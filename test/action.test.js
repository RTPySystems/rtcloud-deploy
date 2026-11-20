'use strict';
/**
 * Ponta a ponta: roda o dist/index.js (o arquivo que o GitHub executa) como
 * o runner faria — entradas em INPUT_*, saídas em GITHUB_OUTPUT, resumo em
 * GITHUB_STEP_SUMMARY — contra o servidor falso.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { criarServidorFalso, RESPOSTAS, CHAVE_TOTAL } = require('./servidor-falso');
const { criarProjeto, pastaTemporaria, apagar, lerSaidas } = require('./ajuda');

const DIST = path.join(__dirname, '..', 'dist', 'index.js');
const SHA = '0123456789abcdef0123456789abcdef01234567';

function rodarAction(entradas, extraAmbiente = {}) {
  const tmp = pastaTemporaria();
  const saida = path.join(tmp, 'output.txt');
  const resumo = path.join(tmp, 'summary.md');
  fs.writeFileSync(saida, '');
  fs.writeFileSync(resumo, '');
  const ambiente = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    GITHUB_OUTPUT: saida,
    GITHUB_STEP_SUMMARY: resumo,
    RUNNER_TEMP: tmp,
    GITHUB_SHA: SHA,
    GITHUB_REF_NAME: 'main',
    GITHUB_REPOSITORY: 'exemplo/projeto',
    GITHUB_SERVER_URL: 'https://github.com',
    ...extraAmbiente,
  };
  for (const [k, v] of Object.entries(entradas)) ambiente[`INPUT_${k.toUpperCase()}`] = v;
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [DIST], { env: ambiente, cwd: tmp });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (d) => (stdout += d));
    filho.stderr.on('data', (d) => (stderr += d));
    filho.on('error', reject);
    filho.on('close', (codigo) => {
      const r = { codigo, stdout, stderr, saidas: lerSaidas(saida), resumo: fs.readFileSync(resumo, 'utf8') };
      const sobrou = fs.readdirSync(tmp).filter((n) => n.endsWith('.zip'));
      r.zipsLargados = sobrou;
      apagar(tmp);
      resolve(r);
    });
  });
}

async function cenario(fn, opcoesServidor) {
  const s = await criarServidorFalso(opcoesServidor);
  try {
    await fn(s);
  } finally {
    await s.fechar();
  }
}

test('o dist/ existe (gerado pelo ncc)', () => {
  assert.ok(fs.existsSync(DIST), 'rode npm run build antes dos testes');
});

test('sucesso: publica, preenche saídas e resumo, esconde a chave', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({
      'index.js': 'console.log("oi")',
      'package.json': '{}',
      '.gitignore': '.env\n*.log\n',
      '.env': 'SEGREDO=1',
      'debug.log': 'x',
    });
    try {
      const r = await rodarAction(
        { 'api-key': CHAVE_TOTAL, 'app-id': 'minha-api', 'api-url': s.api },
        { GITHUB_WORKSPACE: projeto }
      );
      assert.equal(r.codigo, 0, r.stdout + r.stderr);
      assert.deepEqual(s.recebidos[0].nomes, ['.gitignore', 'index.js', 'package.json']);
      assert.equal(r.saidas['app-id'], 'app-123');
      assert.equal(r.saidas.online, 'true');
      assert.equal(r.saidas['env-added'], '0');
      assert.equal(r.saidas.restarted, 'false');
      assert.equal(r.saidas.files, '3');
      assert.equal(Number(r.saidas['package-size']), s.recebidos[0].bytes);
      assert.equal(r.saidas['dashboard-url'], `${s.site}/dashboard/apps/app-123`);
      assert.equal(r.saidas.message, 'Commit aplicado e aplicação no ar.');
      assert.match(r.resumo, /## ✅ Deploy na RTCloud: nova versão publicada/);
      assert.match(r.resumo, /\*\*minha-api\*\* \(`app-123`\)/);
      assert.match(r.resumo, /🟢 No ar/);
      assert.match(r.resumo, /\[`0123456`\]\(https:\/\/github\.com\/exemplo\/projeto\/commit\/0123456789abcdef/);
      assert.match(r.resumo, /regras do `\.gitignore`/);
      assert.match(r.resumo, /Abrir a aplicação no painel da RTCloud/);
      /* a chave só aparece na linha que manda escondê-la */
      assert.equal(r.stdout.split(CHAVE_TOTAL).length - 1, 1);
      assert.match(r.stdout, new RegExp(`^::add-mask::${CHAVE_TOTAL}$`, 'm'));
      assert.match(r.stdout, /^::notice title=Deploy na RTCloud::Nova versão publicada e aplicação no ar\.$/m);
      assert.deepEqual(r.zipsLargados, [], 'o .zip temporário é apagado');
      /* ordem: consulta, depois commit; sem reinício extra */
      assert.deepEqual(s.pedidos.map((p) => `${p.metodo} ${p.caminho}`), ['GET /api/v1/apps/minha-api', 'POST /api/v1/apps/app-123/commit']);
    } finally {
      apagar(projeto);
    }
  }));

