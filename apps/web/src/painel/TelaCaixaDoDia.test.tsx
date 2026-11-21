// apps/web/src/painel/TelaCaixaDoDia.test.tsx — aba Caixa do dia (Fase 2, módulo 5), ligada à API da demonstração.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { darEstoque } from '../testes/estoque';
import { TelaCaixaDoDia } from './TelaCaixaDoDia';
import { TelaCompras } from './TelaCompras';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';
import { TelaVisaoGeral } from './TelaVisaoGeral';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const api = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'cx', operador: o, exemplos: false, atrasoMs: 0 });
const txt = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const janela = () => screen.getByRole('dialog');

/** Abre a tela depois de preparar a loja (`antes`), como a pessoa encontraria. */
async function abrirTela(o: OperadorComPapel, antes?: (a: ReturnType<typeof api>) => Promise<unknown>) {
  const a = api(o);
  if (antes) await antes(a);
  render(<TelaCaixaDoDia api={a} pessoa={{ nome: o.nome, papel: o.papel }} fuso={FUSO} />);
  return a;
}
const pilulaAberto = () => screen.findByText(/^Caixa aberto às \d\d:\d\d$/);

async function venderEmDinheiro(centavos: number) {
  const dono = api(ANA);
  const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: centavos });
  await darEstoque('cx', 10);
  await dono.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: centavos }], recebidoDinheiroCentavos: centavos });
}

/** Caixa aberto ontem (20/11) por Bruno com R$ 20,00 de fundo e uma venda de R$ 10,00 em dinheiro. Agora: 21/11, 08:00. */
async function ontemFechouSozinho() {
  let relogio = new Date('2026-11-20T12:00:00Z');
  const comRelogio = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'cx', operador: o, exemplos: false, atrasoMs: 0, agora: () => relogio });
  const dono = comRelogio(ANA);
  const p = await dono.criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
  await darEstoque('cx', 10);
  await comRelogio(BRUNO).abrirCaixa({ fundoCentavos: 2000 });
  await dono.criarVenda({ itens: [{ produtoId: p.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valorCentavos: 1000 }], recebidoDinheiroCentavos: 1000 });
  relogio = new Date('2026-11-21T11:00:00Z');
  return { comRelogio, agora: () => relogio };
}

