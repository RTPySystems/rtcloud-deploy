'use strict';
/**
 * Conversa com a API pública v1 da RTCloud.
 *
 * Usa node:http/https direto (sem fetch) por um motivo prático: o commit
 * pode levar até 10 minutos do lado do servidor, e o fetch do Node desiste
 * de esperar o cabeçalho da resposta em 5 minutos sem dar como mudar isso.
 *
 * Envelope da API (o mesmo em todas as rotas):
 *   sucesso → { "status": "success", "response": … }
 *   erro    → { "status": "error", "code": "NOT_FOUND", "message": "…" }
 * Durante uma atualização da própria RTCloud a resposta é 503 com o
 * cabeçalho X-RTCloud-Atualizando e Retry-After — aí a Action espera e tenta
 * de novo (até 20 min), em vez de falhar o job.
 */
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { ErroDaAction } = require('./github');
const { version: VERSAO } = require('../package.json');

const PRAZO_COMMIT_MS = 12 * 60 * 1000;
const PRAZO_ACAO_MS = 2 * 60 * 1000;
const ESPERA_MAX_ATUALIZACAO_MS = 20 * 60 * 1000;
const ESPERA_MAX_LIMITE_MS = 5 * 60 * 1000;
const MAX_TENTATIVAS_REDE = 3;
const MAX_TENTATIVAS_INSTAVEL = 3;
const MAX_TENTATIVAS_CONFLITO = 15;
const ESPERA_CONFLITO_MS = 20 * 1000;

const ERROS_DE_REDE = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'PRAZO_ESGOTADO',
]);

const esperarDeVerdade = (ms) => new Promise((r) => setTimeout(r, ms));

/** Um pedido HTTP. Devolve status, cabeçalhos e o texto (até 2 MB). */
function pedir({ url, metodo = 'GET', cabecalhos = {}, corpo = null, prazoMs = PRAZO_ACAO_MS }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    let terminou = false;
    const fim = (fn, v) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      fn(v);
    };
    const req = mod.request(
      u,
      {
        method: metodo,
        headers: { ...cabecalhos, 'Content-Length': corpo ? corpo.length : 0 },
      },
      (res) => {
        const partes = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total <= 2 * 1024 * 1024) partes.push(c);
        });
        res.on('end', () =>
          fim(resolve, { status: res.statusCode || 0, cabecalhos: res.headers, texto: Buffer.concat(partes).toString('utf8') })
        );
        res.on('error', (e) => fim(reject, e));
      }
    );
    const relogio = setTimeout(() => {
      const e = new Error(`sem resposta em ${Math.round(prazoMs / 1000)} s`);
      e.code = 'PRAZO_ESGOTADO';
      req.destroy(e);
    }, prazoMs);
    req.on('error', (e) => fim(reject, e));
    req.end(corpo || undefined);
  });
}

function cabecalhosComuns(chave) {
  return {
    Authorization: `Bearer ${chave}`,
    Accept: 'application/json',
    'User-Agent': `rtcloud-deploy-action/${VERSAO}`,
  };
}

/** Corpo multipart com o .zip no campo "file" — o formato que a rota de commit lê. */
function corpoMultipart(zip, nome = 'projeto.zip') {
  const fronteira = `----rtcloud${crypto.randomBytes(12).toString('hex')}`;
  const cabeca = Buffer.from(
    `--${fronteira}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${nome}"\r\n` +
      'Content-Type: application/zip\r\n\r\n',
    'utf8'
  );
  const pe = Buffer.from(`\r\n--${fronteira}--\r\n`, 'utf8');
  return { tipo: `multipart/form-data; boundary=${fronteira}`, corpo: Buffer.concat([cabeca, zip, pe]) };
}

function interpretar(r) {
  let json = null;
  try {
    json = JSON.parse(r.texto);
  } catch {
    json = null;
  }
  const atualizando =
    r.status === 503 && (r.cabecalhos['x-rtcloud-atualizando'] !== undefined || (json && json.atualizando === true));
  if (r.status >= 200 && r.status < 300 && json && json.status === 'success') {
    return { ok: true, status: r.status, dados: json.response, cabecalhos: r.cabecalhos };
  }
  return {
    ok: false,
    status: r.status,
    codigo: (json && typeof json.code === 'string' && json.code) || (atualizando ? 'UPDATING' : ''),
    mensagem: (json && (json.message || json.error)) || '',
    atualizando,
    semEnvelope: !json,
    cabecalhos: r.cabecalhos,
  };
}

