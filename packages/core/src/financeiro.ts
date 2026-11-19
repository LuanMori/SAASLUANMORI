// packages/core/src/financeiro.ts
// Financeiro alimentado pela Frente de caixa (regras do DaniPets V9.3.3). A aba Financeiro ainda
// não tem tela: estas regras já ficam prontas para ela.
//   - Duas contas: Caixa físico e Conta bancária. O saldo é a soma dos lançamentos; nada é apagado.
//   - Venda: Dinheiro entra no Caixa; Pix entra no Banco; cartão vira "a receber", com a taxa e o prazo
//     da operadora (padrão: débito 1,5% em 1 dia, crédito 3% em 30 dias), e só entra no Banco quando o
//     Dono ou o Administrador confirma que a operadora depositou. Fiado vira "a receber" na conta do
//     cliente, sem taxa, com prazo de 30 dias (como no DaniPets), e entra no Caixa ou no Banco quando
//     o cliente paga.
//   - Estorno (cancelamento ou devolução), pela mesma forma: Dinheiro sai do Caixa (e não pode passar do
//     que há nele); Pix sai do Banco; cartão abate do "a receber" com a taxa proporcional e, se a
//     operadora já tinha depositado, o líquido sai da conta onde o dinheiro entrou. Fiado: abate do que
//     o cliente deve; se ele já tinha pago, o valor sai da conta onde o pagamento entrou.
//   - Lançamentos à mão (entrada, despesa, retirada do dono, transferência) e o saldo inicial (uma vez
//     por conta) são só do Dono e do Administrador.
import { CENTAVOS_MAX, formatarCentavos } from './dinheiro';
import { CONTROLE, ehObjeto } from './interno';
import type { ErroCampo, Resultado } from './resultado';
import {
  type ClienteDaVenda,
  diaNoFuso,
  formatarNumeroVenda,
  FUSO_PADRAO,
  NOME_FORMA_PAGAMENTO,
  type FormaPagamento,
  type Operador,
  type Pagamento,
  type Venda,
} from './venda';

export const CONTAS = ['caixa', 'banco'] as const;
export type ContaId = (typeof CONTAS)[number];

/** Nomes iguais aos do DaniPets. */
export const NOME_CONTA: Record<ContaId, string> = { caixa: 'Caixa físico', banco: 'Conta bancária' };

export const ehConta = (valor: unknown): valor is ContaId => typeof valor === 'string' && (CONTAS as readonly string[]).includes(valor);

export type FormaCartao = Extract<FormaPagamento, 'debito' | 'credito'>;
export const ehCartao = (forma: FormaPagamento): forma is FormaCartao => forma === 'debito' || forma === 'credito';

/** Formas que viram "a receber": cartão (a operadora deposita) e fiado (o cliente paga). */
export type FormaAPrazo = FormaCartao | 'fiado';
export const ehAPrazo = (forma: FormaPagamento): forma is FormaAPrazo => ehCartao(forma) || forma === 'fiado';

/** Onde entra o que é pago na hora (cartão e fiado entram quando são recebidos). */
export const CONTA_DA_FORMA: Record<Exclude<FormaPagamento, FormaAPrazo>, ContaId> = { dinheiro: 'caixa', pix: 'banco' };

/** Prazo para o cliente pagar o fiado, contado do dia da compra (padrão do DaniPets). */
export const PRAZO_FIADO_PADRAO_DIAS = 30;

export type TipoLancamento =
  | 'saldo_inicial'
  | 'venda'
  | 'estorno_venda'
  | 'recebimento_cartao'
  | 'recebimento_fiado'
  | 'entrada'
  | 'despesa'
  | 'retirada'
  | 'transferencia_saida'
  | 'transferencia_entrada'
  | 'pagamento_compra'
  | 'estorno_compra'
  | 'pagamento_conta';

