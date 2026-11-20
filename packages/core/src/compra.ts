// packages/core/src/compra.ts
// COMPRAS E CONTAS A PAGAR (Fase 2, módulo 4), com as regras do DaniPets V9.3.3 (CMP-01 a 09, PRD-10 e 11):
//   - compra por NOTA FISCAL: fornecedor, número da nota, data e vários itens (produto, quantidade, custo
//     maior que zero, validade); bonificação (sem custo) é lançada como entrada de estoque, não como compra;
//   - pagamento À VISTA (sai na hora do Caixa físico ou da Conta bancária) ou A PRAZO (vira conta a pagar,
//     com vencimento); o Caixa físico não fica negativo;
//   - nota repetida do mesmo fornecedor: pergunta antes;
//   - custo diferente da última compra: a tela mostra custo, preço e margem e oferece mudar o preço de
//     venda na mesma gravação (o preço sugerido mantém a margem);
//   - ESTORNO de um item (compra lançada errada): a mercadoria sai do estoque (sem deixar negativo); o
//     dinheiro volta para a conta de onde saiu, ou a conta a pagar diminui (cancelada se zerar);
//   - CUSTO MÉDIO móvel a cada compra (o estoque inicial com custo entra na conta; compra estornada sai dela);
//   - LOTES E VALIDADE: pela regra "o mais antigo sai primeiro", o estoque de hoje pertence às compras mais
//     novas; lotes vencidos ou vencendo aparecem para "dar baixa" (o que ainda estiver na prateleira sai
//     do estoque como "Produto vencido").
// Quantidades na unidade do produto (unidades, ou gramas no kg) e custo por unidade ou por kg (quantidade.ts).
import { CENTAVOS_MAX, formatarCentavos } from './dinheiro';
import type { MovimentoEstoque, NovoMovimentoEstoque } from './estoque';
import { type ContaId, ehConta, mensagemGaveta, type NovoLancamento } from './financeiro';
import { CONTROLE, ehObjeto } from './interno';
import { formatarQuantidade, QUANTIDADE_MAX, type UnidadeVenda, unidadeDe, valorDaQuantidade } from './quantidade';
import type { ErroCampo, Resultado } from './resultado';
import type { Operador } from './venda';

export const LIMITES_COMPRA = { itensMax: 200, notaMax: 60, motivoMax: 200, observacaoMax: 300, descricaoMax: 120 } as const;

/** Quantos dias antes da validade o lote aparece como "vencendo" (DaniPets: 30). */
export const DIAS_AVISO_VALIDADE = 30;

export type PagamentoCompra = { tipo: 'avista'; conta: ContaId } | { tipo: 'aprazo'; vencimento: string };

export interface ItemCompraPedido {
  produtoId: string;
  /** Unidades, ou gramas no produto vendido por kg. */
  quantidade: number;
  /** Custo de cada unidade (ou de cada kg). */
  custoCentavos: number;
  /** AAAA-MM-DD (opcional). */
  validade?: string | null;
}

export interface NovaCompra {
  fornecedorId?: string | null;
  notaFiscal?: string | null;
  /** Dia da compra (AAAA-MM-DD), hoje ou antes. */
  data: string;
  itens: ItemCompraPedido[];
  pagamento: PagamentoCompra;
  /** Novo preço de venda de alguns produtos (o custo mudou e a pessoa escolheu mudar o preço junto). */
  precos?: Record<string, number>;
}

export interface EstornoDoItem {
  em: string;
  por: Operador;
  motivo: string;
}

export interface BaixaDoLote {
  em: string;
  por: Operador;
  /** O que ainda estava na prateleira e saiu do estoque (0 = o lote já tinha acabado). */
  quantidade: number;
  observacao: string | null;
}

export interface ItemComprado {
  produtoId: string;
  nome: string;
  unidade: UnidadeVenda;
  quantidade: number;
  custoCentavos: number;
  totalCentavos: number;
  validade: string | null;
  estorno: EstornoDoItem | null;
  loteBaixado: BaixaDoLote | null;
}

