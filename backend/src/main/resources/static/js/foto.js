// static/js/foto.js — a foto do perfil na aba Meu usuário (legacy/web/src/painel/TelaMeuUsuario.tsx:55-160 e
// legacy/web/src/painel/imagem.ts:1-68). O arquivo escolhido é lido e reduzido no próprio navegador, sem ir para fora:
// cortado em quadrado no meio, com até 256 px, em JPEG com fundo branco. A foto escolhida aparece antes de ser salva,
// com "Salvar a foto" e "Cancelar" (o <template data-foto-nova> do cartão); salvar e tirar vão pelo HTMX, e o servidor
// confere de novo o formato e o tamanho.
(function () {
  'use strict';
  var TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
  var MAX_BYTES = 5 * 1024 * 1024;
  var MAX_CARACTERES = 150000;
  var LADO = 256;
  var GRANDE = 'A foto é grande demais. Use uma imagem menor (até 100 KB).';

  function lerComoDataUrl(arquivo) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () { resolve(String(leitor.result)); };
      leitor.onerror = function () { reject(new Error('Não foi possível ler a imagem.')); };
      leitor.readAsDataURL(arquivo);
    });
  }

  // reduzirImagem com { lado: 256, quadrado: true, jpeg: true }; null = este navegador não reduz
  function reduzir(arquivo) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(arquivo).then(function (imagem) {
      var corte = Math.min(imagem.width, imagem.height);
      var origem = { x: (imagem.width - corte) / 2, y: (imagem.height - corte) / 2, largura: corte, altura: corte };
      var escala = Math.min(1, LADO / Math.max(origem.largura, origem.altura));
      var largura = Math.max(1, Math.round(origem.largura * escala));
      var altura = Math.max(1, Math.round(origem.altura * escala));
      var tela = document.createElement('canvas');
      tela.width = largura;
      tela.height = altura;
      var ctx = tela.getContext('2d');
      if (!ctx) {
        imagem.close();
        return null;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(imagem, origem.x, origem.y, origem.largura, origem.altura, 0, 0, largura, altura);
      imagem.close();
      return tela.toDataURL('image/jpeg', 0.85);
    });
  }

  // prepararImagem: o tipo, o tamanho do arquivo, a redução e o tamanho final
  function preparar(arquivo) {
    if (TIPOS.indexOf(arquivo.type) < 0) return Promise.reject(new Error('Escolha uma imagem PNG, JPEG ou WebP.'));
    if (arquivo.size > MAX_BYTES) return Promise.reject(new Error('A imagem passa de 5 MB. Escolha uma menor.'));
    return reduzir(arquivo)
      .catch(function () { return null; })
      .then(function (reduzida) { return reduzida || lerComoDataUrl(arquivo); })
      .then(function (imagem) {
        if (imagem.length > MAX_CARACTERES) throw new Error(GRANDE);
        return imagem;
      });
  }

  // setErro(null); setAviso(null)
  function limparAvisos(cartao) {
    var erro = cartao.querySelector('#mu-perfil-erro');
    if (erro) {
      erro.hidden = true;
      erro.removeAttribute('class');
      erro.removeAttribute('role');
      erro.textContent = '';
    }
    var avisos = cartao.querySelectorAll(':scope > p.alerta[role=status]');
    for (var i = 0; i < avisos.length; i++) avisos[i].parentNode.removeChild(avisos[i]);
  }

  function mostrarErro(cartao, texto) {
    var erro = cartao.querySelector('#mu-perfil-erro');
    if (!erro) return;
    erro.hidden = false;
    erro.className = 'alerta alerta-erro';
    erro.setAttribute('role', 'alert');
    erro.textContent = texto;
  }

  // a foto escolhida aparece no lugar da salva, com "Salvar a foto" e "Cancelar"
  function mostrarNova(cartao, nova) {
    var caixa = cartao.querySelector('.mu-foto');
    var acoes = cartao.querySelector('.mu-foto-acoes');
    if (!cartao.hasAttribute('data-foto-antes')) {
      cartao.setAttribute('data-foto-antes', '1');
      cartao._fotoAntes = caixa.innerHTML;
      cartao._acoesAntes = acoes.innerHTML;
    }
    var img = document.createElement('img');
    img.src = nova;
    img.alt = 'A foto escolhida (ainda não salva)';
    caixa.textContent = '';
    caixa.appendChild(img);
    cartao.querySelector('#mu-foto-nova').value = nova;
    acoes.textContent = '';
    acoes.appendChild(cartao.querySelector('template[data-foto-nova]').content.cloneNode(true));
    if (window.htmx) window.htmx.process(acoes);
  }

  // setNova(null): volta a foto salva e os botões de antes
  function cancelar(cartao) {
    if (!cartao.hasAttribute('data-foto-antes')) return;
    cartao.querySelector('.mu-foto').innerHTML = cartao._fotoAntes;
    var acoes = cartao.querySelector('.mu-foto-acoes');
    acoes.innerHTML = cartao._acoesAntes;
    if (window.htmx) window.htmx.process(acoes);
    cartao.querySelector('#mu-foto-nova').value = '';
    cartao.removeAttribute('data-foto-antes');
    cartao._fotoAntes = null;
    cartao._acoesAntes = null;
  }

  document.addEventListener('change', function (e) {
    var campo = e.target;
    if (!campo.matches || !campo.matches('input[type=file][data-foto-arquivo]')) return;
    var cartao = campo.closest('[data-perfil]');
    var arquivo = campo.files && campo.files[0];
    campo.value = '';
    if (!cartao || !arquivo) return;
    limparAvisos(cartao);
    preparar(arquivo).then(function (nova) {
      mostrarNova(cartao, nova);
    }, function (falha) {
      mostrarErro(cartao, falha && falha.message ? falha.message : 'Não foi possível salvar. Tente de novo.');
    });
  });

  document.addEventListener('click', function (e) {
    var botao = e.target.closest ? e.target.closest('[data-foto-cancelar]') : null;
    if (!botao) return;
    var cartao = botao.closest('[data-perfil]');
    if (cartao) cancelar(cartao);
  });

  // enquanto grava: "Salvando…" e os botões desligados (enviando); a resposta troca o cartão ou traz o erro
  function enviando(cartao, sim) {
    var botoes = cartao.querySelectorAll('.mu-foto-acoes button, .mu-foto-acoes input');
    for (var i = 0; i < botoes.length; i++) botoes[i].disabled = sim;
    var salvar = cartao.querySelector('[data-foto-salvar]');
    if (salvar) salvar.textContent = sim ? 'Salvando…' : 'Salvar a foto';
  }

  document.addEventListener('htmx:beforeRequest', function (e) {
    var elt = e.detail.elt;
    if (!elt || !elt.hasAttribute || !elt.hasAttribute('data-foto-envio')) return;
    var cartao = elt.closest('[data-perfil]');
    if (!cartao) return;
    limparAvisos(cartao);
    enviando(cartao, true);
  });

  document.addEventListener('htmx:afterRequest', function (e) {
    var elt = e.detail.elt;
    if (!elt || !elt.hasAttribute || !elt.hasAttribute('data-foto-envio')) return;
    var cartao = elt.closest('[data-perfil]');
    if (cartao && document.body.contains(cartao)) enviando(cartao, false);
  });
})();
