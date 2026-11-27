// static/js/formulario.js — os formulários que vão pelo HTMX (decisão T22): enquanto o pedido vai, o botão de enviar fica
// desligado com o texto de [data-salvando] ("Salvando…"), e volta quando a resposta chega, como o "enviando" das telas
// antigas. Os avisos de cada campo chegam do servidor nos marcadores [data-erro-campo]; o campo com aviso ganha a
// classe campo-com-erro e o aria-invalid="true", como no React (legacy/web/src/painel/TelaCompras.tsx:416-422).
(function () {
  'use strict';

  function botaoDe(form) {
    return form && form.querySelector ? form.querySelector('button[type=submit]') : null;
  }

  document.addEventListener('htmx:beforeRequest', function (e) {
    var form = e.detail.elt;
    if (!form || !form.matches || !form.matches('form[data-salvando]')) return;
    var botao = botaoDe(form);
    if (!botao) return;
    if (!botao.hasAttribute('data-texto')) botao.setAttribute('data-texto', botao.textContent);
    botao.disabled = true;
    botao.textContent = form.getAttribute('data-salvando');
  });

  document.addEventListener('htmx:afterRequest', function (e) {
    var form = e.detail.elt;
    if (!form || !form.matches || !form.matches('form[data-salvando]')) return;
    var botao = botaoDe(form);
    if (!botao || !botao.hasAttribute('data-texto')) return;
    botao.disabled = false;
    botao.textContent = botao.getAttribute('data-texto');
    botao.removeAttribute('data-texto');
  });

  // depois que os avisos novos assentam (o HTMX troca os atributos só no fim da troca)
  document.addEventListener('htmx:afterSettle', function () {
    var marcadores = document.querySelectorAll('[data-erro-campo]');
    for (var i = 0; i < marcadores.length; i++) {
      var campo = marcadores[i].closest('.campo');
      if (!campo) continue;
      var comErro = !marcadores[i].hidden;
      campo.classList.toggle('campo-com-erro', comErro);
      var entrada = campo.querySelector('input, select, textarea');
      if (entrada) entrada.setAttribute('aria-invalid', comErro ? 'true' : 'false');
    }
  });
})();
