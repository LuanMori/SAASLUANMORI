// apps/web/src/painel/TelaMeuUsuario.test.tsx — aba "Meu usuário" (pedido do Luan, 25/11/2026): perfil e foto, entradas e
// saídas, trocar a senha; e a foto na barra lateral.
import { MENSAGENS_FOTO } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiConta, ErroApi, MENSAGEM_SEM_SERVIDOR } from '../api';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo, entrarDemo, registrarSaidaDemo, SENHA_DEMO } from '../demo/usuariosDemo';
import { prepararFoto, TelaMeuUsuario } from './TelaMeuUsuario';
import { TelaPainel } from './TelaPainel';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const arquivoPng = () => new File([Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))], 'eu.png', { type: 'image/png' });
const BRUNO = { nome: 'Bruno', usuario: 'bruno', papel: 'vendedor' as const };

/** O Bruno entrou e saiu ontem, entrou hoje cedo e saiu por falta de uso, e entrou de novo às 14:00 (está usando agora). */
async function brunoComAcessos() {
  let agora = new Date('2026-11-24T11:00:00.000Z');
  const relogio = () => agora;
  const entrar = () => entrarDemo('lojaa', 'bruno', SENHA_DEMO, { agora: relogio, atrasoMs: 0 });
  await entrar();
  agora = new Date('2026-11-24T15:30:00.000Z');
  await registrarSaidaDemo('loja-a', 'bruno', null, agora);
  agora = new Date('2026-11-25T11:02:00.000Z');
  await entrar();
  agora = new Date('2026-11-25T11:40:00.000Z');
  await registrarSaidaDemo('loja-a', 'bruno', 'inatividade', agora);
  agora = new Date('2026-11-25T17:00:00.000Z');
  await entrar();
  agora = new Date('2026-11-25T17:45:00.000Z');
  return { api: criarApiLocal({ lojaId: 'loja-a', operador: { id: 'bruno', nome: 'Bruno', papel: 'vendedor' }, exemplos: false, atrasoMs: 0, agora: relogio }), agora: relogio };
}

const celulas = (linha: HTMLElement) => within(linha).getAllByRole('cell').map((c) => c.textContent?.trim());

