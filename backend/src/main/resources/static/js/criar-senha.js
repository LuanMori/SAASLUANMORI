// static/js/criar-senha.js — "Crie a sua senha" (legacy/web/src/painel/TrocarSenha.tsx:24-99): "Mostrar as senhas"
// troca os três campos; ao enviar, o botão vira "Salvando…". O envio vai pelo HTMX: o servidor confere as mesmas regras
// e devolve só os avisos (o que foi digitado continua nos campos, como antes); deu certo, vai para o painel.
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('form[data-criar-senha]');
    if (!form) return;
    var mostrar = form.querySelector('.ts-mostrar input[type=checkbox]');
    var aplicar = function () {
      var campos = form.querySelectorAll('input[data-senha]');
      for (var i = 0; i < campos.length; i++) campos[i].type = mostrar.checked ? 'text' : 'password';
    };
    mostrar.addEventListener('change', aplicar);
    // a senha atual volta vazia depois de uma recusa do servidor: segue o "Mostrar as senhas"
    document.body.addEventListener('htmx:oobAfterSwap', aplicar);
    var botao = form.querySelector('button[type=submit]');
    var texto = botao.textContent;
    form.addEventListener('htmx:beforeRequest', function () {
      botao.disabled = true;
      botao.textContent = 'Salvando…';
    });
    form.addEventListener('htmx:afterRequest', function () {
      botao.disabled = false;
      botao.textContent = texto;
    });
  });
})();
