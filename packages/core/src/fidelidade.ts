// packages/core/src/fidelidade.ts
// PROGRAMA DE FIDELIDADE (Fase 2, módulo 7), com as regras do DaniPets V9.3.3 (CLI-10 a 14, 17 e 18,
// PDV-04, 08 e 18, DEV-07):
//   - CASHBACK: a cada compra, o cliente com cadastro completo (nome, telefone e CPF) ganha X% (regra da loja,
//     padrão 3,5%) do que pagou em dinheiro, Pix ou cartão. A parte paga com cashback, vale-troca ou fiado não
//     gera (o fiado não gera nem quando é pago). Cada compra vira um LOTE com prazo para usar (padrão 31 dias);
//   - na Frente de caixa, o cashback abate do total (até o saldo) e a forma escolhida paga o resto. O uso tira
//     primeiro do lote que vence antes;
//   - a DEVOLUÇÃO tira o cashback que a compra gerou, na proporção do valor devolvido (a devolução que completa a
//     venda leva o resto); o CANCELAMENTO tira tudo. Sai primeiro do lote da própria compra e depois dos outros
//     lotes do cliente; o que já tinha sido usado ou vencido fica registrado como "não recuperado". O cashback
//     USADO na compra devolvida ou cancelada volta para o cliente como lote novo, com prazo novo;
//   - CUPOM DE RETORNO: a mensagem de retorno enviada pelo WhatsApp dá ao cliente um cupom de Y% (padrão 5%) com
//     validade (padrão 7 dias). Identificado o cliente na Frente de caixa, o desconto entra sozinho nos itens sem
//     desconto manual. Cancelar a venda devolve o cupom (até a validade dele);
//   - LISTA DE RETORNO: clientes com cadastro completo sem comprar há N dias (padrão 30) e clientes com cashback
//     vencendo em até M dias (padrão 7). Um lembrete por ciclo; quem pediu "não incomodar" ou foi adiado fica de
//     fora; só quem autorizou recebe mensagem (o lembrete de pagamento do fiado só pede o WhatsApp);
//   - mensagens com {nome}, {loja}, {dias}...; o regulamento sai com o nome da loja e as regras dela.
// Valores em centavos; dias AAAA-MM-DD no fuso da loja.
import type { AcaoAuditoria } from './auditoria';
import { cadastroCompleto, type Cliente, extratoDoCliente, type LinhaExtrato, primeiroNome, telefoneValido, temWhatsapp } from './cliente';
import { dataBr } from './compra';
import { preencherModelo, type RegrasDaLoja } from './configuracao';
import { formatarCentavos } from './dinheiro';
import { type Recebivel, somarDias } from './financeiro';
import { soDigitos } from './interno';
import type { Resultado } from './resultado';
import { type FormaPagamento, formatarNumeroVenda, type Operador, type Pagamento, type Venda } from './venda';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Dias de `de` até `ate` (AAAA-MM-DD). */
export const diasEntre = (de: string, ate: string): number => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** "hoje", "amanhã", "em 3 dias" (DaniPets emDias). */
export const emDias = (n: number): string => (n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);

/** 3.5 -> "3,5%" (DaniPets pctTxt). */
export const pctTexto = (pct: number): string => `${String(Math.round(pct * 100) / 100).replace('.', ',')}%`;

/** Dinheiro para mensagens: "R$ 12,50" com espaço comum (o WhatsApp mostra melhor). */
const dinheiroTexto = (c: number) => formatarCentavos(c).replace(/\s/g, ' ');

/** Quantos dias depois do lembrete a compra conta como "voltou" (DaniPets: 15). */
export const DIAS_PARA_VOLTAR = 15;

/** Quanto tempo o "Adiar" tira o cliente da lista de retorno (DaniPets: 7 dias). */
export const DIAS_ADIAR_LEMBRETE = 7;

// ------------------------------------------------------------------ tipos

export type TipoLoteCashback = 'compra' | 'estorno';

/** Cashback ganho numa compra (ou devolvido numa devolução ou cancelamento), com prazo para usar. */
export interface LoteCashback {
  id: string;
  clienteId: string;
  tipo: TipoLoteCashback;
  /** Dia da compra ou do estorno. */
  dia: string;
  valorCentavos: number;
  /** O que ainda não foi usado nem retirado. */
  restanteCentavos: number;
  /** Último dia para usar. */
  venceEm: string;
  /** % usado no cálculo (só no lote de compra). */
  percentual: number | null;
  /** "Compra #00012", "Devolução nº 3 • venda #00012", "Cancelamento • venda #00012". */
  origem: string;
  vendaId: string | null;
  vendaNumero: number | null;
  /** ISO 8601. */
  criadoEm: string;
  por: Operador;
}

