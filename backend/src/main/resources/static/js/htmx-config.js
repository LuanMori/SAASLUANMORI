// static/js/htmx-config.js — o HTMX com a política de segurança da página (decisão T6): nada de <style> próprio para os
// indicadores (style-src 'self') nem de código em atributos (script-src 'self'). As recusas de regra (400, 403, 404, 409,
// 422, 429) trazem os avisos para a tela, como as mensagens do sistema antigo. Sem resposta do servidor, ou com uma
// falha dele, a mensagem é a mesma do sistema antigo (legacy/web/src/api.ts:973-984; legacy/api/src/http/filtro-erros.ts:86)
// e aparece onde o pedido saiu: no aviso geral da janela, ou no alto da parte, no lugar dos outros avisos.
(function () {
  'use strict';
  var SEM_CONEXAO = 'Sem conexão com o servidor. Verifique a internet.';
  var ERRO_INTERNO = 'Erro interno. Tente novamente.';
  var ALGO_ERRADO = 'Algo deu errado. Tente novamente.';

  document.addEventListener('htmx:beforeSwap', function (e) {
    var s = e.detail.xhr.status;
    if (s === 400 || s === 403 || s === 404 || s === 409 || s === 422 || s === 429) {
      e.detail.shouldSwap = true;
      e.detail.isError = false;
    }
  });

  function mostrarErro(elt, texto) {
    if (!elt || !elt.closest) return;
    var caixa = elt.closest('.modal-caixa');
    var alerta = caixa ? caixa.querySelector('[data-alerta]') : null;
    if (alerta) {
      alerta.hidden = false;
      alerta.className = 'alerta alerta-erro';
      alerta.setAttribute('role', 'alert');
      alerta.textContent = texto;
      return;
    }
    var parte = elt.closest('.rel');
    if (!parte) return;
    var velhos = parte.querySelectorAll(':scope > p.alerta');
    for (var i = 0; i < velhos.length; i++) velhos[i].parentNode.removeChild(velhos[i]);
    var p = document.createElement('p');
    p.className = 'alerta alerta-erro';
    p.setAttribute('role', 'alert');
    p.textContent = texto;
    var topo = parte.querySelector(':scope > header');
    if (topo) topo.insertAdjacentElement('afterend', p);
    else parte.insertBefore(p, parte.firstChild);
  }

  document.addEventListener('htmx:sendError', function (e) {
    mostrarErro(e.detail.elt, SEM_CONEXAO);
  });
  document.addEventListener('htmx:responseError', function (e) {
    mostrarErro(e.detail.elt, e.detail.xhr.status === 500 ? ERRO_INTERNO : ALGO_ERRADO);
  });
})();