export interface Compra {
  id: string;
  /** Sequencial da loja: 1, 2, 3… */
  numero: number;
  /** Dia da compra (AAAA-MM-DD). */
  data: string;
  criadaEm: string;
  fornecedor: { id: string; nome: string } | null;
  notaFiscal: string | null;
  itens: ItemComprado[];
  /** Total da nota quando foi registrada. */
  totalCentavos: number;
  pagamento: PagamentoCompra;
  por: Operador;
  /** Compra com a data de um dia com o caixa já fechado: quem liberou (Dono), o motivo e quando. */
  liberacao?: { por: Operador; motivo: string; em: string } | null;
}

export type SituacaoContaPagar = 'aberta' | 'paga' | 'cancelada';

export interface ContaPagar {
  id: string;
  compraId: string | null;
  descricao: string;
  /** O que falta pagar (diminui quando um item da compra é estornado). */
  valorCentavos: number;
  valorOriginalCentavos: number;
  /** AAAA-MM-DD. */
  vencimento: string;
  situacao: SituacaoContaPagar;
  criadoEm: string;
  por: Operador;
  pagamento: { em: string; conta: ContaId; por: Operador } | null;
  ajustes: { em: string; valorCentavos: number; descricao: string; por: Operador }[];
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-02-30" não existe; "2026-02-28" sim. */
export function dataValida(dia: unknown): dia is string {
  if (typeof dia !== 'string' || !DATA.test(dia)) return false;
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d!));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d;
}

/** "2026-11-19" -> "19/11/2026". */
export const dataBr = (dia: string) => dia.split('-').reverse().join('/');

const texto = (v: unknown) => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

/** Confere a compra que a tela envia. `hoje` (AAAA-MM-DD, no fuso da loja) limita a data da compra. */
export function validarNovaCompra(entrada: unknown, ctx: { hoje: string }): Resultado<NovaCompra> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com a compra.' }] };
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(entrada)) if (!['fornecedorId', 'notaFiscal', 'data', 'itens', 'pagamento', 'precos'].includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });

  const fornecedorId = typeof entrada.fornecedorId === 'string' && entrada.fornecedorId.trim() ? entrada.fornecedorId.trim() : null;
  const nota = texto(entrada.notaFiscal);
  if (nota.length > LIMITES_COMPRA.notaMax) erros.push({ campo: 'notaFiscal', mensagem: `O número da nota pode ter até ${LIMITES_COMPRA.notaMax} caracteres.` });
  else if (CONTROLE.test(nota)) erros.push({ campo: 'notaFiscal', mensagem: 'O número da nota contém caracteres inválidos.' });

  const data = entrada.data;
  if (!dataValida(data)) erros.push({ campo: 'data', mensagem: 'Informe a data da compra.' });
  else if (data > ctx.hoje) erros.push({ campo: 'data', mensagem: 'A data da compra não pode ser depois de hoje.' });

  const itens: ItemCompraPedido[] = [];
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) erros.push({ campo: 'itens', mensagem: 'Inclua pelo menos um produto na compra.' });
  else if (entrada.itens.length > LIMITES_COMPRA.itensMax) erros.push({ campo: 'itens', mensagem: `Uma nota pode ter até ${LIMITES_COMPRA.itensMax} itens.` });
  else {
    entrada.itens.forEach((x, i) => {
      const campo = `itens.${i}`;
      if (!ehObjeto(x)) return void erros.push({ campo, mensagem: 'Item inválido.' });
      for (const k of Object.keys(x)) if (!['produtoId', 'quantidade', 'custoCentavos', 'validade'].includes(k)) erros.push({ campo: `${campo}.${k}`, mensagem: 'Campo não permitido.' });
      const produtoId = typeof x.produtoId === 'string' ? x.produtoId.trim() : '';
      if (!produtoId) return void erros.push({ campo: `${campo}.produtoId`, mensagem: `Item ${i + 1}: escolha o produto.` });
      if (typeof x.quantidade !== 'number' || !Number.isInteger(x.quantidade) || x.quantidade <= 0 || x.quantidade > QUANTIDADE_MAX.kg * 10) {
        return void erros.push({ campo: `${campo}.quantidade`, mensagem: `Item ${i + 1}: informe a quantidade.` });
      }
      if (typeof x.custoCentavos !== 'number' || !Number.isInteger(x.custoCentavos) || x.custoCentavos <= 0 || x.custoCentavos > CENTAVOS_MAX) {
        return void erros.push({
          campo: `${campo}.custoCentavos`,
          mensagem: `Item ${i + 1}: informe o custo unitário (maior que zero). Mercadoria de bonificação: lance como entrada de estoque (Produtos e estoque).`,
        });
      }
      let validade: string | null = null;
      if (x.validade !== undefined && x.validade !== null && x.validade !== '') {
        if (!dataValida(x.validade)) return void erros.push({ campo: `${campo}.validade`, mensagem: `Item ${i + 1}: validade inválida.` });
        validade = x.validade;
      }
      itens.push({ produtoId, quantidade: x.quantidade, custoCentavos: x.custoCentavos, validade });
    });
  }

  let pagamento: PagamentoCompra | null = null;
  const pg = entrada.pagamento;
  if (!ehObjeto(pg) || (pg.tipo !== 'avista' && pg.tipo !== 'aprazo')) erros.push({ campo: 'pagamento', mensagem: 'Escolha à vista ou a prazo.' });
  else if (pg.tipo === 'avista') {
    if (!ehConta(pg.conta)) erros.push({ campo: 'pagamento.conta', mensagem: 'Escolha a conta de pagamento.' });
    else pagamento = { tipo: 'avista', conta: pg.conta };
  } else if (!dataValida(pg.vencimento)) erros.push({ campo: 'pagamento.vencimento', mensagem: 'Informe o vencimento da compra a prazo.' });
  else pagamento = { tipo: 'aprazo', vencimento: pg.vencimento };

  let precos: Record<string, number> | undefined;
  if (entrada.precos !== undefined && entrada.precos !== null) {
    if (!ehObjeto(entrada.precos)) erros.push({ campo: 'precos', mensagem: 'Envie os preços novos por produto.' });
    else {
      precos = {};
      for (const [id, v] of Object.entries(entrada.precos)) {
        if (!itens.some((i) => i.produtoId === id)) erros.push({ campo: `precos.${id}`, mensagem: 'Só muda o preço de produto que está na compra.' });
        else if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > CENTAVOS_MAX) erros.push({ campo: `precos.${id}`, mensagem: 'Informe o novo preço de venda (maior que zero).' });
        else precos[id] = v;
      }
    }
  }
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { fornecedorId, notaFiscal: nota || null, data: data as string, itens, pagamento: pagamento!, ...(precos ? { precos } : {}) } };
}

