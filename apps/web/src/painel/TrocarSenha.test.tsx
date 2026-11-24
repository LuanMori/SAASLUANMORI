// apps/web/src/painel/TrocarSenha.test.tsx
import { MENSAGEM_ACABOU_DE_BLOQUEAR } from '@saas/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiConta, ErroApi } from '../api';
import { TelaCriarSenha } from './TrocarSenha';

afterEach(cleanup);

function montar(trocar: ApiConta['trocarMinhaSenha']) {
  const aoTrocar = vi.fn();
  const aoBloquear = vi.fn();
  const aoSair = vi.fn();
  render(
    <TelaCriarSenha api={{ trocarMinhaSenha: trocar }} loja={{ nome: 'Loja A' }} pessoa={{ nome: 'Joana Lima', usuario: 'joana' }} aoTrocar={aoTrocar} aoBloquear={aoBloquear} aoSair={aoSair} />,
  );
  const preencher = async (atual: string, nova: string, confirmacao = nova) => {
    if (atual) await userEvent.type(screen.getByLabelText('Senha provisória que você recebeu'), atual);
    if (nova) await userEvent.type(screen.getByLabelText('Senha nova'), nova);
    if (confirmacao) await userEvent.type(screen.getByLabelText('Repita a senha nova'), confirmacao);
    await userEvent.click(screen.getByRole('button', { name: 'Criar a minha senha' }));
  };
  return { aoTrocar, aoBloquear, aoSair, preencher };
}

describe('Crie a sua senha (primeiro acesso)', () => {
  it('confere a senha nova antes de mandar (as mesmas regras do servidor)', async () => {
    const trocar = vi.fn();
    const { preencher } = montar(trocar);
    await preencher('provisoria-1', '1234567');
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText('Senha nova'));
    await userEvent.clear(screen.getByLabelText('Repita a senha nova'));
    await preencher('', 'joana-lima-2026', 'joana-lima-2026');
    expect(screen.getByText('A senha não pode ter o seu usuário ou o seu nome.')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText('Senha nova'));
    await userEvent.clear(screen.getByLabelText('Repita a senha nova'));
    await preencher('', 'cavalo-bateria-grampo', 'cavalo-bateria-grampa');
    expect(screen.getByText('A confirmação está diferente da senha nova.')).toBeTruthy();
    expect(trocar).not.toHaveBeenCalled();
  });

  it('troca e avisa; senha atual errada mostra o erro; 5 erradas bloqueiam e saem', async () => {
    const trocar = vi
      .fn<ApiConta['trocarMinhaSenha']>()
      .mockRejectedValueOnce(new ErroApi(400, 'A senha atual não confere.', [{ campo: 'senhaAtual', mensagem: 'Senha atual errada.' }]))
      .mockRejectedValueOnce(new ErroApi(429, MENSAGEM_ACABOU_DE_BLOQUEAR))
      .mockResolvedValueOnce(undefined);
    const { preencher, aoTrocar, aoBloquear } = montar(trocar);
    await preencher('errada-1', 'cavalo-bateria-grampo');
    expect(await screen.findByText('A senha atual não confere.')).toBeTruthy();
    expect(screen.getByText('Senha atual errada.')).toBeTruthy();
    await preencher('errada-2', '', '');
    expect(aoBloquear).toHaveBeenCalledWith(MENSAGEM_ACABOU_DE_BLOQUEAR);
    await userEvent.clear(screen.getByLabelText('Senha provisória que você recebeu'));
    await preencher('certa-123', '', '');
    expect(aoTrocar).toHaveBeenCalledTimes(1);
    expect(trocar).toHaveBeenLastCalledWith('certa-123', 'cavalo-bateria-grampo');
  });

  it('o primeiro acesso também tem o tema claro / escuro', async () => {
    montar(vi.fn());
    await userEvent.click(screen.getByRole('button', { name: /^Usar o tema/ }));
    const agora = document.documentElement.dataset.tema;
    expect(screen.getByRole('button', { name: `Usar o tema ${agora === 'escuro' ? 'claro' : 'escuro'}` })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Usar o tema/ }));
    expect(document.documentElement.dataset.tema).not.toBe(agora);
  });

  it('dá para sair sem criar a senha', async () => {
    const { aoSair } = montar(vi.fn());
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(aoSair).toHaveBeenCalled();
  });
});
