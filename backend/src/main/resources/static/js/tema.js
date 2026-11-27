// static/js/tema.js — tema claro / escuro (DaniPets ACE-15: "a escolha fica neste computador; sem escolha, segue o
// sistema"), como legacy/web/src/tema.ts. Carregado no <head>, antes de a página aparecer: aplica o tema já na primeira
// pintura. Sem escolha, segue o claro/escuro do computador (e muda junto se ele mudar). O botão (barra lateral e tela de
// entrada) troca entre claro e escuro, e a escolha fica guardada neste navegador. O CSS lê data-tema="claro|escuro".
(function () {
  'use strict';
  var CHAVE = 'saas:tema';
  var ESCURO_NO_SISTEMA = '(prefers-color-scheme: dark)';
  /* navegador que não deixa guardar: a escolha vale só nesta aba */
  var escolhaNaMemoria = 'auto';

  function escolhaDoTema() {
    try {
      var v = localStorage.getItem(CHAVE);
      if (v === 'claro' || v === 'escuro') return v;
      return v === null ? escolhaNaMemoria : 'auto'; // valor estranho guardado: segue o computador
    } catch (e) {
      return escolhaNaMemoria;
    }
  }

  function sistemaEscuro() {
    return typeof window.matchMedia === 'function' && window.matchMedia(ESCURO_NO_SISTEMA).matches;
  }

  function temaAtual() {
    var escolha = escolhaDoTema();
    return escolha === 'escuro' || (escolha === 'auto' && sistemaEscuro()) ? 'escuro' : 'claro';
  }

  var ICONE_SOL = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>';
  var ICONE_LUA = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';

  /** O botão mostra o tema para onde vai (BotaoTema.tsx): no escuro, o sol; no claro, a lua. */
  function atualizarBotoes(tema) {
    var proximo = tema === 'escuro' ? 'claro' : 'escuro';
    var botoes = document.querySelectorAll('[data-botao-tema]');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].setAttribute('aria-label', 'Usar o tema ' + proximo);
      botoes[i].setAttribute('title', 'Tema ' + proximo);
      var svg = botoes[i].querySelector('svg');
      if (svg) svg.innerHTML = tema === 'escuro' ? ICONE_SOL : ICONE_LUA;
    }
  }

  function aplicarTema() {
    var t = temaAtual();
    document.documentElement.dataset.tema = t;
    document.documentElement.style.colorScheme = t === 'escuro' ? 'dark' : 'light';
    atualizarBotoes(t);
    return t;
  }

  function alternarTema() {
    var novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
    escolhaNaMemoria = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch (e) {
      /* sem localStorage: vale só até fechar a aba */
    }
    return aplicarTema();
  }

  aplicarTema();
  if (typeof window.matchMedia === 'function') {
    var mq = window.matchMedia(ESCURO_NO_SISTEMA);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function () {
        if (escolhaDoTema() === 'auto') aplicarTema();
      });
    }
  }
  window.addEventListener('storage', function (e) {
    if (e.key === CHAVE || e.key === null) aplicarTema();
  });
  document.addEventListener('DOMContentLoaded', function () {
    atualizarBotoes(temaAtual());
    document.addEventListener('click', function (e) {
      var botao = e.target.closest ? e.target.closest('[data-botao-tema]') : null;
      if (botao) alternarTema();
    });
  });
})();