export type TipoUsoCashback = 'venda' | 'retirada';

/** Cashback que saiu dos lotes: usado numa compra ou retirado (devolução, cancelamento, exclusão dos dados). */
export interface UsoCashback {
  id: string;
  clienteId: string;
  tipo: TipoUsoCashback;
  dia: string;
  valorCentavos: number;
  /** A compra em que foi usado, ou a compra devolvida ou cancelada (null na exclusão dos dados). */
  vendaId: string | null;
  vendaNumero: number | null;
  /** De quais lotes saiu. */
  lotes: { id: string; valorCentavos: number }[];
  /** Na retirada: "Devolução nº 3", "Cancelamento" ou "Exclusão dos dados". */
  rotulo: string | null;
  criadoEm: string;
  por: Operador;
}

/** Cupom de retorno dado ao cliente na mensagem de retorno (WhatsApp). */
export interface CupomRetorno {
  id: string;
  clienteId: string;
  pct: number;
  /** Dia em que foi dado. */
  dia: string;
  /** Último dia para usar. */
  venceEm: string;
  /** A compra em que foi usado (null = ainda não usado). */
  uso: { dia: string; vendaId: string; vendaNumero: number } | null;
  contatoId: string;
}

export const TIPOS_CONTATO = ['retorno', 'cashback', 'cobranca'] as const;
export type TipoContato = (typeof TIPOS_CONTATO)[number];

/** Nomes iguais aos do DaniPets (CONTATO_TIPO). */
export const NOME_CONTATO: Record<TipoContato, string> = { retorno: 'Lembrete de retorno', cashback: 'Aviso de cashback', cobranca: 'Lembrete de pagamento' };

/** Ação do histórico de cada lembrete. */
export const ACAO_DO_CONTATO: Record<TipoContato, AcaoAuditoria> = {
  retorno: 'cliente.lembrete_retorno',
  cashback: 'cliente.aviso_cashback',
  cobranca: 'cliente.lembrete_pagamento',
};

/** 'whatsapp' = mensagem aberta pelo sistema; 'outro' = "Já falei" (pessoalmente, por telefone). */
export type CanalContato = 'whatsapp' | 'outro';

export interface ContatoCliente {
  id: string;
  clienteId: string;
  tipo: TipoContato;
  canal: CanalContato;
  dia: string;
  criadoEm: string;
  por: Operador;
  cupomId: string | null;
}

/** O que a fidelidade precisa saber do cliente. */
export type ClienteDaFidelidade = Pick<Cliente, 'id' | 'nome' | 'telefone' | 'cpf' | 'ativo' | 'naoIncomodar' | 'lembreteAdiadoAte' | 'whatsapp' | 'autorizaMensagens'>;

type ClienteDoSaldo = Pick<Cliente, 'id' | 'nome' | 'telefone' | 'cpf'>;

// ------------------------------------------------------------------ saldo de cashback

/** Lotes com saldo e ainda no prazo, do que vence antes para o que vence depois (DaniPets cbValidos). */
export function lotesValidos(lotes: readonly LoteCashback[], clienteId: string, hoje: string): LoteCashback[] {
  return lotes
    .filter((l) => l.clienteId === clienteId && l.restanteCentavos > 0 && l.venceEm >= hoje)
    .sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.dia.localeCompare(b.dia) || a.criadoEm.localeCompare(b.criadoEm));
}

/** Saldo de cashback para usar hoje. Cadastro incompleto não tem cashback (DaniPets saldoCb). */
export function saldoCashback(lotes: readonly LoteCashback[], cliente: ClienteDoSaldo | null | undefined, hoje: string): number {
  if (!cliente || !cadastroCompleto(cliente)) return 0;
  return lotesValidos(lotes, cliente.id, hoje).reduce((s, l) => s + l.restanteCentavos, 0);
}

/** Cashback que vence em até `dias` dias (DaniPets cbVencendo). */
export function cashbackVencendo(lotes: readonly LoteCashback[], cliente: ClienteDoSaldo, hoje: string, dias: number): number {
  if (!cadastroCompleto(cliente)) return 0;
  const limite = somarDias(hoje, dias);
  return lotesValidos(lotes, cliente.id, hoje)
    .filter((l) => l.venceEm <= limite)
    .reduce((s, l) => s + l.restanteCentavos, 0);
}

