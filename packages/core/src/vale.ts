// packages/core/src/vale.ts
// VALE-TROCA (Fase 2, módulo 8), com as regras do DaniPets V9.3.3 (DEV-03, DEV-10, PDV-09, FIN-09):
//   - na devolução, o valor pode voltar como VALE-TROCA (código VT-0001-ABC) em vez de pelas mesmas formas da
//     venda; o fiado em aberto da venda é abatido antes e só o resto vira vale (venda.ts calcularDevolucao). O vale
//     fica no nome do cliente da venda, de outro cliente escolhido, ou sem cliente;
//   - o vale é crédito do cliente na loja: não mexe em conta nenhuma até ser usado. Vale para quem estiver com o
//     código, com ou sem cliente identificado na Frente de caixa;
//   - na Frente de caixa, cada vale abate do total (depois do cashback) pelo que cobre e a forma escolhida paga o
//     resto; a sobra fica no vale para a próxima compra;
//   - o cancelamento ou a devolução de uma compra paga com vale devolve o valor para o mesmo vale;
//   - LGPD: o vale continua valendo para quem tem o código; só o nome do cliente sai.
// Valores em centavos; dias AAAA-MM-DD no fuso da loja.
import type { LinhaExtrato } from './cliente';
import { dataBr } from './compra';
import { formatarCentavos } from './dinheiro';
import type { Resultado } from './resultado';
import { type ClienteDaVenda, formatarNumeroVenda, type Operador, type Pagamento } from './venda';

/** Letras e números do sufixo do código, sem os que se confundem (0 e O, 1 e I): DaniPets randomSuffix. */
export const ALFABETO_CODIGO_VALE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Um uso do vale: numa compra (positivo) ou a volta de um valor numa devolução ou cancelamento (negativo). */
export interface UsoVale {
  tipo: 'venda' | 'estorno';
  vendaId: string;
  vendaNumero: number;
  valorCentavos: number;
  dia: string;
  /** ISO 8601. */
  em: string;
  por: Operador;
  /** No estorno: "Cancelamento" ou "Devolução nº 3". */
  rotulo: string | null;
}

export interface ValeTroca {
  id: string;
  /** Sequencial na loja: 1, 2, 3… */
  numero: number;
  /** "VT-0001-ABC". */
  codigo: string;
  valorCentavos: number;
  saldoCentavos: number;
  situacao: 'aberto' | 'usado';
  /** De quem é o vale (o nome como estava no cadastro). null = sem cliente. */
  cliente: ClienteDaVenda | null;
  /** A devolução que gerou o vale. */
  origem: { vendaId: string; vendaNumero: number; devolucaoNumero: number };
  dia: string;
  criadoEm: string;
  por: Operador;
  usos: UsoVale[];
}

/** "VT-0001-ABC": o número do vale e 3 letras sorteadas (o sorteio vem de fora: crypto.getRandomValues). */
export function codigoDoVale(numero: number, sorteio: ArrayLike<number>): string {
  const sufixo = Array.from({ length: 3 }, (_, i) => ALFABETO_CODIGO_VALE[(sorteio[i] ?? 0) % ALFABETO_CODIGO_VALE.length]).join('');
  return `VT-${String(numero).padStart(4, '0')}-${sufixo}`;
}

/** O código como a pessoa digitou ("vt-0001-abc ") no formato guardado ("VT-0001-ABC"). */
export const normalizarCodigoVale = (texto: string): string => texto.normalize('NFC').trim().toUpperCase().replace(/\s+/g, '');

export const proximoNumeroDoVale = (vales: readonly Pick<ValeTroca, 'numero'>[]): number => vales.reduce((m, v) => Math.max(m, v.numero), 0) + 1;

/** O vale novo da devolução (DaniPets issueVoucher). */
export function emitirVale(
  valorCentavos: number,
  ctx: { id: string; numero: number; sorteio: ArrayLike<number>; cliente: ClienteDaVenda | null; origem: ValeTroca['origem']; dia: string; em: string; por: Operador },
): ValeTroca {
  return {
    id: ctx.id,
    numero: ctx.numero,
    codigo: codigoDoVale(ctx.numero, ctx.sorteio),
    valorCentavos,
    saldoCentavos: valorCentavos,
    situacao: 'aberto',
    cliente: ctx.cliente,
    origem: ctx.origem,
    dia: ctx.dia,
    criadoEm: ctx.em,
    por: ctx.por,
    usos: [],
  };
}

interface DaVenda {
  vendaId: string;
  vendaNumero: number;
  dia: string;
  em: string;
  por: Operador;
}

/** Usa o vale numa compra (DaniPets useVoucher): o saldo diminui; zerado, o vale fica "usado". */
export function usarVale(vale: ValeTroca, valorCentavos: number, ctx: DaVenda): Resultado<ValeTroca> {
  if (vale.situacao !== 'aberto' || vale.saldoCentavos <= 0) return { ok: false, erros: [{ campo: 'pagamentos', mensagem: 'Vale-troca inválido ou já usado. Remova o vale do pagamento.' }] };
  if (!(valorCentavos > 0) || valorCentavos > vale.saldoCentavos) {
    return { ok: false, erros: [{ campo: 'pagamentos', mensagem: `O vale ${vale.codigo} tem saldo de ${formatarCentavos(vale.saldoCentavos)}.` }] };
  }
  const saldo = vale.saldoCentavos - valorCentavos;
  return {
    ok: true,
    valor: { ...vale, saldoCentavos: saldo, situacao: saldo > 0 ? 'aberto' : 'usado', usos: [...vale.usos, { tipo: 'venda', ...ctx, valorCentavos, rotulo: null }] },
  };
}

