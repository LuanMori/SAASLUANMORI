// packages/core/test/fiado.test.ts — clientes e fiado (Fase 2, módulo 6), com as regras do DaniPets V9.3.3.
import { describe, expect, it } from 'vitest';
import {
  type Autorizacao,
  cadastroCompleto,
  clienteTemHistorico,
  descreverAbatidas,
  efeitosFinanceirosDoEstorno,
  extratoDoCliente,
  fiadoDoCliente,
  liberacaoDoFiadoServe,
  mensagemFiadoPrecisaDono,
  motivosDoFiado,
  type Operador,
  previaDoRecebimento,
  type Recebivel,
  receberFiado,
  receberRecebivel,
  resumirAuditoria,
  situacaoDoFiado,
  TAXAS_CARTAO_PADRAO,
  temWhatsapp,
  validarNovaVenda,
  validarNovoCliente,
  type Venda,
} from '../src';

const ANA: Operador = { id: 'ana', nome: 'Ana' };
const MARIA = { id: 'maria', nome: 'Maria Oliveira' };
const FUSO = 'America/Sao_Paulo';
const HOJE = '2026-11-20';
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem.replace(/ /g, ' ') : '');
const limpo = (t: string) => t.replace(/ /g, ' ');
const BASE = { nome: 'Maria Oliveira', telefone: '41999998888', cpf: '52998224725' };

function fiado(id: string, vendaNumero: number, bruto: number, venceEm: string, extra: Partial<Recebivel> = {}): Recebivel {
  return {
    id,
    forma: 'fiado',
    cliente: MARIA,
    vendaId: `v${vendaNumero}`,
    vendaNumero,
    criadoEm: `${venceEm.slice(0, 8)}01T15:00:00.000Z`,
    venceEm,
    brutoCentavos: bruto,
    taxaCentavos: 0,
    estornadoBrutoCentavos: 0,
    estornadoTaxaCentavos: 0,
    situacao: 'pendente',
    recebimento: null,
    ...extra,
  };
}
let seq = 0;
const novoId = () => `novo${++seq}`;

describe('cadastro completo do cliente (CLI-01)', () => {
  it('campos novos são opcionais e só voltam quando enviados', () => {
    expect(validarNovoCliente(BASE)).toEqual({ ok: true, valor: BASE });
    const completo = validarNovoCliente(
      {
        ...BASE,
        extra: ' Thor,  cão ',
        nascimento: '1990-05-17',
        endereco: 'Rua das Flores, 10',
        observacoes: '',
        limiteFiadoCentavos: 20000,
        whatsapp: true,
        autorizaMensagens: false,
        naoIncomodar: false,
      },
      { hoje: HOJE },
    );
    expect(completo).toEqual({
      ok: true,
      valor: { ...BASE, extra: 'Thor, cão', nascimento: '1990-05-17', endereco: 'Rua das Flores, 10', observacoes: null, limiteFiadoCentavos: 20000, whatsapp: true, autorizaMensagens: false, naoIncomodar: false },
    });
  });

  it('confere nascimento, limite, textos e marcações', () => {
    expect(mensagem(validarNovoCliente({ ...BASE, nascimento: '2026-11-21' }, { hoje: HOJE }))).toBe('Data de nascimento inválida.');
    expect(mensagem(validarNovoCliente({ ...BASE, nascimento: '1990-02-30' }))).toBe('Data de nascimento inválida.');
    expect(mensagem(validarNovoCliente({ ...BASE, nascimento: '1899-12-31' }))).toBe('Data de nascimento inválida.');
    expect(validarNovoCliente({ ...BASE, nascimento: '' })).toEqual({ ok: true, valor: { ...BASE, nascimento: null } });
    expect(mensagem(validarNovoCliente({ ...BASE, limiteFiadoCentavos: -1 }))).toBe('O limite de fiado não pode ser negativo.');
    expect(mensagem(validarNovoCliente({ ...BASE, limiteFiadoCentavos: 10_000_001 }))).toBe('O limite de fiado pode ser no máximo R$ 100.000,00.');
    expect(mensagem(validarNovoCliente({ ...BASE, limiteFiadoCentavos: 10.5 }))).toBe('O limite de fiado não pode ser negativo.');
    expect(mensagem(validarNovoCliente({ ...BASE, extra: 'x'.repeat(161) }))).toBe('O campo extra pode ter até 160 caracteres.');
    expect(mensagem(validarNovoCliente({ ...BASE, observacoes: 'x'.repeat(301) }))).toBe('As observações podem ter até 300 caracteres.'.replace('podem', 'pode'));
    expect(mensagem(validarNovoCliente({ ...BASE, endereco: 'a\u0000b' }))).toBe('O endereço contém caracteres inválidos.');
    expect(mensagem(validarNovoCliente({ ...BASE, whatsapp: 'sim' }))).toBe('Marque sim ou não.');
  });

  it('cadastro completo e WhatsApp (sem a informação, sim para celular)', () => {
    expect(cadastroCompleto(BASE)).toBe(true);
    expect(cadastroCompleto({ ...BASE, cpf: '' })).toBe(false);
    expect(cadastroCompleto({ ...BASE, nome: 'Cliente removido' })).toBe(false);
    expect(cadastroCompleto(null)).toBe(false);
    expect(temWhatsapp({ telefone: '41999998888' })).toBe(true);
    expect(temWhatsapp({ telefone: '4133334444' })).toBe(false);
    expect(temWhatsapp({ telefone: '41999998888', whatsapp: false })).toBe(false);
  });
});