/** O próximo vencimento e quanto vence nesse dia (DaniPets cbProxVenc). */
export function proximoVencimento(lotes: readonly LoteCashback[], cliente: ClienteDoSaldo, hoje: string): { venceEm: string; valorCentavos: number } | null {
  if (!cadastroCompleto(cliente)) return null;
  const validos = lotesValidos(lotes, cliente.id, hoje);
  if (!validos.length) return null;
  const venceEm = validos[0]!.venceEm;
  return { venceEm, valorCentavos: validos.filter((l) => l.venceEm === venceEm).reduce((s, l) => s + l.restanteCentavos, 0) };
}

/** Cashback que venceu sem ser usado (DaniPets cbVencido). */
export function cashbackVencido(lotes: readonly LoteCashback[], clienteId: string, hoje: string): number {
  return lotes.filter((l) => l.clienteId === clienteId && l.restanteCentavos > 0 && l.venceEm < hoje).reduce((s, l) => s + l.restanteCentavos, 0);
}

// ------------------------------------------------------------------ gerar, usar e devolver

/** Formas que geram cashback: o que entrou de verdade (cashback, vale-troca e fiado não geram). */
export const FORMAS_QUE_GERAM_CASHBACK: readonly FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito'];

/** Quanto da venda gera cashback: o pago em dinheiro, Pix ou cartão. */
export const baseDoCashback = (pagamentos: readonly Pagamento[]): number =>
  pagamentos.filter((p) => FORMAS_QUE_GERAM_CASHBACK.includes(p.forma)).reduce((s, p) => s + p.valorCentavos, 0);

/** X% da base, arredondado ao centavo (o % tem até 2 casas: a conta é feita em inteiros). */
export const valorDoCashback = (baseCentavos: number, percentual: number): number => Math.round((baseCentavos * Math.round(percentual * 100)) / 10_000);

interface QuemQuando {
  dia: string;
  em: string;
  por: Operador;
  novoId: () => string;
}

/**
 * O cashback que a compra gera (DaniPets cbGerar). null = não gera: sem cliente, cadastro incompleto, cashback
 * desligado (0%) ou valor abaixo de 1 centavo.
 */
export function gerarCashback(
  venda: Pick<Venda, 'id' | 'numero' | 'pagamentos'>,
  cliente: ClienteDoSaldo | null | undefined,
  regras: RegrasDaLoja['cashback'],
  ctx: QuemQuando,
): LoteCashback | null {
  if (!cliente || !cadastroCompleto(cliente) || !(regras.percentual > 0)) return null;
  const valor = valorDoCashback(baseDoCashback(venda.pagamentos), regras.percentual);
  if (valor < 1) return null;
  return {
    id: ctx.novoId(),
    clienteId: cliente.id,
    tipo: 'compra',
    dia: ctx.dia,
    valorCentavos: valor,
    restanteCentavos: valor,
    venceEm: somarDias(ctx.dia, regras.validadeDias),
    percentual: regras.percentual,
    origem: `Compra ${formatarNumeroVenda(venda.numero)}`,
    vendaId: venda.id,
    vendaNumero: venda.numero,
    criadoEm: ctx.em,
    por: ctx.por,
  };
}

/** Tira `valor` dos lotes, na ordem dada; devolve a lista nova (sem alterar a recebida) e o que saiu de cada lote. */
function tirarDosLotes(todos: readonly LoteCashback[], ordem: readonly LoteCashback[], valor: number): { lotes: LoteCashback[]; usados: { id: string; valorCentavos: number }[]; resto: number } {
  let resto = valor;
  const usados: { id: string; valorCentavos: number }[] = [];
  const tirar = new Map<string, number>();
  for (const l of ordem) {
    if (resto <= 0) break;
    const u = Math.min(l.restanteCentavos, resto);
    if (u <= 0) continue;
    tirar.set(l.id, u);
    usados.push({ id: l.id, valorCentavos: u });
    resto -= u;
  }
  return { lotes: todos.map((l) => (tirar.has(l.id) ? { ...l, restanteCentavos: l.restanteCentavos - tirar.get(l.id)! } : l)), usados, resto };
}

