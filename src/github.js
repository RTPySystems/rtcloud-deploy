'use strict';
/**
 * O pouco que a Action precisa do runner do GitHub, sem dependência externa.
 *
 * Entradas chegam como variáveis INPUT_*; saídas e o resumo do job são
 * arquivos cujo caminho o runner passa em GITHUB_OUTPUT e
 * GITHUB_STEP_SUMMARY; o resto (máscara, aviso, erro, grupo) são comandos
 * "::nome::" escritos na saída padrão. É tudo documentado pelo GitHub em
 * "Workflow commands for GitHub Actions".
 */
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

/** Erro já explicado para a pessoa — a mensagem vai direto para o log e o resumo. */
class ErroDaAction extends Error {
  /**
   * @param {string} mensagem
   * @param {{ dica?: string, http?: number, codigo?: string }} [extra]
   */
  constructor(mensagem, extra = {}) {
    super(mensagem);
    this.name = 'ErroDaAction';
    this.dica = extra.dica || '';
    this.http = extra.http || 0;
    this.codigo = extra.codigo || '';
  }
}

function escaparDado(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escaparPropriedade(s) {
  return escaparDado(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function comando(nome, mensagem = '', props = {}) {
  const lista = Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${escaparPropriedade(v)}`)
    .join(',');
  process.stdout.write(`::${nome}${lista ? ` ${lista}` : ''}::${escaparDado(mensagem)}${os.EOL}`);
}

/** Lê uma entrada do `with:`. O GitHub manda em INPUT_<NOME EM MAIÚSCULAS>. */
function lerEntrada(nome, ambiente = process.env) {
  const chave = `INPUT_${nome.replace(/ /g, '_').toUpperCase()}`;
  return String(ambiente[chave] ?? '').trim();
}

/** Esconde um segredo de todo log seguinte (vira ***). */
function mascarar(segredo) {
  const s = String(segredo || '').trim();
  if (s) comando('add-mask', s);
}

function info(mensagem) {
  process.stdout.write(`${mensagem}${os.EOL}`);
}

function aviso(mensagem, titulo) {
  comando('warning', mensagem, { title: titulo });
}

function erro(mensagem, titulo) {
  comando('error', mensagem, { title: titulo });
}

function nota(mensagem, titulo) {
  comando('notice', mensagem, { title: titulo });
}

async function emGrupo(titulo, fn) {
  comando('group', titulo);
  try {
    return await fn();
  } finally {
    comando('endgroup');
  }
}

/**
 * Imprime texto que não é nosso (nomes de arquivo do projeto) sem deixar
 * uma linha como "::error::…" virar comando do runner.
 */
function semComandos(fn) {
  const ficha = `rtcloud-${crypto.randomUUID()}`;
  comando('stop-commands', ficha);
  try {
    return fn();
  } finally {
    process.stdout.write(`::${ficha}::${os.EOL}`);
  }
}

/** Saída do passo (`steps.<id>.outputs.<nome>`), no formato com delimitador. */
function definirSaida(nome, valor, ambiente = process.env) {
  const arquivo = ambiente.GITHUB_OUTPUT;
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (!arquivo) return false;
  const delimitador = `rtcloud_${crypto.randomUUID()}`;
  fs.appendFileSync(arquivo, `${nome}<<${delimitador}${os.EOL}${texto}${os.EOL}${delimitador}${os.EOL}`, 'utf8');
  return true;
}

/** Acrescenta Markdown ao resumo do job (a página do run no GitHub). */
function escreverResumo(markdown, ambiente = process.env) {
  const arquivo = ambiente.GITHUB_STEP_SUMMARY;
  if (!arquivo) return false;
  fs.appendFileSync(arquivo, `${markdown}${os.EOL}`, 'utf8');
  return true;
}

module.exports = {
  ErroDaAction,
  lerEntrada,
  mascarar,
  info,
  aviso,
  erro,
  nota,
  emGrupo,
  semComandos,
  definirSaida,
  escreverResumo,
  escaparDado,
};
