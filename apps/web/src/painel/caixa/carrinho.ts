// apps/web/src/painel/caixa/carrinho.ts
// O carrinho da Frente de caixa: contas e regras que a tela usa (as mesmas do servidor, para
// avisar antes de enviar). Quem decide de verdade é a API (@saas/core/venda).
import {
  classificarDesconto,
  type FormaPagamento,
  FORMAS_DA_TELA,
  precoComCupom,
  formatarQuantidade,
  LIMITES_VENDA,
  lerQuantidade,
  type NovaVenda,
  type Pagamento,
  type PapelDeLoja,
  QUANTIDADE_MAX,
  type QuemAutoriza,
  quemAutorizaDesconto,
  reaisParaCentavos,
  type UnidadeVenda,
  unidadeDe,
  valorDaQuantidade,
} from '@saas/core';
import type { Produto } from '../../api';

export interface DescontoNaLinha {
  precoFinalCentavos: number;
  motivo: string;
  /** Quem aparece como responsável (a própria pessoa ou quem autorizou). Só para mostrar: o servidor decide. */
  responsavelNome: string;
  /** Autorização dada com senha nesta tela. NÃO é salva: depois de recarregar a página, autoriza de novo. */
  autorizacao: string | null;
}

export interface LinhaCarrinho {
  produtoId: string;
  quantidade: number;
  desconto: DescontoNaLinha | null;
}

/** Cliente identificado (F6). Só o que a tela mostra: o servidor confere no cadastro. */
export interface ClienteNaVenda {
  id: string;
  nome: string;
  /** "***.456.789-**" (o CPF inteiro não fica no carrinho guardado). */
  cpfMascarado: string;
  /** Quanto deve no fiado quando foi identificado (só para mostrar). */
  fiadoEmAbertoCentavos?: number;
  /** Limite de fiado e o que já venceu (só para mostrar; quem confere é o servidor). */
  limiteFiadoCentavos?: number;
  fiadoVencidoCentavos?: number;
  diasVencido?: number;
  /** Cashback para usar hoje e o próximo vencimento (módulo 7; só para mostrar: o servidor confere o saldo). */
  cashbackCentavos?: number;
  /** Saldo dos vales-troca do cliente (módulo 8; só para mostrar). */
  valeCentavos?: number;
  cashbackVencimento?: { venceEm: string; valorCentavos: number } | null;
  /** Cupom de retorno que vale hoje: o desconto entra sozinho nos itens sem desconto manual. */
  cupom?: CupomNaVenda | null;
  /** Nome, telefone e CPF válidos (sem isso: sem cashback, cupom e fiado). */
  completo?: boolean;
}

export interface CupomNaVenda {
  id: string;
  pct: number;
  venceEm: string;
}

/** Vale-troca escolhido para pagar (módulo 8): o saldo é só para mostrar; o servidor confere. */
export interface ValeNoPagamento {
  id: string;
  codigo: string;
  saldoCentavos: number;
}

export interface ParteDividida {
  forma: FormaPagamento;
  valorTexto: string;
}

export interface EstadoPagamento {
  /** false = uma forma só (paga o total); true = pagamento dividido em partes. */
  dividido: boolean;
  /** Forma escolhida (ou a última usada, que já vem marcada na próxima venda, como no DaniPets). */
  forma: FormaPagamento;
  partes: ParteDividida[];
  recebidoTexto: string;
  /** "Usar cashback": o saldo do cliente abate do total (até o total) e a forma escolhida paga o resto. */
  usarCashback?: boolean;
  /** "Usar vale-troca": os vales escolhidos, na ordem em que entraram (cada um abate o que cobre, depois do cashback). */
  vales?: ValeNoPagamento[];
}

export const pagamentoInicial = (forma: FormaPagamento = 'pix'): EstadoPagamento => ({ dividido: false, forma, partes: [], recebidoTexto: '', usarCashback: false, vales: [] });

// ------------------------------------------------------------------ leitura do código
/**
 * "3*7891000100103" ou "3x 0001" = 3 unidades; "1,5*0002" = 1,5 kg (produto vendido por kg); sem
 * multiplicador = 1 unidade ou 1 kg (como no DaniPets). A quantidade sai depois, com a unidade do produto.
 */
