import { Auth0Client } from '@auth0/auth0-spa-js';
import { criarApi, ErroApi } from './api.js';
import { formatarCentavos, reaisParaCentavos } from './dinheiro.js';
import { validarNovoProduto } from './produto.js';

const raiz = document.getElementById('raiz');
const clonar = id => document.getElementById(id).content.cloneNode(true);
const el = (tag, classe, texto) => {
  const n = document.createElement(tag);
  n.className = classe;
  n.textContent = texto;
  return n;
};
const telaMensagem = texto => raiz.replaceChildren(el('p', 'carregando-tela', texto));
const env = import.meta.env;
const faltando = ['VITE_AUTH0_DOMAIN','VITE_AUTH0_CLIENT_ID','VITE_AUTH0_AUDIENCE','VITE_API_URL'].filter(n => !env[n]);
let auth;

function login(erro = null) {
  raiz.replaceChildren(clonar('t-login'));
  const alerta = raiz.querySelector('[role="alert"]');
  if (erro) { alerta.hidden = false; alerta.textContent = erro; }
  raiz.querySelector('button').onclick = () => auth.loginWithRedirect().catch(() => login('Não foi possível entrar. Tente novamente.'));
}
function produtos(api, sessao, sair) {
  let estado = { tipo: 'carregando' };
  let enviando = false;
  let ativo = true;
  raiz.replaceChildren(clonar('t-produtos'));
  const app = raiz.querySelector('.app');
  app.querySelector('#loja').textContent = sessao.loja ?? 'Minha loja';
  app.querySelector('#usuario').textContent = sessao.nome;
  const conteudo = app.querySelector('#conteudo');
  const novo = app.querySelector('#novo');
  const lista = app.querySelector('#lista');
  const form = novo.querySelector('form');
  const nome = form.querySelector('#nome');
  const barras = form.querySelector('#codigoBarras');
  const preco = form.querySelector('#preco');
  const botao = form.querySelector('button');
  const cabecalho = lista.querySelector('.painel-cabecalho');
  const corpo = lista.querySelector('#lista-corpo');
  const parar = () => {
    ativo = false;
    clearInterval(intervalo);
    document.removeEventListener('visibilitychange', voltar);
    return sair();
  };
  app.querySelector('#sair').onclick = parar;

  function renderizar() {
    if (!ativo) return;
    if (estado.tipo === 'bloqueado') {
      conteudo.replaceChildren(clonar('t-bloqueado'));
      conteudo.querySelector('[role="alert"]').textContent = estado.mensagem;
      conteudo.querySelector('button').onclick = parar;
      return;
    }
    if (!novo.isConnected) {
      form.reset();
      erros([]);
      mensagem(null);
      conteudo.replaceChildren(novo, lista);
    }
    cabecalho.querySelector('.suave')?.remove();
    corpo.replaceChildren();
    if (estado.tipo === 'carregando') {
      corpo.append(el('p','suave','Carregando…'));
      return;
    }
    cabecalho.append(el('span','suave',estado.produtos.length + ' cadastrados'));
    if (estado.avisoRede) {
      const aviso = el('p','alerta alerta-aviso','Sem conexão com o servidor. Tentando de novo…');
      aviso.setAttribute('role','status'); corpo.append(aviso);
    }
    if (!estado.produtos.length) {
      corpo.append(el('p','vazio','Nenhum produto cadastrado ainda.'));
      return;
    }
    const tabela = clonar('t-tabela');
    const tbody = tabela.querySelector('tbody');
    for (const p of estado.produtos) {
      const linha = clonar('t-linha');
      linha.querySelector('.mono').textContent = p.codigoInterno;
      const pequeno = linha.querySelector('small');
      pequeno.className = p.codigoBarras ? 'mono suave' : 'suave';
      pequeno.textContent = p.codigoBarras ?? 'sem código de barras';
      linha.querySelector('[data-rotulo="Produto"]').textContent = p.nome;
      linha.querySelector('[data-rotulo="Preço"]').textContent = formatarCentavos(p.precoCentavos);
      tbody.append(linha);
    }
    corpo.append(tabela);
  }
  async function carregar() {
    try {
      const produtos = await api.listarProdutos();
      estado = {tipo:'pronto',produtos,avisoRede:false};
    } catch (e) {
      const erro = e instanceof ErroApi ? e : new ErroApi(0,'Algo deu errado.');
      estado = [401,403].includes(erro.status)
        ? {tipo:'bloqueado',mensagem:erro.message}
        : estado.tipo === 'pronto' ? {...estado,avisoRede:true} : {tipo:'pronto',produtos:[],avisoRede:true};
    }
    renderizar();
  }
  function erros(lista) {
    for (const [campo, input] of [['nome',nome],['codigoBarras',barras],['precoCentavos',preco]]) {
      const div = input.parentElement;
      const erro = lista.find(e => e.campo === campo)?.mensagem;
      div.classList.toggle('campo-com-erro', Boolean(erro));
      div.querySelector('.campo-erro')?.remove();
      if (erro) div.append(el('span','campo-erro',erro));
    }
  }
  function mensagem(texto) {
    novo.querySelector('[role="status"]')?.remove();
    if (texto) {
      const p = el('p','alerta',texto); p.setAttribute('role','status'); novo.append(p);
    }
  }
  barras.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); preco.focus(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (enviando) return;
    mensagem(null);
    const centavos = reaisParaCentavos(preco.value);
    if (centavos === null) { erros([{campo:'precoCentavos',mensagem:'Informe um preço válido (ex.: 12,90).'}]); return; }
    const validacao = validarNovoProduto({nome:nome.value,codigoBarras:barras.value,precoCentavos:centavos});
    if (!validacao.ok) { erros(validacao.erros); return; }
    enviando = true; botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      const criado = await api.criarProduto(validacao.valor);
      if (estado.tipo === 'pronto') {
        estado.produtos = [...estado.produtos,criado].sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));
        renderizar();
      }
      form.reset(); erros([]);
      mensagem('“' + criado.nome + '” cadastrado com o código ' + criado.codigoInterno + '.');
      nome.focus();
    } catch (e) {
      const erro = e instanceof ErroApi ? e : new ErroApi(0,'Algo deu errado.');
      erros(erro.erros); mensagem(erro.erros.length ? null : erro.message);
    } finally {
      enviando = false; botao.disabled = false; botao.textContent = 'Cadastrar';
    }
  });
  const voltar = () => { if (document.visibilityState === 'visible') void carregar(); };
  const intervalo = setInterval(voltar,5000);
  document.addEventListener('visibilitychange',voltar);
  void carregar();
}

