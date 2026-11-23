// apps/web/src/painel/TelaFidelidade.test.tsx — fidelidade nas telas (Fase 2, módulo 7), como no DaniPets V9.3.3:
// cashback e cupom na Frente de caixa; Retorno, WhatsApp, Regras do programa e o resumo na aba Clientes.
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');
const MARIA = { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', autorizaMensagens: true };

let relogio = new Date('2026-11-20T15:00:00Z');
const agora = () => relogio;
const api = (o: OperadorComPapel) => comCaixaAberto(criarApiLocal({ lojaId: 'fid', operador: o, exemplos: false, atrasoMs: 0, agora }));

async function preparar() {
  relogio = new Date('2026-11-20T15:00:00Z');
  const dono = api(ANA);
  const racao = await dono.criarProduto({ nome: 'Ração Gatos 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 });
  const petisco = await dono.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 750 });
  await darEstoque('fid', 100);
  const maria = await dono.cadastrarCliente(MARIA);
  return { dono, racao, petisco, maria };
}

async function pdv(o: OperadorComPapel = BRUNO) {
  const base = api(o);
  if ((await base.lerSituacaoDoCaixa()).estado === 'nao_aberto') await base.abrirCaixa({ fundoCentavos: 10000 });
  const a = { ...base, criarVenda: vi.fn(base.criarVenda) };
  render(<TelaFrenteCaixa api={a} operador={{ nome: o.nome, papel: o.papel }} loja={{ nome: 'Loja T' }} fuso={FUSO} agora={agora} aoSair={vi.fn()} />);
  await screen.findByPlaceholderText('Bipe o código ou digite o nome (3*código = 3 un.)');
  return a;
}
const bipar = (codigo: string) => userEvent.type(screen.getByLabelText('Código ou nome do produto'), `${codigo}{Enter}`);
const total = () => txt(screen.getByTestId('pdv-total').textContent);
const faixa = () => screen.getByRole('group', { name: 'Cliente da venda' });
async function identificar(nome = 'maria') {
  await userEvent.keyboard('{F6}');
  await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), nome);
  await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
}

describe('Frente de caixa · cashback (PDV-08, PDV-18)', () => {
  it('"Usar cashback" abate do total, o Pix paga o resto e o aviso final diz o cashback ganho', async () => {
    const { dono, racao, maria } = await preparar();
    await dono.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 15980 }], clienteId: maria.id }); // gera R$ 5,59
    const a = await pdv();
    await identificar();
    expect(txt(screen.getByRole('status').textContent)).toBe('Cliente: Maria Souza. Cashback disponível: R$ 5,59.');
    expect(within(faixa()).getByText(/^Cashback R\$/).textContent?.replace(/ /g, ' ')).toBe('Cashback R$ 5,59');
    await bipar('2*7897000400403');
    expect(total()).toBe('R$ 15,00');
    await userEvent.click(screen.getByRole('button', { name: /^Usar cashback/ }));
    expect(total()).toBe('R$ 9,41');
    expect(txt(screen.getByLabelText('Conta do pagamento').textContent)).toBe('CompraR$ 15,00Cashback− R$ 5,59×');
    // × tira o cashback desta venda
    await userEvent.click(screen.getByRole('button', { name: 'Não usar o cashback nesta venda' }));
    expect(total()).toBe('R$ 15,00');
    await userEvent.click(screen.getByRole('button', { name: /^Usar cashback/ }));
    await userEvent.keyboard('{F8}');
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe(
      'Venda #00002 finalizada: R$ 15,00 em Pix R$ 9,41 + Cashback R$ 5,59. Cliente: Maria Souza. Maria ganhou R$ 0,33 de cashback.',
    );
    expect(a.criarVenda).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: maria.id,
        pagamentos: [
          { forma: 'cashback', valorCentavos: 559 },
          { forma: 'pix', valorCentavos: 941 },
        ],
      }),
    );
    expect(within(faixa()).getByText('Não identificado')).toBeTruthy();
  });

  it('o cashback que cobre a compra toda: não precisa receber nada; tirar o cliente tira o cashback', async () => {
    const { dono, racao, maria } = await preparar();
    await dono.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 4 }], pagamentos: [{ forma: 'pix', valorCentavos: 31960 }], clienteId: maria.id }); // gera R$ 11,19
    const a = await pdv();
    await identificar();
    await bipar('7897000400403');
    await userEvent.click(screen.getByRole('button', { name: /^Usar cashback/ }));
    expect(total()).toBe('R$ 0,00');
    expect(txt(screen.getByText(/paga a compra toda/).closest('p')?.textContent)).toBe(
      'O crédito do cliente paga a compra toda. Não precisa receber nada: é só finalizar. Fica de saldo para a próxima compra: cashback R$ 3,69.',
    );
    expect(screen.queryByRole('group', { name: 'Forma de pagamento' })).toBeNull();
    // sem cliente, o cashback sai do pagamento
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o cliente da venda' }));
    expect(total()).toBe('R$ 7,50');
    expect(screen.getByRole('group', { name: 'Forma de pagamento' })).toBeTruthy();
    await identificar();
    await userEvent.click(screen.getByRole('button', { name: /^Usar cashback/ }));
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00002 finalizada: R$ 7,50 em Cashback. Cliente: Maria Souza.');
    expect(a.criarVenda).toHaveBeenLastCalledWith(expect.objectContaining({ pagamentos: [{ forma: 'cashback', valorCentavos: 750 }] }));
  });
});