export function lerEntrada(texto: string): { multiplicador: string | null; codigo: string } {
  const t = texto.trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
  return m ? { multiplicador: m[1]!, codigo: m[2]!.trim() } : { multiplicador: null, codigo: t };
}

/** O multiplicador lido na unidade do produto: unidades ou gramas. */
export function quantidadeDaEntrada(multiplicador: string | null, unidade: UnidadeVenda): number | { erro: string } {
  if (multiplicador === null) return unidade === 'kg' ? 1000 : 1;
  const q = lerQuantidade(multiplicador, unidade);
  if (q === null || q < 1) {
    return { erro: unidade === 'kg' ? 'Peso inválido: use até 3 casas (ex.: 1,5*código = 1,5 kg).' : 'Este produto é vendido por unidade: use quantidade inteira (ex.: 3*7891000100103).' };
  }
  if (q > QUANTIDADE_MAX[unidade]) {
    return { erro: unidade === 'kg' ? `No máximo ${formatarQuantidade(QUANTIDADE_MAX.kg, 'kg')} de uma vez.` : `No máximo ${QUANTIDADE_MAX.un} unidades de uma vez.` };
  }
  return q;
}

/** Código de barras primeiro; depois o código interno (só produtos ativos). */
export function acharPorCodigo(produtos: readonly Produto[], codigo: string): Produto | null {
  const c = codigo.trim();
  if (!c) return null;
  return produtos.find((p) => p.ativo && p.codigoBarras === c) ?? produtos.find((p) => p.ativo && p.codigoInterno === c) ?? null;
}

// ------------------------------------------------------------------ contas
/**
 * O cupom de retorno vale nesta linha? Só nos itens sem desconto manual e quando ele dá desconto de pelo menos
 * um centavo (DaniPets syncCoupon). O desconto manual tira o cupom do item; tirar o desconto manual devolve o cupom.
 */
export const cupomNaLinha = (l: LinhaCarrinho, p: Produto, cupom: CupomNaVenda | null | undefined): cupom is CupomNaVenda =>
  Boolean(cupom && !l.desconto && precoComCupom(p.precoCentavos, cupom.pct) < p.precoCentavos);

export const precoDaLinha = (l: LinhaCarrinho, p: Produto, cupom?: CupomNaVenda | null) =>
  l.desconto ? l.desconto.precoFinalCentavos : cupomNaLinha(l, p, cupom) ? precoComCupom(p.precoCentavos, cupom.pct) : p.precoCentavos;

export function totaisDoCarrinho(linhas: readonly LinhaCarrinho[], porId: ReadonlyMap<string, Produto>, cupom?: CupomNaVenda | null) {
  let itens = 0;
  let total = 0;
  let desconto = 0;
  for (const l of linhas) {
    const p = porId.get(l.produtoId);
    if (!p) continue;
    const u = unidadeDe(p.unidade);
    itens += u === 'kg' ? 1 : l.quantidade; // no kg, cada produto conta como um item
    const cobrado = valorDaQuantidade(precoDaLinha(l, p, cupom), l.quantidade, u);
    total += cobrado;
    desconto += valorDaQuantidade(p.precoCentavos, l.quantidade, u) - cobrado;
  }
  return { itens, produtos: linhas.length, totalCentavos: total, descontoCentavos: desconto };
}

/** Quem precisa autorizar o desconto desta linha para quem está operando (null = ninguém). `limitePct` = regra da loja. */
export function autorizacaoNecessaria(l: LinhaCarrinho, p: Produto, papel: PapelDeLoja, limitePct?: number): QuemAutoriza | null {
  if (!l.desconto) return null;
  return quemAutorizaDesconto(classificarDesconto(p.precoCentavos, l.desconto.precoFinalCentavos, limitePct).tipo, papel);
}

/** 1250 -> "12,50" (para preencher campos). */
export function centavosParaTexto(c: number): string {
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
}