describe('fiado do cliente, limite e liberação do Dono (PDV-10)', () => {
  const recebiveis = [
    fiado('r2', 2, 3000, '2026-11-25'),
    fiado('r1', 1, 5000, '2026-11-10'),
    fiado('r3', 3, 2000, '2026-11-01', { situacao: 'recebido', recebimento: { em: 'x', conta: 'caixa', valorCentavos: 2000, por: ANA } }),
    { ...fiado('r4', 4, 1000, '2026-11-05'), cliente: { id: 'outro', nome: 'Outro' } },
  ];

  it('devendo, vencido e a ordem em que o pagamento abate (a que vence primeiro)', () => {
    const f = fiadoDoCliente(recebiveis, 'maria', HOJE);
    expect([f.devendoCentavos, f.vencidoCentavos, f.diasVencido, f.abertos.map((r) => r.id)]).toEqual([8000, 5000, 10, ['r1', 'r2']]);
    expect(situacaoDoFiado(f, HOJE)).toEqual({ texto: 'vencido há 10 dias', tipo: 'vencido' });
    const emDia = fiadoDoCliente([fiado('r2', 2, 3000, '2026-11-22')], 'maria', HOJE);
    expect(situacaoDoFiado(emDia, HOJE)).toEqual({ texto: 'vence em 2 dias (22/11/2026)', tipo: 'perto' });
    expect(situacaoDoFiado(fiadoDoCliente([], 'maria', HOJE), HOJE)).toBeNull();
  });

  it('acima do limite, sem limite e com fiado vencido pedem a liberação de um Dono', () => {
    const f = fiadoDoCliente(recebiveis, 'maria', HOJE);
    expect(motivosDoFiado(20000, { devendoCentavos: 0, vencidoCentavos: 0, diasVencido: 0 }, 5000, true)).toEqual([]);
    expect(motivosDoFiado(10000, f, 3000, true).map(limpo)).toEqual(['passa do limite de R$ 100,00 em R$ 10,00', 'tem R$ 50,00 vencido há 10 dias']);
    expect(motivosDoFiado(100000, f, 3000, false)).toEqual([]); // a loja desligou "fiado vencido pede Dono"
    expect(motivosDoFiado(0, { devendoCentavos: 0, vencidoCentavos: 0, diasVencido: 0 }, 1, true)).toEqual(['o cliente não tem limite de fiado no cadastro']);
    expect(limpo(mensagemFiadoPrecisaDono('Maria', ['o cliente não tem limite de fiado no cadastro']))).toBe(
      'Venda no fiado para Maria: o cliente não tem limite de fiado no cadastro. Precisa da liberação de um Dono.',
    );
  });

  it('a liberação serve só de um Dono, para o mesmo cliente e valor, por 4 horas', () => {
    const agora = new Date(`${HOJE}T15:00:00.000Z`);
    const a = (papel: 'dono' | 'administrador', criadaEm = `${HOJE}T14:00:00.000Z`): Autorizacao => ({
      id: 'a1',
      autorizador: { id: 'x', nome: 'X', papel },
      acao: { tipo: 'fiado', clienteId: 'maria', valorCentavos: 3000 },
      criadaEm,
    });
    expect(liberacaoDoFiadoServe(a('dono'), 'maria', 3000, agora)).toBe(true);
    expect(liberacaoDoFiadoServe(a('administrador'), 'maria', 3000, agora)).toBe(false);
    expect(liberacaoDoFiadoServe(a('dono'), 'maria', 3001, agora)).toBe(false);
    expect(liberacaoDoFiadoServe(a('dono'), 'joao', 3000, agora)).toBe(false);
    expect(liberacaoDoFiadoServe(a('dono', `${HOJE}T10:59:00.000Z`), 'maria', 3000, agora)).toBe(false);
  });

  it('a venda leva a liberação com o motivo', () => {
    const pedido = { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'fiado', valorCentavos: 1000 }], clienteId: 'maria' };
    expect(validarNovaVenda({ ...pedido, liberacaoFiado: { autorizacao: 'a1', motivo: ' cliente antigo ' } })).toMatchObject({ ok: true, valor: { liberacaoFiado: { autorizacao: 'a1', motivo: 'cliente antigo' } } });
    expect(mensagem(validarNovaVenda({ ...pedido, liberacaoFiado: { autorizacao: 'a1', motivo: '' } }))).toBe('Liberação do fiado inválida: informe o motivo.');
    expect(validarNovaVenda(pedido)).toMatchObject({ ok: true, valor: { clienteId: 'maria' } });
  });
});