describe('Caixa do dia · abrir, operar e fechar', () => {
  it('o Vendedor abre o caixa (é o operador) e vê o fundo, o esperado e as vendas de hoje', async () => {
    await abrirTela(BRUNO);
    expect((await screen.findByText(/ainda não foi aberto/)).textContent).toMatch(/Sem caixa aberto não há vendas\./);
    // formato do DaniPets: subtítulo, situação do caixa e a data por extenso no cabeçalho
    expect(screen.getByText('Abertura, sangria, suprimento e fechamento.')).toBeTruthy();
    expect(screen.getByText('Caixa de hoje não aberto')).toBeTruthy();
    expect(screen.getByText(/^[A-ZÀ-Ú][a-zà-ú]+(-feira)?, \d{1,2} de [a-zà-ú]+ de \d{4}$/)).toBeTruthy();
    // tabelas vazias com o cabeçalho e "Nenhum registro."
    expect(within(screen.getByRole('region', { name: 'Histórico de caixa' })).getByText('Nenhum registro.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Movimentos em dinheiro de hoje' })).getByText('Nenhum registro.')).toBeTruthy();
    expect((screen.getByLabelText('Operador') as HTMLInputElement).value).toBe('Bruno');
    // o Vendedor não vê o saldo do Caixa físico (é do Financeiro)
    expect(screen.queryByText(/No sistema, o Caixa físico tem/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Informe o fundo de troco/);
    await userEvent.type(screen.getByLabelText('Fundo de troco na gaveta (R$)'), '150,00');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    expect(txt((await screen.findByText(/Caixa aberto com/)).textContent)).toBe('Caixa aberto com R$ 150,00 de fundo de troco. Operador: Bruno.');
    expect(await pilulaAberto()).toBeTruthy();
    expect(screen.getByText('Operador: Bruno')).toBeTruthy();
    expect(txt(screen.getByTestId('caixa-esperado').textContent)).toBe('R$ 150,00');
    expect(screen.getByRole('heading', { name: /^Fechar caixa de \d\d\/\d\d\/\d{4}$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Regras do caixa' })).toBeNull();
  });

  it('sangria vai para o banco; a retirada do dono pede a senha do Dono ou do Administrador', async () => {
    await abrirTela(BRUNO, (a) => a.abrirCaixa({ fundoCentavos: 10000 }));
    await pilulaAberto();
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '30');
    await userEvent.type(screen.getByLabelText('Descrição'), 'levou ao banco');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(txt((await screen.findByText(/Sangria registrada/)).textContent)).toBe('Sangria registrada: R$ 30,00 da gaveta para a Conta bancária.');
    // a mensagem chega antes da tela recarregar: espera o valor novo
    await waitFor(() => expect(txt(screen.getByTestId('caixa-esperado').textContent)).toBe('R$ 70,00'));

    // retirada do dono: o Vendedor precisa de senha; mais do que a gaveta nem chega a pedir
    await userEvent.selectOptions(screen.getByLabelText('Destino da sangria'), 'retirada');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '80');
    await userEvent.type(screen.getByLabelText('Descrição'), 'levou para casa');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(txt(screen.getByRole('alert').textContent)).toMatch(/maior que o dinheiro esperado na gaveta \(R\$ 70,00\)/);
    await userEvent.clear(screen.getByLabelText('Valor (R$)'));
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(within(janela()).getByRole('heading', { name: 'Autorização necessária' })).toBeTruthy();
    await within(janela()).findByText('Ana · Dono');
    expect(txt(within(janela()).getByText(/^Retirada do dono:/).textContent)).toBe('Retirada do dono: R$ 20,00 da gaveta (levou para casa). O vendedor não registra a retirada do dono sozinho.');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'errada12');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('Senha incorreta.');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar' }));
    expect(txt((await screen.findByText(/Retirada do dono registrada/)).textContent)).toBe('Retirada do dono registrada: R$ 20,00 da gaveta.');
    expect(screen.queryByRole('dialog')).toBeNull();
    const mov = within(screen.getByRole('region', { name: 'Movimentos em dinheiro desde a abertura' }));
    expect(await mov.findByText('Retirada do dono (gaveta) • levou para casa')).toBeTruthy();
    expect(mov.getByText('autorizou: Ana')).toBeTruthy();
  });

  it('fechar: diferença pede justificativa; acima de R$ 10,00 o Vendedor precisa de senha; o histórico guarda tudo', async () => {
    await abrirTela(BRUNO, async (a) => {
      await a.abrirCaixa({ fundoCentavos: 10000 });
      await venderEmDinheiro(2000); // esperado: R$ 120,00
    });
    await pilulaAberto();
    const contado = screen.getByLabelText('Dinheiro contado na gaveta (R$)');
    await userEvent.type(contado, '100');
    expect(txt(screen.getByText(/^Esperado na gaveta:/).textContent)).toBe('Esperado na gaveta: R$ 120,00 • Diferença: -R$ 20,00');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar caixa' }));
    expect(txt(screen.getByRole('alert').textContent)).toBe('Há falta de R$ 20,00 na gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).');
    await userEvent.type(screen.getByLabelText('Observação (obrigatória se houver diferença)'), 'troco errado');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar caixa' }));
    expect(txt(within(janela()).getByText(/^Fechamento do caixa de/).textContent)).toMatch(/com falta de R\$ 20,00 \(esperado R\$ 120,00, contado R\$ 100,00\)\. Acima de R\$ 10,00/);
    await within(janela()).findByText('Caio · Administrador');
    await userEvent.selectOptions(within(janela()).getByLabelText('Quem autoriza'), 'caio');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar' }));
    expect(txt((await screen.findByText(/fechado\. Falta/)).textContent)).toMatch(/^Caixa de \d\d\/\d\d\/\d{4} fechado\. Falta de R\$ 20,00 lançada como ajuste no saldo do Caixa físico\.$/);
    expect(await screen.findByText('O caixa de hoje já foi fechado.')).toBeTruthy();
    expect(screen.getByText('Caixa de hoje fechado')).toBeTruthy();
    const linha = within(screen.getByRole('region', { name: 'Histórico de caixa' })).getAllByRole('row')[1]!;
    expect(txt(linha.textContent)).toMatch(/R\$ 100,00R\$ 120,00R\$ 100,00-R\$ 20,00troco erradoabriu: Bruno às \d\d:\d\dfechou: Bruno às \d\d:\d\d • autorizou: Caio—$/);
    // o Vendedor não desfaz
    expect(screen.queryByRole('button', { name: /Desfazer o fechamento/ })).toBeNull();
  });

  it('o Dono desfaz o último fechamento com motivo e muda a tolerância nas Regras do caixa', async () => {
    const aoMudarRegras = vi.fn();
    const a = api(ANA);
    await a.abrirCaixa({ fundoCentavos: 5000 });
    await a.fecharCaixa({ dia: (await a.lerSituacaoDoCaixa()).hoje, contadoCentavos: 5000 });
    render(<TelaCaixaDoDia api={a} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} aoMudarRegras={aoMudarRegras} />);
    expect((await screen.findByText(/O caixa de hoje já foi fechado\./)).textContent).toMatch(/desfaça o fechamento no histórico/);
    await userEvent.click(screen.getByRole('button', { name: /^Desfazer o fechamento de/ }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Desfazer fechamento' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Informe o motivo.');
    await userEvent.type(within(janela()).getByLabelText('Motivo para desfazer o fechamento'), 'faltou lançar uma venda');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Desfazer fechamento' }));
    expect(await screen.findByText(/desfeito\. O dia está aberto de novo\./)).toBeTruthy();
    expect(await pilulaAberto()).toBeTruthy();
    expect(await screen.findByText('fechamento desfeito 1 vez')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Regras do caixa' }));
    const campo = within(janela()).getByLabelText('Diferença aceita no fechamento (R$)') as HTMLInputElement;
    expect(campo.value).toBe('10,00');
    await userEvent.clear(campo);
    await userEvent.type(campo, '5');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Salvar' }));
    expect(txt((await screen.findByText(/Regras do caixa salvas/)).textContent)).toBe('Regras do caixa salvas: o Vendedor fecha sozinho com diferença de até R$ 5,00.');
    expect(aoMudarRegras).toHaveBeenCalled();
    expect((await a.lerConfiguracao()).regras.caixa.toleranciaCentavos).toBe(500);
  });
});