export interface ContaPagamento {
  pagamentos: Pagamento[];
  /** Quanto falta (positivo) ou sobra (negativo) no pagamento dividido. 0 = fecha. */
  faltaCentavos: number;
  /** Alguma parte com valor que não dá para ler. */
  invalido: boolean;
  /** Parte em dinheiro (para o troco). */
  dinheiroCentavos: number;
  /** Valor recebido em dinheiro, lido do campo (null = vazio ou inválido). */
  recebidoCentavos: number | null;
  /** Cashback que abate do total (0 sem "Usar cashback"). */
  cashbackCentavos: number;
  /** O que cada vale-troca abate (só os que abatem alguma coisa). */
  valesAplicados: { id: string; codigo: string; valorCentavos: number }[];
  /** Cashback + vales: o crédito do cliente que abate do total. */
  creditosCentavos: number;
  /** O que o cliente paga depois dos créditos (as formas de pagamento valem para este valor). */
  aPagarCentavos: number;
}

/**
 * As partes do pagamento (DaniPets syncPays, V9.3.1): os créditos do cliente abatem do total pelo que cobrem —
 * primeiro o cashback (que vence), depois cada vale-troca, na ordem em que entraram — e a forma escolhida paga o
 * resto; no pagamento dividido, as partes digitadas pagam o resto.
 */
export function contaDoPagamento(estado: EstadoPagamento, totalCentavos: number, cashbackDisponivelCentavos = 0): ContaPagamento {
  const cashback = estado.usarCashback ? Math.max(0, Math.min(cashbackDisponivelCentavos, totalCentavos)) : 0;
  let restante = totalCentavos - cashback;
  const valesAplicados: ContaPagamento['valesAplicados'] = [];
  for (const v of estado.vales ?? []) {
    const usa = Math.max(0, Math.min(v.saldoCentavos, restante));
    if (usa <= 0) continue;
    valesAplicados.push({ id: v.id, codigo: v.codigo, valorCentavos: usa });
    restante -= usa;
  }
  const aPagar = restante;
  const pagamentos: Pagamento[] = [
    ...(cashback > 0 ? [{ forma: 'cashback' as const, valorCentavos: cashback }] : []),
    ...valesAplicados.map((v) => ({ forma: 'vale' as const, valorCentavos: v.valorCentavos, valeId: v.id })),
  ];
  let invalido = false;
  let pagoNasFormas = 0;
  if (!estado.dividido) {
    if (aPagar > 0) pagamentos.push({ forma: estado.forma, valorCentavos: aPagar });
    pagoNasFormas = aPagar;
  } else if (aPagar > 0) {
    // se o cashback cobre tudo, as partes digitadas não valem (a tela nem mostra as formas)
    for (const parte of estado.partes) {
      if (parte.valorTexto.trim() === '') continue;
      const v = reaisParaCentavos(parte.valorTexto);
      if (v === null) invalido = true;
      else if (v > 0) {
        pagamentos.push({ forma: parte.forma, valorCentavos: v });
        pagoNasFormas += v;
      }
    }
  }
  const dinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valorCentavos, 0);
  const recebido = estado.recebidoTexto.trim() === '' ? null : reaisParaCentavos(estado.recebidoTexto);
  return {
    pagamentos,
    faltaCentavos: aPagar - pagoNasFormas,
    invalido,
    dinheiroCentavos: dinheiro,
    recebidoCentavos: recebido,
    cashbackCentavos: cashback,
    valesAplicados,
    creditosCentavos: totalCentavos - aPagar,
    aPagarCentavos: aPagar,
  };
}

/**
 * O pedido que vai para a API: só produto, quantidade, desconto pedido (ou o id do cupom de retorno),
 * pagamento e o id do cliente. Com `porId`, os itens sem desconto manual levam o cupom do cliente.
 */
export function montarPedido(linhas: readonly LinhaCarrinho[], conta: ContaPagamento, cliente: ClienteNaVenda | null = null, porId?: ReadonlyMap<string, Produto>): NovaVenda {
  return {
    ...(cliente ? { clienteId: cliente.id } : {}),
    itens: linhas.map((l) => {
      const p = porId?.get(l.produtoId);
      return {
        produtoId: l.produtoId,
        quantidade: l.quantidade,
        desconto: l.desconto ? { precoFinalCentavos: l.desconto.precoFinalCentavos, motivo: l.desconto.motivo, autorizacao: l.desconto.autorizacao } : null,
        ...(p && cliente?.cupom && cupomNaLinha(l, p, cliente.cupom) ? { cupom: cliente.cupom.id } : {}),
      };
    }),
    pagamentos: conta.pagamentos,
    recebidoDinheiroCentavos: conta.dinheiroCentavos > 0 ? conta.recebidoCentavos : null,
  };
}