/** Os itens com nome, unidade e total, conferindo produto (ativo) e quantidade na unidade dele. */
export function montarItensDaCompra(
  itens: readonly ItemCompraPedido[],
  catalogo: ReadonlyMap<string, { id: string; nome: string; unidade?: UnidadeVenda; ativo: boolean }>,
): Resultado<{ itens: ItemComprado[]; totalCentavos: number }> {
  const erros: ErroCampo[] = [];
  const saida: ItemComprado[] = [];
  itens.forEach((x, i) => {
    const p = catalogo.get(x.produtoId);
    if (!p || !p.ativo) return void erros.push({ campo: `itens.${i}.produtoId`, mensagem: `Item ${i + 1}: produto não encontrado ou inativo.` });
    const unidade = unidadeDe(p.unidade);
    if (x.quantidade > QUANTIDADE_MAX[unidade] * 10) {
      return void erros.push({ campo: `itens.${i}.quantidade`, mensagem: `${p.nome}: quantidade acima do limite (${formatarQuantidade(QUANTIDADE_MAX[unidade] * 10, unidade)}).` });
    }
    saida.push({
      produtoId: p.id,
      nome: p.nome,
      unidade,
      quantidade: x.quantidade,
      custoCentavos: x.custoCentavos,
      totalCentavos: valorDaQuantidade(x.custoCentavos, x.quantidade, unidade),
      validade: x.validade ?? null,
      estorno: null,
      loteBaixado: null,
    });
  });
  if (erros.length) return { ok: false, erros };
  const total = saida.reduce((s, i) => s + i.totalCentavos, 0);
  if (!Number.isSafeInteger(total) || total > CENTAVOS_MAX) return { ok: false, erros: [{ campo: 'itens', mensagem: 'Total da compra acima do limite permitido.' }] };
  return { ok: true, valor: { itens: saida, totalCentavos: total } };
}

/** Item ainda valendo (não estornado). */
export const itemValendo = (i: ItemComprado) => i.estorno === null;

