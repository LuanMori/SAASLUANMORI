// apps/web/src/telas/TelaEntrada.test.tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subdominioDoEndereco } from '@saas/core';
import { MARCA } from '../marca';
import { type ResultadoEntrada, TelaEntrada } from './TelaEntrada';

afterEach(cleanup);

const loja = { nome: 'Pet Shop da Ana' };

function montar(aoEntrar = vi.fn(async (): Promise<ResultadoEntrada> => ({ ok: true }))) {
  render(<TelaEntrada loja={loja} aoEntrar={aoEntrar} />);
  return {
    aoEntrar,
    usuario: screen.getByLabelText('Usuário'),
    senha: screen.getByLabelText('Senha'),
    entrar: screen.getByRole('button', { name: 'Entrar' }),
  };
}

describe('TelaEntrada', () => {
  it('mostra a loja do subdomínio num selo do cartão, sem escolher loja', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta!' })).toBeTruthy();
    expect(screen.getByText('Acesse sua conta e gerencie sua loja.')).toBeTruthy();
    expect(screen.getByLabelText('Loja: Pet Shop da Ana').textContent).toBe('Pet Shop da Ana');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('no modelo do Luan: a marca com "PDV · Estoque · Financeiro", a chamada, o texto e os recursos; a ilustração é só enfeite', () => {
    montar();
    const vitrine = screen.getByRole('region', { name: 'Apresentação' });
    expect(within(vitrine).getByText(MARCA.nome)).toBeTruthy();
    expect(within(vitrine).getByText('PDV · Estoque · Financeiro')).toBeTruthy();
    expect(vitrine.querySelector('.entrada-vitrine-chamada')?.textContent).toBe('Sua loja,mais organizadae lucrativa.');
    expect(within(vitrine).getByText(/Um sistema completo para gerenciar vendas \(PDV\)/)).toBeTruthy();
    expect(within(within(vitrine).getByRole('list', { name: 'Recursos do sistema' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'PDV e vendas',
      'Controle de estoque',
      'Gestão financeira',
    ]);
    // a ilustração da loja: desenho embutido (sem endereço de fora), escondido do leitor de tela
    const img = document.querySelector('.entrada-vitrine-ilustracao img') as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
    expect(img.alt).toBe('');
    expect(img.closest('[aria-hidden="true"]')).toBeTruthy();
    // a logo: na vitrine e no cartão; o único título é o do cartão
    expect(screen.getAllByText(MARCA.nome)).toHaveLength(2);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Bem-vindo de volta!']);
  });

  it('Entrar só libera com usuário e senha preenchidos', async () => {
    const { usuario, senha, entrar } = montar();
    expect((entrar as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(usuario, 'ana');
    expect((entrar as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(senha, 'x');
    expect((entrar as HTMLButtonElement).disabled).toBe(false);
  });

  it('envia usuário sem espaços nas pontas e a senha como digitada', async () => {
    const { aoEntrar, usuario, senha } = montar();
    await userEvent.type(usuario, '  ana  ');
    await userEvent.type(senha, ' s3nha {Enter}');
    expect(aoEntrar).toHaveBeenCalledWith('ana', ' s3nha ');
  });

  it('erro de login: mostra a mensagem, limpa a senha e mantém o usuário', async () => {
    const { usuario, senha } = montar(vi.fn(async () => ({ ok: false, mensagem: 'Usuário ou senha incorretos.' }) as const));
    await userEvent.type(usuario, 'ana');
    await userEvent.type(senha, 'errada{Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe('Usuário ou senha incorretos.');
    expect((senha as HTMLInputElement).value).toBe('');
    expect((usuario as HTMLInputElement).value).toBe('ana');
    expect(document.activeElement).toBe(senha);
  });

  it('queda de rede vira mensagem amigável', async () => {
    const { usuario, senha } = montar(vi.fn(async () => Promise.reject(new Error('rede'))));
    await userEvent.type(usuario, 'ana');
    await userEvent.type(senha, 'x{Enter}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Verifique a internet/);
  });

  it('olho mostra e esconde a senha', async () => {
    const { senha } = montar();
    expect((senha as HTMLInputElement).type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect((senha as HTMLInputElement).type).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: 'Esconder senha' }));
    expect((senha as HTMLInputElement).type).toBe('password');
  });

  it('"Esqueceu a senha?" orienta a pedir ao responsável pela loja', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Esqueceu a senha?' }));
    expect(screen.getByRole('status').textContent).toBe('Solicite uma nova senha ao responsável pela loja. Por segurança, as senhas não são enviadas por e-mail.');
  });

  it('endereço sem loja: não mostra formulário', () => {
    render(<TelaEntrada loja={null} aoEntrar={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Endereço não encontrado' })).toBeTruthy();
    expect(screen.queryByLabelText('Usuário')).toBeNull();
    expect(screen.getByRole('button', { name: 'Usar o tema escuro' })).toBeTruthy(); // o tema vale mesmo sem loja
  });

  it('tema claro / escuro no canto, ao lado do Suporte: troca e guarda a escolha neste navegador', async () => {
    localStorage.clear();
    montar();
    const canto = screen.getByRole('button', { name: 'Suporte' }).closest('.entrada-acoes') as HTMLElement;
    expect(canto.contains(screen.getByRole('button', { name: 'Usar o tema escuro' }))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Usar o tema escuro' }));
    expect(document.documentElement.dataset.tema).toBe('escuro');
    expect(localStorage.getItem('saas:tema')).toBe('escuro');
    // a escolha continua depois de entrar: a barra lateral lê o mesmo tema (tema.ts)
    await userEvent.click(screen.getByRole('button', { name: 'Usar o tema claro' }));
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('saas:tema')).toBe('claro');
  });
});

describe('loja pelo endereço (subdominioDoEndereco, a mesma regra do servidor)', () => {
  const base = 'nomedaempresa.com.br';
  it.each([
    ['petshopdaana.nomedaempresa.com.br', 'petshopdaana'],
    ['PetShop.NomeDaEmpresa.com.br.', 'petshop'],
    ['loja-1.nomedaempresa.com.br', 'loja-1'],
    ['nomedaempresa.com.br', null],
    ['www.nomedaempresa.com.br', null],
    ['api.nomedaempresa.com.br', null],
    ['a.b.nomedaempresa.com.br', null],
    ['-x.nomedaempresa.com.br', null],
    ['petshop.outrodominio.com.br', null],
    ['petshopnomedaempresa.com.br', null],
    ['localhost', null],
    ['127.0.0.1', null],
  ])('%s -> %s', (host, esperado) => {
    expect(subdominioDoEndereco(host, base)).toBe(esperado);
  });
});