test('restart auto: o .env trouxe variáveis novas → reinicia', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'index.js': 'x', '.env': 'A=1\nB=2\n# comentário\n' });
    try {
      const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 0, r.stdout);
      assert.equal(r.saidas['env-added'], '2');
      assert.equal(r.saidas.restarted, 'true');
      assert.match(r.resumo, /Feito, para carregar 2 variáveis novas/);
      assert.equal(s.pedidos.at(-1).caminho, '/api/v1/apps/app-123/restart');
    } finally {
      apagar(projeto);
    }
  }));

test('restart false: não reinicia nem com variáveis novas', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'index.js': 'x', '.env': 'A=1\n' });
    try {
      const r = await rodarAction(
        { 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api, restart: 'false' },
        { GITHUB_WORKSPACE: projeto }
      );
      assert.equal(r.codigo, 0);
      assert.equal(r.saidas.restarted, 'false');
      assert.ok(!s.pedidos.some((p) => p.caminho.endsWith('/restart')));
      assert.match(r.resumo, /Não \(restart: false\)/);
    } finally {
      apagar(projeto);
    }
  }));

test('restart true que falha: commit publicado, passo falha, resumo com ⚠️', () =>
  cenario(async (s) => {
    s.forcar('restart', RESPOSTAS.naoAutorizado());
    const projeto = criarProjeto({ 'index.js': 'x' });
    try {
      const r = await rodarAction(
        { 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api, restart: 'true' },
        { GITHUB_WORKSPACE: projeto }
      );
      assert.equal(r.codigo, 1);
      assert.equal(s.recebidos.length, 1);
      assert.match(r.resumo, /## ⚠️ Deploy na RTCloud: versão publicada, mas o reinício falhou/);
      assert.match(r.resumo, /Falhou: Reinício: Chave da API inválida/);
      assert.equal(r.saidas.online, 'true');
      assert.equal(r.saidas.restarted, 'false');
    } finally {
      apagar(projeto);
    }
  }));

test('path aponta para uma subpasta do repositório', () =>
  cenario(async (s) => {
    const repo = criarProjeto({ 'README.md': 'raiz', 'servidor/index.js': 'x', 'servidor/package.json': '{}' });
    try {
      const r = await rodarAction(
        { 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api, path: 'servidor' },
        { GITHUB_WORKSPACE: repo }
      );
      assert.equal(r.codigo, 0, r.stdout);
      assert.deepEqual(s.recebidos[0].nomes, ['index.js', 'package.json']);
    } finally {
      apagar(repo);
    }
  }));

test('aplicação inexistente: para antes de montar e subir o pacote', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'index.js': 'x' });
    try {
      const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'nao-existe', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 1);
      assert.equal(s.pedidos.length, 1);
      assert.match(r.resumo, /## ❌ Deploy na RTCloud: a versão não foi publicada/);
      assert.match(r.resumo, /\| Etapa \| Consulta da aplicação \|/);
      assert.match(r.resumo, /\*\*Como resolver:\*\* Confira o "app-id"/);
      assert.match(r.stdout, /^::error title=Deploy na RTCloud::Consulta da aplicação: Aplicação não encontrada/m);
      assert.equal(r.saidas.online, 'false');
    } finally {
      apagar(projeto);
    }
  }));

