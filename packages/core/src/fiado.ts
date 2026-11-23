// packages/core/src/fiado.ts
// FIADO DO CLIENTE (Fase 2, módulo 6), com as regras do DaniPets V9.3.3 (PDV-10, CLI-15 e 16):
//   - cada compra no fiado é um "a receber" na conta do cliente, com vencimento (prazo da loja, padrão 30 dias);
//   - LIMITE por cliente (definido pelo Dono ou pelo Administrador; 0 = sem fiado). Na Frente de caixa, passar
//     do limite, ou comprar com fiado vencido (regra da loja, ligada no padrão), só com a liberação de um Dono,
//     com motivo;
//   - RECEBER pela conta do cliente: o valor (todo ou parte) abate primeiro a compra mais antiga, ou só as compras
//     de um vencimento. Dinheiro entra na gaveta (com o caixa de hoje aberto; o troco não entra), Pix na Conta
//     bancária e cartão com a TAXA DA MAQUININHA REPASSADA ao cliente (ele paga o bruto; a loja recebe o valor
//     cheio): entra no banco na hora (baixa automática) ou fica a receber da operadora (baixa manual), conforme a
//     escolha do Dono nas taxas. Pagar fiado não gera cashback. (Arquivo do Luan de 23/11/2026.)
// Valores em centavos; dias AAAA-MM-DD no fuso da loja.
import { dataBr, dataValida } from './compra';
import { CENTAVOS_MAX, formatarCentavos } from './dinheiro';
import {
  type ContaId,
  liquidoAReceber,
  type NovoLancamento,
  type NovoRecebivel,
  type Recebivel,
  somarDias,
  taxaDoCartao,
  type TaxasCartao,
} from './financeiro';
import { type Permissao, pode } from './permissoes';
import type { Resultado } from './resultado';
import { type AcaoAutorizada, type Autorizacao, type ClienteDaVenda, NOME_FORMA_PAGAMENTO, type Operador, VALIDADE_AUTORIZACAO_HORAS } from './venda';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export interface FiadoDoCliente {
  /** O que o cliente deve (compras no fiado ainda não pagas, menos o que foi devolvido). */
  devendoCentavos: number;
  /** Parte que já passou do vencimento. */
  vencidoCentavos: number;
  /** Há quantos dias a mais antiga em aberto venceu (0 = nada vencido). */
  diasVencido: number;
  /** Compras no fiado em aberto, da que vence primeiro para a que vence depois (é a ordem em que o pagamento abate). */
  abertos: Recebivel[];
}

/** Fiado do cliente hoje (DaniPets devendo, fiadoVencido e fiadosAbertos). */
export function fiadoDoCliente(recebiveis: readonly Recebivel[], clienteId: string, hoje: string): FiadoDoCliente {
  const abertos = recebiveis
    .filter((r) => r.forma === 'fiado' && r.cliente?.id === clienteId && liquidoAReceber(r) > 0)
    .sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.vendaNumero - b.vendaNumero || a.criadoEm.localeCompare(b.criadoEm));
  const vencidos = abertos.filter((r) => r.venceEm < hoje);
  return {
    devendoCentavos: abertos.reduce((s, r) => s + liquidoAReceber(r), 0),
    vencidoCentavos: vencidos.reduce((s, r) => s + liquidoAReceber(r), 0),
    diasVencido: vencidos[0] ? diasEntre(vencidos[0].venceEm, hoje) : 0,
    abertos,
  };
}

/**
 * Por que a compra no fiado precisa da liberação de um Dono (DaniPets fiadoMotivos). Vazio = passa sem
 * liberação. `vencidoPedeDono` é a regra da loja ("fiado vencido pede liberação", ligada no padrão).
 */
export function motivosDoFiado(limiteCentavos: number, fiado: Pick<FiadoDoCliente, 'devendoCentavos' | 'vencidoCentavos' | 'diasVencido'>, valorCentavos: number, vencidoPedeDono: boolean): string[] {
  const motivos: string[] = [];
  const apos = fiado.devendoCentavos + valorCentavos;
  if (apos > limiteCentavos) {
    motivos.push(limiteCentavos > 0 ? `passa do limite de ${formatarCentavos(limiteCentavos)} em ${formatarCentavos(apos - limiteCentavos)}` : 'o cliente não tem limite de fiado no cadastro');
  }
  if (vencidoPedeDono && fiado.vencidoCentavos > 0) motivos.push(`tem ${formatarCentavos(fiado.vencidoCentavos)} vencido há ${plural(fiado.diasVencido, 'dia', 'dias')}`);
  return motivos;
}