describe('receber o fiado pela conta do cliente (CLI-16)', () => {
  const ctx = { cliente: MARIA, em: `${HOJE}T15:00:00.000Z`, hoje: HOJE, por: ANA, novoId, taxas: TAXAS_CARTAO_PADRAO };
  const abertos = () => fiadoDoCliente([fiado('r1', 1, 5000, '2026-11-10'), fiado('r2', 2, 3000, '2026-11-25')], 'maria', HOJE);

  it('abate primeiro a compra mais antiga; a parte paga de uma compra vira um "recebido" separado', () => {
    const r = receberFiado(abertos(), 6000, 'dinheiro', ctx);
    if (!r.ok) throw new Error(mensagem(r));
    expect(r.valor.abatidas).toEqual([
      { vendaNumero: 1, valorCentavos: 5000 },
      { vendaNumero: 2, valorCentavos: 1000 },
    ]);
    expect(r.valor.atualizados.map((x) => [x.id, x.situacao, x.brutoCentavos, x.recebimento?.valorCentavos ?? null])).toEqual([
      ['r1', 'recebido', 5000, 5000],
      ['r2', 'pendente', 2000, null],
    ]);
    expect(r.valor.partesPagas).toMatchObject([{ vendaId: 'v2', brutoCentavos: 1000, situacao: 'recebido', recebimento: { conta: 'caixa', valorCentavos: 1000, forma: 'dinheiro' } }]);
    expect(r.valor.lancamento).toMatchObject({ conta: 'caixa', tipo: 'recebimento_fiado', valorCentavos: 6000, descricao: 'Fiado • Maria Oliveira • Dinheiro', vendaId: null });
    expect(r.valor.cartao).toBeNull();
    expect(limpo(descreverAbatidas(r.valor.abatidas))).toBe('#00001 (R$ 50,00), #00002 (R$ 10,00)');
    const emAberto = abertos().abertos.map((x) => ({ vendaNumero: x.vendaNumero, abertoCentavos: x.brutoCentavos - x.estornadoBrutoCentavos }));
    expect(previaDoRecebimento(emAberto, 6000)).toEqual({ abatidas: r.valor.abatidas, ficaDevendoCentavos: 2000 });
    expect(previaDoRecebimento(emAberto, 9000)).toEqual({ abatidas: [], ficaDevendoCentavos: 8000 }); // mais do que deve: não abate nada
  });

  it('Pix entra na Conta bancária; cartão fica a receber da operadora, com a taxa', () => {
    const pix = receberFiado(abertos(), 8000, 'pix', ctx);
    expect(pix.ok && pix.valor.lancamento).toMatchObject({ conta: 'banco', valorCentavos: 8000, descricao: 'Fiado • Maria Oliveira • Pix' });
    const cartao = receberFiado(abertos(), 3000, 'credito', ctx);
    if (!cartao.ok) throw new Error('cartão');
    expect(cartao.valor.lancamento).toBeNull();
    expect(cartao.valor.cartao).toMatchObject({ forma: 'credito', cliente: MARIA, origem: 'fiado', vendaNumero: 0, brutoCentavos: 3000, taxaCentavos: 90, venceEm: '2026-12-20', situacao: 'pendente' });
    // confirmar o depósito da operadora: a descrição diz que era fiado
    const conf = receberRecebivel({ ...cartao.valor.cartao!, id: 'c1' }, { conta: 'banco', em: 'x', por: ANA });
    expect(conf.ok && conf.valor.lancamento.descricao).toBe('Cartão de crédito • fiado de Maria Oliveira');
  });

  it('recusa valor zero, maior que a dívida, forma desconhecida e cliente sem fiado', () => {
    expect(mensagem(receberFiado(abertos(), 0, 'pix', ctx))).toBe('Informe o valor recebido.');
    expect(mensagem(receberFiado(abertos(), 8001, 'pix', ctx))).toBe('Maria Oliveira deve R$ 80,00. Informe um valor até esse.');
    expect(mensagem(receberFiado(abertos(), 100, 'cheque', ctx))).toBe('Escolha a forma de pagamento.');
    expect(mensagem(receberFiado(fiadoDoCliente([], 'maria', HOJE), 100, 'pix', ctx))).toBe('Maria Oliveira não tem fiado em aberto.');
  });

  it('devolução depois de pagar uma parte: abate primeiro o que está em aberto; o resto volta pela conta do pagamento', () => {
    const venda = { id: 'v1', numero: 1, pagamentos: [{ forma: 'fiado', valorCentavos: 5000 }], devolucoes: [] } as unknown as Venda;
    const r = receberFiado(fiadoDoCliente([fiado('r1', 1, 5000, '2026-11-25')], 'maria', HOJE), 2000, 'pix', ctx);
    if (!r.ok) throw new Error('receber');
    const daVenda = [...r.valor.atualizados, ...r.valor.partesPagas];
    const e = efeitosFinanceirosDoEstorno(venda, [{ forma: 'fiado', valorCentavos: 4000 }], daVenda, { rotulo: 'Devolução nº 1', em: 'x', por: ANA });
    if (!e.ok) throw new Error(mensagem(e));
    // R$ 30,00 em aberto são abatidos; R$ 10,00 já tinham sido pagos em Pix: voltam pela Conta bancária
    expect(e.valor.recebiveis.map((x) => [x.situacao, x.brutoCentavos - x.estornadoBrutoCentavos])).toEqual([
      ['cancelado', 0],
      ['recebido', 1000],
    ]);
    expect(e.valor.lancamentos.map((l) => [l.conta, l.valorCentavos])).toEqual([['banco', -1000]]);
  });
});

