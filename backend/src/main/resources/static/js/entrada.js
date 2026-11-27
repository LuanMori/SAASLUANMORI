// static/js/entrada.js — o comportamento da tela de entrada (legacy/web/src/telas/TelaEntrada.tsx): o botão "Entrar"
// só liga com usuário e senha; ao enviar, vira "Entrando…"; o olho mostra e esconde a senha; o aviso de Caps Lock;
// "Esqueceu a senha?" e o Suporte abrem e fecham a explicação. O que só aparece às vezes fica num <template> da página
// e entra na tela quando precisa (como no sistema antigo, em que o elemento nem existia).
(function () {
  'use strict';

  function aparecer(id, depoisDe) {
    var modelo = document.getElementById(id);
    var el = modelo.content.firstElementChild.cloneNode(true);
    depoisDe.insertAdjacentElement('afterend', el);
    return el;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('form[data-entrada]');
    if (form) {
      var usuario = form.querySelector('#entrada-usuario');
      var senha = form.querySelector('#entrada-senha');
      var botao = form.querySelector('.entrada-botao');
      var enviando = false;
      var conferir = function () {
        botao.disabled = !(usuario.value.trim() !== '' && senha.value !== '' && !enviando);
      };
      usuario.addEventListener('input', conferir);
      senha.addEventListener('input', conferir);
      conferir();
      form.addEventListener('submit', function (ev) {
        if (botao.disabled) {
          ev.preventDefault();
          return;
        }
        enviando = true;
        botao.disabled = true;
        botao.textContent = 'Entrando…';
      });

      var olho = form.querySelector('.entrada-olho');
      olho.addEventListener('click', function () {
        var mostrar = senha.type === 'password';
        senha.type = mostrar ? 'text' : 'password';
        olho.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
        olho.setAttribute('aria-pressed', String(mostrar));
        olho.replaceChild(document.getElementById(mostrar ? 'tpl-olho-fechado' : 'tpl-olho-aberto').content.firstElementChild.cloneNode(true), olho.firstElementChild);
      });

      var caixaSenha = senha.closest('.entrada-caixa');
      var caps = null;
      var verCaps = function (e) {
        var ligado = !!(e.getModifierState && e.getModifierState('CapsLock'));
        if (ligado && !caps) {
          caps = aparecer('tpl-caps', caixaSenha);
          senha.setAttribute('aria-describedby', 'entrada-caps');
        } else if (!ligado && caps) {
          caps.remove();
          caps = null;
          senha.removeAttribute('aria-describedby');
        }
      };
      senha.addEventListener('keyup', verCaps);
      senha.addEventListener('keydown', verCaps);
      senha.addEventListener('blur', function () {
        if (caps) {
          caps.remove();
          caps = null;
          senha.removeAttribute('aria-describedby');
        }
      });

      var link = form.querySelector('[data-ajuda-senha]');
      var ajuda = null;
      link.addEventListener('click', function () {
        if (ajuda) {
          ajuda.remove();
          ajuda = null;
        } else {
          ajuda = aparecer('tpl-ajuda-senha', link);
        }
        link.setAttribute('aria-expanded', String(!!ajuda));
      });
    }

    var suporte = document.querySelector('.entrada-suporte-botao');
    if (suporte) {
      var caixa = null;
      suporte.addEventListener('click', function () {
        if (caixa) {
          caixa.remove();
          caixa = null;
        } else {
          caixa = aparecer('tpl-suporte', suporte);
        }
        suporte.setAttribute('aria-expanded', String(!!caixa));
      });
    }
  });
})();