/** O que a compra vale hoje (sem os itens estornados). */
export const totalValendo = (c: Compra) => c.itens.filter(itemValendo).reduce((s, i) => s + i.totalCentavos, 0);

/** Nota com o mesmo número do mesmo fornecedor, ainda valendo (DaniPets: "Já existe a NF ... deste fornecedor"). */
export function notaRepetida(compras: readonly Compra[], fornecedorId: string | null, notaFiscal: string | null): Compra | null {
  if (!notaFiscal) return null;
  const chave = notaFiscal.toLocaleLowerCase('pt-BR');
  return compras.find((c) => (c.fornecedor?.id ?? null) === fornecedorId && c.notaFiscal?.toLocaleLowerCase('pt-BR') === chave && c.itens.some(itemValendo)) ?? null;
}

/** Custo da última compra (valendo) do produto. null = nunca comprado. */
export function ultimoCusto(compras: readonly Compra[], produtoId: string): number | null {
  let achado: { em: string; custo: number } | null = null;
  for (const c of compras) {
    for (const i of c.itens) {
      if (i.produtoId !== produtoId || !itemValendo(i)) continue;
      const em = `${c.data}T${c.criadaEm}`;
      if (!achado || em >= achado.em) achado = { em, custo: i.custoCentavos };
    }
  }
  return achado?.custo ?? null;
}

/** Margem sobre o preço de venda (%). null sem preço. */
export const margemPct = (precoCentavos: number, custoCentavos: number): number | null => (precoCentavos > 0 ? ((precoCentavos - custoCentavos) / precoCentavos) * 100 : null);

/** Preço que mantém a mesma margem com o custo novo (DaniPets: preço × custo novo ÷ custo antigo). */
export const precoSugerido = (precoCentavos: number, custoAntigo: number, custoNovo: number): number =>
  custoAntigo > 0 ? Math.max(1, Math.round((precoCentavos * custoNovo) / custoAntigo)) : precoCentavos;

const descricaoDaCompra = (c: Pick<Compra, 'itens' | 'notaFiscal' | 'fornecedor'>) => {
  const um = c.itens.length === 1 ? c.itens[0]! : null;
  const base = um ? `Compra ${um.nome}` : `Compra NF ${c.notaFiscal ?? 'sem número'} • ${c.itens.length} itens`;
  return `${base}${um && c.notaFiscal ? ` • NF ${c.notaFiscal}` : ''} • ${c.fornecedor?.nome ?? 'sem fornecedor'}`.slice(0, LIMITES_COMPRA.descricaoMax);
};

/** O que a compra registrada faz: entra no estoque (com o custo) e sai da conta (à vista) ou vira conta a pagar. */
export function efeitosDaCompra(compra: Compra): {
  movimentos: NovoMovimentoEstoque[];
  lancamentos: NovoLancamento[];
  contaPagar: Omit<ContaPagar, 'id'> | null;
} {
  const movimentos: NovoMovimentoEstoque[] = compra.itens.map((i, linha) => ({
    produtoId: i.produtoId,
    tipo: 'compra',
    quantidade: i.quantidade,
    criadoEm: compra.criadaEm,
    dia: compra.data,
    motivo: compra.notaFiscal ? `NF ${compra.notaFiscal}` : 'Compra',
    custoUnitarioCentavos: i.custoCentavos,
    compraId: compra.id,
    compraLinha: linha,
    vendaId: null,
    vendaNumero: null,
    por: compra.por,
  }));
  const descricao = descricaoDaCompra(compra);
  if (compra.pagamento.tipo === 'avista') {
    return {
      movimentos,
      lancamentos: [
        {
          conta: compra.pagamento.conta,
          tipo: 'pagamento_compra',
          valorCentavos: -compra.totalCentavos,
          descricao,
          criadoEm: compra.criadaEm,
          vendaId: null,
          vendaNumero: null,
          recebivelId: null,
          categoria: null,
          por: compra.por,
          compraId: compra.id,
          contaPagarId: null,
          // o dinheiro sai no dia da compra (a compra pode ter a data de um dia anterior)
          dia: compra.data,
        },
      ],
      contaPagar: null,
    };
  }
  return {
    movimentos,
    lancamentos: [],
    contaPagar: {
      compraId: compra.id,
      descricao,
      valorCentavos: compra.totalCentavos,
      valorOriginalCentavos: compra.totalCentavos,
      vencimento: compra.pagamento.vencimento,
      situacao: 'aberta',
      criadoEm: compra.criadaEm,
      por: compra.por,
      pagamento: null,
      ajustes: [],
    },
  };
}