describe('Meu usuário', () => {
  it('mostra o perfil, as entradas e saídas (a de agora "em uso") e o formulário da senha', async () => {
    const { api, agora } = await brunoComAcessos();
    render(<TelaMeuUsuario api={api} pessoa={BRUNO} fuso={FUSO} agora={agora} aoBloquear={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Meu usuário', level: 1 })).toBeTruthy();
    const perfil = screen.getByRole('region', { name: 'Perfil' });
    expect(within(perfil).getByText('Bruno')).toBeTruthy();
    expect(within(perfil).getByText('bruno')).toBeTruthy();
    expect(within(perfil).getByText('Vendedor')).toBeTruthy();
    expect(await within(perfil).findByLabelText('Escolher a foto do perfil')).toBeTruthy();

    const acessos = screen.getByRole('region', { name: 'Entradas e saídas' });
    const linhas = (await within(acessos).findAllByRole('row')).slice(1);
    expect(linhas.map(celulas)).toEqual([
      ['25/11/2026', '14:00', 'em uso agora', '45 min'],
      ['25/11/2026', '08:02', '08:40 por falta de uso', '38 min'],
      ['24/11/2026', '08:00', '12:30', '4 h 30 min'],
    ]);
    expect(linhas[0]!.className).toContain('mu-atual');

    const senha = screen.getByRole('region', { name: 'Trocar a senha' });
    expect(within(senha).getByLabelText('Senha atual')).toBeTruthy();
    expect(within(senha).getByRole('button', { name: 'Trocar a senha' })).toBeTruthy();
  });

  it('a foto: escolher mostra a prévia; salvar grava e avisa a barra; tirar volta para a inicial', async () => {
    const { api, agora } = await brunoComAcessos();
    const aoMudarFoto = vi.fn();
    render(<TelaMeuUsuario api={api} pessoa={BRUNO} fuso={FUSO} agora={agora} aoBloquear={vi.fn()} aoMudarFoto={aoMudarFoto} />);
    const perfil = screen.getByRole('region', { name: 'Perfil' });
    expect(within(perfil).getByText('B')).toBeTruthy(); // sem foto: a inicial

    await userEvent.upload(await within(perfil).findByLabelText('Escolher a foto do perfil'), arquivoPng());
    expect(((await within(perfil).findByRole('img', { name: 'A foto escolhida (ainda não salva)' })) as HTMLImageElement).src).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect((await api.meuPerfil()).foto ?? null).toBeNull(); // ainda não salvou
    await userEvent.click(within(perfil).getByRole('button', { name: 'Salvar a foto' }));
    expect(await within(perfil).findByText('Foto salva. Ela aparece também no canto da barra lateral.')).toBeTruthy();
    expect(within(perfil).getByRole('img', { name: 'A sua foto' })).toBeTruthy();
    expect((await api.meuPerfil()).foto).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(aoMudarFoto).toHaveBeenCalledExactlyOnceWith(`data:image/png;base64,${PNG_BASE64}`);

    await userEvent.click(within(perfil).getByRole('button', { name: 'Tirar a foto' }));
    expect(await within(perfil).findByText('Foto tirada.')).toBeTruthy();
    await waitFor(() => expect(within(perfil).queryByRole('img')).toBeNull());
    expect(within(perfil).getByText('B')).toBeTruthy();
    expect((await api.meuPerfil()).foto ?? null).toBeNull();
    expect(aoMudarFoto).toHaveBeenLastCalledWith(null);
  });

  it('a foto escolhida pode ser cancelada; arquivo que não é imagem aceita é recusado antes de enviar', async () => {
    const { api, agora } = await brunoComAcessos();
    render(<TelaMeuUsuario api={api} pessoa={BRUNO} fuso={FUSO} agora={agora} aoBloquear={vi.fn()} />);
    const perfil = screen.getByRole('region', { name: 'Perfil' });
    await userEvent.upload(await within(perfil).findByLabelText('Escolher a foto do perfil'), arquivoPng());
    await userEvent.click(await within(perfil).findByRole('button', { name: 'Cancelar' }));
    expect(within(perfil).queryByRole('img')).toBeNull();
    expect((await api.meuPerfil()).foto ?? null).toBeNull();
    await expect(prepararFoto(new File(['<svg></svg>'], 'eu.svg', { type: 'image/svg+xml' }))).rejects.toThrow('Escolha uma imagem PNG, JPEG ou WebP.');
    const grande = new File([new Uint8Array(6 * 1024 * 1024)], 'eu.png', { type: 'image/png' });
    await expect(prepararFoto(grande)).rejects.toThrow('A imagem passa de 5 MB. Escolha uma menor.');
    expect(MENSAGENS_FOTO.grande).toMatch(/100 KB/);
  });

  it('troca a senha ali mesmo: o formulário volta vazio e a senha nova vale para entrar', async () => {
    const { api, agora } = await brunoComAcessos();
    render(<TelaMeuUsuario api={api} pessoa={BRUNO} fuso={FUSO} agora={agora} aoBloquear={vi.fn()} />);
    const senha = screen.getByRole('region', { name: 'Trocar a senha' });
    await userEvent.type(within(senha).getByLabelText('Senha atual'), SENHA_DEMO);
    await userEvent.type(within(senha).getByLabelText('Senha nova'), 'uma frase facil de lembrar');
    await userEvent.type(within(senha).getByLabelText('Repita a senha nova'), 'uma frase facil de lembrar');
    await userEvent.click(within(senha).getByRole('button', { name: 'Trocar a senha' }));
    expect(await within(senha).findByText('Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa.')).toBeTruthy();
    expect((within(senha).getByLabelText('Senha nova') as HTMLInputElement).value).toBe('');
    expect((await entrarDemo('lojaa', 'bruno', 'uma frase facil de lembrar', { atrasoMs: 0 })).ok).toBe(true);
  });

  it('no sistema real, sem essa parte no servidor: a foto e as entradas avisam; trocar a senha continua lá', async () => {
    const sem = () => Promise.reject(new ErroApi(501, MENSAGEM_SEM_SERVIDOR));
    const api: ApiConta = { trocarMinhaSenha: vi.fn(async () => undefined), meuPerfil: sem, salvarMinhaFoto: sem, meusAcessos: sem };
    render(<TelaMeuUsuario api={api} pessoa={BRUNO} fuso={FUSO} aoBloquear={vi.fn()} />);
    expect(await within(screen.getByRole('region', { name: 'Perfil' })).findByText(`Foto do perfil: ${MENSAGEM_SEM_SERVIDOR}`)).toBeTruthy();
    expect(screen.queryByLabelText('Escolher a foto do perfil')).toBeNull();
    expect(await within(screen.getByRole('region', { name: 'Entradas e saídas' })).findByText(MENSAGEM_SEM_SERVIDOR)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Trocar a senha' })).getByRole('button', { name: 'Trocar a senha' })).toBeTruthy();
  });
});

describe('a foto na barra lateral', () => {
  it('depois de salvar em Meu usuário, a foto aparece no canto, no lugar da inicial', async () => {
    const { api, agora } = await brunoComAcessos();
    render(<TelaPainel loja={{ nome: 'Loja A' }} pessoa={{ id: 'bruno', ...BRUNO }} aoSair={vi.fn()} api={api} agora={agora} secaoInicial="meu-usuario" />);
    const barra = screen.getByRole('complementary', { name: 'Barra lateral' });
    const noCanto = () => within(barra).getByRole('button', { name: 'Meu usuário: Bruno, Vendedor' });
    expect(noCanto().querySelector('img')).toBeNull();
    const perfil = screen.getByRole('region', { name: 'Perfil' });
    await userEvent.upload(await within(perfil).findByLabelText('Escolher a foto do perfil'), arquivoPng());
    await userEvent.click(await within(perfil).findByRole('button', { name: 'Salvar a foto' }));
    await waitFor(() => expect(noCanto().querySelector('img')?.getAttribute('src')).toBe(`data:image/png;base64,${PNG_BASE64}`));
  });
});
