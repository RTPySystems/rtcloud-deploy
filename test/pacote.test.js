'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { unzipSync, strFromU8 } = require('fflate');
const { montarPacote, listarArquivos } = require('../src/pacote');
const { ErroDaAction } = require('../src/github');
const { criarProjeto, pastaTemporaria, apagar, entradasDoZip } = require('./ajuda');

const PROJETO_COM_GITIGNORE = {
  'index.js': 'console.log("oi")',
  'package.json': '{"name":"teste"}',
  '.gitignore': '*.log\n!manter.log\ndist/\n/segredo.txt\n.env\n',
  'app.log': 'log',
  'manter.log': 'fica',
  'dist/saida.js': 'build',
  'segredo.txt': 'raiz ancorada',
  'sub/segredo.txt': 'fica: a regra é ancorada na raiz',
  '.env': 'TOKEN=123',
  'node_modules/pacote/index.js': 'x',
  '.git/HEAD': 'ref: refs/heads/main',
  '.DS_Store': 'lixo',
  'src/.gitignore': 'gerado.js\n',
  'src/gerado.js': 'some',
  'src/ok.js': 'fica',
  'lib/gerado.js': 'fica: a regra de src/ não vale aqui',
};

test('.gitignore da raiz e das subpastas valem como no Git', () => {
  const raiz = criarProjeto(PROJETO_COM_GITIGNORE);
  try {
    const r = listarArquivos(raiz);
    assert.equal(r.regras, '.gitignore');
    assert.deepEqual(
      r.arquivos.map((a) => a.rel),
      ['.gitignore', 'index.js', 'lib/gerado.js', 'manter.log', 'package.json', 'src/.gitignore', 'src/ok.js', 'sub/segredo.txt']
    );
  } finally {
    apagar(raiz);
  }
});

test('.rtcloudignore substitui o .gitignore (o build do CI pode subir)', () => {
  const raiz = criarProjeto({ ...PROJETO_COM_GITIGNORE, '.rtcloudignore': '# só logs\n*.log\n' });
  try {
    const r = listarArquivos(raiz);
    assert.equal(r.regras, '.rtcloudignore');
    const nomes = r.arquivos.map((a) => a.rel);
    for (const deveEntrar of ['dist/saida.js', 'segredo.txt', '.env', 'src/gerado.js', '.rtcloudignore', '.gitignore']) {
      assert.ok(nomes.includes(deveEntrar), `${deveEntrar} deveria entrar`);
    }
    for (const deveSair of ['app.log', 'manter.log', 'node_modules/pacote/index.js', '.git/HEAD', '.DS_Store']) {
      assert.ok(!nomes.includes(deveSair), `${deveSair} deveria ficar de fora`);
    }
  } finally {
    apagar(raiz);
  }
});

test('rtcloud.ignore também vale', () => {
  const raiz = criarProjeto({ 'index.js': 'x', 'rtcloud.ignore': 'tmp/\n', 'tmp/a.txt': 'a' });
  try {
    const r = listarArquivos(raiz);
    assert.equal(r.regras, 'rtcloud.ignore');
    assert.deepEqual(r.arquivos.map((a) => a.rel), ['index.js', 'rtcloud.ignore']);
  } finally {
    apagar(raiz);
  }
});

test('manifestos da raiz nunca são ignorados (como no painel)', () => {
  const raiz = criarProjeto({
    'index.js': 'x',
    'package.json': '{}',
    'requirements.txt': 'flask',
    'outro.json': '{}',
    'sub/package.json': '{}',
    '.rtcloudignore': '*.json\n*.txt\n',
  });
  try {
    const nomes = listarArquivos(raiz).arquivos.map((a) => a.rel);
    assert.deepEqual(nomes, ['.rtcloudignore', 'index.js', 'package.json', 'requirements.txt']);
  } finally {
    apagar(raiz);
  }
});