/**
 * Estorno de um item (compra lançada errada): sai do estoque o que entrou; o dinheiro volta para a conta de
 * onde saiu (à vista, ou a prazo já paga) ou a conta a pagar diminui (e é cancelada se zerar).
 */
export function calcularEstornoDoItem(
  compra: Compra,
  linha: number,
  ctx: { motivo: unknown; em: string; por: Operador; saldoEstoque: number; contaPagar: ContaPagar | null },
): Resultado<{ item: ItemComprado; movimento: NovoMovimentoEstoque; lancamento: NovoLancamento | null; contaPagar: ContaPagar | null }> {
  const erro = (mensagem: string, campo = '_'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
  const item = compra.itens[linha];
  if (!item) return erro('Item da compra não encontrado.');
  if (item.estorno) return erro('Este item já foi estornado.');
  const motivo = texto(ctx.motivo);
  if (!motivo) return erro('Informe o motivo do estorno.', 'motivo');
  if (motivo.length > LIMITES_COMPRA.motivoMax || CONTROLE.test(motivo)) return erro(`O motivo pode ter até ${LIMITES_COMPRA.motivoMax} caracteres.`, 'motivo');
  if (ctx.saldoEstoque - item.quantidade < 0) {
    return erro(
      `O estorno deixaria o estoque de ${item.nome} negativo (saldo atual ${formatarQuantidade(ctx.saldoEstoque, item.unidade)}). Se parte da mercadoria já foi vendida, corrija com um ajuste de estoque.`,
    );
  }
  const estornado: ItemComprado = { ...item, estorno: { em: ctx.em, por: ctx.por, motivo } };
  const movimento: NovoMovimentoEstoque = {
    produtoId: item.produtoId,
    tipo: 'estorno_compra',
    quantidade: -item.quantidade,
    criadoEm: ctx.em,
    motivo,
    compraId: compra.id,
    compraLinha: linha,
    vendaId: null,
    vendaNumero: null,
    por: ctx.por,
  };
  const volta = (conta: ContaId): NovoLancamento => ({
    conta,
    tipo: 'estorno_compra',
    valorCentavos: item.totalCentavos,
    descricao: `Estorno da compra ${item.nome}${compra.notaFiscal ? ` • NF ${compra.notaFiscal}` : ''}`.slice(0, LIMITES_COMPRA.descricaoMax),
    criadoEm: ctx.em,
    vendaId: null,
    vendaNumero: null,
    recebivelId: null,
    categoria: null,
    por: ctx.por,
    compraId: compra.id,
    contaPagarId: ctx.contaPagar?.id ?? null,
  });
  if (compra.pagamento.tipo === 'avista') return { ok: true, valor: { item: estornado, movimento, lancamento: volta(compra.pagamento.conta), contaPagar: null } };
  const cp = ctx.contaPagar;
  if (!cp || cp.situacao === 'cancelada') return { ok: true, valor: { item: estornado, movimento, lancamento: null, contaPagar: cp } };
  if (cp.situacao === 'paga') return { ok: true, valor: { item: estornado, movimento, lancamento: volta(cp.pagamento!.conta), contaPagar: cp } };
  const resta = Math.max(0, cp.valorCentavos - item.totalCentavos);
  return {
    ok: true,
    valor: {
      item: estornado,
      movimento,
      lancamento: null,
      contaPagar: {
        ...cp,
        valorCentavos: resta,
        situacao: resta === 0 ? 'cancelada' : 'aberta',
        ajustes: [...cp.ajustes, { em: ctx.em, valorCentavos: -item.totalCentavos, descricao: `Estorno do item ${item.nome} • ${motivo}`.slice(0, LIMITES_COMPRA.descricaoMax), por: ctx.por }],
      },
    },
  };
}

/** Pagar uma conta a pagar (sai da conta escolhida; o Caixa físico não fica negativo). */
export function pagarConta(
  cp: ContaPagar,
  ctx: {
    conta: unknown;
    em: string;
    por: Operador;
    saldoCaixaCentavos: number;
    /** Com o caixa de hoje aberto: o dinheiro esperado na gaveta (vale no lugar do saldo do Caixa físico). */
    gavetaCentavos?: number | null;
  },
): Resultado<{ contaPagar: ContaPagar; lancamento: NovoLancamento }> {
  const erro = (mensagem: string, campo = '_'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
  if (cp.situacao === 'paga') return erro('Esta conta já foi paga.');
  if (cp.situacao === 'cancelada') return erro('Esta conta foi cancelada (compra estornada).');
  if (!ehConta(ctx.conta)) return erro('Escolha a conta de pagamento.', 'conta');
  if (ctx.conta === 'caixa' && ctx.gavetaCentavos != null && cp.valorCentavos > ctx.gavetaCentavos) return erro(mensagemGaveta(cp.valorCentavos, ctx.gavetaCentavos), 'conta');
  if (ctx.conta === 'caixa' && ctx.gavetaCentavos == null && cp.valorCentavos > ctx.saldoCaixaCentavos) {
    return erro(`O valor (${formatarCentavos(cp.valorCentavos)}) é maior que o saldo do Caixa físico (${formatarCentavos(Math.max(0, ctx.saldoCaixaCentavos))}).`, 'conta');
  }
  return {
    ok: true,
    valor: {
      contaPagar: { ...cp, situacao: 'paga', pagamento: { em: ctx.em, conta: ctx.conta, por: ctx.por } },
      lancamento: {
        conta: ctx.conta,
        tipo: 'pagamento_conta',
        valorCentavos: -cp.valorCentavos,
        descricao: cp.descricao,
        criadoEm: ctx.em,
        vendaId: null,
        vendaNumero: null,
        recebivelId: null,
        categoria: null,
        por: ctx.por,
        compraId: cp.compraId,
        contaPagarId: cp.id,
      },
    },
  };
}

/** Contas a pagar em aberto: total, quantas e as vencidas (vence antes de hoje). */
export function resumirContasAPagar(contas: readonly ContaPagar[], hoje: string) {
  const abertas = contas.filter((c) => c.situacao === 'aberta');
  const vencidas = abertas.filter((c) => c.vencimento < hoje);
  return {
    totalCentavos: abertas.reduce((s, c) => s + c.valorCentavos, 0),
    quantidade: abertas.length,
    vencidasCentavos: vencidas.reduce((s, c) => s + c.valorCentavos, 0),
    vencidas: vencidas.length,
  };
}


/**
 * CUSTO MÉDIO móvel de cada produto (DaniPets replayCosts), refazendo os movimentos na ordem: compra (e o
 * estoque inicial com custo) mexe na média; venda, devolução e ajuste só mexem na quantidade; compra
 * estornada sai da conta, como se não tivesse existido. Em centavos por unidade (ou por kg), com fração.
 */
export function custosMedios(movimentos: readonly MovimentoEstoque[]): Map<string, number | null> {
  const estornados = new Set(movimentos.filter((m) => m.tipo === 'estorno_compra' && m.compraId).map((m) => `${m.compraId}:${m.compraLinha}`));
  const ordem = [...movimentos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const st = new Map<string, { q: number; media: number | null }>();
  for (const m of ordem) {
    if ((m.tipo === 'compra' || m.tipo === 'estorno_compra') && estornados.has(`${m.compraId}:${m.compraLinha}`)) continue;
    const x = st.get(m.produtoId) ?? { q: 0, media: null };
    const custo = m.custoUnitarioCentavos;
    if ((m.tipo === 'compra' || m.tipo === 'inicial') && typeof custo === 'number' && custo > 0 && m.quantidade > 0) {
      x.media = x.media !== null && x.q > 0 ? (x.q * x.media + m.quantidade * custo) / (x.q + m.quantidade) : custo;
    }
    x.q += m.quantidade;
    st.set(m.produtoId, x);
  }
  return new Map([...st].map(([id, x]) => [id, x.media]));
}

/**
 * LOTES: pela regra "o mais antigo sai primeiro", o saldo de hoje pertence às compras mais novas. Reparte o
 * saldo da compra mais recente para a mais antiga; o que sobra para cada item é o que resta dele.
 * Chave: "compraId:linha".
 */
export function lotesComSaldo(compras: readonly Compra[], produtoId: string, saldo: number): Map<string, number> {
  let resta = Math.max(0, saldo);
  const saida = new Map<string, number>();
  const itens = compras
    .flatMap((c) => c.itens.map((i, linha) => ({ c, i, linha })))
    .filter((x) => x.i.produtoId === produtoId && itemValendo(x.i))
    .sort((a, b) => `${b.c.data}T${b.c.criadaEm}`.localeCompare(`${a.c.data}T${a.c.criadaEm}`) || b.linha - a.linha);
  for (const x of itens) {
    const q = Math.min(x.i.quantidade, resta);
    saida.set(`${x.c.id}:${x.linha}`, q);
    resta -= q;
  }
  return saida;
}

export interface LoteVencendo {
  compra: Compra;
  linha: number;
  item: ItemComprado;
  /** Quanto deste lote ainda estaria no estoque. */
  restante: number;
  vencido: boolean;
}

/** Lotes com validade até `ateDia` (hoje + 30), sem baixa e com saldo (DaniPets expiringLots). */
export function lotesVencendo(compras: readonly Compra[], saldos: ReadonlyMap<string, number>, hoje: string, ateDia: string): LoteVencendo[] {
  const cache = new Map<string, Map<string, number>>();
  const saida: LoteVencendo[] = [];
  for (const c of compras) {
    c.itens.forEach((item, linha) => {
      if (!itemValendo(item) || !item.validade || item.validade > ateDia || item.loteBaixado) return;
      if (!cache.has(item.produtoId)) cache.set(item.produtoId, lotesComSaldo(compras, item.produtoId, saldos.get(item.produtoId) ?? 0));
      const restante = cache.get(item.produtoId)!.get(`${c.id}:${linha}`) ?? 0;
      if (restante > 0) saida.push({ compra: c, linha, item, restante, vencido: item.validade < hoje });
    });
  }
  return saida.sort((a, b) => a.item.validade!.localeCompare(b.item.validade!));
}

/** "Dar baixa no lote": o que ainda está na prateleira e venceu sai do estoque como "Produto vencido". */
export function calcularBaixaDoLote(
  compra: Compra,
  linha: number,
  ctx: { quantidade: unknown; observacao?: unknown; em: string; por: Operador; saldoEstoque: number },
): Resultado<{ item: ItemComprado; movimento: NovoMovimentoEstoque | null }> {
  const erro = (mensagem: string, campo = '_'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
  const item = compra.itens[linha];
  if (!item || !itemValendo(item)) return erro('Lote não encontrado.');
  if (item.loteBaixado) return erro('Este lote já teve baixa.');
  const q = ctx.quantidade;
  if (typeof q !== 'number' || !Number.isInteger(q) || q < 0) return erro('Quantidade inválida.', 'quantidade');
  if (q > ctx.saldoEstoque) return erro(`O saldo de ${item.nome} é ${formatarQuantidade(ctx.saldoEstoque, item.unidade)}: não dá para baixar ${formatarQuantidade(q, item.unidade)}.`, 'quantidade');
  const obs = texto(ctx.observacao);
  if (obs.length > LIMITES_COMPRA.observacaoMax || CONTROLE.test(obs)) return erro(`A observação pode ter até ${LIMITES_COMPRA.observacaoMax} caracteres.`, 'observacao');
  const nota = `baixa do lote de ${dataBr(compra.data)} (validade ${item.validade ? dataBr(item.validade) : '—'})${obs ? ` • ${obs}` : ''}`;
  return {
    ok: true,
    valor: {
      item: { ...item, loteBaixado: { em: ctx.em, por: ctx.por, quantidade: q, observacao: obs || null } },
      movimento:
        q > 0
          ? {
              produtoId: item.produtoId,
              tipo: 'ajuste',
              quantidade: -q,
              criadoEm: ctx.em,
              motivo: 'Produto vencido',
              observacao: nota.slice(0, LIMITES_COMPRA.observacaoMax),
              compraId: compra.id,
              compraLinha: linha,
              vendaId: null,
              vendaNumero: null,
              por: ctx.por,
            }
          : null,
    },
  };
}