export const NOME_LANCAMENTO: Record<TipoLancamento, string> = {
  saldo_inicial: 'Saldo inicial',
  venda: 'Venda recebida',
  estorno_venda: 'Estorno de venda',
  recebimento_cartao: 'Recebimento de cartão',
  recebimento_fiado: 'Recebimento de fiado',
  entrada: 'Entrada',
  despesa: 'Despesa',
  retirada: 'Retirada do dono',
  transferencia_saida: 'Transferência (saída)',
  transferencia_entrada: 'Transferência (entrada)',
  pagamento_compra: 'Pagamento de compra',
  estorno_compra: 'Estorno de compra',
  pagamento_conta: 'Conta paga',
};

export interface Lancamento {
  id: string;
  conta: ContaId;
  tipo: TipoLancamento;
  /** Positivo entra, negativo sai (centavos). */
  valorCentavos: number;
  descricao: string;
  /** ISO 8601. */
  criadoEm: string;
  vendaId: string | null;
  vendaNumero: number | null;
  /** Recebimento de cartão que originou o lançamento. */
  recebivelId: string | null;
  /** Só nas despesas. */
  categoria: string | null;
  /** Quem lançou (na venda, quem vendeu). */
  por: Operador;
  /** Compra (à vista ou estornada) e conta a pagar que originaram o lançamento. */
  compraId?: string | null;
  contaPagarId?: string | null;
}

export type NovoLancamento = Omit<Lancamento, 'id'>;

export interface TaxasCartao {
  /** % cobrado pela operadora (1.5 = 1,5%). */
  taxaPct: Record<FormaCartao, number>;
  /** Dias até a operadora depositar. */
  dias: Record<FormaCartao, number>;
}

/** Padrão do DaniPets. */
export const TAXAS_CARTAO_PADRAO: TaxasCartao = { taxaPct: { debito: 1.5, credito: 3 }, dias: { debito: 1, credito: 30 } };

export type SituacaoRecebivel = 'pendente' | 'recebido' | 'cancelado';

/** Venda no cartão esperando a operadora depositar, ou no fiado esperando o cliente pagar. */
export interface Recebivel {
  id: string;
  forma: FormaAPrazo;
  /** No fiado, de quem é a conta. No cartão, null. */
  cliente: ClienteDaVenda | null;
  vendaId: string;
  vendaNumero: number;
  /** ISO 8601. */
  criadoEm: string;
  /** Dia (AAAA-MM-DD, no fuso da loja) em que a operadora deve depositar (no fiado: em que o cliente deve pagar). */
  venceEm: string;
  /** Valor passado no cartão (ou comprado no fiado). */
  brutoCentavos: number;
  /** Taxa da operadora sobre o bruto (no fiado, 0). */
  taxaCentavos: number;
  /** Parte do bruto e da taxa já estornada (devolução ou cancelamento). */
  estornadoBrutoCentavos: number;
  estornadoTaxaCentavos: number;
  situacao: SituacaoRecebivel;
  recebimento: { em: string; conta: ContaId; valorCentavos: number; por: Operador } | null;
}

export type NovoRecebivel = Omit<Recebivel, 'id'>;

export const LIMITES_FINANCEIRO = { descricaoMax: 120, categoriaMax: 60, taxaPctMax: 99.99, diasMax: 365 } as const;

// ------------------------------------------------------------------ cálculos
/** Taxa da operadora em centavos, arredondada (a % vai em centésimos para não errar no ponto flutuante). */
export function taxaDoCartao(valorCentavos: number, pct: number): number {
  return Math.round((valorCentavos * Math.round(pct * 100)) / 10_000);
}

/** "2026-11-16" + 30 -> "2026-12-16". */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

/** O que a operadora ainda vai depositar (0 se já depositou ou se foi todo estornado). */
export function liquidoAReceber(r: Recebivel): number {
  if (r.situacao !== 'pendente') return 0;
  return r.brutoCentavos - r.estornadoBrutoCentavos - (r.taxaCentavos - r.estornadoTaxaCentavos);
}