/** Quanto ainda dá para pôr no carrinho, olhando o estoque e o que já está nele. */
export function disponivelParaVenda(saldos: ReadonlyMap<string, number>, linhas: readonly LinhaCarrinho[], produtoId: string): number {
  const noCarrinho = linhas.find((l) => l.produtoId === produtoId)?.quantidade ?? 0;
  return Math.max(0, (saldos.get(produtoId) ?? 0) - noCarrinho);
}

/**
 * Atalhos para o valor recebido em dinheiro: as próximas quantias "redondas" acima do valor a pagar
 * (múltiplos de R$ 5, R$ 10, R$ 50 e R$ 100), até 3. Ex.: R$ 32,40 -> R$ 35, R$ 40 e R$ 50.
 */
export function sugestoesDeDinheiro(valorCentavos: number): number[] {
  if (valorCentavos <= 0) return [];
  const acima = [500, 1000, 5000, 10_000].map((nota) => (Math.floor(valorCentavos / nota) + 1) * nota);
  return [...new Set(acima)].sort((a, b) => a - b).slice(0, 3);
}

/** Próxima forma ainda não usada no pagamento dividido (ou a primeira). O fiado nunca vem sozinho: é escolhido. */
export function proximaForma(usadas: readonly FormaPagamento[]): FormaPagamento {
  return FORMAS_DA_TELA.find((f) => f !== 'fiado' && !usadas.includes(f)) ?? FORMAS_DA_TELA[0]!;
}

/** O pagamento usa fiado (na forma única ou numa das partes)? */
export const usaFiado = (p: EstadoPagamento): boolean => (p.dividido ? p.partes.some((x) => x.forma === 'fiado') : p.forma === 'fiado');

/**
 * Tira o fiado do pagamento (quando a venda fica sem cliente): forma única volta para Pix; no dividido,
 * as partes no fiado saem e, se sobrar uma só, volta a ser uma forma.
 */
export function semFiado(p: EstadoPagamento): EstadoPagamento {
  if (!p.dividido) return p.forma === 'fiado' ? { ...p, forma: 'pix' } : p;
  const partes = p.partes.filter((x) => x.forma !== 'fiado');
  return partes.length <= 1 ? { ...p, dividido: false, forma: partes[0]?.forma ?? 'pix', partes: [] } : { ...p, partes };
}

/** Venda sem cliente: sem fiado e sem cashback (os dois são da conta do cliente). O vale-troca fica: vale para quem tem o código. */
export const semCreditoDoCliente = (p: EstadoPagamento): EstadoPagamento => ({ ...semFiado(p), usarCashback: false });

// ------------------------------------------------------------------ carrinho salvo (por pessoa)
// Como no DaniPets: cada pessoa tem o próprio carrinho guardado no navegador e ele sobrevive a
// recarregar a página. As autorizações dadas com senha NÃO são guardadas.
interface CarrinhoSalvo {
  v: 1;
  linhas: LinhaCarrinho[];
  pagamento: EstadoPagamento;
  cliente?: ClienteNaVenda | null;
}

