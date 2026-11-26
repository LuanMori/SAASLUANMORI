// apps/web/src/painel/pendencias.ts
// Pendências do card da Visão geral (formato do DaniPets V9.3.3).
//
// ⚠ AINDA A DEFINIR: quais pendências entram aqui está em aberto. A lista de
// sugestões e o que cada uma precisa estão em docs/PENDENCIAS.md. Já definidas e
// ligadas pelo Luan: as do CAIXA (#1 caixa de hoje não aberto, #2 dia anterior aberto,
// #3 diferença acima da tolerância — só o Dono — e #16 caixa fechado sozinho,
// "Deseja verificar?"), em regrasPendencias.ts → pendenciasDoCaixa, e as de CLIENTES
// (fiado a vencer, cashback a vencer e promoções exclusivas, 23/11/2026), em
// PendenciasDoInicio.tsx. Sem essas partes no servidor, o card diz que nada foi definido.
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
  /**
   * Botão opcional: leva para a aba onde se resolve (`secao`; some para quem não pode abrir a aba) ou abre uma janela
   * na própria Visão geral (`abrir`, ex.: "Ver lista" das pendências de clientes).
   */
  acao?: { rotulo: string; secao?: IdSecao; abrir?: () => void };
  /** Só Dono e Administrador veem (ex.: contas vencidas), como os avisos de Financeiro no DaniPets. */
  soGestor?: boolean;
  /** Só o Dono vê (ex.: fechamento com diferença acima da tolerância, pendência 3). */
  soDono?: boolean;
}

/** As urgentes primeiro (como no DaniPets); dentro de cada grupo, a ordem de chegada. */
export function ordenarPendencias(lista: readonly Pendencia[]): Pendencia[] {
  const peso = (p: Pendencia) => (p.gravidade === 'alta' ? 0 : 1);
  return lista.map((p, i) => ({ p, i })).sort((a, b) => peso(a.p) - peso(b.p) || a.i - b.i).map(({ p }) => p);
}

/** Rodapé do card vazio enquanto as outras pendências não forem escolhidas (docs/PENDENCIAS.md). */
export const NOTA_PENDENCIAS_A_DEFINIR =
  'Por enquanto, estão ligados os avisos do caixa e dos clientes (fiado a vencer, cashback a vencer e promoções). Os outros (estoque, validade, contas…) ainda vamos escolher.';
