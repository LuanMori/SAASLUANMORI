// packages/core/src/estoque.ts
// Estoque por movimentos (como no DaniPets): o saldo de um produto é a soma de tudo que
// entrou e saiu. Nada é apagado; corrigir é lançar um ajuste.
//   - venda: sai a quantidade vendida;
//   - cancelamento da venda: tudo volta;
//   - devolução: volta o que foi marcado como "volta para a prateleira" (avaria e vencido não voltam);
//   - entrada (compra, reposição) e ajuste (perda, avaria, contagem): lançados à mão pelo Dono ou
//     pelo Administrador; o ajuste exige motivo e não pode deixar o saldo negativo.
// Quantidades sempre inteiras, na unidade do produto: unidades, ou gramas no produto vendido por kg
// (quantidade.ts). O ajuste usa os motivos da loja (padrão do DaniPets: perda ou avaria, produto vencido,
// correção de contagem, outro) e pode ter uma observação.
import { CONTROLE, ehObjeto } from './interno';
import { formatarQuantidade, type UnidadeVenda } from './quantidade';
import type { ErroCampo, Resultado } from './resultado';
import type { Devolucao, Operador, Venda } from './venda';

export type TipoMovimentoEstoque = 'inicial' | 'entrada' | 'compra' | 'estorno_compra' | 'ajuste' | 'venda' | 'cancelamento' | 'devolucao';

export const NOME_MOVIMENTO_ESTOQUE: Record<TipoMovimentoEstoque, string> = {
  inicial: 'Estoque inicial',
  entrada: 'Entrada',
  compra: 'Compra',
  estorno_compra: 'Compra estornada',
  ajuste: 'Ajuste',
  venda: 'Venda',
  cancelamento: 'Venda cancelada',
  devolucao: 'Devolução',
};

export interface MovimentoEstoque {
  id: string;
  produtoId: string;
  tipo: TipoMovimentoEstoque;
  /** Positivo entra, negativo sai. Inteiro: unidades, ou gramas no produto vendido por kg. */
  quantidade: number;
  /** ISO 8601. */
  criadoEm: string;
  motivo: string | null;
  /** Observação do ajuste (DaniPets: "Outro" + observação). */
  observacao?: string | null;
  /** Custo de cada unidade (ou kg) no estoque inicial ou na compra, quando há (para o custo médio). */
  custoUnitarioCentavos?: number | null;
  /** Compra (e o item dela) que originou o movimento. */
  compraId?: string | null;
  compraLinha?: number | null;
  vendaId: string | null;
  vendaNumero: number | null;
  por: Operador;
}

export type NovoMovimentoEstoque = Omit<MovimentoEstoque, 'id'>;

export type SituacaoEstoque = 'ok' | 'baixo' | 'zerado' | 'negativo';

/** Quantidades em unidades ou gramas (9.999.999 g = quase 10 toneladas). */
export const LIMITES_ESTOQUE = { quantidadeMax: 9_999_999, minimoMax: 9_999_999, motivoMax: 200, observacaoMax: 300 } as const;

export function saldosDeEstoque(movimentos: readonly Pick<MovimentoEstoque, 'produtoId' | 'quantidade'>[]): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const m of movimentos) saldos.set(m.produtoId, (saldos.get(m.produtoId) ?? 0) + m.quantidade);
  return saldos;
}

/** negativo < 0 · zerado = 0 · baixo = no mínimo ou abaixo · ok. Sem mínimo (null/0), só zerado e negativo avisam. */
export function situacaoEstoque(saldo: number, minimo: number | null): SituacaoEstoque {
  if (saldo < 0) return 'negativo';
  if (saldo === 0) return 'zerado';
  if (minimo && minimo > 0 && saldo <= minimo) return 'baixo';
  return 'ok';
}

/** A venda só passa se houver estoque para todos os itens (somando o mesmo produto). */
export function conferirEstoque(
  itens: readonly { produtoId: string; nome: string; quantidade: number; unidade?: UnidadeVenda }[],
  saldos: ReadonlyMap<string, number>,
): Resultado<null> {
  const pedido = new Map<string, { nome: string; quantidade: number; unidade: UnidadeVenda }>();
  itens.forEach((i) => {
    const ja = pedido.get(i.produtoId);
    pedido.set(i.produtoId, { nome: i.nome, quantidade: (ja?.quantidade ?? 0) + i.quantidade, unidade: i.unidade ?? 'un' });
  });
  const erros: ErroCampo[] = [];
  for (const [produtoId, { nome, quantidade, unidade }] of pedido) {
    const saldo = saldos.get(produtoId) ?? 0;
    if (quantidade > saldo) erros.push({ campo: 'itens', mensagem: `Estoque insuficiente para ${nome}. Disponível: ${formatarQuantidade(Math.max(0, saldo), unidade)}.` });
  }
  return erros.length ? { ok: false, erros } : { ok: true, valor: null };
}