/** Taxa que ficou de fato com a operadora (a parte estornada volta). */
export const taxaEfetiva = (r: Recebivel): number => r.taxaCentavos - r.estornadoTaxaCentavos;

export interface SaldosContas {
  porConta: Record<ContaId, number>;
  totalCentavos: number;
}

export function saldosDasContas(lancamentos: readonly Pick<Lancamento, 'conta' | 'valorCentavos'>[]): SaldosContas {
  const porConta: Record<ContaId, number> = { caixa: 0, banco: 0 };
  for (const l of lancamentos) porConta[l.conta] += l.valorCentavos;
  return { porConta, totalCentavos: porConta.caixa + porConta.banco };
}

export interface ResumoAReceber {
  /** Líquido que ainda vai cair (bruto - taxa). */
  totalCentavos: number;
  quantidade: number;
  /** Já passou do dia de cair e ninguém confirmou. */
  vencidosCentavos: number;
  vencidos: number;
}

export function resumirAReceber(recebiveis: readonly Recebivel[], hoje: string): ResumoAReceber {
  const pendentes = recebiveis.filter((r) => liquidoAReceber(r) > 0);
  const vencidos = pendentes.filter((r) => r.venceEm <= hoje);
  const soma = (lista: Recebivel[]) => lista.reduce((s, r) => s + liquidoAReceber(r), 0);
  return { totalCentavos: soma(pendentes), quantidade: pendentes.length, vencidosCentavos: soma(vencidos), vencidos: vencidos.length };
}

/** Só os de cartão (o que a operadora vai depositar). */
export const recebiveisDeCartao = <T extends Pick<Recebivel, 'forma'>>(lista: readonly T[]): T[] => lista.filter((r) => r.forma !== 'fiado');

/** Só os de fiado (o que os clientes devem). */
export const recebiveisDeFiado = <T extends Pick<Recebivel, 'forma'>>(lista: readonly T[]): T[] => lista.filter((r) => r.forma === 'fiado');

/** Quanto um cliente deve no fiado (compras no fiado ainda não pagas, menos o que foi devolvido). */
export function fiadoEmAberto(recebiveis: readonly Recebivel[], clienteId: string): number {
  return recebiveisDeFiado(recebiveis)
    .filter((r) => r.cliente?.id === clienteId)
    .reduce((s, r) => s + liquidoAReceber(r), 0);
}

/** Recebimentos de cartão que já deviam ter caído (do mais antigo para o mais novo). */
export function recebiveisVencidos(recebiveis: readonly Recebivel[], hoje: string): Recebivel[] {
  return recebiveis.filter((r) => liquidoAReceber(r) > 0 && r.venceEm <= hoje).sort((a, b) => a.venceEm.localeCompare(b.venceEm));
}

/** Taxas de cartão das vendas indicadas (para relatórios). */
export function taxasDasVendas(recebiveis: readonly Recebivel[], vendaIds: ReadonlySet<string>): number {
  return recebiveis.filter((r) => vendaIds.has(r.vendaId)).reduce((s, r) => s + taxaEfetiva(r), 0);
}

// ------------------------------------------------------------------ venda e estorno
export interface EfeitosFinanceirosDaVenda {
  lancamentos: NovoLancamento[];
  recebiveis: NovoRecebivel[];
}