/** O que a venda leva quando o fiado foi liberado: quem liberou (Dono), o motivo e os motivos da liberação. */
export interface FiadoLiberado {
  por: Operador;
  motivo: string;
  motivos: string[];
}

/** Autorização de um Dono (dentro de 4 horas) para esta compra no fiado: mesmo cliente e mesmo valor. */
export function liberacaoDoFiadoServe(a: Autorizacao | null | undefined, clienteId: string, valorCentavos: number, agora: Date, permissao: Permissao = 'fiado.liberar'): a is Autorizacao {
  if (!a || !pode(a.autorizador.papel, permissao)) return false;
  const acao: AcaoAutorizada = a.acao;
  if (acao.tipo !== 'fiado' || acao.clienteId !== clienteId || acao.valorCentavos !== valorCentavos) return false;
  const idade = agora.getTime() - new Date(a.criadaEm).getTime();
  return idade >= 0 && idade <= VALIDADE_AUTORIZACAO_HORAS * 3_600_000;
}

/** Texto da recusa na Frente de caixa ("Venda no fiado para Maria: passa do limite...; tem ... vencido"). */
export const mensagemFiadoPrecisaDono = (nome: string, motivos: readonly string[]) => `Venda no fiado para ${nome}: ${motivos.join('; ')}. Precisa da liberação de um Dono.`;

// ------------------------------------------------------------------ receber pela conta do cliente
export const FORMAS_RECEBER_FIADO = ['dinheiro', 'pix', 'debito', 'credito'] as const;
export type FormaReceberFiado = (typeof FORMAS_RECEBER_FIADO)[number];

/** Só as compras de um vencimento (receber pela lista "Fiado a vencer", que separa por vencimento). */
export function fiadoDoVencimento(fiado: FiadoDoCliente, venceEm: string, hoje: string): FiadoDoCliente {
  const abertos = fiado.abertos.filter((r) => r.venceEm === venceEm);
  const devendo = abertos.reduce((s, r) => s + liquidoAReceber(r), 0);
  const vencido = venceEm < hoje ? devendo : 0;
  return { devendoCentavos: devendo, vencidoCentavos: vencido, diasVencido: vencido > 0 ? diasEntre(venceEm, hoje) : 0, abertos };
}

/** Lembrete de pagamento de um vencimento: "fiado:2026-12-23". */
export const referenciaDoFiado = (venceEm: string): string => `fiado:${venceEm}`;

/** O vencimento de uma referência "fiado:AAAA-MM-DD" (null = não é uma referência válida). */
export function vencimentoDaReferencia(referencia: unknown): string | null {
  if (typeof referencia !== 'string') return null;
  const m = /^fiado:(\d{4}-\d{2}-\d{2})$/.exec(referencia);
  return m && dataValida(m[1]) ? m[1]! : null;
}

/** Quanto cobrar para receber o fiado: o que abate, o que o cliente paga, a taxa da maquininha e o troco. */
export interface CotacaoRecebimento {
  /** O que abate da dívida (e o que a loja recebe). */
  principalCentavos: number;
  forma: FormaReceberFiado;
  /** Taxa da maquininha (0 em dinheiro e Pix). */
  percentual: number;
  /** O que o cliente paga: no cartão, o principal mais a taxa. */
  brutoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
  /** Só em dinheiro: o que o cliente entregou e o troco. */
  entregueCentavos: number | null;
  trocoCentavos: number;
}

/**
 * Cotação do recebimento do fiado (arquivo do Luan, 23/11/2026). No cartão, a taxa da maquininha é repassada ao
 * cliente: o bruto é o valor em que bruto − taxa(bruto) dá exatamente o que abate a dívida (conferido para todas
 * as taxas de 0,01% a 99,99%). Em dinheiro, o troco do que foi entregue (sem `entregue`, entregou o valor certo).
 */
