'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { consultarAplicacao, publicarCommit, reiniciarAplicacao, interpretar } = require('../src/api');
const { ErroDaAction } = require('../src/github');
const { criarServidorFalso, RESPOSTAS, CHAVE_TOTAL, CHAVE_LEITURA } = require('./servidor-falso');

const ZIP = Buffer.from(zipSync({ 'index.js': strToU8('console.log(1)'), 'package.json': strToU8('{}') }));

/** esperar() de mentira: anota quanto a Action esperaria e segue na hora. */
function relogioFalso() {
  const esperas = [];
  return { esperas, esperar: async (ms) => void esperas.push(ms) };
}

async function comServidor(fn, opcoes) {
  const s = await criarServidorFalso(opcoes);
  try {
    await fn(s);
  } finally {
    await s.fechar();
  }
}

test('consulta a aplicação pelo nome e devolve o id de verdade', () =>
  comServidor(async (s) => {
    const a = await consultarAplicacao({ api: s.api, chave: CHAVE_TOTAL, app: 'minha-api' });
    assert.equal(a.id, 'app-123');
    assert.equal(a.nome, 'minha-api');
    assert.equal(a.principal, 'index.js');
    assert.equal(s.pedidos[0].cabecalhos.authorization, `Bearer ${CHAVE_TOTAL}`);
    assert.match(s.pedidos[0].cabecalhos['user-agent'], /^rtcloud-deploy-action\//);
  }));

test('commit vai em multipart, campo "file", com .zip e Content-Length', () =>
  comServidor(async (s) => {
    const c = await publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP });
    assert.deepEqual(c, { id: 'app-123', online: true, variaveisNovas: 0, mensagem: 'Commit aplicado e aplicação no ar.', tentativas: 1 });
    const pedido = s.pedidos[0];
    assert.equal(pedido.metodo, 'POST');
    assert.equal(pedido.caminho, '/api/v1/apps/app-123/commit');
    assert.match(pedido.cabecalhos['content-type'], /^multipart\/form-data; boundary=/);
    assert.equal(s.recebidos[0].nomeDoArquivo, 'projeto.zip');
    assert.equal(s.recebidos[0].tipo, 'application/zip');
    assert.deepEqual(s.recebidos[0].nomes, ['index.js', 'package.json']);
  }));

test('nome com espaço e acento vai codificado na URL', () =>
  comServidor(
    async (s) => {
      const a = await consultarAplicacao({ api: s.api, chave: CHAVE_TOTAL, app: 'Meu Bot ção' });
      assert.equal(a.id, 'app-9');
      assert.equal(s.pedidos[0].caminho, '/api/v1/apps/Meu%20Bot%20%C3%A7%C3%A3o');
    },
    { apps: [{ id: 'app-9', name: 'Meu Bot ção', type: 'bot', main: 'index.js' }] }
  ));

test('chave errada: falha na hora, com a dica, sem nova tentativa', () =>
  comServidor(async (s) => {
    const { esperar, esperas } = relogioFalso();
    await assert.rejects(
      publicarCommit({ api: s.api, chave: 'rtc_errada_0000000000', app: 'app-123', zip: ZIP, esperar }),
      (e) => e instanceof ErroDaAction && e.http === 401 && /Chaves de API/.test(e.dica) && /HTTP 401 ACCESS_DENIED/.test(e.message)
    );
    assert.equal(s.pedidos.length, 1);
    assert.deepEqual(esperas, []);
  }));

test('chave só de leitura: explica que precisa de acesso total', () =>
  comServidor(async (s) => {
    await assert.rejects(
      publicarCommit({ api: s.api, chave: CHAVE_LEITURA, app: 'app-123', zip: ZIP }),
      (e) => e.http === 403 && /só de leitura/.test(e.dica)
    );
  }));

test('aplicação que não existe: 404 com dica sobre o app-id', () =>
  comServidor(async (s) => {
    await assert.rejects(
      consultarAplicacao({ api: s.api, chave: CHAVE_TOTAL, app: 'nao-existe' }),
      (e) => e.http === 404 && /app-id/.test(e.dica)
    );
  }));