const textoCurto = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function lerCarrinhoSalvo(chave: string): { linhas: LinhaCarrinho[]; pagamento: EstadoPagamento; cliente: ClienteNaVenda | null } | null {
  try {
    const bruto = JSON.parse(localStorage.getItem(chave) ?? 'null') as CarrinhoSalvo | null;
    if (!bruto || bruto.v !== 1 || !Array.isArray(bruto.linhas)) return null;
    const linhas = bruto.linhas
      .filter((l) => typeof l?.produtoId === 'string' && Number.isInteger(l.quantidade) && l.quantidade > 0)
      .map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade, desconto: l.desconto ? { ...l.desconto, autorizacao: null } : null }));
    const p = bruto.pagamento;
    const forma = FORMAS_DA_TELA.includes(p?.forma) ? p.forma : 'pix';
    const partes = Array.isArray(p?.partes) ? p.partes.filter((x) => FORMAS_DA_TELA.includes(x?.forma)).map((x) => ({ forma: x.forma, valorTexto: String(x.valorTexto ?? '') })) : [];
    const c = bruto.cliente;
    const dia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const venc = c?.cashbackVencimento;
    const k = c?.cupom;
    const cliente =
      c && textoCurto(c.id, LIMITES_VENDA.produtoIdMax) && textoCurto(c.nome, 120) && typeof c.cpfMascarado === 'string' && c.cpfMascarado.length <= 20
        ? {
            id: c.id,
            nome: c.nome,
            cpfMascarado: c.cpfMascarado,
            ...(Number.isSafeInteger(c.fiadoEmAbertoCentavos) ? { fiadoEmAbertoCentavos: c.fiadoEmAbertoCentavos } : {}),
            ...(Number.isSafeInteger(c.limiteFiadoCentavos) ? { limiteFiadoCentavos: c.limiteFiadoCentavos } : {}),
            ...(Number.isSafeInteger(c.fiadoVencidoCentavos) ? { fiadoVencidoCentavos: c.fiadoVencidoCentavos } : {}),
            ...(Number.isSafeInteger(c.diasVencido) ? { diasVencido: c.diasVencido } : {}),
            ...(Number.isSafeInteger(c.cashbackCentavos) ? { cashbackCentavos: c.cashbackCentavos } : {}),
            ...(venc && dia(venc.venceEm) && Number.isSafeInteger(venc.valorCentavos) ? { cashbackVencimento: { venceEm: venc.venceEm, valorCentavos: venc.valorCentavos } } : {}),
            ...(k && textoCurto(k.id, LIMITES_VENDA.autorizacaoMax) && typeof k.pct === 'number' && k.pct > 0 && k.pct <= 50 && dia(k.venceEm) ? { cupom: { id: k.id, pct: k.pct, venceEm: k.venceEm } } : {}),
            ...(typeof c.completo === 'boolean' ? { completo: c.completo } : {}),
            ...(Number.isSafeInteger(c.valeCentavos) ? { valeCentavos: c.valeCentavos } : {}),
          }
        : null;
    // vales-troca escolhidos: o código no formato VT-0001-ABC, cada um uma vez (o servidor confere o saldo)
    const vales: ValeNoPagamento[] = [];
    for (const x of Array.isArray(p?.vales) ? p.vales.slice(0, LIMITES_VENDA.pagamentosMax) : []) {
      if (textoCurto(x?.id, LIMITES_VENDA.autorizacaoMax) && typeof x.codigo === 'string' && /^VT-\d{4,}-[A-Z0-9]{3}$/.test(x.codigo) && Number.isSafeInteger(x.saldoCentavos) && x.saldoCentavos > 0 && !vales.some((v) => v.id === x.id)) {
        vales.push({ id: x.id, codigo: x.codigo, saldoCentavos: x.saldoCentavos });
      }
    }
    const pagamento: EstadoPagamento = {
      dividido: Boolean(p?.dividido) && partes.length > 1,
      forma,
      partes,
      recebidoTexto: String(p?.recebidoTexto ?? ''),
      usarCashback: p?.usarCashback === true,
      vales,
    };
    // sem cliente, o fiado e o cashback guardados não valem
    return { linhas, pagamento: cliente ? pagamento : semCreditoDoCliente(pagamento), cliente };
  } catch {
    return null;
  }
}

export function salvarCarrinho(chave: string, linhas: readonly LinhaCarrinho[], pagamento: EstadoPagamento, cliente: ClienteNaVenda | null = null): void {
  const dado: CarrinhoSalvo = {
    v: 1,
    linhas: linhas.map((l) => ({ ...l, desconto: l.desconto ? { ...l.desconto, autorizacao: null } : null })),
    pagamento,
    cliente,
  };
  try {
    localStorage.setItem(chave, JSON.stringify(dado));
  } catch {
    /* sem localStorage: o carrinho só não sobrevive a recarregar a página */
  }
}
