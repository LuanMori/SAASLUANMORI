// static/js/htmx-config.js — o HTMX com a política de segurança da página (decisão T6): nada de <style> próprio para os
// indicadores (style-src 'self') nem de código em atributos (script-src 'self'). As recusas de regra (400, 403, 409,
// 422, 429) trazem os avisos para a tela, como as mensagens do sistema antigo.
(function () {
  'use strict';
  document.addEventListener('htmx:beforeSwap', function (e) {
    var s = e.detail.xhr.status;
    if (s === 400 || s === 403 || s === 409 || s === 422 || s === 429) {
      e.detail.shouldSwap = true;
      e.detail.isError = false;
    }
  });
})();