/** O valor de uma compra paga com o vale volta para o mesmo vale (DaniPets refundPayment VOUCHER). */
export function devolverNoVale(vale: ValeTroca, valorCentavos: number, ctx: DaVenda & { rotulo: string }): ValeTroca {
  return {
    ...vale,
    saldoCentavos: vale.saldoCentavos + valorCentavos,
    situacao: 'aberto',
    usos: [...vale.usos, { tipo: 'estorno', vendaId: ctx.vendaId, vendaNumero: ctx.vendaNumero, valorCentavos: -valorCentavos, dia: ctx.dia, em: ctx.em, por: ctx.por, rotulo: ctx.rotulo }],
  };
}

/** Quanto do vale foi usado nesta venda e ainda não voltou. */
export const usadoNaVenda = (vale: Pick<ValeTroca, 'usos'>, vendaId: string): number =>
  vale.usos.filter((u) => u.vendaId === vendaId).reduce((s, u) => s + u.valorCentavos, 0);

/**
 * Reparte o que volta pela forma "vale-troca" entre os vales usados na venda, na ordem do pagamento, sem passar do
 * que cada vale pagou nesta venda (o DaniPets podia devolver demais num vale quando a venda usava dois).
 */
export function repartirNosVales(
  vales: readonly ValeTroca[],
  pagamentos: readonly Pagamento[],
  vendaId: string,
  valorCentavos: number,
): Resultado<{ valeId: string; codigo: string; valorCentavos: number }[]> {
  let resto = valorCentavos;
  const partes: { valeId: string; codigo: string; valorCentavos: number }[] = [];
  const vistos = new Set<string>();
  for (const p of pagamentos) {
    if (resto <= 0) break;
    if (p.forma !== 'vale' || !p.valeId || vistos.has(p.valeId)) continue;
    vistos.add(p.valeId);
    const vale = vales.find((v) => v.id === p.valeId);
    if (!vale) continue;
    const parte = Math.min(resto, usadoNaVenda(vale, vendaId));
    if (parte <= 0) continue;
    partes.push({ valeId: vale.id, codigo: vale.codigo, valorCentavos: parte });
    resto -= parte;
  }
  if (resto > 0) return { ok: false, erros: [{ campo: 'estornos', mensagem: 'O vale-troca usado nesta venda não foi encontrado.' }] };
  return { ok: true, valor: partes };
}

/** Vales com saldo, do mais novo para o mais antigo (a lista de escolha da Frente de caixa). */
export const valesEmAberto = <T extends Pick<ValeTroca, 'situacao' | 'saldoCentavos' | 'criadoEm'>>(vales: readonly T[]): T[] =>
  vales.filter((v) => v.situacao === 'aberto' && v.saldoCentavos > 0).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

/** Os vales com saldo de um cliente e quanto somam (DaniPets cliVales e saldoVale). */
export function valesDoCliente(vales: readonly ValeTroca[], clienteId: string): { saldoCentavos: number; abertos: ValeTroca[] } {
  const abertos = valesEmAberto(vales.filter((v) => v.cliente?.id === clienteId));
  return { saldoCentavos: abertos.reduce((s, v) => s + v.saldoCentavos, 0), abertos };
}

/** Linhas de vale-troca do extrato do cliente (DaniPets cliExtrato): emitido, usado e devolvido. */
export function extratoDosVales(clienteId: string, vales: readonly ValeTroca[]): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  for (const v of vales) {
    if (v.cliente?.id !== clienteId) continue;
    linhas.push({
      dia: v.dia,
      ordem: `${v.criadoEm}3`,
      tipo: 'vale',
      movimento: `Vale-troca ${v.codigo}`,
      detalhe: `Devolução nº ${v.origem.devolucaoNumero} • compra ${formatarNumeroVenda(v.origem.vendaNumero)}`,
      valorCentavos: v.valorCentavos,
      sinal: '+',
      cancelada: false,
    });
    for (const u of v.usos) {
      linhas.push({
        dia: u.dia,
        ordem: `${u.em}2`,
        tipo: 'vale',
        movimento: u.tipo === 'estorno' ? 'Vale-troca devolvido' : 'Vale-troca usado',
        detalhe: `${v.codigo} • compra ${formatarNumeroVenda(u.vendaNumero)}${u.rotulo ? ` • ${u.rotulo}` : ''}`,
        valorCentavos: Math.abs(u.valorCentavos),
        sinal: u.valorCentavos < 0 ? '+' : '−',
        cancelada: false,
      });
    }
  }
  return linhas;
}

/** "VT-0001-ABC • R$ 30,00 • Maria • 20/11/2026": a linha da escolha do vale na Frente de caixa. */
export const descreverVale = (v: Pick<ValeTroca, 'codigo' | 'saldoCentavos' | 'cliente' | 'dia'>): string =>
  `${v.codigo} • ${formatarCentavos(v.saldoCentavos)}${v.cliente ? ` • ${v.cliente.nome}` : ''} • ${dataBr(v.dia)}`;