function segundosDeRetryAfter(cab) {
  const v = cab && cab['retry-after'];
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const data = Date.parse(v);
  return Number.isFinite(data) ? Math.max(0, Math.ceil((data - Date.now()) / 1000)) : null;
}

function segundosDoLimite(r) {
  const ra = segundosDeRetryAfter(r.cabecalhos);
  if (ra !== null) return ra;
  const m = /(\d+)\s*s\b/.exec(r.mensagem || '');
  if (m) return Number(m[1]);
  const m2 = /(\d+)\s*min/.exec(r.mensagem || '');
  if (m2) return Number(m2[1]) * 60;
  const reset = Number(r.cabecalhos && r.cabecalhos['x-ratelimit-reset']);
  if (Number.isFinite(reset) && reset > 0) return Math.max(1, Math.ceil(reset - Date.now() / 1000));
  return 60;
}

/** Quanto esperar antes de tentar de novo — ou null para desistir. */
function planoDeEspera(r, estado) {
  if (r.atualizando) {
    const seg = Math.min(120, Math.max(1, segundosDeRetryAfter(r.cabecalhos) ?? 30));
    if (estado.esperouAtualizacao + seg * 1000 > ESPERA_MAX_ATUALIZACAO_MS) return null;
    estado.esperouAtualizacao += seg * 1000;
    return { ms: seg * 1000, motivo: 'a RTCloud está publicando uma atualização (as aplicações seguem no ar)' };
  }
  if (r.status === 429) {
    const seg = segundosDoLimite(r);
    if (seg * 1000 > ESPERA_MAX_LIMITE_MS) return null;
    return { ms: Math.max(1, seg) * 1000, motivo: 'limite de chamadas da chave' };
  }
  if (r.status === 409 && estado.conflito < MAX_TENTATIVAS_CONFLITO) {
    estado.conflito++;
    return { ms: ESPERA_CONFLITO_MS, motivo: 'já existe um commit em andamento nesta aplicação' };
  }
  if ([500, 502, 503, 504].includes(r.status) && estado.instavel < MAX_TENTATIVAS_INSTAVEL) {
    estado.instavel++;
    return { ms: 15_000 * estado.instavel, motivo: `a plataforma respondeu ${r.status}` };
  }
  return null;
}

const DICAS = {
  401: 'A chave está errada ou foi revogada. Gere outra em menu da conta → Chaves de API e atualize o secret.',
  403: 'Use uma chave com acesso total e confira se o seu papel pode publicar versão (dono, Administrador ou Desenvolvedor da equipe) e se o plano está ativo.',
  404: 'Confira o "app-id": vale o id que aparece no painel ou o nome exato da aplicação. A chave precisa ser da conta dona ou de alguém da equipe dela.',
  400: 'Confira o pacote: o arquivo principal configurado na aplicação precisa estar no .zip.',
  409: 'Outro commit desta aplicação não terminou a tempo. Use "concurrency" no workflow para um deploy por vez.',
  413: 'Deixe arquivos pesados (mídia, bancos, builds antigos) de fora com um .rtcloudignore na raiz.',
  429: 'O limite de commit é de 6 a cada 10 minutos por chave. Use "concurrency" no workflow ou espere alguns minutos.',
  500: 'A RTCloud não conseguiu concluir agora. Rode o job de novo em alguns minutos; a situação da plataforma fica em status.rtcloud.com.br.',
};

function erroDaResposta(r, rotulo) {
  if (r.atualizando) {
    return new ErroDaAction(`${rotulo}: a RTCloud segue publicando uma atualização depois de 20 minutos de espera.`, {
      dica: 'Rode o job de novo daqui a pouco. As aplicações continuam no ar enquanto isso.',
      http: 503,
      codigo: 'UPDATING',
    });
  }
  const base = r.mensagem || (r.semEnvelope ? 'resposta inesperada do servidor' : 'erro sem mensagem');
  const dica =
    r.status === 403 && /leitura/i.test(r.mensagem)
      ? 'Esta chave é só de leitura. Gere uma chave com acesso total para publicar.'
      : DICAS[r.status] || (r.status >= 500 ? DICAS[500] : '');
  return new ErroDaAction(`${rotulo}: ${base} (HTTP ${r.status}${r.codigo ? ` ${r.codigo}` : ''}).`, {
    dica,
    http: r.status,
    codigo: r.codigo,
  });
}

