'use strict';
/**
 * Monta o .zip do projeto que vai para o Commit.
 *
 * Quais arquivos entram:
 *   · com `.rtcloudignore` (ou `rtcloud.ignore`) na raiz → valem só as regras
 *     dele, e o `.gitignore` é deixado de lado. É o jeito de mandar o que o
 *     build do CI gerou (dist/, .next/…) mesmo que o Git ignore essas pastas
 *     — a mesma ideia do `.npmignore` no npm;
 *   · sem ele → valem os `.gitignore` do projeto (o da raiz e os das
 *     subpastas, cada um relativo à própria pasta, como no Git);
 *   · sempre ficam de fora `.git/` e `node_modules/` (a RTCloud instala as
 *     dependências no servidor) e lixo de sistema (.DS_Store, Thumbs.db);
 *   · `package.json`, `requirements.txt` e `pyproject.toml` da raiz nunca são
 *     ignorados — sem eles a aplicação não sobe (o painel faz o mesmo);
 *   · links simbólicos não são seguidos: um link para fora do projeto
 *     levaria arquivos do runner junto. Eles aparecem como aviso.
 *
 * O .zip é escrito em fluxo num arquivo temporário: nunca segura o projeto
 * inteiro na memória.
 */
const fs = require('node:fs');
const path = require('node:path');
const ignore = require('ignore');
const { Zip, ZipDeflate, ZipPassThrough } = require('fflate');
const { ErroDaAction } = require('./github');

/** Teto por envio aceito pela RTCloud (o mesmo do painel). */
const LIMITE_BYTES = 100 * 1024 * 1024;

const NOMES_IGNORE_RTCLOUD = ['.rtcloudignore', 'rtcloud.ignore'];
const PASTAS_SEMPRE_FORA = new Set(['.git', 'node_modules']);
const ARQUIVOS_SEMPRE_FORA = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const ESSENCIAIS_NA_RAIZ = new Set(['package.json', 'requirements.txt', 'pyproject.toml']);

/* já comprimidos: guardar sem comprimir de novo poupa CPU e não aumenta nada */
const JA_COMPRIMIDOS = new Set([
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.br', '.zst',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico',
  '.mp3', '.ogg', '.opus', '.m4a', '.aac', '.flac',
  '.mp4', '.webm', '.mov', '.mkv', '.avi',
  '.woff', '.woff2', '.pdf', '.jar', '.apk',
]);

const DATA_MINIMA_ZIP = new Date('1980-01-02T00:00:00Z').getTime();
const DATA_MAXIMA_ZIP = new Date('2099-12-30T00:00:00Z').getTime();