/** Usa o cashback numa compra: tira primeiro do lote que vence antes (DaniPets cbConsumir). */
export function consumirCashback(
  lotes: readonly LoteCashback[],
  cliente: ClienteDoSaldo,
  valorCentavos: number,
  hoje: string,
): Resultado<{ lotes: LoteCashback[]; usados: { id: string; valorCentavos: number }[] }> {
  const saldo = saldoCashback(lotes, cliente, hoje);
  if (valorCentavos > saldo) {
    return { ok: false, erros: [{ campo: 'pagamentos', mensagem: `O cashback disponível de ${cliente.nome} é ${formatarCentavos(saldo)}.` }] };
  }
  const r = tirarDosLotes(lotes, lotesValidos(lotes, cliente.id, hoje), valorCentavos);
  return { ok: true, valor: { lotes: r.lotes, usados: r.usados } };
}

/**
 * Cashback usado numa compra devolvida ou cancelada: volta para o cliente como lote novo, com prazo novo
 * (DaniPets cbCreditar). null = nada a devolver.
 */
export function creditarCashback(
  valorCentavos: number,
  ctx: QuemQuando & { clienteId: string; validadeDias: number; origem: string; vendaId: string | null; vendaNumero: number | null },
): LoteCashback | null {
  if (!(valorCentavos > 0)) return null;
  return {
    id: ctx.novoId(),
    clienteId: ctx.clienteId,
    tipo: 'estorno',
    dia: ctx.dia,
    valorCentavos,
    restanteCentavos: valorCentavos,
    venceEm: somarDias(ctx.dia, ctx.validadeDias),
    percentual: null,
    origem: ctx.origem,
    vendaId: ctx.vendaId,
    vendaNumero: ctx.vendaNumero,
    criadoEm: ctx.em,
    por: ctx.por,
  };
}

/**
 * Quanto do cashback gerado pela compra a devolução tira (DaniPets registerReturn): na proporção do valor
 * devolvido; a devolução que completa a venda leva o que falta. Sem `devolvidoAgora` (cancelamento): tudo o que falta.
 */
export function cashbackARetirar(
  venda: Pick<Venda, 'totalCentavos' | 'cashbackGeradoCentavos' | 'cashbackRetiradoCentavos'>,
  devolvidoAntesCentavos = 0,
  devolvidoAgoraCentavos: number | null = null,
): number {
  const gerado = venda.cashbackGeradoCentavos ?? 0;
  const falta = Math.max(0, gerado - (venda.cashbackRetiradoCentavos ?? 0));
  if (falta === 0 || devolvidoAgoraCentavos === null || venda.totalCentavos <= 0) return falta;
  const fim = devolvidoAntesCentavos + devolvidoAgoraCentavos >= venda.totalCentavos;
  const valor = fim ? falta : Math.round((gerado * devolvidoAgoraCentavos) / venda.totalCentavos);
  return Math.max(0, Math.min(valor, falta));
}

/**
 * Retira o cashback que a compra gerou (DaniPets cbRetirarDaVenda): primeiro do lote da própria compra (mesmo
 * vencido), depois dos outros lotes válidos do cliente. O que não deu para tirar (já usado ou vencido) volta em
 * `naoRecuperadoCentavos`.
 */
export function retirarCashbackDaVenda(
  lotes: readonly LoteCashback[],
  venda: { id: string; clienteId: string },
  valorCentavos: number,
  hoje: string,
): { lotes: LoteCashback[]; usados: { id: string; valorCentavos: number }[]; tiradoCentavos: number; naoRecuperadoCentavos: number } {
  if (!(valorCentavos > 0)) return { lotes: [...lotes], usados: [], tiradoCentavos: 0, naoRecuperadoCentavos: 0 };
  const proprios = lotes.filter((l) => l.vendaId === venda.id && l.tipo === 'compra' && l.restanteCentavos > 0);
  const outros = lotes
    .filter((l) => l.clienteId === venda.clienteId && l.vendaId !== venda.id && l.restanteCentavos > 0 && l.venceEm >= hoje)
    .sort((a, b) => a.venceEm.localeCompare(b.venceEm) || a.dia.localeCompare(b.dia));
  const r = tirarDosLotes(lotes, [...proprios, ...outros], valorCentavos);
  return { lotes: r.lotes, usados: r.usados, tiradoCentavos: valorCentavos - r.resto, naoRecuperadoCentavos: r.resto };
}

/** Exclusão dos dados (LGPD): o cliente perde o cashback que sobrou, válido ou vencido (DaniPets cliAnonimizar). */
export function zerarCashbackDoCliente(
  lotes: readonly LoteCashback[],
  clienteId: string,
): { lotes: LoteCashback[]; usados: { id: string; valorCentavos: number }[]; valorCentavos: number } {
  const sobra = lotes.filter((l) => l.clienteId === clienteId && l.restanteCentavos > 0);
  const usados = sobra.map((l) => ({ id: l.id, valorCentavos: l.restanteCentavos }));
  return {
    lotes: lotes.map((l) => (l.clienteId === clienteId && l.restanteCentavos > 0 ? { ...l, restanteCentavos: 0 } : l)),
    usados,
    valorCentavos: usados.reduce((s, u) => s + u.valorCentavos, 0),
  };
}