test('pacote sem o arquivo principal: avisa antes e mostra o 400 do servidor', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'src/app.js': 'x', 'package.json': '{}' });
    try {
      const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 1);
      assert.match(r.stdout, /::warning title=Deploy na RTCloud::O arquivo principal configurado na aplicação \(index\.js\) não está no pacote/);
      assert.match(r.resumo, /ZIP sem o arquivo principal \(index\.js\)/);
      assert.match(r.resumo, /\| Etapa \| Commit \|/);
    } finally {
      apagar(projeto);
    }
  }));

test('chave do MCP (rtm_): recusa sem fazer nenhum pedido', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'index.js': 'x' });
    try {
      const r = await rodarAction({ 'api-key': 'rtm_chave_do_mcp_123456', 'app-id': 'app-123', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 1);
      assert.equal(s.pedidos.length, 0);
      assert.match(r.resumo, /servidor MCP/);
      assert.equal(r.stdout.split('rtm_chave_do_mcp_123456').length - 1, 1, 'só na linha de máscara');
    } finally {
      apagar(projeto);
    }
  }));

test('api-url em http fora da máquina local é recusada (a chave não viaja sem TLS)', async () => {
  const projeto = criarProjeto({ 'index.js': 'x' });
  try {
    const r = await rodarAction(
      { 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': 'http://exemplo.com/api/v1' },
      { GITHUB_WORKSPACE: projeto }
    );
    assert.equal(r.codigo, 1);
    assert.match(r.resumo, /precisa ser https/);
  } finally {
    apagar(projeto);
  }
});

test('aplicação com o deploy automático do GitHub ligado: aviso de deploy dobrado', () =>
  cenario(
    async (s) => {
      const projeto = criarProjeto({ 'index.js': 'x' });
      try {
        const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'app-7', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
        assert.equal(r.codigo, 0);
        assert.match(r.stdout, /::warning title=Deploy na RTCloud::Esta aplicação também está com o Deploy automático pelo GitHub ligado \(exemplo\/projeto, branch main\)/);
        assert.match(r.resumo, /> \[!WARNING\]\n> Esta aplicação também está com o Deploy automático/);
        assert.match(r.resumo, /🟡 Reiniciando/);
        assert.equal(r.saidas.online, 'false');
      } finally {
        apagar(projeto);
      }
    },
    {
      apps: [
        { id: 'app-7', name: 'site', type: 'site', main: 'index.js', url: 'https://site.exemplo', github: { repo: 'exemplo/projeto', branch: 'main' }, reiniciaDevagar: true },
      ],
    }
  ));

test('RTCloud em atualização no meio do deploy: espera e publica', () =>
  cenario(async (s) => {
    s.forcar('commit', RESPOSTAS.atualizando('1'));
    const projeto = criarProjeto({ 'index.js': 'x' });
    try {
      const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 0, r.stdout);
      assert.match(r.stdout, /Commit: a RTCloud está publicando uma atualização \(as aplicações seguem no ar\)\. Nova tentativa em 1 s\./);
      /* o 503 forçado responde antes de abrir o .zip: 2 envios, 1 aceito */
      assert.equal(s.pedidos.filter((p) => p.caminho.endsWith('/commit')).length, 2);
      assert.equal(s.recebidos.length, 1);
    } finally {
      apagar(projeto);
    }
  }));

test('nome de arquivo que imita comando do runner não vira comando', () =>
  cenario(async (s) => {
    const projeto = criarProjeto({ 'index.js': 'x' });
    /* "::error::…" como nome de pasta só existe fora do Windows */
    if (process.platform !== 'win32') {
      fs.mkdirSync(path.join(projeto, '::error::falso'), { recursive: true });
      fs.writeFileSync(path.join(projeto, '::error::falso', 'a.txt'), 'x');
    }
    try {
      const r = await rodarAction({ 'api-key': CHAVE_TOTAL, 'app-id': 'app-123', 'api-url': s.api }, { GITHUB_WORKSPACE: projeto });
      assert.equal(r.codigo, 0);
      const parar = /^::stop-commands::(\S+)$/m.exec(r.stdout);
      assert.ok(parar, 'a lista de arquivos sai com os comandos pausados');
      assert.ok(r.stdout.includes(`::${parar[1]}::`), 'e os comandos voltam depois');
    } finally {
      apagar(projeto);
    }
  }));
