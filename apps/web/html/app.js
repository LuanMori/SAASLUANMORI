import { Auth0Client } from '@auth0/auth0-spa-js';
import { criarApi } from '../src/api';
import { montarProdutos, mostrarSessao } from '../src/telas/produtos-view.js';

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
  const app = document.createElement('div');
  app.className = 'app';
  raiz.replaceChildren(app);
  const desmontar = montarProdutos(app, api, () => {
    void sair();
  });
  window.addEventListener('pagehide', evento => {
    if (!evento.persisted) desmontar();
  });
  mostrarSessao(app, sessao);
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
