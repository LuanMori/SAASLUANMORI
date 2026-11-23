// packages/core/src/papeis.ts
// Papéis previstos no briefing (Fase 5.7 + super_admin). Referência DaniPets:
// Dono e Administrador têm tudo liberado; Vendedor vende, opera caixa, cuida de
// clientes e cadastra produto novo.
// Pedido do Luan (23/11/2026):
//   - PERSONALIZADO: a pessoa tem só as funções que o Dono (ou o Administrador) escolher para ela;
//   - ADM. SUP (super_admin): o usuário mestre do sistema, presente em todas as lojas vendidas, com acesso a tudo,
//     mas invisível: não aparece na lista de usuários da loja e, no histórico e nas vendas, aparece como "Suporte".
//     Só ele cadastra o Dono (na implantação) e o Administrador. As permissões ficam em permissoes.ts.

export const PAPEIS = ['super_admin', 'dono', 'administrador', 'vendedor', 'personalizado'] as const;

export type Papel = (typeof PAPEIS)[number];

/** Papéis de quem trabalha numa loja (o super_admin não pertence a loja nenhuma). */
export const PAPEIS_DE_LOJA = ['dono', 'administrador', 'vendedor', 'personalizado'] as const satisfies readonly Papel[];

export type PapelDeLoja = (typeof PAPEIS_DE_LOJA)[number];

/** Quem opera numa loja: as pessoas da loja ou o Adm. Sup (que entra em qualquer loja). */
export type PapelNaLoja = PapelDeLoja | 'super_admin';

/** Como a tela chama cada papel. */
export const NOME_PAPEL: Record<PapelDeLoja, string> = { dono: 'Dono', administrador: 'Administrador', vendedor: 'Vendedor', personalizado: 'Personalizado' };

/** O nome do papel do usuário mestre (só ele vê, no próprio acesso). */
export const NOME_ADM_SUP = 'Adm. Sup';
/** Como o Adm. Sup aparece para a loja: no histórico, nas vendas e em tudo o que ele fizer. */
export const NOME_SUPORTE = 'Suporte';

/** "Dono", "Personalizado"... e "Adm. Sup" para o usuário mestre. */
export const nomeDoPapel = (papel: PapelNaLoja): string => (papel === 'super_admin' ? NOME_ADM_SUP : NOME_PAPEL[papel]);

/** O usuário mestre (Adm. Sup). */
export const ehAdmSup = (papel: unknown): papel is 'super_admin' => papel === 'super_admin';

/**
 * Dono, Administrador ou o Adm. Sup (os "gestores" do DaniPets). Para liberar uma AÇÃO, use `pode(quem, permissao)`
 * de permissoes.ts: lá fica a matriz de quem pode o quê.
 */
export const ehGestor = (papel: string | null | undefined): boolean => papel === 'dono' || papel === 'administrador' || papel === 'super_admin';

/** Só o Dono (ex.: pendências que só ele vê). O Adm. Sup vê tudo, então também. */
export const ehDono = (papel: string | null | undefined): boolean => papel === 'dono' || papel === 'super_admin';

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

export function ehPapelDeLoja(valor: unknown): valor is PapelDeLoja {
  return typeof valor === 'string' && (PAPEIS_DE_LOJA as readonly string[]).includes(valor);
}

export const ehPapelNaLoja = (valor: unknown): valor is PapelNaLoja => ehAdmSup(valor) || ehPapelDeLoja(valor);
