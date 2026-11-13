// apps/web/src/painel/formato.ts — datas e horas sempre no fuso da loja.
import type { Venda } from '@saas/core';

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

/** "2× Petisco Bifinho, 1× Areia" */
export const resumoItens = (venda: Venda) => venda.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ');

export const totalItens = (venda: Venda) => venda.itens.reduce((s, i) => s + i.quantidade, 0);

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
