// packages/core/src/permissoes.ts
// QUEM PODE FAZER O QUÊ, num lugar só (revisão de 18/11/2026, item 4.3).
// Telas, demonstração e servidor perguntam aqui: `pode(quem, 'financeiro')`, com o papel ou com a pessoa (o
// Personalizado tem as funções dele). Ninguém compara papel solto ("papel === 'dono'") para liberar uma ação.
//
// Matriz copiada do DaniPets V9.3.3:
//   - Dono e Administrador: tudo liberado (DaniPets: isManager);
//   - Vendedor: vender, caixa, clientes e cadastrar produto novo (DaniPets: VENDEDOR_PODE);
//   - brinde (preço R$ 0,00) sem senha, exclusão de dados (LGPD) e liberação de lançamento em dia com o caixa
//     já fechado: só o Dono (DaniPets: cliAnonimizar, askDono);
//   - ciência do fechamento com diferença acima da tolerância (pendência 3, pedido do Luan em 22/11/2026) e a
//     baixa do cartão automática ou manual (23/11/2026): só o Dono. As taxas da maquininha: Dono e Administrador.
//   - Personalizado (pedido do Luan, 23/11/2026): só as funções escolhidas para ele, dentre as que se podem dar
//     (PERMISSOES_CONCEDIVEIS: tudo, menos o que é só do Dono e a gestão de usuários);
//   - Adm. Sup (super_admin, o usuário mestre): tudo, em qualquer loja. As ferramentas dele em Dados e backup e restaurar
//     uma cópia de segurança (troca os dados atuais) são só dele (SO_ADM_SUP, pedido do Luan em 25/11/2026).
// Para mudar a regra de um papel, mude só a tabela PODE abaixo (e os testes).
import type { PapelDeLoja } from './papeis';

/** Cada permissão com o texto que aparece em mensagens ("Financeiro: só o Dono ou o Administrador."). */
export const PERMISSOES = {
  vender: 'Vender na Frente de caixa',
  caixa: 'Abrir e fechar o caixa',
  clientes: 'Cadastrar e consultar clientes',
  'clientes.desativar': 'Desativar e reativar cliente',
  'clientes.limite': 'Definir o limite de fiado do cliente',
  'clientes.cpf': 'Ver o CPF completo do cliente',
  'clientes.fiado': 'Ver o fiado de todos os clientes (aba Fiado)',
  'produtos.cadastrar': 'Cadastrar produto novo',
  'produtos.alterar': 'Alterar, inativar e excluir produto',
  'estoque.lancar': 'Lançar entrada, ajuste e estoque mínimo',
  compras: 'Compras',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios e vendas de outros dias',
  dados: 'Dados e backup',
  'dados.restaurar': 'Restaurar uma cópia de segurança (troca os dados atuais da loja)',
  'loja.configurar': 'Alterar os dados e as regras da loja',
  usuarios: 'Cadastrar, alterar e desativar usuários',
  'usuarios.donos': 'Cadastrar e alterar outro Dono, ou dar o papel de Dono',
  'usuarios.excluir_dados': 'Excluir os dados de um usuário desativado (LGPD)',
  'clientes.excluir_dados': 'Excluir os dados de um cliente (LGPD)',
  'desconto.acima_do_limite': 'Dar desconto acima do limite da loja sem pedir senha',
  estorno: 'Cancelar venda e devolver itens sem pedir senha',
  brinde: 'Dar brinde (preço R$ 0,00) sem pedir senha',
  'caixa.retirada': 'Fazer a retirada do dono (gaveta) sem pedir senha',
  'caixa.diferenca': 'Fechar o caixa com diferença acima da tolerância sem pedir senha',
  'caixa.desfazer': 'Desfazer o fechamento do caixa',
  'caixa.ciencia': 'Dar ciência do fechamento com diferença acima da tolerância',
  'financeiro.baixa_cartao': 'Escolher se o cartão entra no banco na hora ou fica a receber',
  'dia_fechado.liberar': 'Liberar lançamento em dia com o caixa já fechado',
  'fiado.liberar': 'Liberar venda no fiado acima do limite ou com fiado vencido',
  'suporte.ferramentas': 'Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção)',
} as const;

export type Permissao = keyof typeof PERMISSOES;

export const LISTA_PERMISSOES = Object.keys(PERMISSOES) as Permissao[];

const TODAS = new Set<Permissao>(LISTA_PERMISSOES);

/** Só o Dono, como no DaniPets. */
const SO_DONO = new Set<Permissao>([
  'brinde',
  'usuarios.donos',
  'usuarios.excluir_dados',
  'clientes.excluir_dados',
  'caixa.ciencia',
  'financeiro.baixa_cartao',
  'dia_fechado.liberar',
  'fiado.liberar',
]);

/**
 * Só o Adm. Sup (o usuário mestre, da nossa empresa; pedido do Luan, 25/11/2026: a aba dele em Dados e backup, para
 * termos acesso mesmo depois de vender, e restaurar uma cópia de segurança, que troca os dados atuais): fica fora do
 * Dono, do Administrador e do Personalizado.
 */
const SO_ADM_SUP = new Set<Permissao>(['dados.restaurar', 'suporte.ferramentas']);

/** O que se pode dar a um Personalizado: tudo, menos o que é só do Dono ou do Adm. Sup e a gestão de usuários. */
export const PERMISSOES_CONCEDIVEIS: readonly Permissao[] = LISTA_PERMISSOES.filter((p) => !SO_DONO.has(p) && !SO_ADM_SUP.has(p) && p !== 'usuarios');
const CONCEDIVEIS = new Set<Permissao>(PERMISSOES_CONCEDIVEIS);
export const ehPermissaoConcedivel = (p: unknown): p is Permissao => typeof p === 'string' && CONCEDIVEIS.has(p as Permissao);