export function cotarRecebimentoFiado(principal: unknown, forma: unknown, taxas: Pick<TaxasCartao, 'taxaPct'>, entregue?: unknown): Resultado<CotacaoRecebimento> {
  const erro = (mensagem: string, campo: string): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
  if (typeof principal !== 'number' || !Number.isSafeInteger(principal) || principal <= 0 || principal > CENTAVOS_MAX) return erro('Informe um valor válido para a baixa.', 'valorCentavos');
  if (typeof forma !== 'string' || !(FORMAS_RECEBER_FIADO as readonly string[]).includes(forma)) return erro('Escolha a forma de pagamento.', 'forma');
  const f = forma as FormaReceberFiado;
  const percentual = f === 'debito' || f === 'credito' ? taxas.taxaPct[f] : 0;
  const pontos = Math.round(percentual * 100);
  if (!Number.isInteger(pontos) || pontos < 0 || pontos >= 10_000) return erro('A taxa da maquininha está inválida. Confira as taxas.', 'taxa');
  const bruto = Math.round((principal * 10_000) / (10_000 - pontos));
  if (bruto > CENTAVOS_MAX) return erro('O valor a cobrar passa do limite de um recebimento.', 'valorCentavos');
  const taxa = taxaDoCartao(bruto, percentual);
  if (bruto - taxa !== principal) return erro('Não foi possível calcular a taxa deste valor. Tente outro valor.', 'taxa');
  let entregueCentavos: number | null = null;
  if (f === 'dinheiro') {
    const e = entregue === undefined || entregue === null ? principal : entregue;
    if (typeof e !== 'number' || !Number.isSafeInteger(e) || e > CENTAVOS_MAX || e < principal) return erro('O dinheiro entregue é menor que o valor da baixa.', 'entregueCentavos');
    entregueCentavos = e;
  }
  return {
    ok: true,
    valor: {
      principalCentavos: principal,
      forma: f,
      percentual,
      brutoCentavos: bruto,
      taxaCentavos: taxa,
      liquidoCentavos: principal,
      entregueCentavos,
      trocoCentavos: entregueCentavos === null ? 0 : entregueCentavos - principal,
    },
  };
}

export interface RecebimentoDeFiado {
  /** Compras no fiado que mudaram (pagas por inteiro, ou com o valor que falta diminuído). */
  atualizados: Recebivel[];
  /** A parte paga de uma compra que foi paga só em parte (vira um "recebido" separado, para a devolução saber de onde voltar). */
  partesPagas: Recebivel[];
  /** Dinheiro (Caixa físico) ou Pix (Conta bancária). */
  lancamento: NovoLancamento | null;
  /** Cartão: o pagamento à operadora, com a taxa repassada (bruto − taxa = o valor recebido). A baixa (na hora ou
   *  manual) é decidida por quem grava, com as taxas da loja. */
  cartao: NovoRecebivel | null;
  /** O que foi abatido de cada compra (da mais antiga para a mais nova). */
  abatidas: { vendaNumero: number; valorCentavos: number }[];
}

/**
 * Para a tela mostrar antes de confirmar: o que o valor abate e quanto fica devendo. `abertos` na ordem em
 * que o pagamento abate (a que vence primeiro), com o que falta pagar de cada compra.
 */
export function previaDoRecebimento(
  abertos: readonly { vendaNumero: number; abertoCentavos: number }[],
  valorCentavos: number,
): { abatidas: { vendaNumero: number; valorCentavos: number }[]; ficaDevendoCentavos: number } {
  const devendo = abertos.reduce((s, a) => s + a.abertoCentavos, 0);
  const valor = Number.isSafeInteger(valorCentavos) && valorCentavos > 0 && valorCentavos <= devendo ? valorCentavos : 0;
  let resta = valor;
  const abatidas: { vendaNumero: number; valorCentavos: number }[] = [];
  for (const a of abertos) {
    if (resta <= 0) break;
    const u = Math.min(a.abertoCentavos, resta);
    abatidas.push({ vendaNumero: a.vendaNumero, valorCentavos: u });
    resta -= u;
  }
  return { abatidas, ficaDevendoCentavos: devendo - valor };
}

/**
 * Recebe o fiado do cliente: o valor (todo ou parte do que ele deve) abate primeiro a compra mais antiga (DaniPets
 * fiadoReceber). No cartão, a taxa da maquininha é repassada ao cliente (cotarRecebimentoFiado).
 */