describe('Frente de caixa · cupom de retorno (PDV-04)', () => {
  it('identificado o cliente com cupom, o desconto entra sozinho nos itens e vai para o servidor como cupom', async () => {
    const { dono, racao, maria } = await preparar();
    const { cupom } = await dono.registrarContato(maria.id, { tipo: 'retorno', canal: 'whatsapp' });
    const a = await pdv();
    await identificar();
    expect(txt(screen.getByRole('status').textContent)).toBe('Cliente: Maria Souza. Cupom de 5% aplicado.');
    expect(within(faixa()).getByText('Cupom 5% aplicado')).toBeTruthy();
    await bipar('7891000200209');
    expect(total()).toBe('R$ 75,91');
    const linha = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(txt(linha.textContent)).toMatch(/cupom de retorno.*R\$ 75,91de R\$ 79,90 · Cupom de retorno 5%Aplicar desconto/);
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 75,91 em Pix. Cliente: Maria Souza. Maria ganhou R$ 2,66 de cashback.');
    expect(a.criarVenda).toHaveBeenCalledWith(expect.objectContaining({ itens: [{ produtoId: racao.id, quantidade: 1, desconto: null, cupom: cupom!.id }] }));
  });
});

describe('Clientes · Retorno, WhatsApp e lembretes (CLI-13, 14)', () => {
  async function sumida() {
    const p = await preparar();
    relogio = new Date('2026-10-10T15:00:00Z');
    await p.dono.criarVenda({ itens: [{ produtoId: p.petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 1500 }], clienteId: p.maria.id });
    relogio = new Date('2026-11-20T15:00:00Z');
    return p;
  }
  function telaClientes(o: OperadorComPapel) {
    const a = api(o);
    render(<TelaClientes api={a} pessoa={{ nome: o.nome, papel: o.papel }} fuso={FUSO} agora={agora} />);
    return a;
  }
  const abaRetorno = async () => userEvent.click(within(await screen.findByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: /^Retorno/ }));

  it('a lista mostra quem sumiu; o WhatsApp abre com a mensagem pronta e "Marcar como enviado" dá o cupom', async () => {
    const { maria } = await sumida();
    telaClientes(BRUNO);
    await abaRetorno();
    const sumidos = await screen.findByRole('region', { name: /Sem comprar há 30 dias ou mais/ });
    expect(txt(within(sumidos).getByRole('listitem').textContent)).toMatch(/^Maria Souza não compra há 41 dias\.Última compra em 10\/10\/2026: Petisco Bifinho/);
    await userEvent.click(within(sumidos).getByRole('button', { name: 'WhatsApp para Maria Souza' }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Lembrete de retorno');
    const msg = (await within(janela()).findByLabelText('Mensagem')) as HTMLTextAreaElement;
    expect(msg.value).toBe(
      'Olá, Maria! Aqui é da Minha loja. Faz 41 dias desde a sua última compra e sentimos sua falta. Separamos 5% de desconto para você, válido até 27/11/2026. É só informar seu CPF no caixa.',
    );
    expect(txt(within(janela()).getByText(/Ao marcar como enviado/).textContent)).toBe(
      'Ao marcar como enviado, o cliente ganha um cupom de 5% válido até 27/11/2026. O desconto entra sozinho quando ele for identificado na Frente de caixa.',
    );
    const link = within(janela()).getByRole('link', { name: 'Abrir no WhatsApp' }) as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/wa\.me\/5541999998888\?text=Ol%C3%A1%2C%20Maria!/);
    expect([link.target, link.rel]).toEqual(['_blank', 'noopener noreferrer']);
    // ajustar a mensagem muda o link
    await userEvent.clear(msg);
    await userEvent.type(msg, 'Oi, Maria!');
    expect((within(janela()).getByRole('link', { name: 'Abrir no WhatsApp' }) as HTMLAnchorElement).href).toBe('https://wa.me/5541999998888?text=Oi%2C%20Maria!');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Marcar como enviado' }));
    expect(txt((await screen.findByText(/Lembrete de retorno registrado/)).textContent)).toBe('Lembrete de retorno registrado para Maria. Cupom de 5% válido até 27/11/2026.');
    await waitFor(() => expect(screen.getByText(/Ninguém para lembrar agora/)).toBeTruthy());
    expect(txt(screen.getByText(/ficou de fora/).textContent)).toMatch(/^1 cliente ficou de fora da lista hoje/);
    // a conta mostra o cupom e o extrato, o contato
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: /^Clientes/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    expect(await screen.findByText(/Cupom de retorno ativo: 5% de desconto até 27\/11\/2026/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(txt(screen.getByRole('region', { name: 'Extrato' }).textContent)).toMatch(/Cupom de retorno5% até 27\/11\/2026 • ainda não usado—.*Lembrete de retornoMensagem pelo WhatsApp • Bruno—/);
    void maria;
  });

  it('"Já falei", "Adiar 7 dias" e "Não incomodar" (com confirmação)', async () => {
    await sumida();
    const a = telaClientes(BRUNO);
    await abaRetorno();
    await userEvent.click(await screen.findByRole('button', { name: 'Adiar 7 dias o lembrete de Maria Souza' }));
    expect(await screen.findByText('Maria volta para a lista em 27/11/2026.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Ninguém para lembrar agora/)).toBeTruthy());
    cleanup();
    relogio = new Date('2026-11-28T15:00:00Z');
    telaClientes(BRUNO);
    await abaRetorno();
    await userEvent.click(await screen.findByRole('button', { name: 'Não incomodar Maria Souza' }));
    expect(within(janela()).getByText('Maria Souza sai das listas de lembrete. Dá para desfazer no cadastro.')).toBeTruthy();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Maria não vai receber lembretes.')).toBeTruthy();
    expect((await a.listarRetorno()).fora).toEqual([expect.objectContaining({ motivo: 'Pediu para não receber lembretes' })]);
    // "Já falei" registra o contato sem mensagem (e sem cupom)
    const joao = await api(ANA).cadastrarCliente({ nome: 'João Pereira', telefone: '41988887777', cpf: '11144477735' });
    await api(ANA).registrarContato(joao.id, { tipo: 'retorno', canal: 'outro' });
    expect((await a.listarRetorno()).resultado.linhas.map((l) => [l.clienteNome, l.canal])).toEqual([['João Pereira', 'outro']]);
  });
});

describe('Clientes · Regras do programa e resumo (CLI-10, 17 e 18)', () => {
  function telaClientes(o: OperadorComPapel) {
    const a = api(o);
    render(<TelaClientes api={a} pessoa={{ nome: o.nome, papel: o.papel }} fuso={FUSO} agora={agora} />);
    return a;
  }
  const abaRegras = async () => userEvent.click(within(await screen.findByRole('navigation', { name: 'Seções de Clientes' })).getByRole('button', { name: 'Regras do programa' }));

  it('o Vendedor vê as regras e o regulamento, sem poder alterar', async () => {
    await preparar();
    telaClientes(BRUNO);
    await abaRegras();
    expect(await screen.findByText(/Só o Dono e o Administrador alteram as regras/)).toBeTruthy();
    expect((screen.getByLabelText('Percentual de cashback') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Salvar regras' })).toBeNull();
    expect(screen.getByText(/^Programa de cashback Minha loja/).textContent).toMatch(/recebe 3,5% do valor pago como cashback/);
  });

  it('o Dono muda o percentual e a mensagem; o regulamento acompanha; variável errada é recusada', async () => {
    await preparar();
    const a = telaClientes(ANA);
    await abaRegras();
    const pct = (await screen.findByLabelText('Percentual de cashback')) as HTMLInputElement;
    await userEvent.clear(pct);
    await userEvent.type(pct, '25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(screen.getByRole('alert').textContent).toBe('Percentual de cashback: use um valor entre 0 e 20.');
    await userEvent.clear(pct);
    await userEvent.type(pct, '5,5');
    const msg = screen.getByLabelText('Aviso de cashback vencendo') as HTMLTextAreaElement;
    await userEvent.clear(msg);
    await userEvent.type(msg, 'Oi {{nome}, use {{cupom}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Use só {nome}, {loja}, {valor}, {validade} (não existe {cupom}).');
    await userEvent.clear(msg);
    await userEvent.type(msg, 'Oi {{nome}, seu cashback de {{valor} vence em {{validade}.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar regras' }));
    expect(await screen.findByText('Regras salvas. Valem para as próximas vendas e lembretes.')).toBeTruthy();
    expect((await a.lerConfiguracao()).regras.cashback.percentual).toBe(5.5);
    expect((await a.lerConfiguracao()).regras.mensagens.cashback).toBe('Oi {nome}, seu cashback de {valor} vence em {validade}.');
    await waitFor(() => expect(screen.getByText(/^Programa de cashback Minha loja/).textContent).toMatch(/recebe 5,5% do valor pago/));
    // copiar o regulamento
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar texto' }));
    expect(escrever).toHaveBeenCalledWith(expect.stringMatching(/^Programa de cashback Minha loja\n/));
    expect(await screen.findByText('Regulamento copiado.')).toBeTruthy();
  });

  it('o resumo mostra o cashback em aberto e de onde ele vem', async () => {
    const { dono, racao, maria } = await preparar();
    await dono.criarVenda({ itens: [{ produtoId: racao.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 15980 }], clienteId: maria.id });
    telaClientes(ANA);
    await waitFor(() => expect(txt(screen.getByTestId('cli-cashback-aberto').textContent)).toBe('R$ 5,59'));
    await userEvent.click(screen.getByRole('button', { name: /CASHBACK EM ABERTO/ }));
    const detalhe = await screen.findByRole('region', { name: 'Cashback em aberto' });
    expect(txt(within(detalhe).getByText(/^Gerado R\$/).textContent)).toBe('Gerado R$ 5,59 − usado R$ 0,00 − vencido R$ 0,00 = em aberto R$ 5,59');
    expect(txt(within(detalhe).getAllByRole('row')[1]!.textContent)).toBe('Maria SouzaR$ 5,59——R$ 5,59R$ 5,59 em 21/12/2026');
    // a conta mostra o cashback disponível
    await userEvent.click(screen.getByRole('button', { name: 'Abrir a conta de Maria Souza' }));
    const disponivel = (await screen.findByText('Cashback disponível')).parentElement!;
    expect(txt(disponivel.textContent)).toBe('Cashback disponívelR$ 5,59R$ 5,59 vence em 21/12/2026');
  });
});
