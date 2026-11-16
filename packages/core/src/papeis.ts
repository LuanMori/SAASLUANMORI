// packages/core/src/papeis.ts
// Papéis previstos no briefing (Fase 5.7 + super_admin). Referência DaniPets:
// Dono e Administrador têm tudo liberado; Vendedor vende, opera caixa, cuida de
// clientes e cadastra produto novo. As permissões finas entram nas Fases 3 e 5.7.

export const PAPEIS = ['super_admin', 'dono', 'administrador', 'vendedor'] as const;

export type Papel = (typeof PAPEIS)[number];

/** Papéis de quem trabalha numa loja (o super_admin não pertence a loja nenhuma). */
export const PAPEIS_DE_LOJA = ['dono', 'administrador', 'vendedor'] as const satisfies readonly Papel[];

export type PapelDeLoja = (typeof PAPEIS_DE_LOJA)[number];

/** Como a tela chama cada papel. */
export const NOME_PAPEL: Record<PapelDeLoja, string> = { dono: 'Dono', administrador: 'Administrador', vendedor: 'Vendedor' };

/** Dono e Administrador: tudo liberado (financeiro, relatórios, autorizações, estoque). */
export const ehGestor = (papel: PapelDeLoja): boolean => papel === 'dono' || papel === 'administrador';

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

export function ehPapelDeLoja(valor: unknown): valor is PapelDeLoja {
  return typeof valor === 'string' && (PAPEIS_DE_LOJA as readonly string[]).includes(valor);
}
