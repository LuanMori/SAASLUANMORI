// apps/web/src/painel/formato.ts — datas e horas sempre no fuso da loja.
import { formatarCentavos, formatarQuantidade, NOME_FORMA_PAGAMENTO, type Pagamento, unidadeDe, type Venda } from '@saas/core';

export const horaNoFuso = (iso: string | Date, fuso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });

export const dataNoFuso = (iso: string | Date, fuso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: fuso });

/** "quinta-feira, 13 de novembro" */
export const dataPorExtenso = (quando: Date, fuso: string) =>
  quando.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fuso });

export function saudacao(quando: Date, fuso: string): string {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: fuso }).format(quando));
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Quantidade de um item vendido: "2×" (unidades) ou "1,25 kg" (a granel). */
export const quantidadeDoItem = (i: { quantidade: number; unidade?: 'un' | 'kg' }) =>
  unidadeDe(i.unidade) === 'kg' ? formatarQuantidade(i.quantidade, 'kg') : `${i.quantidade}×`;

/** "2× Petisco Bifinho, 1,25 kg Ração a granel" */
export const resumoItens = (venda: Venda) => venda.itens.map((i) => `${quantidadeDoItem(i)} ${i.nome}`).join(', ');

/** Itens da venda: as unidades, e cada produto vendido por kg conta como um item. */
export const totalItens = (venda: Venda) => venda.itens.reduce((s, i) => s + (unidadeDe(i.unidade) === 'kg' ? 1 : i.quantidade), 0);

/** "6 produtos vendidos", "6 produtos vendidos + 2,5 kg" ou "2,5 kg vendidos" (DaniPets: unidades + kg). */
export function produtosVendidos(unidades: number, gramas: number): string {
  if (unidades === 0 && gramas > 0) return `${formatarQuantidade(gramas, 'kg')} vendidos`;
  return `${unidades} ${unidades === 1 ? 'produto vendido' : 'produtos vendidos'}${gramas > 0 ? ` + ${formatarQuantidade(gramas, 'kg')}` : ''}`;
}

/** "6", "6 + 2,5 kg" ou "2,5 kg" (cartão "Itens vendidos" dos Relatórios). */
export const itensVendidos = (unidades: number, gramas: number) =>
  gramas === 0 ? String(unidades) : unidades === 0 ? formatarQuantidade(gramas, 'kg') : `${unidades} + ${formatarQuantidade(gramas, 'kg')}`;

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Dinheiro R$ 6,00 + Pix R$ 12,00" (sempre com os valores). */
export const pagamentosComValores = (pagamentos: readonly Pagamento[]) =>
  pagamentos.map((p) => `${NOME_FORMA_PAGAMENTO[p.forma]} ${formatarCentavos(p.valorCentavos)}`).join(' + ');