async function iniciar() {
  if (faltando.length) { telaMensagem('Configuração incompleta: ' + faltando.join(', ')); return; }
  telaMensagem('Carregando…');
  auth = new Auth0Client({
    domain:env.VITE_AUTH0_DOMAIN,clientId:env.VITE_AUTH0_CLIENT_ID,
    authorizationParams:{redirect_uri:window.location.origin,audience:env.VITE_AUTH0_AUDIENCE},
    cacheLocation:'memory',useRefreshTokens:true,useRefreshTokensFallback:true
  });
  let erro = null;
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('state') && (params.has('code') || params.has('error'))) {
      try { await auth.handleRedirectCallback(); } finally { history.replaceState({},document.title,location.pathname); }
    } else await auth.checkSession();
  } catch { erro = 'Não foi possível entrar. Tente novamente.'; }
  if (!await auth.isAuthenticated()) { login(erro); return; }
  const user = await auth.getUser();
  const api = criarApi(env.VITE_API_URL.replace(/\/+$/,''), async () => {
    const token = await auth.getTokenSilently();
    if (!token) throw new Error('sem token');
    return token;
  });
  produtos(api,{nome:user?.name ?? user?.email ?? 'Usuário',loja:typeof user?.org_name === 'string' ? user.org_name : null},
    () => auth.logout({logoutParams:{returnTo:window.location.origin}}));
}
iniciar().catch(() => telaMensagem('Não foi possível entrar. Tente novamente.'));
