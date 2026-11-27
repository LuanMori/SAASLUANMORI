// static/js/janela.js — a janela por cima da tela (legacy/web/src/painel/caixa/Modal.tsx:1-66): o foco vai para o primeiro
// campo, Tab não sai da janela, Esc fecha, apertar o mouse fora dela fecha, e o foco volta para onde estava. A janela
// chega pelo HTMX (o servidor monta o conteúdo) e entra como o último item da parte, como no React. "Cancelar" tem
// [data-fechar]. Se a parte inteira volta do servidor (deu certo), a janela some junto e o foco vai para o botão que a
// abriu, no conteúdo novo ([data-foco]); o mesmo vale para um botão da parte que a faz voltar (Desativar/Reativar).
(function () {
  'use strict';
  var FOCAVEIS = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
  var aberta = null;
  var focoPendente = null;

  function aoTeclar(e) {
    if (!aberta) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
      return;
    }
    if (e.key !== 'Tab') return;
    var lista = aberta.caixa.querySelectorAll(FOCAVEIS);
    if (lista.length === 0) return;
    var primeiro = lista[0];
    var ultimo = lista[lista.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  function fechar(devolverFoco) {
    if (!aberta) return;
    var a = aberta;
    aberta = null;
    document.removeEventListener('keydown', aoTeclar, true);
    if (a.fundo.parentNode) a.fundo.parentNode.removeChild(a.fundo);
    if (devolverFoco && a.antes && document.body.contains(a.antes) && a.antes.focus) a.antes.focus();
  }

  function abrir(fundo) {
    var caixa = fundo.querySelector('.modal-caixa');
    if (!caixa) return;
    if (aberta) {
      // já havia uma janela aberta (dois cliques): fica a primeira
      fundo.parentNode.removeChild(fundo);
      return;
    }
    var antes = document.activeElement;
    aberta = { fundo: fundo, caixa: caixa, antes: antes, chave: antes && antes.getAttribute ? antes.getAttribute('data-foco') : null };
    var primeiro = caixa.querySelector(FOCAVEIS);
    if (primeiro) primeiro.focus();
    document.addEventListener('keydown', aoTeclar, true);
    fundo.addEventListener('mousedown', function (e) {
      if (e.target === fundo) fechar(true);
    });
    caixa.addEventListener('click', function (e) {
      var alvo = e.target.closest ? e.target.closest('[data-fechar]') : null;
      if (alvo && caixa.contains(alvo)) fechar(true);
    });
  }

  document.addEventListener('htmx:load', function (e) {
    var elt = e.target;
    if (elt && elt.classList && elt.classList.contains('modal-fundo')) abrir(elt);
  });

  // com uma janela aberta, outro botão que abre janela não faz nada (setJanela só guarda uma)
  document.addEventListener('htmx:beforeRequest', function (e) {
    if (aberta && e.detail.elt && e.detail.elt.hasAttribute && e.detail.elt.hasAttribute('data-abre-janela')) e.preventDefault();
  });

  // a parte vai voltar inteira: guarda para onde o foco vai depois (abrir a janela só acrescenta, não troca a parte)
  document.addEventListener('htmx:beforeSwap', function (e) {
    var alvo = e.detail.target;
    if (!e.detail.shouldSwap || !alvo || !alvo.contains) return;
    // no beforeSwap, detail.elt é o alvo da troca; quem fez o pedido fica em requestConfig.elt
    var elt = e.detail.requestConfig && e.detail.requestConfig.elt;
    var troca = (e.detail.xhr && e.detail.xhr.getResponseHeader('HX-Reswap')) || (elt && elt.getAttribute && elt.getAttribute('hx-swap')) || 'innerHTML';
    if (troca.indexOf('outerHTML') !== 0 && troca.indexOf('innerHTML') !== 0) return;
    if (aberta && alvo.contains(aberta.fundo)) {
      focoPendente = aberta.chave;
      fechar(false);
    } else if (!aberta && document.activeElement && alvo.contains(document.activeElement) && document.activeElement.getAttribute) {
      focoPendente = document.activeElement.getAttribute('data-foco');
    }
  });

  document.addEventListener('htmx:afterSettle', function () {
    if (!focoPendente) return;
    var chave = focoPendente;
    focoPendente = null;
    var alvo = document.querySelector('[data-foco="' + chave.replace(/"/g, '') + '"]');
    if (alvo && alvo.focus) alvo.focus();
  });
})();
