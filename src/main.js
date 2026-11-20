'use strict';
/**
 * O passo inteiro: confere a chave e a aplicação, monta o .zip, publica pelo
 * Commit da API v1, reinicia se precisar e escreve o resumo do job.
 *
 * O resumo sai sempre — em falha também, com o motivo e o que fazer — e as
 * saídas do passo recebem o que se sabe até o ponto em que parou.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const gh = require('./github');
const { lerEntradas } = require('./entradas');
const { montarPacote, formatarBytes } = require('./pacote');
const { consultarAplicacao, publicarCommit, reiniciarAplicacao } = require('./api');
const { montarResumo, enderecoDoPainel } = require('./resumo');

const LISTAR_ATE = 300;

function avisoDoGithub(aplicacao) {
  if (!aplicacao || !aplicacao.github) return null;
  const g = aplicacao.github;
  return (
    `Esta aplicação também está com o Deploy automático pelo GitHub ligado (${g.repo}${g.branch ? `, branch ${g.branch}` : ''}). ` +
    'Cada push pode publicar duas vezes: desligue um dos dois no painel, na aba Commit da aplicação.'
  );
}

function avisoDoPrincipal(aplicacao, pacote) {
  const principal = aplicacao && aplicacao.principal ? aplicacao.principal.replace(/^\.?\/+/, '') : '';
  if (!principal || !pacote || pacote.caminhos.includes(principal)) return null;
  return (
    `O arquivo principal configurado na aplicação (${principal}) não está no pacote. ` +
    'Se ele é gerado no build, rode o build antes deste passo e confira o .gitignore / .rtcloudignore.'
  );
}

/**
 * @param {{ ambiente?: NodeJS.ProcessEnv, esperar?: (ms:number)=>Promise<void> }} [opcoes]
 */
