// apps/web/src/painel/TelaClientes.test.tsx — aba Clientes (Fase 2, módulo 6), ligada à API da demonstração.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaClientes } from './TelaClientes';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const api = (o: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'tc', operador: o, exemplos: false, atrasoMs: 0 }));
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' };

async function comFiado(valor = 3000) {
  const dono = api(ANA);
  const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: '7897000400403', precoCentavos: 1000 });
  await darEstoque('tc', 50);
  const maria = await dono.cadastrarCliente({ ...MARIA, limiteFiadoCentavos: 10_000 });
  if (valor) await dono.criarVenda({ itens: [{ produtoId: p.id, quantidade: valor / 1000 }], pagamentos: [{ forma: 'fiado', valorCentavos: valor }], clienteId: maria.id });
  return { dono, p, maria };
}

function tela(o: OperadorComPapel) {
  const a = api(o);
  render(<TelaClientes api={a} pessoa={{ nome: o.nome, papel: o.papel }} fuso={FUSO} />);
  return a;
}

describe('Clientes · lista e conta', () => {
  it('o Vendedor cadastra, vê a lista sem o CPF inteiro e sem o fiado de todos, e abre a conta', async () => {
    tela(BRUNO);
    expect(await screen.findByText(/Nenhum cliente cadastrado ainda/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Regras dos clientes' })).toBeNull();
    // o Vendedor vê Clientes, Retorno e Regras do programa, sem a aba Fiado
    const secoes = screen.getByRole('navigation', { name: 'Seções de Clientes' });
    expect(within(secoes).queryByRole('button', { name: /^Fiado/ })).toBeNull();
    expect(within(secoes).getByRole('button', { name: /^Retorno/ })).toBeTruthy();
    expect(within(secoes).getByRole('button', { name: 'Regras do programa' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '+ Novo cliente' }));
    expect((within(janela()).getByLabelText('Limite de fiado (R$)') as HTMLInputElement).disabled).toBe(true);
    expect(within(janela()).queryByLabelText('Pet')).toBeNull(); // o campo extra começa desligado
    await userEvent.type(within(janela()).getByLabelText('Nome completo'), 'Maria Souza');
    await userEvent.type(within(janela()).getByLabelText('Telefone com DDD'), '41999998888');
    await userEvent.type(within(janela()).getByLabelText('CPF'), '529.982.247-24');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar cliente' }));
    expect(within(janela()).getByText('CPF inválido. Confira os números.')).toBeTruthy();
    await userEvent.clear(within(janela()).getByLabelText('CPF'));
    await userEvent.type(within(janela()).getByLabelText('CPF'), '529.982.247-25');
    await userEvent.click(within(janela()).getByLabelText(/O cliente autoriza receber ofertas/));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar cliente' }));
    // abre a conta do cliente novo
    expect(await screen.findByRole('heading', { name: 'Maria Souza' })).toBeTruthy();
    expect(txt(screen.getByText(/^\(41\) 99999-8888/).textContent)).toMatch(/CPF \*\*\*\.982\.247-\*\*/);
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
    expect(screen.getByText('aceita mensagens')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Excluir cliente' })).toBeTruthy(); // sem histórico
    await userEvent.click(screen.getByRole('button', { name: '← Voltar para a lista' }));
    const linha = (await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' })).closest('tr')!;
    expect(txt(linha.textContent)).toBe('Maria Souza(41) 99999-8888WhatsApp • aceita mensagens***.982.247-**nunca comprou—em dia');
  });

  it('o Dono vê o fiado, o CPF completo (fica no histórico), recebe o fiado e a aba Fiado', async () => {
    const { dono, maria } = await comFiado(3000);
    tela(ANA);
    const linha = (await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' })).closest('tr')!;
    expect(txt(linha.querySelector('td[data-rotulo="Fiado"]')?.textContent)).toBe('R$ 30,00limite R$ 100,00');
    await userEvent.click(within(linha).getByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    await screen.findByRole('heading', { name: 'Maria Souza' });
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar' }));
    expect(await screen.findByText(/CPF 529\.982\.247-25/)).toBeTruthy();
    expect((await dono.listarAuditoria())[0]).toMatchObject({ texto: 'CPF completo visto' });
    expect(txt(screen.getByRole('region', { name: 'Extrato' }).textContent)).toMatch(/Compra no fiado.*\+ R\$ 30,00.*Compra #00001/);

    await userEvent.click(screen.getByRole('button', { name: 'Receber fiado' }));
    const valor = within(janela()).getByLabelText('Valor recebido (R$)') as HTMLInputElement;
    expect(valor.value).toBe('30,00');
    await userEvent.clear(valor);
    await userEvent.type(valor, '10');
    await userEvent.selectOptions(within(janela()).getByLabelText('Forma de pagamento'), 'pix');
    expect(txt(within(janela()).getByText('Fica devendo').nextElementSibling?.textContent)).toBe('R$ 20,00');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar recebimento' }));
    expect(txt((await screen.findByText(/^Recebido R\$/)).textContent)).toBe('Recebido R$ 10,00 de Maria em Pix: abateu #00001 (R$ 10,00). Fica devendo R$ 20,00.');

    await userEvent.click(screen.getByRole('button', { name: '← Voltar para a lista' }));
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: /^Fiado/ }));
    const contas = await screen.findByRole('region', { name: 'Contas em aberto' });
    await waitFor(() => expect(txt(within(contas).getAllByRole('row')[1]!.textContent)).toMatch(/^Maria Souza\(41\) 99999-8888R\$ 20,00R\$ 100,00R\$ 80,00#00001vence/));
    expect(screen.getByText(/Código de Defesa do Consumidor, art\. 42/)).toBeTruthy();
    void maria;
  });

  it('o Vendedor exclui um cliente sem histórico, com motivo; o Dono vê o aviso até "Ciente"', async () => {
    const vend = api(BRUNO);
    await vend.cadastrarCliente({ nome: 'João Pereira', telefone: '4133334444', cpf: '11144477735' });
    render(<TelaClientes api={vend} pessoa={{ nome: 'Bruno', papel: 'vendedor' }} fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir a conta de João Pereira' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir cliente' }));
    expect(within(janela()).getByText(/O Dono e o Administrador vão ver um aviso/)).toBeTruthy();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Excluir' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Informe o motivo da exclusão.');
    await userEvent.type(within(janela()).getByLabelText('Motivo da exclusão'), 'cadastro em duplicidade');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('João Pereira foi excluído.')).toBeTruthy();
    cleanup();
    tela(ANA);
    const aviso = await screen.findByText(/Bruno excluiu o cliente/);
    expect(txt(aviso.closest('.cli-aviso')?.textContent)).toMatch(/^Bruno excluiu o cliente João Pereira \(\(41\) 3333-4444\) em \d\d\/\d\d\/\d{4}\. Motivo: cadastro em duplicidade\.Ciente$/);
    await userEvent.click(screen.getByRole('button', { name: 'Ciente' }));
    await waitFor(() => expect(screen.queryByText(/Bruno excluiu o cliente/)).toBeNull());
  });

  it('Regras do programa: o campo extra ("Pet") aparece no cadastro e na lista; LGPD pede a liberação do Dono', async () => {
    const aoMudarRegras = vi.fn();
    const a = api(ANA);
    const p = await a.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    await darEstoque('tc', 5);
    render(<TelaClientes api={a} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} aoMudarRegras={aoMudarRegras} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Regras do programa' }));
    await userEvent.click(await screen.findByLabelText('Usar o campo extra'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(await screen.findByText('Regras salvas. Valem para as próximas vendas e lembretes.')).toBeTruthy();
    expect(aoMudarRegras).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '+ Novo cliente' }));
    await within(janela()).findByLabelText('Pet');
    for (const [rotulo, valor] of [
      ['Nome completo', 'Maria Souza'],
      ['Telefone com DDD', '41999998888'],
      ['CPF', '52998224725'],
      ['Pet', 'Thor, cão'],
    ]) {
      await userEvent.type(within(janela()).getByLabelText(rotulo!), valor!);
    }
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar cliente' }));
    await screen.findByRole('heading', { name: 'Maria Souza' });
    expect(screen.getByText('Thor, cão')).toBeTruthy();
    // com uma compra, só os dados podem ser excluídos (LGPD), com a senha e o motivo de um Dono
    const maria = (await a.listarContasDeClientes()).clientes[0]!;
    await a.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 1000 }], clienteId: maria.id });
    await userEvent.click(screen.getByRole('button', { name: '← Voltar para a lista' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir dados (LGPD)' }));
    expect(within(janela()).getByRole('heading', { name: 'Liberação do Dono' })).toBeTruthy();
    await within(janela()).findByText('Ana · Dono');
    await userEvent.type(within(janela()).getByLabelText('Senha do Dono'), 'demo1234');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'pedido do cliente');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Liberar' }));
    expect(await screen.findByText(/Dados do cliente excluídos/)).toBeTruthy();
    expect((await a.listarContasDeClientes()).total).toBe(0);
  });
});

