// apps/web/src/painel/TelaFiadoCaixa.test.tsx — o que veio do arquivo do Luan de 23/11/2026, já no código: receber
// fiado (troco, cartão com a taxa repassada), taxas da maquininha (Dono e Administrador; a baixa é escolha do Dono)
// e as pendências de clientes no card da Visão geral ("Ver lista", Receber e WhatsApp do vencimento).
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaClientes } from './TelaClientes';
import { TelaVisaoGeral } from './TelaVisaoGeral';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const CAIO: OperadorComPapel = { id: 'caio', nome: 'Caio', papel: 'administrador' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');

/** Maria com R$ 30,00 no fiado, comprado em 20/11/2026 (vence 20/12). */
async function lojaComFiado() {
  let relogio = new Date('2026-11-20T15:00:00Z');
  const api = (o: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'fc', operador: o, exemplos: false, atrasoMs: 0, agora: () => relogio }));
  const dono = api(ANA);
  const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('fc', 20);
  const maria = await dono.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', limiteFiadoCentavos: 100000 });
  await dono.criarVenda({ itens: [{ produtoId: p.id, quantidade: 3 }], pagamentos: [{ forma: 'fiado', valorCentavos: 3000 }], clienteId: maria.id });
  return { api, maria, agora: () => relogio, mudar: (iso: string) => (relogio = new Date(iso)) };
}