// ------------------------------------------------------------------ cupom de retorno

/**
 * O cupom de retorno que vale hoje (DaniPets cupomAtivo): cadastro completo, cupom ligado nas regras (mais de 0%),
 * ainda não usado e no prazo.
 */
export function cupomAtivo(cupons: readonly CupomRetorno[], cliente: ClienteDoSaldo | null | undefined, hoje: string, regras: Pick<RegrasDaLoja['retorno'], 'cupomPct'>): CupomRetorno | null {
  if (!cliente || !cadastroCompleto(cliente) || !(regras.cupomPct > 0)) return null;
  return cupons.find((k) => k.clienteId === cliente.id && !k.uso && k.venceEm >= hoje && k.pct > 0) ?? null;
}

export interface ContatoRegistrado {
  contato: ContatoCliente;
  /** O cupom da mensagem de retorno (o que o cliente já tinha, se ainda valia, ou um novo). */
  cupom: CupomRetorno | null;
  cupomNovo: boolean;
}

/**
 * Registra o lembrete (DaniPets registrarContato). Só a mensagem de RETORNO enviada pelo WhatsApp dá cupom;
 * se o cliente já tem um cupom valendo, a mensagem fala desse mesmo.
 */
export function registrarContato(
  cliente: ClienteDoSaldo,
  tipo: TipoContato,
  canal: CanalContato,
  ctx: QuemQuando & { cupons: readonly CupomRetorno[]; regras: Pick<RegrasDaLoja['retorno'], 'cupomPct' | 'cupomValidadeDias'> },
): ContatoRegistrado {
  const contato: ContatoCliente = { id: ctx.novoId(), clienteId: cliente.id, tipo, canal, dia: ctx.dia, criadoEm: ctx.em, por: ctx.por, cupomId: null };
  let cupom: CupomRetorno | null = null;
  let cupomNovo = false;
  if (tipo === 'retorno' && canal === 'whatsapp' && cadastroCompleto(cliente) && ctx.regras.cupomPct > 0) {
    cupom = cupomAtivo(ctx.cupons, cliente, ctx.dia, ctx.regras);
    if (!cupom) {
      cupom = { id: ctx.novoId(), clienteId: cliente.id, pct: ctx.regras.cupomPct, dia: ctx.dia, venceEm: somarDias(ctx.dia, ctx.regras.cupomValidadeDias), uso: null, contatoId: contato.id };
      cupomNovo = true;
    }
    contato.cupomId = cupom.id;
  }
  return { contato, cupom, cupomNovo };
}

// ------------------------------------------------------------------ mensagens

/** Pode receber ofertas e lembretes: tem WhatsApp, telefone válido e autorizou (DaniPets podeMensagem). */
export const podeReceberMensagem = (c: Pick<Cliente, 'ativo' | 'telefone' | 'whatsapp' | 'autorizaMensagens'>): boolean =>
  c.ativo && temWhatsapp(c) && telefoneValido(c.telefone) && Boolean(c.autorizaMensagens);

/** O lembrete de pagamento do fiado só precisa do WhatsApp (é sobre a conta do cliente, não oferta). */
export const podeReceberCobranca = (c: Pick<Cliente, 'ativo' | 'telefone' | 'whatsapp'>): boolean => c.ativo && temWhatsapp(c) && telefoneValido(c.telefone);

/** Por que o botão do WhatsApp está desligado (null = pode mandar). */
export function motivoSemMensagem(c: Pick<Cliente, 'ativo' | 'telefone' | 'whatsapp' | 'autorizaMensagens'>, tipo: TipoContato): string | null {
  if (!c.ativo) return 'Cliente desativado.';
  if (!temWhatsapp(c) || !telefoneValido(c.telefone)) return 'O cliente não tem WhatsApp no cadastro.';
  if (tipo !== 'cobranca' && !c.autorizaMensagens) return 'O cliente não autorizou mensagens da loja pelo WhatsApp.';
  return null;
}

