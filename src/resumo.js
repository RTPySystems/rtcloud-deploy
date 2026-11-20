'use strict';
/**
 * O resumo do job (a página do run no GitHub) — em sucesso e em falha.
 *
 * Tudo que vem de fora (nome da aplicação, mensagem do servidor, caminho de
 * arquivo) passa por `celula()`: sem isso um "|" quebra a tabela e um "<"
 * vira HTML no resumo.
 */
const { formatarBytes } = require('./pacote');

function celula(texto) {
  return String(texto ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .trim();
}

function codigo(texto) {
  const t = celula(texto).replace(/`/g, "'");
  return t ? `\`${t}\`` : '';
}

function duracao(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** Endereço do painel a partir da URL da API (…/api/v1 → …). */
function enderecoDoPainel(api, appId) {
  try {
    const u = new URL(api);
    const base = u.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${u.origin}${base}/dashboard/apps/${encodeURIComponent(appId)}`;
  } catch {
    return null;
  }
}

function contextoDoGit(ambiente = process.env) {
  const sha = ambiente.GITHUB_SHA || '';
  const repo = ambiente.GITHUB_REPOSITORY || '';
  const servidor = (ambiente.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  return {
    sha,
    curto: sha.slice(0, 7),
    ref: ambiente.GITHUB_REF_NAME || '',
    link: sha && repo ? `${servidor}/${repo}/commit/${sha}` : null,
  };
}

function linhaDoPacote(pacote) {
  if (!pacote) return null;
  const regras = pacote.regras ? `regras do ${codigo(pacote.regras)}` : 'sem arquivo de ignorar';
  return `${formatarBytes(pacote.bytes)} · ${pacote.total} arquivo${pacote.total === 1 ? '' : 's'} · ${regras}`;
}

function linhaDoGit(git) {
  if (!git.curto) return null;
  const sha = git.link ? `[${codigo(git.curto)}](${git.link})` : codigo(git.curto);
  return git.ref ? `${sha} em ${codigo(git.ref)}` : sha;
}

function tabela(linhas) {
  const validas = linhas.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return ['| | |', '| --- | --- |', ...validas.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}

function blocoDosMaiores(pacote) {
  if (!pacote || !pacote.maiores || pacote.maiores.length === 0) return '';
  const linhas = pacote.maiores.map((m) => `| ${codigo(m.caminho)} | ${formatarBytes(m.tamanho)} |`);
  return [
    '',
    '<details><summary>Maiores arquivos do pacote</summary>',
    '',
    '| Arquivo | Tamanho |',
    '| --- | --- |',
    ...linhas,
    '',
    '</details>',
  ].join('\n');
}

function textoDoReinicio(r) {
  if (!r) return null;
  switch (r.situacao) {
    case 'feito':
      return r.motivo === 'variaveis'
        ? `Feito, para carregar ${r.variaveis} variáve${r.variaveis === 1 ? 'l nova' : 'is novas'}`
        : 'Feito (restart: true)';
    case 'falhou':
      return `Falhou: ${celula(r.erro)}`;
    case 'desligado':
      return 'Não (restart: false)';
    default:
      return 'Não precisou (o commit já reinicia a aplicação)';
  }
}

/**
 * @param {object} d
 * @param {string} d.api
 * @param {{ id:string, nome:string, url:string|null }|null} d.aplicacao
 * @param {object|null} d.pacote
 * @param {{ online:boolean, variaveisNovas:number, mensagem:string }|null} d.commit
 * @param {object|null} d.reinicio
 * @param {number} d.ms
 * @param {{ mensagem:string, dica?:string, etapa?:string }|null} d.falha
 * @param {string[]} [d.avisos]
 */
function montarResumo(d, ambiente = process.env) {
  const git = contextoDoGit(ambiente);
  const app = d.aplicacao;
  const nomeApp = app
    ? app.nome && app.nome !== app.id
      ? `**${celula(app.nome)}** (${codigo(app.id)})`
      : `**${celula(app.id)}**`
    : d.appInformada
      ? codigo(d.appInformada)
      : null;
  const painel = app ? enderecoDoPainel(d.api, app.id) : null;
  const partes = [];

  if (d.commit) {
    const reinicioFalhou = d.reinicio && d.reinicio.situacao === 'falhou';
    partes.push(
      reinicioFalhou
        ? '## ⚠️ Deploy na RTCloud: versão publicada, mas o reinício falhou'
        : '## ✅ Deploy na RTCloud: nova versão publicada'
    );
    partes.push('');
    partes.push(
      tabela([
        ['Aplicação', nomeApp],
        ['Situação', d.commit.online ? '🟢 No ar' : '🟡 Reiniciando: confira o status em instantes'],
        ['Endereço', app && app.url ? celula(app.url) : null],
        ['Pacote', linhaDoPacote(d.pacote)],
        ['Variáveis novas do .env', String(d.commit.variaveisNovas)],
        ['Reinício extra', textoDoReinicio(d.reinicio)],
        ['Commit do Git', linhaDoGit(git)],
        ['Tempo', duracao(d.ms)],
      ])
    );
    if (d.commit.mensagem) partes.push('', `> ${celula(d.commit.mensagem)}`);
  } else {
    partes.push('## ❌ Deploy na RTCloud: a versão não foi publicada');
    partes.push('');
    if (d.falha) {
      partes.push(`**O que aconteceu:** ${celula(d.falha.mensagem)}`);
      if (d.falha.dica) partes.push('', `**Como resolver:** ${celula(d.falha.dica)}`);
      partes.push('');
    }
    partes.push(
      tabela([
        ['Aplicação', nomeApp],
        ['Etapa', d.falha && d.falha.etapa ? celula(d.falha.etapa) : null],
        ['Pacote', linhaDoPacote(d.pacote)],
        ['Commit do Git', linhaDoGit(git)],
        ['Tempo', duracao(d.ms)],
      ])
    );
  }

  if (d.avisos && d.avisos.length) {
    partes.push('', d.avisos.map((a) => `> [!WARNING]\n> ${celula(a)}`).join('\n\n'));
  }
  if (painel) partes.push('', `[Abrir a aplicação no painel da RTCloud →](${painel})`);
  const maiores = blocoDosMaiores(d.pacote);
  if (maiores) partes.push(maiores);
  return `${partes.join('\n')}\n`;
}

module.exports = { montarResumo, enderecoDoPainel, celula };