/** O que a venda gera no financeiro: Dinheiro no Caixa, Pix no Banco, cartão e fiado "a receber". */
export function efeitosFinanceirosDaVenda(
  venda: Venda,
  ctx: { taxas?: TaxasCartao; fuso?: string; prazoFiadoDias?: number } = {},
): EfeitosFinanceirosDaVenda {
  const taxas = ctx.taxas ?? TAXAS_CARTAO_PADRAO;
  const dia = diaNoFuso(venda.criadaEm, ctx.fuso ?? FUSO_PADRAO);
  const lancamentos: NovoLancamento[] = [];
  const recebiveis: NovoRecebivel[] = [];
  for (const p of venda.pagamentos) {
    if (p.forma === 'fiado') {
      recebiveis.push({
        forma: 'fiado',
        cliente: venda.cliente,
        vendaId: venda.id,
        vendaNumero: venda.numero,
        criadoEm: venda.criadaEm,
        venceEm: somarDias(dia, ctx.prazoFiadoDias ?? PRAZO_FIADO_PADRAO_DIAS),
        brutoCentavos: p.valorCentavos,
        taxaCentavos: 0,
        estornadoBrutoCentavos: 0,
        estornadoTaxaCentavos: 0,
        situacao: 'pendente',
        recebimento: null,
      });
    } else if (ehCartao(p.forma)) {
      recebiveis.push({
        forma: p.forma,
        cliente: null,
        vendaId: venda.id,
        vendaNumero: venda.numero,
        criadoEm: venda.criadaEm,
        venceEm: somarDias(dia, taxas.dias[p.forma]),
        brutoCentavos: p.valorCentavos,
        taxaCentavos: taxaDoCartao(p.valorCentavos, taxas.taxaPct[p.forma]),
        estornadoBrutoCentavos: 0,
        estornadoTaxaCentavos: 0,
        situacao: 'pendente',
        recebimento: null,
      });
    } else {
      lancamentos.push({
        conta: CONTA_DA_FORMA[p.forma],
        tipo: 'venda',
        valorCentavos: p.valorCentavos,
        descricao: `Venda ${formatarNumeroVenda(venda.numero)} • ${NOME_FORMA_PAGAMENTO[p.forma]}`,
        criadoEm: venda.criadaEm,
        vendaId: venda.id,
        vendaNumero: venda.numero,
        recebivelId: null,
        categoria: null,
        por: venda.vendedor,
      });
    }
  }
  return { lancamentos, recebiveis };
}

export interface ContextoEstornoFinanceiro {
  /** "Cancelamento" ou "Devolução #00003": aparece na descrição do lançamento. */
  rotulo: string;
  /** ISO 8601. */
  em: string;
  por: Operador;
  /** Saldo atual do Caixa físico: a devolução em dinheiro não pode passar dele. Sem ele, não confere. */
  saldoCaixaCentavos?: number;
}

export interface EfeitosFinanceirosDoEstorno {
  lancamentos: NovoLancamento[];
  /** Os recebimentos (cartão e fiado) da venda, já com o estorno abatido (o servidor grava por cima). */
  recebiveis: Recebivel[];
}

