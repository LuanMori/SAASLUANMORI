// apps/web/src/painel/caixa/carrinho.ts
// O carrinho da Frente de caixa: contas e regras que a tela usa (as mesmas do servidor, para
// avisar antes de enviar). Quem decide de verdade é a API (@saas/core/venda).
import {
  classificarDesconto,
  type FormaPagamento,
  FORMAS_PAGAMENTO,
  LIMITES_VENDA,
  type NovaVenda,
  type Pagamento,
  type PapelDeLoja,
  type QuemAutoriza,
  quemAutorizaDesconto,
  reaisParaCentavos,
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
}

export const pagamentoInicial = (forma: FormaPagamento = 'pix'): EstadoPagamento => ({ dividido: false, forma, partes: [], recebidoTexto: '' });

// ------------------------------------------------------------------ leitura do código
/** "3*7891000100103" ou "3x 0001" = 3 unidades; sem multiplicador = 1 (como no DaniPets). */
export function lerEntrada(texto: string): { quantidade: number; codigo: string } | { erro: string } {
  const t = texto.trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
  if (!m) return { quantidade: 1, codigo: t };
  const quantidade = Number(m[1]!.replace(',', '.'));
  if (!Number.isInteger(quantidade) || quantidade < 1) return { erro: 'Os produtos são vendidos por unidade: use quantidade inteira (ex.: 3*7891000100103).' };
  if (quantidade > LIMITES_VENDA.quantidadeMax) return { erro: `No máximo ${LIMITES_VENDA.quantidadeMax} unidades de uma vez.` };
  return { quantidade, codigo: m[2]!.trim() };
}

/** Código de barras primeiro; depois o código interno (só produtos ativos). */
export function acharPorCodigo(produtos: readonly Produto[], codigo: string): Produto | null {
  const c = codigo.trim();
  if (!c) return null;
  return produtos.find((p) => p.ativo && p.codigoBarras === c) ?? produtos.find((p) => p.ativo && p.codigoInterno === c) ?? null;
}

// ------------------------------------------------------------------ contas
export const precoDaLinha = (l: LinhaCarrinho, p: Produto) => (l.desconto ? l.desconto.precoFinalCentavos : p.precoCentavos);

export function totaisDoCarrinho(linhas: readonly LinhaCarrinho[], porId: ReadonlyMap<string, Produto>) {
  let itens = 0;
  let total = 0;
  let desconto = 0;
  for (const l of linhas) {
    const p = porId.get(l.produtoId);
    if (!p) continue;
    itens += l.quantidade;
    total += precoDaLinha(l, p) * l.quantidade;
    desconto += (p.precoCentavos - precoDaLinha(l, p)) * l.quantidade;
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
}

export function contaDoPagamento(estado: EstadoPagamento, totalCentavos: number): ContaPagamento {
  let pagamentos: Pagamento[];
  let invalido = false;
  if (!estado.dividido) {
    pagamentos = totalCentavos > 0 ? [{ forma: estado.forma, valorCentavos: totalCentavos }] : [];
  } else {
    pagamentos = [];
    for (const parte of estado.partes) {
      if (parte.valorTexto.trim() === '') continue;
      const v = reaisParaCentavos(parte.valorTexto);
      if (v === null) invalido = true;
      else if (v > 0) pagamentos.push({ forma: parte.forma, valorCentavos: v });
    }
  }
  const pago = pagamentos.reduce((s, p) => s + p.valorCentavos, 0);
  const dinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valorCentavos, 0);
  const recebido = estado.recebidoTexto.trim() === '' ? null : reaisParaCentavos(estado.recebidoTexto);
  return { pagamentos, faltaCentavos: totalCentavos - pago, invalido, dinheiroCentavos: dinheiro, recebidoCentavos: recebido };
}

/** O pedido que vai para a API: só produto, quantidade, desconto pedido, pagamento e o id do cliente. */
export function montarPedido(linhas: readonly LinhaCarrinho[], conta: ContaPagamento, cliente: ClienteNaVenda | null = null): NovaVenda {
  return {
    ...(cliente ? { clienteId: cliente.id } : {}),
    itens: linhas.map((l) => ({
      produtoId: l.produtoId,
      quantidade: l.quantidade,
      desconto: l.desconto ? { precoFinalCentavos: l.desconto.precoFinalCentavos, motivo: l.desconto.motivo, autorizacao: l.desconto.autorizacao } : null,
    })),
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
  return FORMAS_PAGAMENTO.find((f) => f !== 'fiado' && !usadas.includes(f)) ?? FORMAS_PAGAMENTO[0];
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
    const forma = FORMAS_PAGAMENTO.includes(p?.forma) ? p.forma : 'pix';
    const partes = Array.isArray(p?.partes) ? p.partes.filter((x) => FORMAS_PAGAMENTO.includes(x?.forma)).map((x) => ({ forma: x.forma, valorTexto: String(x.valorTexto ?? '') })) : [];
    const c = bruto.cliente;
    const cliente =
      c && textoCurto(c.id, LIMITES_VENDA.produtoIdMax) && textoCurto(c.nome, 120) && typeof c.cpfMascarado === 'string' && c.cpfMascarado.length <= 20
        ? {
            id: c.id,
            nome: c.nome,
            cpfMascarado: c.cpfMascarado,
            ...(Number.isSafeInteger(c.fiadoEmAbertoCentavos) ? { fiadoEmAbertoCentavos: c.fiadoEmAbertoCentavos } : {}),
          }
        : null;
    const pagamento: EstadoPagamento = { dividido: Boolean(p?.dividido) && partes.length > 1, forma, partes, recebidoTexto: String(p?.recebidoTexto ?? '') };
    // sem cliente, o fiado guardado não vale
    return { linhas, pagamento: cliente ? pagamento : semFiado(pagamento), cliente };
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