function erroDeRede(e, rotulo) {
  return new ErroDaAction(`${rotulo}: falha de conexão (${e.code || e.message}).`, {
    dica: e.code === 'ENOTFOUND' ? 'Confira a "api-url" (ou deixe em branco).' : DICAS[500],
    codigo: e.code || 'NETWORK',
  });
}

/**
 * Faz o pedido, esperando e tentando de novo quando faz sentido.
 * @param {() => Promise<{status:number,cabecalhos:object,texto:string}>} fazer
 * @param {{ rotulo: string, esperar?: (ms:number)=>Promise<void>, log?: (m:string)=>void }} opcoes
 */
async function comNovasTentativas(fazer, { rotulo, esperar = esperarDeVerdade, log = () => {} }) {
  const estado = { tentativas: 0, rede: 0, conflito: 0, instavel: 0, esperouAtualizacao: 0 };
  for (;;) {
    estado.tentativas++;
    let r;
    try {
      r = interpretar(await fazer());
    } catch (e) {
      if (!ERROS_DE_REDE.has(e.code) || estado.rede >= MAX_TENTATIVAS_REDE) throw erroDeRede(e, rotulo);
      estado.rede++;
      const ms = 15_000 * estado.rede;
      log(`${rotulo}: falha de conexão (${e.code}). Nova tentativa em ${ms / 1000} s.`);
      await esperar(ms);
      continue;
    }
    if (r.ok) return { dados: r.dados, tentativas: estado.tentativas, cabecalhos: r.cabecalhos };
    const plano = planoDeEspera(r, estado);
    if (!plano) throw erroDaResposta(r, rotulo);
    log(`${rotulo}: ${plano.motivo}. Nova tentativa em ${Math.round(plano.ms / 1000)} s.`);
    await esperar(plano.ms);
  }
}

function caminhoDaApp(api, app, sufixo = '') {
  return `${api}/apps/${encodeURIComponent(app)}${sufixo}`;
}

/** GET /apps/{id} — confere chave e aplicação antes de montar e subir o pacote. */
async function consultarAplicacao({ api, chave, app, esperar, log }) {
  const r = await comNovasTentativas(
    () => pedir({ url: caminhoDaApp(api, app), cabecalhos: cabecalhosComuns(chave) }),
    { rotulo: 'Consulta da aplicação', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return {
    id: String(d.id || app),
    nome: String(d.name || app),
    tipo: d.type || null,
    url: typeof d.url === 'string' && /^https?:\/\//.test(d.url) ? d.url : null,
    principal: typeof d.main === 'string' ? d.main : null,
    github: d.github && d.github.repo ? { repo: String(d.github.repo), branch: d.github.branch || null } : null,
    suspensa: Boolean(d.suspended),
  };
}

/** POST /apps/{id}/commit — publica o .zip. */
async function publicarCommit({ api, chave, app, zip, esperar, log }) {
  const { tipo, corpo } = corpoMultipart(zip);
  const r = await comNovasTentativas(
    () =>
      pedir({
        url: caminhoDaApp(api, app, '/commit'),
        metodo: 'POST',
        cabecalhos: { ...cabecalhosComuns(chave), 'Content-Type': tipo },
        corpo,
        prazoMs: PRAZO_COMMIT_MS,
      }),
    { rotulo: 'Commit', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return {
    id: String(d.id || app),
    online: d.online === true,
    variaveisNovas: Number.isFinite(Number(d.envAdded)) ? Number(d.envAdded) : 0,
    mensagem: typeof d.message === 'string' ? d.message : '',
    tentativas: r.tentativas,
  };
}

/** POST /apps/{id}/restart — reinicia recarregando as variáveis de ambiente. */
async function reiniciarAplicacao({ api, chave, app, esperar, log }) {
  const r = await comNovasTentativas(
    () => pedir({ url: caminhoDaApp(api, app, '/restart'), metodo: 'POST', cabecalhos: cabecalhosComuns(chave) }),
    { rotulo: 'Reinício', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return { mensagem: typeof d.message === 'string' ? d.message : '', iniciando: d.starting === true };
}

module.exports = {
  pedir,
  interpretar,
  comNovasTentativas,
  consultarAplicacao,
  publicarCommit,
  reiniciarAplicacao,
  corpoMultipart,
};