/** Desfaz no financeiro o que voltou para o cliente, pela mesma forma de pagamento. */
export function efeitosFinanceirosDoEstorno(
  venda: Venda,
  estornos: readonly Pagamento[],
  recebiveisDaVenda: readonly Recebivel[],
  ctx: ContextoEstornoFinanceiro,
): Resultado<EfeitosFinanceirosDoEstorno> {
  const lancamentos: NovoLancamento[] = [];
  const recebiveis = recebiveisDaVenda.map((r) => ({ ...r, recebimento: r.recebimento ? { ...r.recebimento } : null }));
  const numero = formatarNumeroVenda(venda.numero);
  const lancar = (conta: ContaId, valor: number, descricao: string, recebivelId: string | null = null) =>
    lancamentos.push({ conta, tipo: 'estorno_venda', valorCentavos: -valor, descricao, criadoEm: ctx.em, vendaId: venda.id, vendaNumero: venda.numero, recebivelId, categoria: null, por: ctx.por });

  for (const e of estornos) {
    const nome = NOME_FORMA_PAGAMENTO[e.forma];
    if (!ehAPrazo(e.forma)) {
      if (e.forma === 'dinheiro' && ctx.saldoCaixaCentavos !== undefined && e.valorCentavos > ctx.saldoCaixaCentavos) {
        return {
          ok: false,
          erros: [
            {
              campo: 'estornos',
              mensagem: `A devolução em dinheiro (${formatarCentavos(e.valorCentavos)}) é maior que o saldo do Caixa físico (${formatarCentavos(Math.max(0, ctx.saldoCaixaCentavos))}). Confira o caixa ou lance uma entrada no Financeiro antes.`,
            },
          ],
        };
      }
      lancar(CONTA_DA_FORMA[e.forma], e.valorCentavos, `${ctx.rotulo} • venda ${numero} • ${nome}`);
      continue;
    }
    let resta = e.valorCentavos;
    for (const r of recebiveis) {
      if (resta <= 0) break;
      if (r.vendaId !== venda.id || r.forma !== e.forma || r.situacao === 'cancelado') continue;
      const restanteBruto = r.brutoCentavos - r.estornadoBrutoCentavos;
      const restanteTaxa = r.taxaCentavos - r.estornadoTaxaCentavos;
      const bruto = Math.min(resta, restanteBruto);
      if (bruto <= 0) continue;
      // taxa proporcional; o último estorno leva o que sobrou, para não ficar centavo perdido
      const taxa = bruto === restanteBruto ? restanteTaxa : Math.min(restanteTaxa, Math.round((bruto * r.taxaCentavos) / r.brutoCentavos));
      r.estornadoBrutoCentavos += bruto;
      r.estornadoTaxaCentavos += taxa;
      if (r.situacao === 'recebido') lancar(r.recebimento!.conta, bruto - taxa, `${ctx.rotulo} • venda ${numero} • estorno no ${nome}`, r.id);
      else if (r.estornadoBrutoCentavos >= r.brutoCentavos) r.situacao = 'cancelado';
      resta -= bruto;
    }
    if (resta > 0) return { ok: false, erros: [{ campo: 'estornos', mensagem: `Não há valor em ${nome} suficiente nesta venda para estornar.` }] };
  }
  return { ok: true, valor: { lancamentos, recebiveis } };
}

/** Confirma que a operadora depositou (cartão) ou que o cliente pagou (fiado): o valor entra na conta escolhida. */
export function receberRecebivel(
  r: Recebivel,
  ctx: { conta: unknown; em: string; por: Operador },
): Resultado<{ recebivel: Recebivel; lancamento: NovoLancamento }> {
  if (r.situacao === 'recebido') return { ok: false, erros: [{ campo: '_', mensagem: 'Este recebimento já foi confirmado.' }] };
  if (r.situacao === 'cancelado') return { ok: false, erros: [{ campo: '_', mensagem: 'Este recebimento foi cancelado (venda cancelada ou devolvida).' }] };
  if (!ehConta(ctx.conta)) return { ok: false, erros: [{ campo: 'conta', mensagem: 'Escolha a conta onde o dinheiro entrou.' }] };
  const valor = liquidoAReceber(r);
  return {
    ok: true,
    valor: {
      recebivel: { ...r, situacao: 'recebido', recebimento: { em: ctx.em, conta: ctx.conta, valorCentavos: valor, por: ctx.por } },
      lancamento: {
        conta: ctx.conta,
        tipo: r.forma === 'fiado' ? 'recebimento_fiado' : 'recebimento_cartao',
        valorCentavos: valor,
        descricao: `${NOME_FORMA_PAGAMENTO[r.forma]}${r.cliente ? ` • ${r.cliente.nome}` : ''} • venda ${formatarNumeroVenda(r.vendaNumero)}`,
        criadoEm: ctx.em,
        vendaId: r.vendaId,
        vendaNumero: r.vendaNumero,
        recebivelId: r.id,
        categoria: null,
        por: ctx.por,
      },
    },
  };
}

// ------------------------------------------------------------------ lançamentos à mão
export const TIPOS_LANCAMENTO_MANUAL = ['entrada', 'despesa', 'retirada', 'transferencia'] as const;
export type TipoLancamentoManual = (typeof TIPOS_LANCAMENTO_MANUAL)[number];

