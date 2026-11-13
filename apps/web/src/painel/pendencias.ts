// apps/web/src/painel/pendencias.ts
// Pendências do card da Visão geral (formato do DaniPets V9.3.3).
//
// ⚠ AINDA NÃO DEFINIDAS: quais pendências entram aqui está em aberto. A lista de
// sugestões e o que cada uma precisa estão em docs/PENDENCIAS.md. Enquanto nada
// for definido, a Visão geral recebe `null` e o card diz isso, sem inventar aviso.
//
// Cada pendência definida no futuro vira uma regra que olha os dados da loja
// (caixa, estoque, validade, contas…) e devolve zero ou mais itens deste tipo.
import type { IdSecao } from './menu';

/** alta = precisa resolver já (ícone vermelho); media = atenção (ícone amarelo). */
export type GravidadePendencia = 'alta' | 'media';

export interface Pendencia {
  /** Identificador estável (ex.: "caixa-nao-aberto:2026-11-13"). */
  id: string;
  gravidade: GravidadePendencia;
  texto: string;
  /** Botão opcional que leva para a aba onde se resolve (some para quem não pode abrir a aba). */
  acao?: { rotulo: string; secao: IdSecao };
  /** Só Dono e Administrador veem (ex.: contas vencidas), como os avisos de Financeiro no DaniPets. */
  soGestor?: boolean;
}

/** As urgentes primeiro (como no DaniPets); dentro de cada grupo, a ordem de chegada. */
export function ordenarPendencias(lista: readonly Pendencia[]): Pendencia[] {
  const peso = (p: Pendencia) => (p.gravidade === 'alta' ? 0 : 1);
  return lista.map((p, i) => ({ p, i })).sort((a, b) => peso(a.p) - peso(b.p) || a.i - b.i).map(({ p }) => p);
}