test('RTCloud em atualização (503 + X-RTCloud-Atualizando): espera o Retry-After e tenta de novo', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.atualizando('30'), RESPOSTAS.atualizando('45'));
    const { esperar, esperas } = relogioFalso();
    const logs = [];
    const c = await publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar, log: (m) => logs.push(m) });
    assert.equal(c.online, true);
    assert.equal(c.tentativas, 3);
    assert.deepEqual(esperas, [30_000, 45_000]);
    assert.match(logs[0], /publicando uma atualização/);
  }));

test('atualização que passa de 20 minutos: desiste com mensagem própria', () =>
  comServidor(async (s) => {
    for (let i = 0; i < 30; i++) s.forcar('commit', RESPOSTAS.atualizando('120'));
    const { esperar, esperas } = relogioFalso();
    await assert.rejects(
      publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar }),
      (e) => e.codigo === 'UPDATING' && /20 minutos/.test(e.message)
    );
    assert.equal(esperas.reduce((a, b) => a + b, 0), 20 * 60 * 1000);
  }));

test('commit em andamento (409): espera 20 s e tenta de novo', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.conflito());
    const { esperar, esperas } = relogioFalso();
    const c = await publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar });
    assert.equal(c.tentativas, 2);
    assert.deepEqual(esperas, [20_000]);
  }));

test('limite curto (429 com Retry-After): espera e segue', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.limiteComRetryAfter(12));
    const { esperar, esperas } = relogioFalso();
    await publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar });
    assert.deepEqual(esperas, [12_000]);
  }));

test('limite longo (429, "Tente de novo em 540 s"): não prende o runner, falha com a dica', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.limite(540));
    const { esperar, esperas } = relogioFalso();
    await assert.rejects(
      publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar }),
      (e) => e.http === 429 && /6 a cada 10 minutos/.test(e.dica)
    );
    assert.deepEqual(esperas, []);
  }));

test('502 em HTML (sem envelope): 3 novas tentativas e depois falha clara', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.html502(), RESPOSTAS.html502(), RESPOSTAS.html502(), RESPOSTAS.html502());
    const { esperar, esperas } = relogioFalso();
    await assert.rejects(
      publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar }),
      (e) => e.http === 502 && /resposta inesperada/.test(e.message) && /status\.rtcloud\.com\.br/.test(e.dica)
    );
    assert.equal(s.pedidos.length, 4);
    assert.deepEqual(esperas, [15_000, 30_000, 45_000]);
  }));

test('conexão caiu no meio: tenta de novo e publica', () =>
  comServidor(async (s) => {
    s.forcar('commit', RESPOSTAS.derrubar());
    const { esperar, esperas } = relogioFalso();
    const c = await publicarCommit({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123', zip: ZIP, esperar });
    assert.equal(c.tentativas, 2);
    assert.deepEqual(esperas, [15_000]);
    assert.equal(s.recebidos.length, 1);
  }));

test('servidor fora (conexão recusada): falha depois de 3 novas tentativas', async () => {
  const s = await criarServidorFalso();
  const api = s.api;
  await s.fechar();
  const { esperar, esperas } = relogioFalso();
  await assert.rejects(
    consultarAplicacao({ api, chave: CHAVE_TOTAL, app: 'app-123', esperar }),
    (e) => e instanceof ErroDaAction && e.codigo === 'ECONNREFUSED'
  );
  assert.equal(esperas.length, 3);
});

test('reinício usa POST /apps/{id}/restart', () =>
  comServidor(async (s) => {
    const r = await reiniciarAplicacao({ api: s.api, chave: CHAVE_TOTAL, app: 'app-123' });
    assert.equal(r.iniciando, true);
    assert.equal(s.pedidos[0].caminho, '/api/v1/apps/app-123/restart');
    assert.equal(s.pedidos[0].metodo, 'POST');
  }));

test('200 sem o envelope da API não conta como sucesso', () => {
  const r = interpretar({ status: 200, cabecalhos: {}, texto: '<html>portal do wi-fi</html>' });
  assert.equal(r.ok, false);
  assert.equal(r.semEnvelope, true);
});