export interface DadosDaMensagem {
  nomeLoja: string;
  cliente: Pick<Cliente, 'nome'>;
  hoje: string;
  regras: Pick<RegrasDaLoja, 'retorno' | 'mensagens'>;
  /** Retorno: dia da última compra. */
  ultimaCompraDia?: string | null;
  /** Cashback: o próximo vencimento. */
  proximoVencimento?: { venceEm: string; valorCentavos: number } | null;
  /** Cobrança: quanto deve e quando vence a compra mais antiga em aberto. */
  devendoCentavos?: number;
  vencimentoFiado?: string | null;
  /** Retorno: o cupom que o cliente já tem (a validade da mensagem é a dele). */
  cupom?: Pick<CupomRetorno, 'pct' | 'venceEm'> | null;
}

/** A mensagem pronta para o cliente (DaniPets cliMensagem). */
export function mensagemDoCliente(tipo: TipoContato, d: DadosDaMensagem): string {
  const pct = d.cupom?.pct ?? d.regras.retorno.cupomPct;
  const valores: Record<string, string> = {
    nome: primeiroNome(d.cliente.nome),
    loja: d.nomeLoja,
    dias: d.ultimaCompraDia ? String(diasEntre(d.ultimaCompraDia, d.hoje)) : '',
    desconto: String(Math.round(pct * 100) / 100).replace('.', ','),
    validade:
      tipo === 'retorno'
        ? dataBr(d.cupom?.venceEm ?? somarDias(d.hoje, d.regras.retorno.cupomValidadeDias))
        : d.proximoVencimento
          ? dataBr(d.proximoVencimento.venceEm)
          : '',
    valor: tipo === 'cashback' ? dinheiroTexto(d.proximoVencimento?.valorCentavos ?? 0) : dinheiroTexto(d.devendoCentavos ?? 0),
    vencimento: d.vencimentoFiado ? dataBr(d.vencimentoFiado) : '',
  };
  return preencherModelo(d.regras.mensagens[tipo], valores);
}

/** Link que abre o WhatsApp com a mensagem pronta (o Brasil é o 55). */
export const linkWhatsapp = (telefone: string, texto: string): string => `https://wa.me/55${soDigitos(telefone)}?text=${encodeURIComponent(texto)}`;

// ------------------------------------------------------------------ lista de retorno e resultado

export interface ItemRetorno {
  clienteId: string;
  diasSemComprar: number;
  ultimaCompraDia: string;
}

export interface ItemCashbackVencendo {
  clienteId: string;
  venceEm: string;
  valorCentavos: number;
}

export interface ForaDoRetorno {
  clienteId: string;
  motivo: string;
}

export interface AnaliseRetorno {
  /** Sem comprar há N dias ou mais (de quem está há mais tempo para quem está há menos). */
  retorno: ItemRetorno[];
  /** Cashback vencendo (do que vence antes para o que vence depois). */
  cashback: ItemCashbackVencendo[];
  /** Ficaram de fora hoje: já lembrados, adiados ou "não incomodar". */
  fora: ForaDoRetorno[];
}