async function executar(opcoes = {}) {
  const ambiente = opcoes.ambiente || process.env;
  const esperar = opcoes.esperar;
  const inicio = Date.now();
  const avisos = [];
  const estado = { aplicacao: null, pacote: null, commit: null, reinicio: null };
  let entradas = null;
  let etapa = 'Leitura das entradas';
  let falha = null;
  let destino = null;

  /* antes de qualquer outra coisa: a chave nunca aparece no log */
  gh.mascarar(gh.lerEntrada('api-key', ambiente));
  const appInformada = gh.lerEntrada('app-id', ambiente);
  const log = (m) => gh.info(m);
  const avisar = (m) => {
    avisos.push(m);
    gh.aviso(m, 'Deploy na RTCloud');
  };

  try {
    entradas = lerEntradas(ambiente);
    const { api, chave } = entradas;

    etapa = 'Consulta da aplicação';
    estado.aplicacao = await gh.emGrupo('Conferindo a chave e a aplicação', async () => {
      const a = await consultarAplicacao({ api, chave, app: entradas.app, esperar, log });
      log(`Aplicação: ${a.nome} (${a.id})${a.tipo ? ` · ${a.tipo}` : ''}`);
      return a;
    });
    const avisoGit = avisoDoGithub(estado.aplicacao);
    if (avisoGit) avisar(avisoGit);

    etapa = 'Montagem do pacote';
    destino = path.join(ambiente.RUNNER_TEMP || os.tmpdir(), `rtcloud-${crypto.randomUUID()}.zip`);
    estado.pacote = await gh.emGrupo('Montando o pacote', async () => {
      const p = montarPacote(entradas.pasta, destino);
      log(`Pasta: ${entradas.pastaInformada}`);
      log(`Regras: ${p.regras || 'nenhum arquivo de ignorar (ficam de fora só .git e node_modules)'}`);
      log(`${p.total} arquivos · ${formatarBytes(p.bytesOriginais)} → ${formatarBytes(p.bytes)} no .zip · ${p.ignorados} itens ignorados`);
      gh.semComandos(() => {
        for (const c of p.caminhos.slice(0, LISTAR_ATE)) log(`  ${c}`);
        if (p.caminhos.length > LISTAR_ATE) log(`  … e mais ${p.caminhos.length - LISTAR_ATE}`);
      });
      return p;
    });
    if (estado.pacote.links.length) {
      const exemplos = estado.pacote.links.slice(0, 5).join(', ');
      avisar(
        `${estado.pacote.links.length} link(s) simbólico(s) ficaram de fora do pacote (${exemplos}${estado.pacote.links.length > 5 ? ', …' : ''}). ` +
          'Copie o conteúdo para dentro do projeto se ele precisa subir.'
      );
    }
    const avisoPrincipal = avisoDoPrincipal(estado.aplicacao, estado.pacote);
    if (avisoPrincipal) avisar(avisoPrincipal);

    etapa = 'Commit';
    estado.commit = await gh.emGrupo('Enviando para a RTCloud', async () => {
      const zip = fs.readFileSync(destino);
      const c = await publicarCommit({ api, chave, app: estado.aplicacao.id, zip, esperar, log });
      log(c.mensagem || 'Commit aplicado.');
      if (c.variaveisNovas > 0) log(`Variáveis novas vindas do .env: ${c.variaveisNovas}`);
      return c;
    });

    etapa = 'Reinício';
    const pedir = entradas.reinicio === 'true' || (entradas.reinicio === 'auto' && estado.commit.variaveisNovas > 0);
    if (!pedir) {
      estado.reinicio = { situacao: entradas.reinicio === 'false' ? 'desligado' : 'dispensado' };
    } else {
      try {
        await gh.emGrupo('Reiniciando a aplicação', async () => {
          const r = await reiniciarAplicacao({ api, chave, app: estado.aplicacao.id, esperar, log });
          log(r.mensagem || 'Reinício pedido.');
        });
        estado.reinicio = {
          situacao: 'feito',
          motivo: entradas.reinicio === 'true' ? 'pedido' : 'variaveis',
          variaveis: estado.commit.variaveisNovas,
        };
      } catch (e) {
        estado.reinicio = { situacao: 'falhou', erro: e.message };
        if (entradas.reinicio === 'true') throw e;
        avisar(`A versão foi publicada, mas o reinício para carregar as variáveis novas falhou: ${e.message}`);
      }
    }
  } catch (e) {
    const conhecido = e instanceof gh.ErroDaAction;
    falha = {
      mensagem: conhecido ? e.message : `Erro inesperado: ${e && e.message ? e.message : e}`,
      dica: conhecido ? e.dica : 'Rode o job de novo. Se continuar, abra um chamado no painel com o link deste run.',
      etapa,
    };
    if (!conhecido && e && e.stack) {
      await gh.emGrupo('Detalhes técnicos do erro', async () => gh.semComandos(() => log(e.stack)));
    }
  } finally {
    if (destino) fs.rmSync(destino, { force: true });
  }

  const ms = Date.now() - inicio;
  const appId = estado.aplicacao ? estado.aplicacao.id : '';
  const painel = appId && entradas ? enderecoDoPainel(entradas.api, appId) : '';

  gh.definirSaida('app-id', appId, ambiente);
  gh.definirSaida('online', estado.commit ? String(estado.commit.online) : 'false', ambiente);
  gh.definirSaida('env-added', estado.commit ? String(estado.commit.variaveisNovas) : '0', ambiente);
  gh.definirSaida('restarted', estado.reinicio && estado.reinicio.situacao === 'feito' ? 'true' : 'false', ambiente);
  gh.definirSaida('package-size', estado.pacote ? String(estado.pacote.bytes) : '0', ambiente);
  gh.definirSaida('files', estado.pacote ? String(estado.pacote.total) : '0', ambiente);
  gh.definirSaida('dashboard-url', painel || '', ambiente);
  gh.definirSaida('message', falha ? falha.mensagem : (estado.commit && estado.commit.mensagem) || 'Commit aplicado.', ambiente);

  try {
    gh.escreverResumo(
      montarResumo(
        {
          api: entradas ? entradas.api : '',
          aplicacao: estado.aplicacao,
          appInformada,
          pacote: estado.pacote,
          /* com restart: true, um reinício que falhou ainda mostra o commit que entrou */
          commit: estado.commit,
          reinicio: estado.reinicio,
          ms,
          falha,
          avisos,
        },
        ambiente
      ),
      ambiente
    );
  } catch (e) {
    gh.aviso(`Não foi possível escrever o resumo do job: ${e.message}`);
  }

  if (falha) {
    gh.erro(falha.dica ? `${falha.mensagem} ${falha.dica}` : falha.mensagem, 'Deploy na RTCloud');
    process.exitCode = 1;
    return { ok: false, falha, ...estado };
  }
  gh.nota(
    estado.commit.online ? 'Nova versão publicada e aplicação no ar.' : 'Nova versão publicada. A aplicação está reiniciando.',
    'Deploy na RTCloud'
  );
  return { ok: true, falha: null, ...estado };
}

module.exports = { executar };