describe('Receber fiado: troco e cartão com a taxa repassada', () => {
  it('em dinheiro mostra o troco; no crédito, quanto cobrar na maquininha para a loja receber o valor cheio', async () => {
    const { api } = await lojaComFiado();
    render(<TelaClientes api={api(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Receber fiado' }));
    expect(txt(within(janela()).getByText(/^Maria Souza ·/).textContent)).toBe('Maria Souza · em aberto R$ 30,00');
    const valor = within(janela()).getByLabelText('Valor a baixar (R$)');
    await userEvent.clear(valor);
    await userEvent.type(valor, '10');
    await userEvent.type(within(janela()).getByLabelText('Dinheiro entregue (R$)'), '50');
    expect(txt(within(janela()).getByLabelText('Prévia do recebimento').textContent)).toBe('TrocoR$ 40,00Saldo após a baixaR$ 20,00Abate primeiro#00001 (R$ 10,00)');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar recebimento' }));
    expect(txt((await screen.findByText(/^Baixa de R\$/)).textContent)).toBe('Baixa de R$ 10,00 confirmada. Dinheiro: R$ 10,00 · troco R$ 40,00 · saldo em aberto R$ 20,00.');

    await userEvent.click(await screen.findByRole('button', { name: 'Receber fiado' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cartão de crédito' }));
    await waitFor(() =>
      expect(txt(within(janela()).getByLabelText('Prévia do recebimento').textContent)).toBe(
        'Cobrar na maquininhaR$ 20,62Taxa da maquininha (3%)R$ 0,62Líquido para a lojaR$ 20,00Saldo após a baixaR$ 0,00Abate primeiro#00001 (R$ 20,00)',
      ),
    );
    expect(within(janela()).getByText(/^No cartão, a taxa da maquininha é cobrada do cliente/).textContent).toMatch(/Baixa automática: entra na Conta bancária na hora\.$/);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar recebimento' }));
    expect(txt((await screen.findByText(/^Baixa de R\$ 20,00/)).textContent)).toBe('Baixa de R$ 20,00 confirmada. Cartão de crédito: R$ 20,62 · saldo em aberto R$ 0,00.');
  });

  it('valor acima do que deve: avisa e não deixa confirmar', async () => {
    const { api } = await lojaComFiado();
    render(<TelaClientes api={api(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Receber fiado' }));
    const valor = within(janela()).getByLabelText('Valor a baixar (R$)');
    await userEvent.clear(valor);
    await userEvent.type(valor, '31');
    expect(within(janela()).getByRole('alert').textContent).toBe('Maria Souza deve R$ 30,00. Informe um valor até esse.'.replace(' 30', ' 30'));
    expect((within(janela()).getByRole('button', { name: 'Confirmar recebimento' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Taxas da maquininha (Clientes → Fiado)', () => {
  it('o Dono muda as taxas e escolhe a baixa; o Administrador muda as taxas, mas a baixa é do Dono', async () => {
    const { api } = await lojaComFiado();
    render(<TelaClientes api={api(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: /^Fiado/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Taxas da maquininha' }));
    const credito = (await within(janela()).findByLabelText('Cartão de crédito (%)')) as HTMLInputElement;
    expect([(within(janela()).getByLabelText('Cartão de débito (%)') as HTMLInputElement).value, credito.value]).toEqual(['1,5', '3']);
    expect((within(janela()).getByLabelText(/^Automática/) as HTMLInputElement).checked).toBe(true);
    await userEvent.clear(credito);
    await userEvent.type(credito, '3,99');
    await userEvent.click(within(janela()).getByLabelText(/^Manual/));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar taxas' }));
    expect(await screen.findByText('Taxas da maquininha atualizadas.')).toBeTruthy();
    expect(await api(ANA).lerTaxasCartao()).toMatchObject({ taxaPct: { debito: 1.5, credito: 3.99 }, baixaAutomatica: false });
    cleanup();

    render(<TelaClientes api={api(CAIO)} pessoa={{ nome: 'Caio', papel: 'administrador' }} fuso={FUSO} />);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: /^Fiado/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Taxas da maquininha' }));
    const manual = (await within(janela()).findByLabelText(/^Manual/)) as HTMLInputElement;
    expect([manual.checked, manual.disabled]).toEqual([true, true]);
    expect(within(janela()).getByText('Só o Dono escolhe a baixa do cartão.')).toBeTruthy();
    const debito = within(janela()).getByLabelText('Cartão de débito (%)');
    await userEvent.clear(debito);
    await userEvent.type(debito, '2');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar taxas' }));
    expect(await screen.findByText('Taxas da maquininha atualizadas.')).toBeTruthy();
    expect(await api(ANA).lerTaxasCartao()).toMatchObject({ taxaPct: { debito: 2, credito: 3.99 }, baixaAutomatica: false });
  });
});

describe('Pendências de clientes no card da Visão geral', () => {
  it('"Fiado a vencer · 1" → Ver lista: WhatsApp do vencimento (uma vez) e Receber só aquele vencimento', async () => {
    const { api, maria, agora, mudar } = await lojaComFiado();
    mudar('2026-12-15T15:00:00Z'); // vence em 20/12: daqui a 5 dias
    const aoIrPara = vi.fn();
    render(<TelaVisaoGeral api={api(ANA)} nome="Ana" fuso={FUSO} agora={agora} aoVerCaixa={vi.fn()} aoIrPara={aoIrPara} intervaloMs={60_000} />);
    const item = (await screen.findByText(/^Fiado a vencer · 1$/)).closest('li')!;
    await userEvent.click(within(item).getByRole('button', { name: 'Ver lista' }));
    expect(aoIrPara).not.toHaveBeenCalled(); // abre a lista na própria Visão geral
    expect(within(janela()).getByRole('heading', { name: 'Fiado a vencer' })).toBeTruthy();
    expect(txt(within(janela()).getByRole('listitem').textContent)).toBe('Maria SouzaR$ 30,00 · vence 20/12/2026ReceberWhatsApp');

    await userEvent.click(within(janela()).getByRole('button', { name: 'WhatsApp para Maria Souza' }));
    expect(within(janela()).getByRole('heading', { name: 'Lembrete de pagamento' })).toBeTruthy();
    const msg = (await within(janela()).findByLabelText('Mensagem')) as HTMLTextAreaElement;
    expect(txt(msg.value)).toMatch(/há R\$ 30,00 em aberto na sua conta, com vencimento em 20\/12\/2026/);
    await userEvent.click(within(janela()).getByRole('button', { name: 'Marcar como enviado' }));
    expect(await within(janela()).findByText('Lembrete de pagamento registrado para Maria.')).toBeTruthy();
    await waitFor(() => expect(within(janela()).getByText('Lembrete registrado')).toBeTruthy());

    await userEvent.click(within(janela()).getByRole('button', { name: 'Receber o fiado de Maria Souza' }));
    expect(txt((await within(janela()).findByText(/^Maria Souza ·/)).textContent)).toBe('Maria Souza · vence 20/12/2026 · R$ 30,00');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Pix' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar recebimento' }));
    expect(txt((await within(janela()).findByText(/^Baixa de R\$/)).textContent)).toBe('Baixa de R$ 30,00 confirmada. Pix: R$ 30,00 · saldo em aberto R$ 0,00.');
    expect(await within(janela()).findByText('Ninguém nesta lista agora.')).toBeTruthy();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByText(/^Fiado a vencer/)).toBeNull());
    expect((await api(ANA).contaDoCliente(maria.id)).fiado.devendoCentavos).toBe(0);
  });
});