/** Quem lembrar hoje (DaniPets cliAnaliseRetorno). `ultimaCompra`: dia da última compra (finalizada) de cada cliente. */
export function analisarRetorno(entrada: {
  clientes: readonly ClienteDaFidelidade[];
  ultimaCompra: ReadonlyMap<string, string>;
  lotes: readonly LoteCashback[];
  contatos: readonly ContatoCliente[];
  cupons: readonly CupomRetorno[];
  regras: Pick<RegrasDaLoja, 'cashback' | 'retorno'>;
  hoje: string;
}): AnaliseRetorno {
  const { hoje, regras } = entrada;
  const retorno: ItemRetorno[] = [];
  const cashback: ItemCashbackVencendo[] = [];
  const fora: ForaDoRetorno[] = [];
  const recentes = (clienteId: string, tipo: TipoContato) =>
    entrada.contatos.filter((k) => k.clienteId === clienteId && k.tipo === tipo).sort((a, b) => b.dia.localeCompare(a.dia) || b.criadoEm.localeCompare(a.criadoEm));
  for (const c of entrada.clientes) {
    if (!c.ativo) continue;
    const ultima = entrada.ultimaCompra.get(c.id) ?? null;
    const sumido = ultima !== null && cadastroCompleto(c) && diasEntre(ultima, hoje) >= regras.retorno.diasSemComprar;
    const vencendo = cashbackVencendo(entrada.lotes, c, hoje, regras.cashback.avisoDias) > 0;
    if (!sumido && !vencendo) continue;
    if (c.naoIncomodar) {
      fora.push({ clienteId: c.id, motivo: 'Pediu para não receber lembretes' });
      continue;
    }
    if (c.lembreteAdiadoAte && c.lembreteAdiadoAte > hoje) {
      fora.push({ clienteId: c.id, motivo: `Adiado até ${dataBr(c.lembreteAdiadoAte)}` });
      continue;
    }
    if (sumido) {
      // um lembrete por ciclo: depois da última compra, só uma vez
      const k = recentes(c.id, 'retorno').find((x) => x.dia >= ultima!);
      if (k) {
        const cupom = k.cupomId ? entrada.cupons.find((x) => x.id === k.cupomId) : undefined;
        fora.push({ clienteId: c.id, motivo: `Já lembrado em ${dataBr(k.dia)}${cupom ? ` (cupom até ${dataBr(cupom.venceEm)})` : ''}` });
      } else retorno.push({ clienteId: c.id, diasSemComprar: diasEntre(ultima!, hoje), ultimaCompraDia: ultima! });
    }
    if (vencendo) {
      const k = recentes(c.id, 'cashback').find((x) => diasEntre(x.dia, hoje) < Math.max(regras.cashback.avisoDias, 1));
      if (k) fora.push({ clienteId: c.id, motivo: `Cashback já avisado em ${dataBr(k.dia)}` });
      else {
        const pv = proximoVencimento(entrada.lotes, c, hoje)!;
        cashback.push({ clienteId: c.id, venceEm: pv.venceEm, valorCentavos: pv.valorCentavos });
      }
    }
  }
  retorno.sort((a, b) => b.diasSemComprar - a.diasSemComprar);
  cashback.sort((a, b) => a.venceEm.localeCompare(b.venceEm));
  return { retorno, cashback, fora };
}

export type SituacaoLembrete = 'voltou' | 'nao_voltou' | 'aguardando';

export interface LinhaResultadoLembrete {
  contato: ContatoCliente;
  /** A primeira compra em até 15 dias depois do lembrete. */
  voltou: { dia: string; vendaNumero: number } | null;
  situacao: SituacaoLembrete;
}

export interface ResultadoDosLembretes {
  linhas: LinhaResultadoLembrete[];
  enviados: number;
  voltaram: number;
  /** % dos lembretes em que o cliente voltou (0 sem lembretes). */
  taxaPct: number;
}

/** Resultado dos lembretes de retorno (DaniPets cliResultadoRetorno): voltou em até 15 dias? */
export function resultadoDosLembretes(
  contatos: readonly ContatoCliente[],
  compras: readonly { clienteId: string; dia: string; vendaNumero: number }[],
  hoje: string,
): ResultadoDosLembretes {
  const ks = contatos.filter((k) => k.tipo === 'retorno').sort((a, b) => b.dia.localeCompare(a.dia) || b.criadoEm.localeCompare(a.criadoEm));
  const linhas = ks.map((k): LinhaResultadoLembrete => {
    const v = compras
      .filter((x) => x.clienteId === k.clienteId && x.dia >= k.dia && diasEntre(k.dia, x.dia) <= DIAS_PARA_VOLTAR)
      .sort((a, b) => a.dia.localeCompare(b.dia) || a.vendaNumero - b.vendaNumero)[0];
    return {
      contato: k,
      voltou: v ? { dia: v.dia, vendaNumero: v.vendaNumero } : null,
      situacao: v ? 'voltou' : diasEntre(k.dia, hoje) > DIAS_PARA_VOLTAR ? 'nao_voltou' : 'aguardando',
    };
  });
  const voltaram = linhas.filter((l) => l.voltou).length;
  return { linhas, enviados: ks.length, voltaram, taxaPct: ks.length ? Math.round((voltaram / ks.length) * 100) : 0 };
}

// ------------------------------------------------------------------ regulamento

/** O regulamento para deixar na loja (DaniPets cliRegulamento), com o nome e as regras da loja. */
export function regulamentoDoPrograma(nomeLoja: string, regras: Pick<RegrasDaLoja, 'cashback'>): string {
  const { percentual, validadeDias } = regras.cashback;
  const ganho =
    percentual > 0
      ? `2. A cada compra, o cliente recebe ${pctTexto(percentual)} do valor pago como cashback.`
      : '2. No momento, as compras não geram cashback.';
  return [
    `Programa de cashback ${nomeLoja}`,
    '',
    '1. Participa quem se cadastra com nome, telefone e CPF. A participação é voluntária.',
    ganho,
    `3. O cashback pode ser usado em compras na loja em até ${plural(validadeDias, 'dia', 'dias')} a partir da data da compra. Depois desse prazo, ele vence.`,
    '4. Não há valor mínimo de compra nem limite de uso por compra.',
    '5. A parte da compra paga com cashback, vale-troca ou fiado não gera cashback.',
    '6. Em devoluções e cancelamentos, o cashback daquela compra é retirado.',
    '7. O cashback não pode ser trocado por dinheiro.',
    '8. Os dados do cadastro são usados só para o programa e, se o cliente autorizar, para mensagens da loja. O cliente pode pedir a exclusão dos dados quando quiser.',
  ].join('\n');
}

