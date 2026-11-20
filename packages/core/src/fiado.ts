// packages/core/src/fiado.ts
// FIADO DO CLIENTE (Fase 2, módulo 6), com as regras do DaniPets V9.3.3 (PDV-10, CLI-15 e 16):
//   - cada compra no fiado é um "a receber" na conta do cliente, com vencimento (prazo da loja, padrão 30 dias);
//   - LIMITE por cliente (definido pelo Dono ou pelo Administrador; 0 = sem fiado). Na Frente de caixa, passar
//     do limite, ou comprar com fiado vencido (regra da loja, ligada no padrão), só com a liberação de um Dono,
//     com motivo;
//   - RECEBER pela conta do cliente: o valor (todo ou parte) abate primeiro a compra mais antiga. Dinheiro entra
//     na gaveta (com o caixa de hoje aberto), Pix na Conta bancária e cartão fica a receber da operadora, com a
//     taxa do cartão. Pagar fiado não gera cashback.
// Valores em centavos; dias AAAA-MM-DD no fuso da loja.
import { dataBr } from './compra';
import { formatarCentavos } from './dinheiro';
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

export interface RecebimentoDeFiado {
  /** Compras no fiado que mudaram (pagas por inteiro, ou com o valor que falta diminuído). */
  atualizados: Recebivel[];
  /** A parte paga de uma compra que foi paga só em parte (vira um "recebido" separado, para a devolução saber de onde voltar). */
  partesPagas: Recebivel[];
  /** Dinheiro (Caixa físico) ou Pix (Conta bancária). */
  lancamento: NovoLancamento | null;
  /** Cartão: fica a receber da operadora, com a taxa. */
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

/** Recebe o fiado do cliente: o valor (todo ou parte do que ele deve) abate primeiro a compra mais antiga (DaniPets fiadoReceber). */
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
  const cartao: NovoRecebivel | null =
    f === 'debito' || f === 'credito'
      ? {
          forma: f,
          cliente: ctx.cliente,
          vendaId: '',
          vendaNumero: 0,
          origem: 'fiado',
          criadoEm: ctx.em,
          venceEm: somarDias(ctx.hoje, ctx.taxas.dias[f]),
          brutoCentavos: valorCentavos,
          taxaCentavos: taxaDoCartao(valorCentavos, ctx.taxas.taxaPct[f]),
          estornadoBrutoCentavos: 0,
          estornadoTaxaCentavos: 0,
          situacao: 'pendente',
          recebimento: null,
        }
      : null;
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
