'use strict';
/* Ponto de entrada do ncc: só chama o passo. A lógica fica em main.js (testável). */
const { executar } = require('./main');
const { erro } = require('./github');

executar().catch((e) => {
  erro(`Erro inesperado: ${e && e.message ? e.message : e}`, 'Deploy na RTCloud');
  process.exitCode = 1;
});
