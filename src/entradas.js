'use strict';
/**
 * Lê e confere as entradas do `with:` antes de qualquer trabalho.
 *
 * Tudo que dá para saber errado sem rede (chave no formato errado, pasta que
 * não existe, valor de `restart` inválido) falha aqui, com a correção escrita
 * — melhor do que empacotar 80 MB para descobrir no fim.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ErroDaAction, lerEntrada } = require('./github');

const API_PADRAO = 'https://rtcloud.com.br/api/v1';
const MODOS_DE_REINICIO = { auto: 'auto', true: 'true', false: 'false', sim: 'true', nao: 'false', 'não': 'false' };

function lerChave(ambiente) {
  const chave = lerEntrada('api-key', ambiente);
  if (!chave) {
    throw new ErroDaAction('A entrada "api-key" é obrigatória.', {
      dica: 'Gere uma chave com acesso total no painel (menu da conta → Chaves de API), salve como secret RTCLOUD_API_KEY e use api-key: ${{ secrets.RTCLOUD_API_KEY }}.',
    });
  }
  if (/^rtm_/.test(chave)) {
    throw new ErroDaAction('Essa chave começa com rtm_, que é do servidor MCP (assistentes de IA).', {
      dica: 'Para a Action, gere uma chave de API (começa com rtc_) com acesso total em menu da conta → Chaves de API.',
    });
  }
  if (!/^rtc_\S{8,}$/.test(chave)) {
    throw new ErroDaAction('A "api-key" não parece uma chave da RTCloud (deve começar com rtc_).', {
      dica: 'Copie a chave inteira, sem espaços nem aspas, e guarde num secret do repositório.',
    });
  }
  return chave;
}

function lerAplicacao(ambiente) {
  const app = lerEntrada('app-id', ambiente);
  if (!app) {
    throw new ErroDaAction('A entrada "app-id" é obrigatória.', {
      dica: 'Use o id da aplicação (aparece no painel e em GET /apps) ou o nome exato dela.',
    });
  }
  if (app.length > 80 || /[\r\n\t]/.test(app)) {
    throw new ErroDaAction('O "app-id" tem mais de 80 caracteres ou quebra de linha.', {
      dica: 'Use o id da aplicação (aparece no painel) ou o nome exato dela.',
    });
  }
  return app;
}

function lerPasta(ambiente) {
  const base = ambiente.GITHUB_WORKSPACE || process.cwd();
  const informada = lerEntrada('path', ambiente) || '.';
  const pasta = path.resolve(base, informada);
  let info;
  try {
    info = fs.statSync(pasta);
  } catch {
    throw new ErroDaAction(`A pasta "${informada}" não existe no runner.`, {
      dica: 'Confira se o passo actions/checkout veio antes e se o caminho é relativo à raiz do repositório.',
    });
  }
  if (!info.isDirectory()) {
    throw new ErroDaAction(`"${informada}" é um arquivo, não uma pasta.`, {
      dica: 'Aponte "path" para a pasta do projeto — a Action monta o .zip sozinha.',
    });
  }
  return { pasta, informada };
}

function lerReinicio(ambiente) {
  const bruto = (lerEntrada('restart', ambiente) || 'auto').toLowerCase();
  const modo = MODOS_DE_REINICIO[bruto];
  if (!modo) {
    throw new ErroDaAction(`Valor inválido em "restart": ${bruto}.`, {
      dica: 'Use auto (padrão), true ou false.',
    });
  }
  return modo;
}

function lerApi(ambiente) {
  const bruto = lerEntrada('api-url', ambiente) || API_PADRAO;
  let url;
  try {
    url = new URL(bruto);
  } catch {
    throw new ErroDaAction(`"api-url" inválida: ${bruto}.`, { dica: `Deixe em branco para usar ${API_PADRAO}.` });
  }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    /* a chave viaja no cabeçalho: http puro só para teste na própria máquina */
    throw new ErroDaAction('"api-url" precisa ser https.', { dica: `Deixe em branco para usar ${API_PADRAO}.` });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ErroDaAction('"api-url" não pode ter usuário, senha, ?parâmetros nem #âncora.', {
      dica: `Deixe em branco para usar ${API_PADRAO}.`,
    });
  }
  return url.toString().replace(/\/+$/, '');
}

/**
 * @returns {{ chave: string, app: string, pasta: string, pastaInformada: string, reinicio: 'auto'|'true'|'false', api: string }}
 */
function lerEntradas(ambiente = process.env) {
  const chave = lerChave(ambiente);
  const app = lerAplicacao(ambiente);
  const { pasta, informada } = lerPasta(ambiente);
  const reinicio = lerReinicio(ambiente);
  const api = lerApi(ambiente);
  return { chave, app, pasta, pastaInformada: informada, reinicio, api };
}

module.exports = { lerEntradas, API_PADRAO };
