// apps/web/src/painel/formato.ts — datas e horas sempre no fuso da loja.
import { type Devolucao, formatarCentavos, formatarQuantidade, nomeDoPagamento, type Pagamento, unidadeDe, type Venda } from '@saas/core';

export const horaNoFuso = (iso: string | Date, fuso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });

export const dataNoFuso = (iso: string | Date, fuso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: fuso });

/** "quinta-feira, 13 de novembro" */
export const dataPorExtenso = (quando: Date, fuso: string) =>
  quando.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fuso });

/** "Sábado, 21 de novembro de 2026": o dia AAAA-MM-DD da loja, por extenso (cabeçalho do Caixa do dia). */
export function diaPorExtenso(dia: string): string {
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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

/** "Dinheiro R$ 6,00 + Pix R$ 12,00" (sempre com os valores; no vale-troca, com o código). */
export const pagamentosComValores = (pagamentos: readonly Pagamento[]) => pagamentos.map((p) => `${nomeDoPagamento(p)} ${formatarCentavos(p.valorCentavos)}`).join(' + ');

/** Como o valor da devolução voltou: pelas formas da venda e, se for o caso, o vale-troca emitido (módulo 8). */
export const comoVoltou = (d: Pick<Devolucao, 'estornos' | 'vale'>) =>
  [pagamentosComValores(d.estornos), d.vale ? `vale-troca ${d.vale.codigo} ${formatarCentavos(d.vale.valorCentavos)}` : ''].filter(Boolean).join(' + ') || '—';