export interface LancamentoManual {
  tipo: TipoLancamentoManual;
  conta: ContaId;
  /** Só na transferência. */
  contaDestino: ContaId | null;
  valorCentavos: number;
  descricao: string;
  categoria: string | null;
}

/** O que a tela envia (conta de destino e categoria são opcionais). */
export type NovoLancamentoManual = Omit<LancamentoManual, 'contaDestino' | 'categoria'> & { contaDestino?: ContaId | null; categoria?: string | null };

const valorPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= CENTAVOS_MAX;

function lerTexto(v: unknown, campo: string, max: number, erros: ErroCampo[], obrigatorio?: string): string {
  const t = typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (!t && obrigatorio) erros.push({ campo, mensagem: obrigatorio });
  else if (t.length > max) erros.push({ campo, mensagem: `Use até ${max} caracteres.` });
  else if (CONTROLE.test(t)) erros.push({ campo, mensagem: 'Texto com caracteres inválidos.' });
  return t;
}

export function validarLancamentoManual(entrada: unknown): Resultado<LancamentoManual> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o lançamento.' }] };
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(entrada)) {
    if (!['tipo', 'conta', 'contaDestino', 'valorCentavos', 'descricao', 'categoria'].includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  }
  const tipo = entrada.tipo as TipoLancamentoManual;
  if (!(TIPOS_LANCAMENTO_MANUAL as readonly unknown[]).includes(tipo)) erros.push({ campo: 'tipo', mensagem: 'Escolha entrada, despesa, retirada ou transferência.' });
  if (!ehConta(entrada.conta)) erros.push({ campo: 'conta', mensagem: 'Escolha a conta.' });
  let contaDestino: ContaId | null = null;
  if (tipo === 'transferencia') {
    if (!ehConta(entrada.contaDestino) || entrada.contaDestino === entrada.conta) erros.push({ campo: 'contaDestino', mensagem: 'Escolha contas diferentes para a transferência.' });
    else contaDestino = entrada.contaDestino;
  } else if (entrada.contaDestino !== undefined && entrada.contaDestino !== null) {
    erros.push({ campo: 'contaDestino', mensagem: 'Conta de destino só na transferência.' });
  }
  if (!valorPositivo(entrada.valorCentavos)) erros.push({ campo: 'valorCentavos', mensagem: 'Informe um valor maior que zero.' });
  const descricao = lerTexto(entrada.descricao, 'descricao', LIMITES_FINANCEIRO.descricaoMax, erros, 'Descreva o lançamento.');
  const categoria = lerTexto(entrada.categoria, 'categoria', LIMITES_FINANCEIRO.categoriaMax, erros);
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: { tipo, conta: entrada.conta as ContaId, contaDestino, valorCentavos: entrada.valorCentavos as number, descricao, categoria: tipo === 'despesa' ? categoria || 'Outras despesas' : null },
  };
}

/** Transforma o lançamento à mão em lançamentos nas contas (transferência = saída numa, entrada na outra). */
export function lancamentosManuais(l: LancamentoManual, ctx: { em: string; por: Operador }): NovoLancamento[] {
  const base = { criadoEm: ctx.em, vendaId: null, vendaNumero: null, recebivelId: null, por: ctx.por };
  switch (l.tipo) {
    case 'entrada':
      return [{ ...base, conta: l.conta, tipo: 'entrada', valorCentavos: l.valorCentavos, descricao: l.descricao, categoria: null }];
    case 'despesa':
      return [{ ...base, conta: l.conta, tipo: 'despesa', valorCentavos: -l.valorCentavos, descricao: l.descricao, categoria: l.categoria }];
    case 'retirada':
      return [{ ...base, conta: l.conta, tipo: 'retirada', valorCentavos: -l.valorCentavos, descricao: `Retirada do dono • ${l.descricao}`, categoria: null }];
    case 'transferencia':
      return [
        { ...base, conta: l.conta, tipo: 'transferencia_saida', valorCentavos: -l.valorCentavos, descricao: l.descricao, categoria: null },
        { ...base, conta: l.contaDestino!, tipo: 'transferencia_entrada', valorCentavos: l.valorCentavos, descricao: l.descricao, categoria: null },
      ];
  }
}