describe('Caixa do dia · fechamento automático à meia-noite (pedido do Luan, 21/11/2026)', () => {
  it('o Dono vê "Deseja verificar?", confere os números do dia e marca como verificado', async () => {
    const { comRelogio } = await ontemFechouSozinho();
    render(<TelaCaixaDoDia api={comRelogio(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    const aviso = await screen.findByText(/fechou sozinho à meia-noite/);
    expect(txt(aviso.textContent)).toBe('O caixa de 20/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta (esperado R$ 30,00). Deseja verificar?');
    expect(screen.getByText('Caixa de hoje não aberto')).toBeTruthy();
    expect(screen.getByText('Sábado, 21 de novembro de 2026')).toBeTruthy();
    // no histórico: automático, a verificar, quem fechou foi o Sistema
    const linha = within(screen.getByRole('region', { name: 'Histórico de caixa' })).getAllByRole('row')[1]!;
    expect(txt(linha.textContent)).toBe('20/11/2026R$ 20,00R$ 30,00—automático • sem contagema verificarabriu: Bruno às 09:00fechou: Sistema (meia-noite)Desfazer fechamento');

    await userEvent.click(screen.getByRole('button', { name: 'Verificar o fechamento de 20/11/2026' }));
    expect(within(janela()).getByRole('heading', { name: 'Verificar o fechamento de 20/11/2026' })).toBeTruthy();
    expect(txt(within(janela()).getByLabelText('Números do dia').textContent)).toBe(
      'Fundo de trocoR$ 20,00Entradas em dinheiroR$ 10,00Saídas em dinheiroR$ 0,00Esperado na gavetaR$ 30,00Vendas do diaR$ 10,00 em dinheiro • Pix R$ 0,00 • cartões R$ 0,00',
    );
    await userEvent.type(within(janela()).getByLabelText('Observação (opcional)'), 'contei R$ 30,00, bateu');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Marcar como verificado' }));
    expect(txt((await screen.findByText(/verificado\. A pendência/)).textContent)).toBe('Fechamento de 20/11/2026 verificado. A pendência saiu da Visão geral.');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.queryByText(/fechou sozinho à meia-noite/)).toBeNull());
    expect(txt((await screen.findByText(/^verificado: Ana/)).textContent)).toBe('verificado: Ana em 21/11/2026 às 08:00 • contei R$ 30,00, bateu');
  });

  it('o Vendedor não confere: sem o aviso, só "a verificar" no histórico', async () => {
    const { comRelogio } = await ontemFechouSozinho();
    render(<TelaCaixaDoDia api={comRelogio(BRUNO)} pessoa={{ nome: 'Bruno', papel: 'vendedor' }} fuso={FUSO} />);
    expect(await screen.findByText('a verificar')).toBeTruthy();
    expect(screen.queryByText(/Deseja verificar/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Verificar/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Abrir caixa de hoje' })).toBeTruthy();
  });

  it('não bateu: "Desfazer para contar" reabre o dia (não fecha sozinho de novo) e ele fecha com a contagem', async () => {
    const { comRelogio } = await ontemFechouSozinho();
    render(<TelaCaixaDoDia api={comRelogio(ANA)} pessoa={{ nome: 'Ana', papel: 'dono' }} fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar o fechamento de 20/11/2026' }));
    await userEvent.click(within(janela()).getByRole('button', { name: 'Desfazer para contar' }));
    expect(within(janela()).getByRole('heading', { name: 'Desfazer o fechamento de 20/11/2026' })).toBeTruthy();
    await userEvent.type(within(janela()).getByLabelText('Motivo do ajuste do fechamento automático'), 'conferir a gaveta');
    await userEvent.type(within(janela()).getByLabelText('Explique por que o fechamento automático precisa ser ajustado'), 'faltou dinheiro na gaveta');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Desfazer fechamento' }));
    expect(txt((await screen.findByText(/desfeito\. Conte a gaveta/)).textContent)).toBe(
      'Fechamento de 20/11/2026 desfeito. Conte a gaveta e feche o dia com a contagem (o dia não fecha sozinho de novo até a próxima meia-noite).',
    );
    // a tela leu de novo e o dia continua aberto, esperando a contagem
    expect(await screen.findByRole('heading', { name: 'Fechar caixa de 20/11/2026' })).toBeTruthy();
    expect(screen.getByText('O caixa de 20/11/2026 ainda está aberto. Feche esse dia antes de abrir o caixa de hoje.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Dinheiro contado na gaveta (R$)'), '25');
    await userEvent.type(screen.getByLabelText('Observação (obrigatória se houver diferença)'), 'troco errado');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar caixa' }));
    expect(txt((await screen.findByText(/fechado\. Falta/)).textContent)).toBe('Caixa de 20/11/2026 fechado. Falta de R$ 5,00 lançada como ajuste no saldo do Caixa físico.');
    expect(await screen.findByRole('heading', { name: 'Abrir caixa de hoje' })).toBeTruthy();
  });
});

describe('Caixa do dia · nas outras telas', () => {
  it('Visão geral: o fechamento automático vira a pendência "Deseja verificar?" do Dono; o Vendedor não vê', async () => {
    const { comRelogio, agora } = await ontemFechouSozinho();
    const aoIrPara = vi.fn();
    const visao = (o: OperadorComPapel) => (
      <TelaVisaoGeral api={comRelogio(o)} nome={o.nome} fuso={FUSO} agora={agora} aoVerCaixa={vi.fn()} aoIrPara={aoIrPara} intervaloMs={60_000} />
    );
    render(visao(ANA));
    const item = await screen.findByText(/fechou sozinho à meia-noite/);
    expect(txt(item.textContent)).toBe('Atenção: O caixa de 20/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta (esperado R$ 30,00). Deseja verificar?');
    expect(screen.getByTestId('pend-contagem').textContent).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(aoIrPara).toHaveBeenCalledWith('caixa-do-dia');
    cleanup();

    // verificado: a pendência some e o card diz o que já está ligado
    const dono = comRelogio(ANA);
    await dono.verificarFechamentoAutomatico((await dono.lerCaixa()).historico[0]!.id);
    render(visao(ANA));
    expect(txt((await screen.findByText(/^Nada pendente/)).textContent)).toBe(
      'Nada pendente. Tudo em ordem.Por enquanto, só o aviso do caixa fechado sozinho à meia-noite está ligado. Os outros (estoque, validade, contas…) ainda vamos escolher.',
    );
    cleanup();

    // o Vendedor não confere o caixa: para ele, as pendências continuam "a definir"
    render(visao(BRUNO));
    await screen.findByRole('button', { name: 'Caixa de hoje não aberto' });
    expect(screen.getByText(/Ainda não definimos quais avisos entram aqui/)).toBeTruthy();
    expect(screen.queryByText(/fechou sozinho/)).toBeNull();
  });

  it('Frente de caixa sem caixa aberto: pílula vermelha, aviso com "Abrir caixa" e a venda é recusada', async () => {
    const a = api(BRUNO);
    const p = await a.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 750 });
    await darEstoque('cx', 5);
    const aoAbrirCaixa = vi.fn();
    render(<TelaFrenteCaixa api={a} operador={{ nome: 'Bruno', papel: 'vendedor' }} loja={{ nome: 'Loja' }} fuso={FUSO} aoSair={vi.fn()} aoAbrirCaixa={aoAbrirCaixa} />);
    expect(await screen.findByText('CAIXA DE HOJE NÃO ABERTO')).toBeTruthy();
    expect(screen.getByText('O caixa de hoje ainda não foi aberto. Sem caixa aberto não há vendas.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Leitor de código de barras'), `${p.codigoBarras}{Enter}`);
    await userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
    expect((await screen.findByText('Abra o caixa de hoje (Caixa do dia) antes de vender.')).getAttribute('role')).toBe('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    expect(aoAbrirCaixa).toHaveBeenCalledOnce();
    // com o caixa aberto, a pílula fica verde e a venda passa
    cleanup();
    await a.abrirCaixa({ fundoCentavos: 0 });
    render(<TelaFrenteCaixa api={a} operador={{ nome: 'Bruno', papel: 'vendedor' }} loja={{ nome: 'Loja' }} fuso={FUSO} aoSair={vi.fn()} aoAbrirCaixa={aoAbrirCaixa} />);
    expect(await screen.findByText(/^Caixa aberto às \d\d:\d\d$/)).toBeTruthy();
    expect(screen.queryByText(/ainda não foi aberto/)).toBeNull();
  });

  it('Visão geral mostra a situação do caixa no cabeçalho; clicar leva para o Caixa do dia', async () => {
    const a = api(ANA);
    const aoVerCaixa = vi.fn();
    render(<TelaVisaoGeral api={a} nome="Ana" fuso={FUSO} aoVerCaixa={aoVerCaixa} intervaloMs={60_000} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Caixa de hoje não aberto' }));
    expect(aoVerCaixa).toHaveBeenCalledOnce();
  });

  it('compra com a data de um dia já fechado: pede a liberação do Dono, com motivo', async () => {
    const a = api(ANA);
    const p = await a.criarProduto({ nome: 'Ração 15 kg', codigoBarras: null, precoCentavos: 18990 });
    await a.definirSaldoInicial({ conta: 'banco', valorCentavos: 100000 });
    // ontem: abriu e fechou
    const ontemLocal = new Date(Date.now() - 86_400_000);
    const ontem = criarApiLocal({ lojaId: 'cx', operador: ANA, exemplos: false, atrasoMs: 0, agora: () => ontemLocal });
    const dia = (await ontem.lerSituacaoDoCaixa()).hoje;
    await ontem.abrirCaixa({ fundoCentavos: 0 });
    await ontem.fecharCaixa({ dia, contadoCentavos: 0 });
    render(<TelaCompras api={a} fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Registrar compra' }));
    const j = janela();
    await userEvent.clear(within(j).getByLabelText('Data da compra'));
    await userEvent.type(within(j).getByLabelText('Data da compra'), dia);
    await userEvent.selectOptions(within(j).getByLabelText('Produto do item 1'), p.id);
    await userEvent.type(within(j).getByLabelText('Quantidade do item 1'), '2');
    await userEvent.type(within(j).getByLabelText('Custo do item 1'), '120,00');
    await userEvent.click(within(j).getByRole('button', { name: 'Registrar compra' }));
    const lib = await screen.findByRole('heading', { name: 'Liberação do Dono' });
    const modal = lib.closest('[role="dialog"]') as HTMLElement;
    await within(modal).findByText('Ana · Dono');
    expect(txt(within(modal).getByText(/já foi fechado/).textContent)).toMatch(/: compra de Ração 15 kg nesse dia precisa da liberação de um Dono\.$/);
    expect([...within(modal).getByLabelText('Dono').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Ana · Dono']); // o Administrador não libera
    await userEvent.type(within(modal).getByLabelText('Senha do Dono'), 'demo1234');
    await userEvent.click(within(modal).getByRole('button', { name: 'Liberar' }));
    expect(within(modal).getByRole('alert').textContent).toBe('Informe o motivo.');
    await userEvent.type(within(modal).getByLabelText('Motivo'), 'NF chegou atrasada');
    await userEvent.click(within(modal).getByRole('button', { name: 'Liberar' }));
    expect(await screen.findByText(/dia já fechado • liberada por Ana: NF chegou atrasada/)).toBeTruthy();
    expect((await a.listarAuditoria())[0]).toMatchObject({ texto: 'Lançamento retroativo liberado', resumo: expect.stringMatching(/^compra • data .* • liberado por Ana$/) });
  });

  it('ajuste de estoque com a data de um dia já fechado: o Dono libera e o movimento guarda a data', async () => {
    const a = api(ANA);
    const p = await a.criarProduto({ nome: 'Coleira M', codigoBarras: null, precoCentavos: 2990, estoqueInicial: 5 });
    const ontemLocal = new Date(Date.now() - 86_400_000);
    const ontem = criarApiLocal({ lojaId: 'cx', operador: ANA, exemplos: false, atrasoMs: 0, agora: () => ontemLocal });
    const dia = (await ontem.lerSituacaoDoCaixa()).hoje;
    await ontem.abrirCaixa({ fundoCentavos: 0 });
    await ontem.fecharCaixa({ dia, contadoCentavos: 0 });
    render(<TelaProdutosEstoque api={a} papel="dono" fuso={FUSO} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ajuste de Coleira M' }));
    await userEvent.type(within(janela()).getByLabelText('Quantidade em unidades'), '1');
    await userEvent.selectOptions(within(janela()).getByLabelText('Motivo'), 'Produto vencido');
    const data = within(janela()).getByLabelText('Data');
    await userEvent.clear(data);
    await userEvent.type(data, dia);
    expect(within(janela()).getByText(/um Dono precisa liberar/)).toBeTruthy();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Lançar ajuste' }));
    expect(await screen.findByRole('heading', { name: 'Liberação do Dono' })).toBeTruthy();
    await within(janela()).findByText('Ana · Dono');
    await userEvent.type(within(janela()).getByLabelText('Senha do Dono'), 'demo1234');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'vencido de ontem');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Liberar' }));
    expect(txt((await screen.findByText(/Ajuste lançado/)).textContent)).toMatch(/^Ajuste lançado \(data \d\d\/\d\d\/\d{4}\): Coleira M -1 un\. Saldo agora: 4 un\.$/);
    const [m] = await a.listarMovimentosEstoque({ produtoId: p.id, de: dia, ate: dia });
    expect(m).toMatchObject({ tipo: 'ajuste', dia, liberacao: { por: { nome: 'Ana' }, motivo: 'vencido de ontem' } });
  });
});