test('o .zip tem exatamente os arquivos e o conteúdo certos', () => {
  const raiz = criarProjeto({ ...PROJETO_COM_GITIGNORE, 'imagem.png': crypto.randomBytes(2048), 'acentuação/olá.txt': 'çãõ' });
  const tmp = pastaTemporaria();
  try {
    const destino = path.join(tmp, 'pacote.zip');
    const p = montarPacote(raiz, destino);
    const zip = fs.readFileSync(destino);
    assert.equal(p.bytes, zip.length);
    const conteudo = unzipSync(new Uint8Array(zip));
    assert.deepEqual(Object.keys(conteudo).sort(), [...p.caminhos].sort());
    assert.equal(strFromU8(conteudo['index.js']), 'console.log("oi")');
    assert.equal(strFromU8(conteudo['acentuação/olá.txt']), 'çãõ');
    assert.deepEqual(Buffer.from(conteudo['imagem.png']), fs.readFileSync(path.join(raiz, 'imagem.png')));
    assert.equal(p.total, p.caminhos.length);
    assert.ok(p.maiores.length > 0 && p.maiores[0].caminho === 'imagem.png');
    const entradas = entradasDoZip(zip);
    assert.ok(entradas.every((e) => e.sistema === 3), 'entradas marcadas como Unix');
    const acentuado = entradas.find((e) => e.nome === 'acentuação/olá.txt');
    assert.ok(acentuado && (acentuado.flags & 0x800), 'nome com acento marcado como UTF-8');
  } finally {
    apagar(raiz, tmp);
  }
});

test('mantém a permissão de execução de scripts', { skip: process.platform === 'win32' && 'o Windows não tem bit de execução' }, () => {
  const raiz = criarProjeto({ 'start.sh': '#!/bin/sh\necho oi\n', 'index.js': 'x' });
  const tmp = pastaTemporaria();
  try {
    fs.chmodSync(path.join(raiz, 'start.sh'), 0o755);
    const destino = path.join(tmp, 'p.zip');
    montarPacote(raiz, destino);
    const e = entradasDoZip(fs.readFileSync(destino));
    assert.equal(e.find((x) => x.nome === 'start.sh').modoUnix & 0o777, 0o755);
    assert.equal(e.find((x) => x.nome === 'index.js').modoUnix & 0o111, 0);
  } finally {
    apagar(raiz, tmp);
  }
});

test('passou do limite: erro com os maiores arquivos e sem .zip largado', () => {
  const raiz = criarProjeto({ 'index.js': 'x', 'video.bin': crypto.randomBytes(64 * 1024) });
  const tmp = pastaTemporaria();
  const destino = path.join(tmp, 'grande.zip');
  try {
    assert.throws(
      () => montarPacote(raiz, destino, { limiteBytes: 16 * 1024 }),
      (e) => e instanceof ErroDaAction && e.codigo === 'PAYLOAD_TOO_LARGE' && /video\.bin/.test(e.dica) && /\.rtcloudignore/.test(e.dica)
    );
    assert.equal(fs.existsSync(destino), false);
  } finally {
    apagar(raiz, tmp);
  }
});

test('pasta sem nada para enviar é recusada', () => {
  const raiz = criarProjeto({ '.gitignore': '*\n', 'a.txt': 'a' });
  const tmp = pastaTemporaria();
  try {
    /* o próprio .gitignore casa com "*" — sobra nada */
    assert.throws(() => montarPacote(raiz, path.join(tmp, 'p.zip')), (e) => e instanceof ErroDaAction && /Nenhum arquivo/.test(e.message));
  } finally {
    apagar(raiz, tmp);
  }
});

test('o .zip de destino dentro do projeto não entra nele mesmo', () => {
  const raiz = criarProjeto({ 'index.js': 'x' });
  try {
    const destino = path.join(raiz, 'saida.zip');
    const p = montarPacote(raiz, destino);
    assert.deepEqual(p.caminhos, ['index.js']);
  } finally {
    apagar(raiz);
  }
});

test('links simbólicos não são seguidos', (t) => {
  const fora = criarProjeto({ 'senha.txt': 'não pode subir' });
  const raiz = criarProjeto({ 'index.js': 'x' });
  try {
    try {
      fs.symlinkSync(path.join(fora, 'senha.txt'), path.join(raiz, 'atalho.txt'));
      fs.symlinkSync(fora, path.join(raiz, 'pasta-de-fora'), 'dir');
    } catch (e) {
      t.skip(`este sistema não deixa criar link simbólico (${e.code})`);
      return;
    }
    const r = listarArquivos(raiz);
    assert.deepEqual(r.arquivos.map((a) => a.rel), ['index.js']);
    assert.deepEqual(r.links.sort(), ['atalho.txt', 'pasta-de-fora']);
  } finally {
    apagar(raiz, fora);
  }
});