function lerTexto(arquivo) {
  try {
    return fs.readFileSync(arquivo, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Decide o que fica de fora. Devolve `fica(rel, ehPasta)` e de onde vieram as regras.
 * @param {string} raiz
 */
function criarFiltro(raiz) {
  for (const nome of NOMES_IGNORE_RTCLOUD) {
    const texto = lerTexto(path.join(raiz, nome));
    if (texto !== null) {
      const ig = ignore({ allowRelativePaths: true }).add(texto);
      return {
        origem: nome,
        /** regras por pasta: com .rtcloudignore só a raiz conta */
        entrarNaPasta() {},
        ignora: (rel, ehPasta) => ig.ignores(ehPasta ? `${rel}/` : rel),
      };
    }
  }

  /* .gitignore: um por pasta, cada um relativo a ela; o mais fundo decide */
  const camadas = [];
  const temRaiz = lerTexto(path.join(raiz, '.gitignore')) !== null;
  return {
    origem: temRaiz ? '.gitignore' : null,
    entrarNaPasta(relPasta) {
      const texto = lerTexto(path.join(raiz, relPasta, '.gitignore'));
      if (texto === null) return;
      if (relPasta) this.origem = this.origem || '.gitignore';
      camadas.push({ base: relPasta ? `${relPasta}/` : '', ig: ignore({ allowRelativePaths: true }).add(texto) });
    },
    ignora(rel, ehPasta) {
      for (let i = camadas.length - 1; i >= 0; i--) {
        const { base, ig } = camadas[i];
        if (base && !rel.startsWith(base)) continue;
        const resto = rel.slice(base.length);
        if (!resto) continue;
        const r = ig.test(ehPasta ? `${resto}/` : resto);
        if (r.ignored) return true;
        if (r.unignored) return false;
      }
      return false;
    },
  };
}

/**
 * Lista os arquivos que entram, em ordem estável.
 * @param {string} raiz pasta do projeto (absoluta)
 * @param {{ excluir?: string[] }} [opcoes] caminhos absolutos que nunca entram (o próprio .zip)
 */
function listarArquivos(raiz, opcoes = {}) {
  const excluir = new Set((opcoes.excluir || []).map((p) => path.resolve(p)));
  const filtro = criarFiltro(raiz);
  const arquivos = [];
  const links = [];
  let ignorados = 0;

  const visitar = (relPasta) => {
    filtro.entrarNaPasta(relPasta);
    const absPasta = path.join(raiz, relPasta);
    let itens;
    try {
      itens = fs.readdirSync(absPasta, { withFileTypes: true });
    } catch (e) {
      throw new ErroDaAction(`Não foi possível ler a pasta "${relPasta || '.'}": ${e.code || e.message}.`);
    }
    itens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const item of itens) {
      const rel = relPasta ? `${relPasta}/${item.name}` : item.name;
      const abs = path.join(absPasta, item.name);
      if (excluir.has(path.resolve(abs))) continue;

      if (item.isSymbolicLink()) {
        links.push(rel);
        continue;
      }
      if (item.isDirectory()) {
        if (PASTAS_SEMPRE_FORA.has(item.name) || filtro.ignora(rel, true)) {
          ignorados++;
          continue;
        }
        visitar(rel);
        continue;
      }
      if (!item.isFile()) continue;

      const essencial = !relPasta && ESSENCIAIS_NA_RAIZ.has(item.name);
      if (!essencial && (ARQUIVOS_SEMPRE_FORA.has(item.name) || filtro.ignora(rel, false))) {
        ignorados++;
        continue;
      }
      const st = fs.statSync(abs);
      arquivos.push({ rel, abs, tamanho: st.size, modo: st.mode, mtime: st.mtimeMs });
    }
  };

  visitar('');
  return { arquivos, links, ignorados, regras: filtro.origem };
}

function dataNoZip(ms) {
  if (!Number.isFinite(ms)) return new Date(DATA_MINIMA_ZIP);
  return new Date(Math.min(DATA_MAXIMA_ZIP, Math.max(DATA_MINIMA_ZIP, ms)));
}

/** Permissões Unix no zip (mantém o +x de scripts como start.sh). */
function atributos(modo) {
  const perm = (modo & 0o777) || 0o644;
  return ((0o100000 | perm) << 16) >>> 0;
}

function formatarBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function maiores(arquivos, n = 8) {
  return [...arquivos].sort((a, b) => b.tamanho - a.tamanho).slice(0, n).map((a) => ({ caminho: a.rel, tamanho: a.tamanho }));
}

/**
 * Escreve o .zip.
 * @param {string} raiz
 * @param {string} destino caminho do .zip (fora do projeto, de preferência)
 * @param {{ limiteBytes?: number }} [opcoes]
 */
function montarPacote(raiz, destino, opcoes = {}) {
  const limite = opcoes.limiteBytes || LIMITE_BYTES;
  const lista = listarArquivos(raiz, { excluir: [destino] });
  if (lista.arquivos.length === 0) {
    throw new ErroDaAction('Nenhum arquivo para enviar: a pasta está vazia ou tudo caiu nas regras de ignorar.', {
      dica: lista.regras
        ? `Confira o ${lista.regras} e a entrada "path".`
        : 'Confira a entrada "path" e se o actions/checkout veio antes.',
    });
  }

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const fd = fs.openSync(destino, 'w');
  let escritos = 0;
  let falha = null;
  let estourou = false;
  let fechado = false;
  try {
    const zip = new Zip((err, pedaco) => {
      if (err) {
        falha = err;
        return;
      }
      if (estourou || !pedaco || !pedaco.length) return;
      escritos += pedaco.length;
      if (escritos > limite) {
        estourou = true;
        return;
      }
      fs.writeSync(fd, pedaco);
    });

    let bytesOriginais = 0;
    for (const a of lista.arquivos) {
      if (falha || estourou) break;
      const dados = fs.readFileSync(a.abs);
      bytesOriginais += dados.length;
      const atrib = { os: 3, attrs: atributos(a.modo), mtime: dataNoZip(a.mtime) };
      const guardar = JA_COMPRIMIDOS.has(path.extname(a.rel).toLowerCase());
      const entrada = guardar ? new ZipPassThrough(a.rel) : new ZipDeflate(a.rel, { level: 6 });
      Object.assign(entrada, atrib);
      zip.add(entrada);
      entrada.push(dados, true);
    }
    if (!falha && !estourou) zip.end();

    fs.closeSync(fd);
    fechado = true;

    if (falha) throw new ErroDaAction(`Falha ao montar o .zip: ${falha.message || falha}.`);
    if (estourou) {
      fs.rmSync(destino, { force: true });
      const top = maiores(lista.arquivos, 5)
        .map((m) => `${m.caminho} (${formatarBytes(m.tamanho)})`)
        .join(', ');
      throw new ErroDaAction(`O pacote passou do limite de ${formatarBytes(limite)} por envio.`, {
        dica: `Deixe de fora mídia, bancos e builds pesados com um .rtcloudignore na raiz. Maiores arquivos: ${top}.`,
        codigo: 'PAYLOAD_TOO_LARGE',
      });
    }

    return {
      arquivo: destino,
      bytes: escritos,
      bytesOriginais,
      total: lista.arquivos.length,
      ignorados: lista.ignorados,
      links: lista.links,
      regras: lista.regras,
      caminhos: lista.arquivos.map((a) => a.rel),
      maiores: maiores(lista.arquivos),
    };
  } finally {
    if (!fechado) {
      try {
        fs.closeSync(fd);
      } catch {
        /* já fechado */
      }
    }
  }
}

module.exports = { montarPacote, listarArquivos, formatarBytes, LIMITE_BYTES };