const daVenda = (venda: Venda) => ({ vendaId: venda.id, vendaNumero: venda.numero });

/** Baixa da venda: sai cada item (na hora da venda, por quem vendeu). */
export function movimentosDaVenda(venda: Venda): NovoMovimentoEstoque[] {
  return venda.itens.map((i) => ({ produtoId: i.produtoId, tipo: 'venda', quantidade: -i.quantidade, criadoEm: venda.criadaEm, motivo: null, ...daVenda(venda), por: venda.vendedor }));
}

/** Cancelamento: volta tudo o que a venda tirou. */
export function movimentosDoCancelamento(venda: Venda, ctx: { motivo: string; em: string; por: Operador }): NovoMovimentoEstoque[] {
  return venda.itens.map((i) => ({ produtoId: i.produtoId, tipo: 'cancelamento', quantidade: i.quantidade, criadoEm: ctx.em, motivo: ctx.motivo, ...daVenda(venda), por: ctx.por }));
}

/** Devolução: volta só o que foi marcado como "volta para a prateleira" (sem a marcação, volta). */
export function movimentosDaDevolucao(venda: Venda, devolucao: Devolucao): NovoMovimentoEstoque[] {
  return devolucao.itens
    .filter((i) => i.voltaAoEstoque !== false)
    .map((i) => ({ produtoId: i.produtoId, tipo: 'devolucao', quantidade: i.quantidade, criadoEm: devolucao.criadaEm, motivo: devolucao.motivo, ...daVenda(venda), por: devolucao.feitaPor }));
}

export interface MovimentoManual {
  produtoId: string;
  tipo: 'entrada' | 'ajuste';
  /** Entrada: maior que zero. Ajuste: diferente de zero (negativo tira, positivo põe). */
  quantidade: number;
  motivo: string;
  /** Opcional (DaniPets: observação do ajuste). */
  observacao?: string;
}

/** Entrada e ajuste lançados à mão (para a aba Produtos e estoque). Ajuste precisa de motivo. */
export function validarMovimentoManual(entrada: unknown): Resultado<MovimentoManual> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o movimento.' }] };
  const d = entrada;
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(d)) if (!['produtoId', 'tipo', 'quantidade', 'motivo', 'observacao'].includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  const produtoId = typeof d.produtoId === 'string' ? d.produtoId.trim() : '';
  if (!produtoId) erros.push({ campo: 'produtoId', mensagem: 'Escolha o produto.' });
  const tipo = d.tipo;
  if (tipo !== 'entrada' && tipo !== 'ajuste') erros.push({ campo: 'tipo', mensagem: 'Escolha entrada ou ajuste.' });
  const q = d.quantidade;
  if (typeof q !== 'number' || !Number.isInteger(q) || q === 0 || Math.abs(q) > LIMITES_ESTOQUE.quantidadeMax) {
    erros.push({ campo: 'quantidade', mensagem: 'Informe uma quantidade inteira diferente de zero.' });
  } else if (tipo === 'entrada' && q < 0) {
    erros.push({ campo: 'quantidade', mensagem: 'Entrada é sempre positiva. Para tirar do estoque, use ajuste.' });
  }
  const motivo = typeof d.motivo === 'string' ? d.motivo.normalize('NFC').trim() : '';
  if (tipo === 'ajuste' && !motivo) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo do ajuste (ex.: perda, avaria, contagem).' });
  if (motivo.length > LIMITES_ESTOQUE.motivoMax) erros.push({ campo: 'motivo', mensagem: `O motivo pode ter até ${LIMITES_ESTOQUE.motivoMax} caracteres.` });
  else if (CONTROLE.test(motivo)) erros.push({ campo: 'motivo', mensagem: 'O motivo contém caracteres inválidos.' });
  const observacao = typeof d.observacao === 'string' ? d.observacao.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (d.observacao !== undefined && typeof d.observacao !== 'string') erros.push({ campo: 'observacao', mensagem: 'A observação deve ser um texto.' });
  else if (observacao.length > LIMITES_ESTOQUE.observacaoMax) erros.push({ campo: 'observacao', mensagem: `A observação pode ter até ${LIMITES_ESTOQUE.observacaoMax} caracteres.` });
  else if (CONTROLE.test(observacao)) erros.push({ campo: 'observacao', mensagem: 'A observação contém caracteres inválidos.' });
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { produtoId, tipo: tipo as 'entrada' | 'ajuste', quantidade: q as number, motivo, ...(observacao ? { observacao } : {}) } };
}

