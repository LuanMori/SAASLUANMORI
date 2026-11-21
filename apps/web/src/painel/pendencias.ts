// apps/web/src/painel/pendencias.ts
// Pendências do card da Visão geral (formato do DaniPets V9.3.3).
//
// ⚠ AINDA A DEFINIR: quais pendências entram aqui está em aberto. A lista de
// sugestões e o que cada uma precisa estão em docs/PENDENCIAS.md. A única já
// definida (Luan, 21/11/2026) é a #16: caixa fechado sozinho à meia-noite, "Deseja
// verificar?" (regrasPendencias.ts → pendenciasDoCaixa, calculada na Visão geral).
// Sem ela (ex.: Vendedor, ou servidor sem o caixa), o card diz que nada foi definido.
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

/** Rodapé do card vazio enquanto as outras pendências não forem escolhidas (docs/PENDENCIAS.md). */
export const NOTA_PENDENCIAS_A_DEFINIR =
  'Por enquanto, só o aviso do caixa fechado sozinho à meia-noite está ligado. Os outros (estoque, validade, contas…) ainda vamos escolher.';