/** Saída do Caixa físico não pode passar do dinheiro que há nele (o Banco pode ficar negativo). */
export function conferirSaida(lancamentos: readonly NovoLancamento[], saldos: SaldosContas): Resultado<null> {
  const saiDoCaixa = -lancamentos.filter((l) => l.conta === 'caixa').reduce((s, l) => s + l.valorCentavos, 0);
  if (saiDoCaixa > 0 && saiDoCaixa > saldos.porConta.caixa) {
    return {
      ok: false,
      erros: [{ campo: 'valorCentavos', mensagem: `O valor (${formatarCentavos(saiDoCaixa)}) é maior que o saldo do Caixa físico (${formatarCentavos(Math.max(0, saldos.porConta.caixa))}). Confira o valor digitado.` }],
    };
  }
  return { ok: true, valor: null };
}

/** Saldo inicial (implantação): uma vez por conta. Pode ser zero; o Banco pode começar negativo. */
export function validarSaldoInicial(entrada: unknown, lancamentos: readonly Pick<Lancamento, 'conta' | 'tipo'>[]): Resultado<{ conta: ContaId; valorCentavos: number }> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com a conta e o valor.' }] };
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(entrada)) if (k !== 'conta' && k !== 'valorCentavos') erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  const { conta, valorCentavos: v } = entrada;
  if (!ehConta(conta)) erros.push({ campo: 'conta', mensagem: 'Escolha a conta.' });
  else if (lancamentos.some((l) => l.conta === conta && l.tipo === 'saldo_inicial')) erros.push({ campo: 'conta', mensagem: 'O saldo inicial desta conta já foi definido.' });
  if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > CENTAVOS_MAX || (conta === 'caixa' && v < 0)) {
    erros.push({ campo: 'valorCentavos', mensagem: conta === 'caixa' ? 'Informe quanto dinheiro há no caixa (zero ou mais).' : 'Informe o saldo da conta.' });
  }
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { conta: conta as ContaId, valorCentavos: v as number } };
}

/** Taxa de 0 a 99,99% (100% ou mais deixaria o valor a receber negativo) e prazo de 0 a 365 dias. */
export function validarTaxasCartao(entrada: unknown): Resultado<TaxasCartao> {
  if (!ehObjeto(entrada) || !ehObjeto(entrada.taxaPct) || !ehObjeto(entrada.dias)) {
    return { ok: false, erros: [{ campo: '_', mensagem: 'Informe a taxa e os dias do débito e do crédito.' }] };
  }
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(entrada)) if (k !== 'taxaPct' && k !== 'dias') erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  const taxaPct = { debito: 0, credito: 0 };
  const dias = { debito: 0, credito: 0 };
  for (const f of ['debito', 'credito'] as const) {
    const t = entrada.taxaPct[f];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > LIMITES_FINANCEIRO.taxaPctMax || Math.abs(Math.round(t * 100) - t * 100) > 1e-6) {
      erros.push({ campo: `taxaPct.${f}`, mensagem: 'A taxa vai de 0 a 99,99%, com até 2 casas.' });
    } else taxaPct[f] = t;
    const d = entrada.dias[f];
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > LIMITES_FINANCEIRO.diasMax) erros.push({ campo: `dias.${f}`, mensagem: 'Os dias vão de 0 a 365.' });
    else dias[f] = d;
  }
  return erros.length ? { ok: false, erros } : { ok: true, valor: { taxaPct, dias } };
}