// ------------------------------------------------------------------ extrato do cliente

export interface FidelidadeDoCliente {
  lotes: readonly LoteCashback[];
  usos: readonly UsoCashback[];
  cupons: readonly CupomRetorno[];
  contatos: readonly ContatoCliente[];
}

/** Linhas de cashback, cupom e contatos do extrato (DaniPets cliExtrato). */
export function extratoDaFidelidade(clienteId: string, f: FidelidadeDoCliente, hoje: string): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  for (const l of f.lotes) {
    if (l.clienteId !== clienteId) continue;
    linhas.push({
      dia: l.dia,
      ordem: `${l.criadoEm}3`,
      tipo: 'cashback',
      movimento: l.tipo === 'estorno' ? 'Cashback devolvido' : 'Cashback ganho',
      detalhe: `${l.origem} • usar até ${dataBr(l.venceEm)}`,
      valorCentavos: l.valorCentavos,
      sinal: '+',
      cancelada: false,
    });
    if (l.restanteCentavos > 0 && l.venceEm < hoje) {
      linhas.push({
        dia: somarDias(l.venceEm, 1),
        ordem: '0',
        tipo: 'cashback',
        movimento: 'Cashback vencido',
        detalhe: `Ganho em ${dataBr(l.dia)} e não usado até ${dataBr(l.venceEm)}`,
        valorCentavos: l.restanteCentavos,
        sinal: '−',
        cancelada: false,
      });
    }
  }
  for (const u of f.usos) {
    if (u.clienteId !== clienteId) continue;
    const compra = u.vendaNumero ? formatarNumeroVenda(u.vendaNumero) : '';
    linhas.push({
      dia: u.dia,
      ordem: `${u.criadoEm}2`,
      tipo: 'cashback',
      movimento: u.tipo === 'retirada' ? 'Cashback retirado' : 'Cashback usado',
      detalhe: u.tipo === 'retirada' ? (compra ? `${u.rotulo ?? 'Devolução'} da compra ${compra}` : (u.rotulo ?? 'Retirado')) : `Na compra ${compra}`,
      valorCentavos: u.valorCentavos,
      sinal: '−',
      cancelada: false,
    });
  }
  for (const k of f.cupons) {
    if (k.clienteId !== clienteId) continue;
    const situacao = k.uso ? ` • usado na compra ${formatarNumeroVenda(k.uso.vendaNumero)}` : k.venceEm < hoje ? ' • venceu sem uso' : ' • ainda não usado';
    linhas.push({ dia: k.dia, ordem: '6', tipo: 'contatos', movimento: 'Cupom de retorno', detalhe: `${pctTexto(k.pct)} até ${dataBr(k.venceEm)}${situacao}`, valorCentavos: null, sinal: '', cancelada: false });
  }
  for (const k of f.contatos) {
    if (k.clienteId !== clienteId) continue;
    linhas.push({
      dia: k.dia,
      ordem: `${k.criadoEm}7`,
      tipo: 'contatos',
      movimento: NOME_CONTATO[k.tipo],
      detalhe: `${k.canal === 'whatsapp' ? 'Mensagem pelo WhatsApp' : 'Contato sem mensagem'} • ${k.por.nome}`,
      valorCentavos: null,
      sinal: '',
      cancelada: false,
    });
  }
  return linhas;
}

/** O extrato inteiro do cliente: compras, devoluções, fiado, cashback, cupons e contatos, do mais novo para o mais antigo. */
export function extratoCompletoDoCliente(clienteId: string, vendas: readonly Venda[], recebiveis: readonly Recebivel[], fuso: string, f: FidelidadeDoCliente, hoje: string): LinhaExtrato[] {
  return [...extratoDoCliente(clienteId, vendas, recebiveis, fuso), ...extratoDaFidelidade(clienteId, f, hoje)].sort(
    (a, b) => b.dia.localeCompare(a.dia) || b.ordem.localeCompare(a.ordem),
  );
}