/** Entrada ou ajuste lançado à mão, já conferido por validarMovimentoManual. */
export function movimentoManual(m: MovimentoManual, ctx: { em: string; por: Operador }): NovoMovimentoEstoque {
  return {
    produtoId: m.produtoId,
    tipo: m.tipo,
    quantidade: m.quantidade,
    criadoEm: ctx.em,
    motivo: m.motivo || null,
    observacao: m.observacao || null,
    vendaId: null,
    vendaNumero: null,
    por: ctx.por,
  };
}

/** O estoque inicial do cadastro (com o custo, quando informado). */
export function movimentoInicial(
  p: { produtoId: string; quantidade: number; custoUnitarioCentavos: number | null },
  ctx: { em: string; por: Operador },
): NovoMovimentoEstoque {
  return {
    produtoId: p.produtoId,
    tipo: 'inicial',
    quantidade: p.quantidade,
    criadoEm: ctx.em,
    motivo: 'Estoque inicial',
    custoUnitarioCentavos: p.custoUnitarioCentavos,
    vendaId: null,
    vendaNumero: null,
    por: ctx.por,
  };
}

/** "Como o saldo é calculado" (DaniPets PRD-09): inicial + compras + entradas − vendas + cancelamentos + devoluções ± ajustes. */
export interface ComposicaoSaldo {
  inicial: number;
  /** Compras menos as estornadas. */
  compras: number;
  entradas: number;
  vendas: number;
  cancelamentos: number;
  devolucoes: number;
  ajustes: number;
  saldo: number;
}

export function composicaoDoSaldo(movimentos: readonly Pick<MovimentoEstoque, 'produtoId' | 'tipo' | 'quantidade'>[], produtoId: string): ComposicaoSaldo {
  const c: ComposicaoSaldo = { inicial: 0, compras: 0, entradas: 0, vendas: 0, cancelamentos: 0, devolucoes: 0, ajustes: 0, saldo: 0 };
  const campo: Record<TipoMovimentoEstoque, Exclude<keyof ComposicaoSaldo, 'saldo'>> = {
    inicial: 'inicial',
    compra: 'compras',
    estorno_compra: 'compras',
    entrada: 'entradas',
    venda: 'vendas',
    cancelamento: 'cancelamentos',
    devolucao: 'devolucoes',
    ajuste: 'ajustes',
  };
  for (const m of movimentos) {
    if (m.produtoId !== produtoId) continue;
    c[campo[m.tipo]] += m.tipo === 'venda' ? -m.quantidade : m.quantidade;
    c.saldo += m.quantidade;
  }
  return c;
}

/**
 * O produto tem história (vendas, entradas, ajustes)? Só o estoque inicial do cadastro não conta.
 * Com história, o produto não pode ser excluído (só inativado) nem mudar de unidade.
 */
export function produtoTemHistorico(produtoId: string, movimentos: readonly Pick<MovimentoEstoque, 'produtoId' | 'tipo'>[], vendas: readonly Pick<Venda, 'itens'>[] = []): boolean {
  return movimentos.some((m) => m.produtoId === produtoId && m.tipo !== 'inicial') || vendas.some((v) => v.itens.some((i) => i.produtoId === produtoId));
}

/** Estoque mínimo: inteiro (unidades ou gramas) de 0 em diante; null ou 0 = sem aviso de estoque baixo. */
export function validarEstoqueMinimo(valor: unknown): Resultado<number | null> {
  if (valor === null || valor === undefined || valor === 0) return { ok: true, valor: null };
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > LIMITES_ESTOQUE.minimoMax) {
    return { ok: false, erros: [{ campo: 'estoqueMinimo', mensagem: 'O estoque mínimo deve ser um número de 0 em diante.' }] };
  }
  return { ok: true, valor };
}
