'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lerEntradas, API_PADRAO } = require('../src/entradas');
const { montarResumo, enderecoDoPainel } = require('../src/resumo');
const { ErroDaAction } = require('../src/github');
const { criarProjeto, apagar } = require('./ajuda');

function ambienteCom(entradas, extra = {}) {
  const amb = { ...extra };
  for (const [k, v] of Object.entries(entradas)) amb[`INPUT_${k.toUpperCase()}`] = v;
  return amb;
}

test('entradas: padrões de path, restart e api-url', () => {
  const raiz = criarProjeto({ 'index.js': 'x' });
  try {
    const e = lerEntradas(ambienteCom({ 'api-key': 'rtc_abcdefgh12345', 'app-id': ' minha-api ' }, { GITHUB_WORKSPACE: raiz }));
    assert.equal(e.app, 'minha-api');
    assert.equal(e.pasta, raiz);
    assert.equal(e.reinicio, 'auto');
    assert.equal(e.api, API_PADRAO);
  } finally {
    apagar(raiz);
  }
});

test('entradas: restart aceita true/false/auto (e sim/não)', () => {
  const raiz = criarProjeto({ 'index.js': 'x' });
  try {
    const base = { 'api-key': 'rtc_abcdefgh12345', 'app-id': 'a' };
    for (const [valor, esperado] of [['TRUE', 'true'], ['false', 'false'], ['Auto', 'auto'], ['sim', 'true'], ['não', 'false']]) {
      assert.equal(lerEntradas(ambienteCom({ ...base, restart: valor }, { GITHUB_WORKSPACE: raiz })).reinicio, esperado);
    }
    assert.throws(() => lerEntradas(ambienteCom({ ...base, restart: 'talvez' }, { GITHUB_WORKSPACE: raiz })), /restart/);
  } finally {
    apagar(raiz);
  }
});

test('entradas: erros que dá para pegar sem rede', () => {
  const raiz = criarProjeto({ 'index.js': 'x' });
  const amb = (e) => ambienteCom(e, { GITHUB_WORKSPACE: raiz });
  try {
    assert.throws(() => lerEntradas(amb({ 'app-id': 'a' })), (e) => e instanceof ErroDaAction && /api-key/.test(e.message));
    assert.throws(() => lerEntradas(amb({ 'api-key': 'sk-123456789', 'app-id': 'a' })), /rtc_/);
    assert.throws(() => lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345' })), /app-id/);
    assert.throws(() => lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345', 'app-id': 'x'.repeat(81) })), /80 caracteres/);
    assert.throws(() => lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345', 'app-id': 'a', path: 'nao-existe' })), /não existe/);
    assert.throws(() => lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345', 'app-id': 'a', path: 'index.js' })), /é um arquivo/);
    assert.throws(() => lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345', 'app-id': 'a', 'api-url': 'https://x.com/api/v1?k=1' })), /parâmetros/);
    /* http só na própria máquina */
    assert.equal(lerEntradas(amb({ 'api-key': 'rtc_abcdefgh12345', 'app-id': 'a', 'api-url': 'http://127.0.0.1:9/api/v1/' })).api, 'http://127.0.0.1:9/api/v1');
  } finally {
    apagar(raiz);
  }
});

test('resumo: texto de fora não quebra a tabela nem vira HTML', () => {
  const md = montarResumo(
    {
      api: 'https://rtcloud.com.br/api/v1',
      aplicacao: { id: 'app-1', nome: 'loja | <script>alert(1)</script>', url: null },
      pacote: null,
      commit: { online: true, variaveisNovas: 0, mensagem: 'ok\n| injetado |' },
      reinicio: { situacao: 'dispensado' },
      ms: 75_000,
      falha: null,
    },
    {}
  );
  assert.ok(!md.includes('<script>'));
  assert.match(md, /loja \\\| &lt;script&gt;/);
  assert.match(md, /> ok \\\| injetado \\\|/);
  assert.match(md, /\| Tempo \| 1 min 15 s \|/);
  assert.match(md, /Não precisou \(o commit já reinicia a aplicação\)/);
});

test('painel: endereço sai da URL da API', () => {
  assert.equal(enderecoDoPainel('https://rtcloud.com.br/api/v1', 'app 1'), 'https://rtcloud.com.br/dashboard/apps/app%201');
  assert.equal(enderecoDoPainel('http://127.0.0.1:3000/api/v1', 'x'), 'http://127.0.0.1:3000/dashboard/apps/x');
});