describe('Clientes · fiado na Frente de caixa', () => {
  it('acima do limite: pede a liberação de um Dono, com motivo, e finaliza depois dela', async () => {
    const { maria } = await comFiado(8000); // deve R$ 80,00 de R$ 100,00
    const vend = api(BRUNO);
    render(<TelaFrenteCaixa api={vend} operador={{ nome: 'Bruno', papel: 'vendedor' }} loja={{ nome: 'Loja' }} fuso={FUSO} aoSair={vi.fn()} />);
    await screen.findByPlaceholderText('Bipe o código (3*código = 3 unidades)');
    await userEvent.keyboard('{F6}');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), 'maria');
    await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
    expect(screen.getByText(/Limite R\$ 100,00 • disponível R\$ 20,00/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Leitor de código de barras'), '3*7897000400403{Enter}');
    await userEvent.keyboard('{F7}');
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(await screen.findByRole('heading', { name: 'Liberação do Dono' })).toBeTruthy();
    expect(txt(within(janela()).getByText(/^Venda no fiado para/).textContent)).toBe('Venda no fiado para Maria Souza: passa do limite de R$ 100,00 em R$ 10,00. Precisa da liberação de um Dono.');
    await within(janela()).findByText('Ana · Dono');
    await userEvent.type(within(janela()).getByLabelText('Senha do Dono'), 'demo1234');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'cliente antigo');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Liberar' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toMatch(/^Venda #00002 finalizada: R\$ 30,00 em Fiado\. Cliente: Maria Souza\.$/);
    const [ultima] = await api(ANA).listarVendas();
    expect(ultima?.fiadoLiberado).toMatchObject({ por: { nome: 'Ana' }, motivo: 'cliente antigo' });
    void maria;
  });
});