/**
 * O Personalizado tela por tela (pedido do Luan, 24/11/2026: "Personalizado você escolhe o que a pessoa tem acesso").
 * `acesso` abre a tela (é o que o menu pede); os `extras` são o que se faz dentro dela e só valem com o acesso.
 * Sem `acesso`: a tela é de todos (a consulta de Produtos e estoque) ou a função vale em várias telas (as regras da
 * loja). Cada função que se pode dar ao Personalizado está aqui uma vez só (teste).
 */
export interface TelaDoPersonalizado {
  tela: string;
  acesso: Permissao | null;
  extras: readonly Permissao[];
}

export const TELAS_DO_PERSONALIZADO: readonly TelaDoPersonalizado[] = [
  { tela: 'Frente de caixa', acesso: 'vender', extras: ['desconto.acima_do_limite', 'estorno'] },
  { tela: 'Caixa do dia', acesso: 'caixa', extras: ['caixa.retirada', 'caixa.diferenca', 'caixa.desfazer'] },
  { tela: 'Produtos e estoque', acesso: null, extras: ['produtos.cadastrar', 'produtos.alterar', 'estoque.lancar'] },
  { tela: 'Compras', acesso: 'compras', extras: [] },
  { tela: 'Clientes', acesso: 'clientes', extras: ['clientes.desativar', 'clientes.limite', 'clientes.cpf', 'clientes.fiado'] },
  { tela: 'Financeiro', acesso: 'financeiro', extras: [] },
  { tela: 'Relatórios', acesso: 'relatorios', extras: [] },
  { tela: 'Dados e backup', acesso: 'dados', extras: [] },
  { tela: 'Regras da loja', acesso: null, extras: ['loja.configurar'] },
];

/** A tela que um extra pede (o acesso a ela), ou null se a função não depende de tela nenhuma. */
export function telaQueAFuncaoPede(p: Permissao): TelaDoPersonalizado | null {
  return TELAS_DO_PERSONALIZADO.find((t) => t.acesso !== null && t.extras.includes(p)) ?? null;
}

/** Tira os extras que ficaram sem o acesso à tela deles (eles não valeriam), na ordem da lista de permissões. */
export function funcoesCoerentes(lista: readonly Permissao[]): Permissao[] {
  const marcadas = new Set(lista);
  return PERMISSOES_CONCEDIVEIS.filter((p) => {
    if (!marcadas.has(p)) return false;
    const t = telaQueAFuncaoPede(p);
    return !t || marcadas.has(t.acesso!);
  });
}

type PapelDaMatriz = 'super_admin' | 'dono' | 'administrador' | 'vendedor';

/**
 * A matriz. Adm. Sup: tudo. Dono: tudo, menos as ferramentas do Adm. Sup. Administrador: tudo, menos o que é só do
 * Dono ou do Adm. Sup. Vendedor: o do DaniPets.
 */
const PODE: Record<PapelDaMatriz, ReadonlySet<Permissao>> = {
  super_admin: TODAS,
  dono: new Set(LISTA_PERMISSOES.filter((p) => !SO_ADM_SUP.has(p))),
  administrador: new Set(LISTA_PERMISSOES.filter((p) => !SO_DONO.has(p) && !SO_ADM_SUP.has(p))),
  vendedor: new Set<Permissao>(['vender', 'caixa', 'clientes', 'produtos.cadastrar']),
};
const NADA: ReadonlySet<Permissao> = new Set();

/** Quem está fazendo algo: o papel, ou a pessoa com o papel e (no Personalizado) as funções escolhidas para ela. */
export interface Acesso {
  papel: string;
  permissoes?: readonly string[] | null;
}
export type QuemAcessa = string | Acesso | null | undefined;

/**
 * Tudo o que `quem` pode. O Personalizado tem só as funções dele que se podem dar (uma função só do Dono gravada
 * por fora não vale). Papel que não está na matriz (dado alterado por fora) não pode nada (como o DaniPets V9.3.3).
 */
export function permissoesDe(quem: QuemAcessa): ReadonlySet<Permissao> {
  if (!quem) return NADA;
  const papel = typeof quem === 'string' ? quem : quem.papel;
  if (papel === 'personalizado') return new Set((typeof quem === 'string' ? [] : (quem.permissoes ?? [])).filter(ehPermissaoConcedivel));
  return Object.hasOwn(PODE, papel) ? PODE[papel as PapelDaMatriz] : NADA;
}

export function pode(quem: QuemAcessa, permissao: Permissao): boolean {
  return permissoesDe(quem).has(permissao);
}

/** Quem tem a permissão, para escrever a mensagem de recusa: "só o Dono ou o Administrador". */
export function quemPode(permissao: Permissao): PapelDeLoja[] {
  return (['dono', 'administrador', 'vendedor'] as const).filter((p) => PODE[p].has(permissao));
}

const NOME: Record<'dono' | 'administrador' | 'vendedor', string> = { dono: 'o Dono', administrador: 'o Administrador', vendedor: 'o Vendedor' };

/** "Financeiro: só o Dono ou o Administrador." */
export function mensagemSemPermissao(permissao: Permissao): string {
  const papeis = quemPode(permissao).map((p) => NOME[p as keyof typeof NOME]);
  // nenhum papel de loja: é das ferramentas do Adm. Sup
  const lista = papeis.length <= 1 ? (papeis[0] ?? 'o Adm. Sup') : `${papeis.slice(0, -1).join(', ')} ou ${papeis.at(-1)}`;
  return `${PERMISSOES[permissao]}: só ${lista}.`;
}