export function receberFiado(
  fiado: FiadoDoCliente,
  valorCentavos: unknown,
  forma: unknown,
  ctx: { cliente: ClienteDaVenda; em: string; hoje: string; por: Operador; novoId: () => string; taxas: TaxasCartao },
): Resultado<RecebimentoDeFiado> {
  const erro = (mensagem: string, campo = '_'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
  const nome = ctx.cliente.nome;
  if (fiado.devendoCentavos <= 0) return erro(`${nome} não tem fiado em aberto.`);
  if (typeof valorCentavos !== 'number' || !Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) return erro('Informe o valor recebido.', 'valorCentavos');
  if (valorCentavos > fiado.devendoCentavos) return erro(`${nome} deve ${formatarCentavos(fiado.devendoCentavos)}. Informe um valor até esse.`, 'valorCentavos');
  if (typeof forma !== 'string' || !(FORMAS_RECEBER_FIADO as readonly string[]).includes(forma)) return erro('Escolha a forma de pagamento.', 'forma');
  const f = forma as FormaReceberFiado;
  const conta: ContaId = f === 'dinheiro' ? 'caixa' : 'banco';
  const recebimento = (valor: number) => ({ em: ctx.em, conta, valorCentavos: valor, por: ctx.por, forma: f });

  let resta = valorCentavos;
  const atualizados: Recebivel[] = [];
  const partesPagas: Recebivel[] = [];
  const abatidas: { vendaNumero: number; valorCentavos: number }[] = [];
  for (const r of fiado.abertos) {
    if (resta <= 0) break;
    const aberto = liquidoAReceber(r);
    const u = Math.min(aberto, resta);
    if (u === aberto) {
      atualizados.push({ ...r, situacao: 'recebido', recebimento: recebimento(u) });
    } else {
      // pagou só uma parte: a parte paga vira um "recebido" separado; a compra continua com o que falta
      partesPagas.push({ ...r, id: ctx.novoId(), brutoCentavos: u, taxaCentavos: 0, estornadoBrutoCentavos: 0, estornadoTaxaCentavos: 0, situacao: 'recebido', recebimento: recebimento(u) });
      atualizados.push({ ...r, brutoCentavos: r.brutoCentavos - u });
    }
    abatidas.push({ vendaNumero: r.vendaNumero, valorCentavos: u });
    resta -= u;
  }
  if (resta > 0) return erro('Não foi possível abater o valor do fiado. Nada foi alterado.');

  const descricao = `Fiado • ${nome} • ${NOME_FORMA_PAGAMENTO[f]}`;
  const lancamento: NovoLancamento | null =
    f === 'dinheiro' || f === 'pix'
      ? { conta, tipo: 'recebimento_fiado', valorCentavos, descricao, criadoEm: ctx.em, vendaId: null, vendaNumero: null, recebivelId: null, categoria: null, por: ctx.por }
      : null;
  let cartao: NovoRecebivel | null = null;
  if (f === 'debito' || f === 'credito') {
    const cotacao = cotarRecebimentoFiado(valorCentavos, f, ctx.taxas);
    if (!cotacao.ok) return cotacao;
    cartao = {
      forma: f,
      cliente: ctx.cliente,
      vendaId: '',
      vendaNumero: 0,
      origem: 'fiado',
      criadoEm: ctx.em,
      venceEm: somarDias(ctx.hoje, ctx.taxas.dias[f]),
      brutoCentavos: cotacao.valor.brutoCentavos,
      taxaCentavos: cotacao.valor.taxaCentavos,
      estornadoBrutoCentavos: 0,
      estornadoTaxaCentavos: 0,
      situacao: 'pendente',
      recebimento: null,
    };
  }
  return { ok: true, valor: { atualizados, partesPagas, lancamento, cartao, abatidas } };
}

/** "#00012 (R$ 30,00), #00015 (R$ 20,00)" */
export const descreverAbatidas = (abatidas: readonly { vendaNumero: number; valorCentavos: number }[]) =>
  abatidas.map((a) => `#${String(a.vendaNumero).padStart(5, '0')} (${formatarCentavos(a.valorCentavos)})`).join(', ');

/** Situação da conta no fiado para a lista ("vencido há 3 dias", "vence hoje", "vence em 5 dias"). */
export function situacaoDoFiado(fiado: FiadoDoCliente, hoje: string): { texto: string; tipo: 'vencido' | 'perto' | 'em_dia' } | null {
  const primeira = fiado.abertos[0];
  if (!primeira) return null;
  if (fiado.vencidoCentavos > 0) return { texto: `vencido há ${plural(fiado.diasVencido, 'dia', 'dias')}`, tipo: 'vencido' };
  const n = diasEntre(hoje, primeira.venceEm);
  return { texto: n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : `vence em ${n} dias (${dataBr(primeira.venceEm)})`, tipo: n <= 3 ? 'perto' : 'em_dia' };
}
