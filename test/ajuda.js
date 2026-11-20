'use strict';
/* Utilidades dos testes: projeto temporário e leitura crua do .zip. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Cria uma pasta temporária com os arquivos dados ({ 'a/b.txt': 'conteúdo' | Buffer }). */
function criarProjeto(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcloud-acao-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const abs = path.join(raiz, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, conteudo);
  }
  return raiz;
}

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtcloud-acao-tmp-'));
}

function apagar(...pastas) {
  for (const p of pastas) if (p) fs.rmSync(p, { recursive: true, force: true });
}

/**
 * Lê o diretório central do .zip: nome, sistema de origem e atributos
 * externos de cada entrada (o fflate não expõe isso na descompressão).
 */
function entradasDoZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('zip sem diretório central');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const lista = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('entrada do diretório central inválida');
    const feitoPor = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComent = buf.readUInt16LE(p + 32);
    const externos = buf.readUInt32LE(p + 38);
    const nome = buf.subarray(p + 46, p + 46 + tamNome).toString('utf8');
    lista.push({ nome, sistema: feitoPor >> 8, flags, modoUnix: externos >>> 16 });
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return lista;
}

/** Lê o GITHUB_OUTPUT no formato nome<<DELIM … DELIM. */
function lerSaidas(arquivo) {
  const saidas = {};
  if (!fs.existsSync(arquivo)) return saidas;
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const m = /^([^<]+)<<(.+)$/.exec(linhas[i]);
    if (!m) continue;
    const valor = [];
    i++;
    while (i < linhas.length && linhas[i] !== m[2]) valor.push(linhas[i++]);
    saidas[m[1]] = valor.join('\n');
  }
  return saidas;
}

module.exports = { criarProjeto, pastaTemporaria, apagar, entradasDoZip, lerSaidas };
