// static/js/painel.js — a área logada: os botões da barra lateral levam às partes; "Sair" encerra a sessão; e a tela
// sai sozinha depois de N minutos sem uso (legacy/web/src/usarInatividade.ts:1-39; DaniPets: 30). Conta como uso:
// teclado, clique, toque, mouse, roda e rolagem; confere a cada 15 s e quando a aba volta a aparecer. O servidor derruba
// a sessão do mesmo jeito; isto só faz a TELA sair junto, para ninguém deixar o caixa aberto num computador largado.
(function () {
  'use strict';
  var EVENTOS = ['keydown', 'mousedown', 'mousemove', 'touchstart', 'wheel', 'scroll'];

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {
      var alvo = e.target.closest ? e.target.closest('[data-ir],[data-sair]') : null;
      if (!alvo) return;
      if (alvo.hasAttribute('data-sair')) {
        document.getElementById('form-sair').submit();
      } else {
        window.location.assign(alvo.getAttribute('data-ir'));
      }
    });

    var minutos = Number(document.body.getAttribute('data-inatividade-min'));
    if (!minutos || minutos <= 0) return;
    var ultimoUso = Date.now();
    var marcar = function () {
      ultimoUso = Date.now();
    };
    for (var i = 0; i < EVENTOS.length; i++) window.addEventListener(EVENTOS[i], marcar, { passive: true, capture: true });
    var parado = false;
    var conferir = function () {
      if (!parado && Date.now() - ultimoUso >= minutos * 60000) {
        parado = true;
        clearInterval(timer);
        document.getElementById('form-sair-inatividade').submit();
      }
    };
    var timer = setInterval(conferir, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') conferir();
    });
  });
})();
