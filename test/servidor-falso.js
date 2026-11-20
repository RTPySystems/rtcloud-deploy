'use strict';
/**
 * Servidor falso da API v1 da RTCloud, para os testes.
 *
 * Imita o que a Action usa — GET /apps/{id}, POST /apps/{id}/commit e
 * POST /apps/{id}/restart — com o mesmo envelope, a mesma leitura de chave
 * (com ou sem Bearer), id ou nome exato da aplicação, multipart com o .zip
 * no campo "file" e as recusas do servidor de verdade (chave só de leitura,
 * ZIP sem o arquivo principal). Cada teste pode forçar respostas na fila
 * (`forcar`) para simular atualização, conflito, limite e queda de conexão.
 */
const http = require('node:http');
const { unzipSync, strFromU8 } = require('fflate');

const CHAVE_TOTAL = 'rtc_teste_total_0123456789';
const CHAVE_LEITURA = 'rtc_teste_leitura_0123456789';

function lerMultipart(corpo, tipo) {
  const m = /boundary=([^;]+)/.exec(tipo || '');
  if (!m) return [];
  const fronteira = Buffer.from(`--${m[1]}`);
  const partes = [];
  let i = corpo.indexOf(fronteira);
  while (i !== -1) {
    const ini = i + fronteira.length;
    if (corpo.subarray(ini, ini + 2).toString() === '--') break;
    const prox = corpo.indexOf(fronteira, ini);
    if (prox === -1) break;
    const parte = corpo.subarray(ini + 2, prox - 2);
    const sep = parte.indexOf('\r\n\r\n');
    const cab = parte.subarray(0, sep).toString('utf8');
    partes.push({
      nome: (/name="([^"]+)"/.exec(cab) || [])[1],
      arquivo: (/filename="([^"]+)"/.exec(cab) || [])[1],
      tipo: (/Content-Type:\s*(\S+)/i.exec(cab) || [])[1],
      dados: Buffer.from(parte.subarray(sep + 4)),
    });
    i = prox;
  }
  return partes;
}

function contarVariaveis(texto) {
  return texto.split(/\r?\n/).filter((l) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l)).length;
}

/**
 * @param {{ apps?: object[] }} [opcoes]
 * @returns {Promise<{ api: string, site: string, pedidos: object[], recebidos: object[], forcar: Function, fechar: Function }>}
 */
