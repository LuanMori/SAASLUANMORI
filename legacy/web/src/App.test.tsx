// apps/web/src/App.test.tsx
// Sistema real com login próprio, com o servidor simulado no fetch (as rotas e respostas do apps/api).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { MENSAGEM_SEM_SERVIDOR, type SessaoAtual } from './api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DONA: SessaoAtual = {
  usuario: { id: 'u1', nome: 'Dona Maria', usuario: 'dona', papel: 'dono' },
  loja: { nome: 'Loja A', subdominio: 'lojaa' },
  senhaProvisoria: false,
  inatividadeMin: 30,
};

type Rota = (corpo: unknown) => [number, unknown];

/** Servidor de mentira: "MÉTODO /caminho" -> [status, corpo]. Guarda os pedidos feitos. */
function servidor(rotas: Record<string, Rota>) {
  const pedidos: { rota: string; corpo: unknown; credentials?: RequestCredentials }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const caminho = String(url).replace(/^\/api/, '').replace(/\?.*$/, '');
    const rota = `${init?.method ?? 'GET'} ${caminho}`;
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    pedidos.push({ rota, corpo, credentials: init?.credentials });
    const r = rotas[rota];
    if (!r) return new Response(JSON.stringify({ status: 404, mensagem: 'Rota não encontrada.' }), { status: 404 });
    const [status, resposta] = r(corpo);
    return new Response(status === 204 ? null : JSON.stringify(resposta), { status, headers: { 'Content-Type': 'application/json' } });
  });
  return pedidos;
}

const semSessao: Rota = () => [401, { status: 401, mensagem: 'Faça login para continuar.', codigo: 'sem_sessao' }];
const lojaA: Rota = () => [200, { loja: { nome: 'Loja A', subdominio: 'lojaa' }, informarLoja: true }];
const listas: Record<string, Rota> = {
  'GET /usuarios': () => [200, { itens: [{ ...DONA.usuario, ativo: true, senhaProvisoria: false, bloqueadoAte: null, ultimoAcessoEm: null, criadoEm: '2026-11-18T12:00:00Z' }] }],
  'GET /auditoria': () => [200, { itens: [] }],
};

async function entrar(usuario = 'dona', senha = 'minha-senha-boa') {
  await userEvent.type(await screen.findByLabelText('Usuário'), usuario);
  await userEvent.type(screen.getByLabelText('Senha'), senha);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('App (sistema real, login próprio)', () => {
  it('sem sessão: tela de entrada com o nome da loja; o login manda loja, usuário e senha e abre a área logada', async () => {
    const pedidos = servidor({ 'GET /sessao': semSessao, 'GET /sessao/loja': lojaA, 'POST /sessao': () => [200, DONA], ...listas });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    expect(await screen.findByLabelText('Loja: Loja A')).toBeTruthy();
    await entrar();
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy();
    expect(pedidos.find((p) => p.rota === 'POST /sessao')?.corpo).toEqual({ loja: 'lojaa', usuario: 'dona', senha: 'minha-senha-boa' });
    expect(pedidos.every((p) => p.credentials === 'same-origin')).toBe(true);
  });

  it('senha errada: a mensagem do servidor aparece e a senha é apagada', async () => {
    servidor({
      'GET /sessao': semSessao,
      'GET /sessao/loja': lojaA,
      'POST /sessao': () => [401, { status: 401, mensagem: 'Usuário ou senha incorretos.', codigo: 'credenciais' }],
    });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    await entrar('dona', 'errada');
    expect(await screen.findByText('Usuário ou senha incorretos.')).toBeTruthy();
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('');
  });

  it('com sessão aberta, entra direto; abas que o servidor ainda não tem mostram o aviso', async () => {
    servidor({ 'GET /sessao': () => [200, DONA], ...listas });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByText(MENSAGEM_SEM_SERVIDOR)).toBeTruthy();
  });

  it('senha provisória: só deixa criar a própria senha', async () => {
    const pedidos = servidor({ 'GET /sessao': () => [200, { ...DONA, senhaProvisoria: true }], 'POST /sessao/senha': () => [200, DONA], ...listas });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    expect(await screen.findByText('Crie a sua senha')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Senha provisória que você recebeu'), 'provisoria-1');
    await userEvent.type(screen.getByLabelText('Senha nova'), 'cavalo-bateria-grampo');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'cavalo-bateria-grampo');
    await userEvent.click(screen.getByRole('button', { name: 'Criar a minha senha' }));
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy();
    expect(pedidos.find((p) => p.rota === 'POST /sessao/senha')?.corpo).toEqual({ senhaAtual: 'provisoria-1', senhaNova: 'cavalo-bateria-grampo' });
  });

  it('a sessão termina no meio do uso (401): volta para a entrada com o aviso', async () => {
    servidor({
      'GET /sessao': () => [200, DONA],
      'GET /usuarios': () => [401, { status: 401, mensagem: 'Sua sessão terminou. Entre de novo.', codigo: 'sessao_encerrada' }],
      'GET /auditoria': () => [200, { itens: [] }],
      'GET /sessao/loja': lojaA,
    });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    expect(await screen.findByText('Sua sessão terminou. Entre de novo.')).toBeTruthy();
    expect(screen.getByLabelText('Usuário')).toBeTruthy();
  });

  it('Sair encerra a sessão no servidor', async () => {
    const pedidos = servidor({ 'GET /sessao': () => [200, DONA], 'POST /sessao/sair': () => [204, null], 'GET /sessao/loja': lojaA, ...listas });
    render(<App urlApi="/api" lojaDev="lojaa" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(screen.getByLabelText('Usuário')).toBeTruthy());
    expect(pedidos.map((p) => p.rota)).toContain('POST /sessao/sair');
  });

  it('servidor fora do ar: avisa e deixa tentar de novo', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<App urlApi="/api" lojaDev="lojaa" />);
    expect(await screen.findByText(/Não foi possível falar com o servidor/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
