// apps/web/src/api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApiServidor, ErroApi, MENSAGEM_SEM_SERVIDOR } from './api';

afterEach(() => vi.restoreAllMocks());

const responder = (status: number, corpo: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(corpo), { status }));

describe('criarApiServidor', () => {
  it('o que o servidor ainda não tem responde 501 com o aviso (e o objeto não parece uma Promise)', async () => {
    const api = criarApiServidor('/api', vi.fn());
    await expect(api.listarVendas()).rejects.toMatchObject({ status: 501, message: MENSAGEM_SEM_SERVIDOR });
    await expect(api.resumoFinanceiro()).rejects.toBeInstanceOf(ErroApi);
    expect((api as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it('manda cookie do mesmo endereço e lê o erro no formato do servidor (com codigo)', async () => {
    const fetch = responder(403, { status: 403, mensagem: 'Usuários: só o Dono ou o Administrador.', codigo: 'sem_permissao' });
    const api = criarApiServidor('/api', vi.fn());
    const erro = await api.listarUsuarios().catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 403, message: 'Usuários: só o Dono ou o Administrador.', codigo: 'sem_permissao' });
    expect(fetch).toHaveBeenCalledWith('/api/usuarios', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('401 de sessão encerrada avisa quem montou a área logada', async () => {
    responder(401, { status: 401, mensagem: 'Sua sessão terminou. Entre de novo.', codigo: 'sessao_encerrada' });
    const aoSessaoEncerrada = vi.fn();
    await criarApiServidor('/api', aoSessaoEncerrada).listarProdutos().catch(() => undefined);
    expect(aoSessaoEncerrada).toHaveBeenCalledWith('Sua sessão terminou. Entre de novo.');
  });

  it('204 vira undefined; o corpo vai em JSON', async () => {
    const fetch = responder(204, null);
    await expect(criarApiServidor('/api', vi.fn()).redefinirSenhaUsuario('abc', 'nova-senha-1')).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/usuarios/abc/senha');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ senha: 'nova-senha-1' }), headers: { 'Content-Type': 'application/json' } });
  });

  it('sem rede: status 0 com mensagem própria', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(criarApiServidor('/api', vi.fn()).listarUsuarios()).rejects.toMatchObject({ status: 0, message: 'Sem conexão com o servidor. Verifique a internet.' });
  });
});
