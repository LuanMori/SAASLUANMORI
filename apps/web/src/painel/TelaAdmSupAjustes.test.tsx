// apps/web/src/painel/TelaAdmSupAjustes.test.tsx — Adm. Sup: ajustes desta loja (módulo 13f) na tela de Dados e
// backup, e o que some para a equipe quando o suporte desliga um recurso (barra, Clientes, Frente de caixa).
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';
import { TelaPainel } from './TelaPainel';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const AGORA = new Date('2026-11-25T15:00:00Z');
const agora = () => AGORA;
const SUPORTE: OperadorComPapel = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' };
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const SEM_LIMITE = { usuariosAtivos: null, produtosAtivos: null };
const api = (operador: OperadorComPapel) => criarApiLocal({ lojaId: 'loja-a', operador, exemplos: false, atrasoMs: 0, agora });
const desligar = (...desligados: string[]) => api(SUPORTE).salvarAjustesDaLoja({ desligados: desligados as never, limites: SEM_LIMITE });

async function cartaoDosAjustes() {
  const aoMudar = vi.fn();
  render(<TelaDadosBackup api={api(SUPORTE)} papel="super_admin" fuso={FUSO} agora={agora} aoMudar={aoMudar} />);
  await screen.findByLabelText('Nome da loja');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Adm. Sup' }));
  return { cartao: screen.getByRole('region', { name: 'Ajustes desta loja' }), aoMudar };
}

describe('Adm. Sup → ajustes desta loja', () => {
  it('desliga recursos e põe limite; mostra quantos a loja tem e avisa quando ela já passou do limite novo', async () => {
    const { cartao, aoMudar } = await cartaoDosAjustes();
    const fiado = await within(cartao).findByRole('checkbox', { name: 'Fiado' });
    expect(within(cartao).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true, true, true, true]);
    expect(fiado.getAttribute('aria-describedby')).toBe('as-recurso-fiado-sobre');
    expect(within(cartao).getByText('Esta loja usa o padrão: tudo ligado e sem limite.')).toBeTruthy();
    expect(await within(cartao).findByText('Hoje: 3 ativos (o Adm. Sup não conta)')).toBeTruthy();

    await userEvent.click(fiado);
    await userEvent.click(within(cartao).getByRole('checkbox', { name: 'Relatórios' }));
    expect(within(cartao).getByText(/^Desligado\. Vender fiado/)).toBeTruthy();
    await userEvent.type(within(cartao).getByLabelText('Usuários ativos (máximo)'), '2');
    expect(within(cartao).getByText(/^usuários ativos: a loja já tem mais do que o limite novo\. Ninguém é desativado/)).toBeTruthy();
    await userEvent.click(within(cartao).getByRole('button', { name: 'Salvar os ajustes' }));

    expect(await within(cartao).findByText('Ajustes salvos. A equipe desta loja vê a mudança na hora.')).toBeTruthy();
    expect(within(cartao).getByText('Última mudança: 25/11/2026 às 12:00 · Suporte')).toBeTruthy();
    expect((within(cartao).getByRole('checkbox', { name: 'Fiado' }) as HTMLInputElement).checked).toBe(false);
    expect((within(cartao).getByLabelText('Usuários ativos (máximo)') as HTMLInputElement).value).toBe('2');
    expect(aoMudar).toHaveBeenCalled();
    expect(await api(ANA).lerAjustesDaLoja()).toMatchObject({ desligados: ['relatorios', 'fiado'], limites: { usuariosAtivos: 2, produtosAtivos: null } });
  });

  it('limite que não é número: mostra o erro e não salva', async () => {
    const { cartao } = await cartaoDosAjustes();
    await userEvent.type(await within(cartao).findByLabelText('Produtos ativos (máximo)'), 'mil');
    await userEvent.click(within(cartao).getByRole('button', { name: 'Salvar os ajustes' }));
    expect((await within(cartao).findByRole('alert')).textContent).toBe('Produtos ativos: use um número inteiro de 1 a 100.000, ou deixe em branco para não ter limite.');
    expect((await api(ANA).lerAjustesDaLoja()).alteradoEm).toBeNull();
  });
});

describe('a equipe da loja', () => {
  const painel = (secaoInicial?: 'clientes' | 'relatorios') =>
    render(<TelaPainel loja={{ nome: 'Loja A' }} pessoa={{ ...ANA, usuario: 'ana' }} aoSair={vi.fn()} api={api(ANA)} agora={agora} secaoInicial={secaoInicial} />);

  it('a barra sem Compras, Financeiro e Relatórios; Clientes sem a aba Retorno (o Fiado continua)', async () => {
    await desligar('compras', 'financeiro', 'relatorios', 'fidelidade');
    painel('clientes');
    const barra = screen.getByRole('complementary', { name: 'Barra lateral' });
    await waitFor(() => expect(within(barra).queryByRole('button', { name: 'Relatórios' })).toBeNull());
    expect(within(barra).queryByRole('button', { name: 'Compras' })).toBeNull();
    expect(within(barra).queryByRole('button', { name: 'Financeiro' })).toBeNull();
    expect(within(barra).getByRole('button', { name: 'Clientes' })).toBeTruthy();
    const abas = screen.getByRole('navigation', { name: 'Seções de Clientes' });
    await waitFor(() => expect(within(abas).queryByRole('button', { name: /^Retorno/ })).toBeNull());
    expect(within(abas).getByRole('button', { name: /^Fiado/ })).toBeTruthy();
  });

  it('quem está na aba quando o suporte desliga vê o aviso no lugar dela', async () => {
    await desligar('relatorios');
    painel('relatorios');
    expect(await screen.findByText('Relatórios: este recurso está desligado nesta loja. Fale com o suporte.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeTruthy();
  });

  it('Frente de caixa sem fiado e sem vale-troca: sem o botão, sem a tecla F7 e a devolução sem a opção de vale', async () => {
    const dono = comCaixaAberto(api(ANA));
    const petisco = await dono.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 1000 });
    await darEstoque('loja-a', 20);
    await dono.criarVenda({ itens: [{ produtoId: petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 2000 }] });
    render(
      <TelaFrenteCaixa api={dono} operador={{ nome: 'Ana', papel: 'dono' }} loja={{ nome: 'Loja A' }} fuso={FUSO} agora={agora} aoSair={vi.fn()} ajustes={{ desligados: ['fiado', 'vales'] }} />,
    );
    await screen.findByPlaceholderText('Bipe o código ou digite o nome (3*código = 3 un.)');
    expect(screen.getByRole('button', { name: /^Pix/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Fiado/ })).toBeNull();
    expect(screen.queryByText('fiado', { selector: '.pdv-tecla' })).toBeNull();
    await userEvent.keyboard('{F7}');
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    const janela = screen.getByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Número da venda'), '1');
    await userEvent.click(within(janela).getByRole('button', { name: 'Continuar' }));
    const modo = await screen.findByLabelText('Como o valor volta'); // a janela troca de passo (outro diálogo)
    expect(within(modo).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['mesma']);
  });
});