function criarServidorFalso(opcoes = {}) {
  const pedidos = [];
  const recebidos = [];
  const fila = { app: [], commit: [], restart: [] };
  const apps = opcoes.apps || [
    { id: 'app-123', name: 'minha-api', type: 'bot', main: 'index.js', url: null, github: null, suspended: false },
  ];

  const json = (res, status, obj, cab = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cab });
    res.end(JSON.stringify(obj));
  };
  const erro = (res, status, code, message, cab) => json(res, status, { status: 'error', code, message }, cab);
  const ok = (res, response) => json(res, 200, { status: 'success', response });

  function aplicarForcada(f, req, res) {
    if (f.derrubar) {
      req.socket.destroy();
      return;
    }
    const enviar = () => {
      res.writeHead(f.status, { 'Content-Type': f.texto ? 'text/html' : 'application/json', ...(f.cabecalhos || {}) });
      res.end(f.texto !== undefined ? f.texto : JSON.stringify(f.json));
    };
    if (f.atrasoMs) setTimeout(enviar, f.atrasoMs);
    else enviar();
  }

  function responder(req, res, r) {
    const m = /^\/api\/v1\/apps\/([^/]+)(\/commit|\/restart)?\/?$/.exec(r.caminho);
    if (!m) return erro(res, 404, 'NOT_FOUND', 'Rota não encontrada.');
    const tipo = m[2] === '/commit' ? 'commit' : m[2] === '/restart' ? 'restart' : 'app';
    const forcada = fila[tipo].shift();
    if (forcada) return aplicarForcada(forcada, req, res);

    const chave = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!chave) return erro(res, 401, 'ACCESS_DENIED', 'Envie a chave da API no cabeçalho Authorization.');
    if (chave !== CHAVE_TOTAL && chave !== CHAVE_LEITURA) return erro(res, 401, 'ACCESS_DENIED', 'Chave da API inválida ou revogada.');
    if (req.method === 'POST' && chave !== CHAVE_TOTAL) {
      return erro(res, 403, 'FORBIDDEN', 'Esta chave é só de leitura. Use uma chave com acesso total para ações e alterações.');
    }

    const alvo = decodeURIComponent(m[1]);
    const app = apps.find((a) => a.id === alvo) || apps.find((a) => a.name === alvo);
    if (!app) return erro(res, 404, 'NOT_FOUND', 'Aplicação não encontrada.');

    if (tipo === 'app') {
      if (req.method !== 'GET') return erro(res, 405, 'BAD_REQUEST', 'Método não permitido.');
      return ok(res, { ...app, language: 'javascript', status: 'running', online: true, ram: 512 });
    }
    if (req.method !== 'POST') return erro(res, 405, 'BAD_REQUEST', 'Método não permitido.');

    if (tipo === 'restart') return ok(res, { id: app.id, action: 'restart', starting: true, message: 'Reiniciando.' });

    /* commit */
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado !== r.corpo.length) return erro(res, 400, 'BAD_REQUEST', 'Content-Length não bate com o corpo.');
    const partes = lerMultipart(r.corpo, req.headers['content-type']);
    const arquivo = partes.find((p) => p.nome === 'file');
    if (!arquivo || !arquivo.arquivo) return erro(res, 400, 'BAD_REQUEST', 'Campo "file" com o .zip é obrigatório.');
    if (!/\.zip$/i.test(arquivo.arquivo)) return erro(res, 400, 'BAD_REQUEST', 'Envie o projeto em .zip.');
    let conteudo;
    try {
      conteudo = unzipSync(new Uint8Array(arquivo.dados));
    } catch {
      return erro(res, 400, 'BAD_REQUEST', 'Não foi possível preparar o pacote. Confira o ZIP e tente de novo.');
    }
    const nomes = Object.keys(conteudo).sort();
    recebidos.push({ app: app.id, nomeDoArquivo: arquivo.arquivo, tipo: arquivo.tipo, nomes, conteudo, bytes: arquivo.dados.length });
    if (app.main && !nomes.includes(app.main)) {
      return erro(res, 400, 'BAD_REQUEST', `ZIP sem o arquivo principal (${app.main}).`);
    }
    const env = conteudo['.env'] ? contarVariaveis(strFromU8(conteudo['.env'])) : 0;
    return ok(res, {
      id: app.id,
      online: !app.reiniciaDevagar,
      envAdded: env,
      message: app.reiniciaDevagar
        ? 'Commit aplicado. Reinício em andamento — confira o status em instantes.'
        : 'Commit aplicado e aplicação no ar.',
    });
  }

  const server = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      const corpo = Buffer.concat(partes);
      const url = new URL(req.url, 'http://servidor-falso');
      const registro = { metodo: req.method, caminho: url.pathname, cabecalhos: req.headers, corpo };
      pedidos.push(registro);
      responder(req, res, registro);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const site = `http://127.0.0.1:${port}`;
      resolve({
        site,
        api: `${site}/api/v1`,
        pedidos,
        recebidos,
        /** Põe respostas na fila de um tipo de rota: 'app', 'commit' ou 'restart'. */
        forcar(tipo, ...respostas) {
          fila[tipo].push(...respostas);
        },
        fechar() {
          return new Promise((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          });
        },
      });
    });
  });
}

/** Respostas prontas que o servidor de verdade dá. */
const RESPOSTAS = {
  atualizando: (retryAfter = '30') => ({
    status: 503,
    cabecalhos: { 'Retry-After': String(retryAfter), 'X-RTCloud-Atualizando': String(Date.now()) },
    json: {
      ok: false,
      atualizando: true,
      desde: new Date().toISOString(),
      error: 'A RTCloud está publicando uma atualização. Volta em instantes — suas aplicações continuam no ar.',
    },
  }),
  conflito: () => ({
    status: 409,
    json: { status: 'error', code: 'CONFLICT', message: 'Já existe um commit em andamento nesta aplicação. Aguarde ele terminar.' },
  }),
  limite: (seg) => ({
    status: 429,
    json: { status: 'error', code: 'RATE_LIMIT', message: `Muitas chamadas. Tente de novo em ${seg} s.` },
  }),
  limiteComRetryAfter: (seg) => ({
    status: 429,
    cabecalhos: { 'Retry-After': String(seg) },
    json: { status: 'error', code: 'RATE_LIMIT', message: 'Muitas chamadas.' },
  }),
  html502: () => ({ status: 502, texto: '<html><body>Bad gateway</body></html>' }),
  naoAutorizado: () => ({
    status: 401,
    json: { status: 'error', code: 'ACCESS_DENIED', message: 'Chave da API inválida ou revogada.' },
  }),
  derrubar: () => ({ derrubar: true }),
};

module.exports = { criarServidorFalso, RESPOSTAS, CHAVE_TOTAL, CHAVE_LEITURA, lerMultipart };
