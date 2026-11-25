import { formatarCentavos, reaisParaCentavos, validarNovoProduto } from '@saas/core';
import { ErroApi } from '../api';
import markup from './produtos.html?raw';

export function montarProdutos(app, api, aoSair, intervaloMs = 5000) {
  // Apenas o modelo estático do build passa por innerHTML.
  app.innerHTML = markup;
  const conteudo = app.querySelector('main');
  const novo = conteudo.querySelector('[data-novo]');
  const lista = conteudo.querySelector('[data-lista]');
  const form = novo.querySelector('form');
  const nome = form.querySelector('#nome');
  const barras = form.querySelector('#codigoBarras');
  const preco = form.querySelector('#preco');
  const enviar = form.querySelector('button');
  const status = novo.querySelector('[role=status]');
  const contagem = lista.querySelector('[data-contagem]');
  const tabela = lista.querySelector('table');
  const linha = app.querySelector('[data-linha]').content;
  const bloqueio = app.querySelector('[data-bloqueio]').content;
  const eventos = new AbortController();
  const { signal } = eventos;
  let produtos = [];
  let bloqueado = false;
  let versao = 0;
  let montagemForm = 0;

  function mensagem(texto) {
    status.textContent = texto ?? '';
    status.hidden = !texto;
  }

  function erros(itens) {
    for (const [campo, input] of [['nome', nome], ['codigoBarras', barras], ['precoCentavos', preco]]) {
      const texto = itens.find(item => item.campo === campo)?.mensagem ?? '';
      const aviso = input.parentElement.querySelector('.campo-erro');
      input.parentElement.classList.toggle('campo-com-erro', Boolean(texto));
      aviso.textContent = texto;
      aviso.hidden = !texto;
    }
  }

  function mostrarLista(avisoRede) {
    if (bloqueado) {
      conteudo.replaceChildren(novo, lista);
      bloqueado = false;
    }
    contagem.hidden = false;
    contagem.replaceChildren(String(produtos.length), ' cadastrados');
    lista.querySelector('[data-carregando]').hidden = true;
    lista.querySelector('[role=status]').hidden = !avisoRede;
    lista.querySelector('.vazio').hidden = produtos.length !== 0;
    tabela.hidden = produtos.length === 0;
    const linhas = document.createDocumentFragment();
    for (const produto of produtos) {
      const item = linha.cloneNode(true);
      item.querySelector('.mono').textContent = produto.codigoInterno;
      const pequeno = item.querySelector('small');
      pequeno.className = produto.codigoBarras ? 'mono suave' : 'suave';
      pequeno.textContent = produto.codigoBarras ?? 'sem código de barras';
      item.querySelector('[data-rotulo="Produto"]').textContent = produto.nome;
      item.querySelector('[data-rotulo="Preço"]').textContent = formatarCentavos(produto.precoCentavos);
      linhas.append(item);
    }
    tabela.tBodies[0].replaceChildren(linhas);
  }

  function bloquear(texto) {
    if (!bloqueado) {
      montagemForm++;
      form.reset();
      erros([]);
      mensagem(null);
      enviar.disabled = false;
      enviar.textContent = 'Cadastrar';
      produtos = [];
      conteudo.replaceChildren(bloqueio.cloneNode(true));
      conteudo.querySelector('button').onclick = aoSair;
      bloqueado = true;
    }
    conteudo.querySelector('[role=alert]').textContent = texto;
  }

  async function carregar() {
    const tentativa = ++versao;
    try {
      const itens = await api.listarProdutos();
      if (signal.aborted || tentativa !== versao) return;
      produtos = itens;
      mostrarLista(false);
    } catch (erro) {
      if (signal.aborted || tentativa !== versao) return;
      if (erro instanceof ErroApi && (erro.status === 401 || erro.status === 403)) bloquear(erro.message);
      else mostrarLista(true);
    }
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    if (enviar.disabled) return;
    mensagem(null);
    const centavos = reaisParaCentavos(preco.value);
    if (centavos === null) {
      erros([{ campo: 'precoCentavos', mensagem: 'Informe um preço válido (ex.: 12,90).' }]);
      return;
    }
    const dados = validarNovoProduto({ nome: nome.value, codigoBarras: barras.value, precoCentavos: centavos });
    if (!dados.ok) { erros(dados.erros); return; }
    enviar.disabled = true;
    enviar.textContent = 'Salvando…';
    const origem = montagemForm;
    try {
      const criado = await api.criarProduto(dados.valor);
      if (signal.aborted || origem !== montagemForm) return;
      if (lista.querySelector('[data-carregando]').hidden) {
        ++versao;
        produtos = [...produtos.filter(item => item.id !== criado.id), criado].sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));
        mostrarLista(!lista.querySelector('[role=status]').hidden);
      } else {
        void carregar();
      }
      form.reset();
      erros([]);
      mensagem('“' + criado.nome + '” cadastrado com o código ' + criado.codigoInterno + '.');
      nome.focus();
    } catch (causa) {
      if (signal.aborted || origem !== montagemForm) return;
      const erro = causa instanceof ErroApi ? causa : new ErroApi(0, 'Algo deu errado.');
      erros(erro.erros);
      mensagem(erro.erros.length ? null : erro.message);
    } finally {
      if (!signal.aborted && origem === montagemForm) {
        enviar.disabled = false;
        enviar.textContent = 'Cadastrar';
      }
    }
  }

  app.querySelector('[data-sair]').onclick = aoSair;
  barras.addEventListener('keydown', evento => {
    if (evento.key === 'Enter') { evento.preventDefault(); preco.focus(); }
  }, { signal });
  form.addEventListener('submit', cadastrar, { signal });
  function atualizarSeVisivel() { if (document.visibilityState === 'visible') void carregar(); }
  document.addEventListener('visibilitychange', atualizarSeVisivel, { signal });
  const intervalo = window.setInterval(atualizarSeVisivel, intervaloMs);
  void carregar();
  return () => {
    eventos.abort();
    window.clearInterval(intervalo);
    app.replaceChildren();
  };
}

export function mostrarSessao(app, sessao) {
  app.querySelector('[data-loja]').textContent = sessao.loja ?? 'Minha loja';
  app.querySelector('[data-usuario]').textContent = sessao.nome;
}