describe('conta do cliente: extrato e histórico (CLI-04, 07)', () => {
  const vendas = [
    {
      id: 'v1',
      numero: 1,
      criadaEm: '2026-11-10T15:00:00.000Z',
      cliente: MARIA,
      itens: [{ nome: 'Ração 15 kg', quantidade: 1 }, { nome: 'Granel', quantidade: 1500, unidade: 'kg' }],
      totalCentavos: 5000,
      descontoCentavos: 0,
      pagamentos: [{ forma: 'fiado', valorCentavos: 5000 }],
      status: 'finalizada',
      devolucoes: [{ numero: 1, criadaEm: '2026-11-12T15:00:00.000Z', itens: [{ nome: 'Granel', quantidade: 500, unidade: 'kg' }], totalCentavos: 1000, estornos: [{ forma: 'fiado', valorCentavos: 1000 }] }],
    },
    { id: 'v2', numero: 2, criadaEm: '2026-11-11T15:00:00.000Z', cliente: MARIA, itens: [{ nome: 'Areia', quantidade: 2 }], totalCentavos: 4980, descontoCentavos: 500, pagamentos: [{ forma: 'pix', valorCentavos: 4980 }], status: 'cancelada', devolucoes: [] },
    { id: 'v3', numero: 3, criadaEm: '2026-11-11T16:00:00.000Z', cliente: null, itens: [], totalCentavos: 1, descontoCentavos: 0, pagamentos: [], status: 'finalizada', devolucoes: [] },
  ] as unknown as Venda[];
  const recebiveis = [
    fiado('r1', 1, 3000, '2026-12-10', { vendaId: 'v1', criadoEm: '2026-11-10T15:00:00.000Z', estornadoBrutoCentavos: 1000 }),
    fiado('p1', 1, 1000, '2026-12-10', { vendaId: 'v1', criadoEm: '2026-11-10T15:00:00.000Z', situacao: 'recebido', recebimento: { em: '2026-11-15T15:00:00.000Z', conta: 'banco', valorCentavos: 1000, por: ANA, forma: 'pix' } }),
  ];

  it('compras, devoluções, compra no fiado e pagamentos, do mais novo para o mais antigo', () => {
    const e = extratoDoCliente('maria', vendas, recebiveis, FUSO).map((l) => [l.dia, l.tipo, l.movimento, limpo(l.detalhe), l.sinal, l.valorCentavos, l.cancelada]);
    expect(e).toEqual([
      ['2026-11-15', 'fiado', 'Fiado pago', 'Pix • compra #00001 • Ana', '−', 1000, false],
      ['2026-11-12', 'fiado', 'Fiado estornado', 'Devolução nº 1 • compra #00001', '−', 1000, false],
      ['2026-11-12', 'compras', 'Devolução nº 1', 'da compra #00001 • 0,5 kg Granel', '−', 1000, false],
      ['2026-11-11', 'compras', 'Compra #00002 (cancelada)', '2 Areia • Pix • desconto R$ 5,00', '', 4980, true],
      ['2026-11-10', 'fiado', 'Compra no fiado', 'compra #00001 • vence 10/12/2026', '+', 4000, false],
      ['2026-11-10', 'compras', 'Compra #00001', 'Ração 15 kg, 1,5 kg Granel • Fiado', '', 5000, false],
    ]);
  });

  it('cliente com compra ou fiado tem histórico (não pode ser excluído, só os dados)', () => {
    expect(clienteTemHistorico('maria', vendas, [])).toBe(true);
    expect(clienteTemHistorico('joao', vendas, recebiveis)).toBe(false);
    expect(clienteTemHistorico('maria', [], recebiveis)).toBe(true);
  });

  it('resumos das ações novas no histórico', () => {
    const nome = (id: string) => (id === 'ana' ? 'Ana' : null);
    expect(resumirAuditoria('cliente.alterado', { campos: ['extra', 'endereco', 'whatsapp'] })).toBe('campo extra, endereço, WhatsApp');
    expect(limpo(resumirAuditoria('cliente.limite', { de: 0, para: 20000 }))).toBe('R$ 0,00 → R$ 200,00');
    expect(resumirAuditoria('cliente.mensagens', { autorizou: true })).toBe('autorizou mensagens da loja');
    expect(resumirAuditoria('cliente.mensagens', { autorizou: false })).toBe('cancelou a autorização de mensagens');
    expect(resumirAuditoria('cliente.nao_incomodar', { ativo: true })).toBe('saiu das listas de lembrete');
    expect(limpo(resumirAuditoria('cliente.fiado_recebido', { valorCentavos: 6000, forma: 'pix' }))).toBe('R$ 60,00 • em Pix');
    expect(limpo(resumirAuditoria('venda.fiado_liberado', { numero: 12, valorCentavos: 5000, autorizadoPor: 'ana' }, nome))).toBe('venda nº 00012 • R$ 50,00 no fiado • liberado por Ana');
  });
});
