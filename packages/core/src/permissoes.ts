// packages/core/src/permissoes.ts
// QUEM PODE FAZER O QUÊ, num lugar só (revisão de 18/11/2026, item 4.3).
// Telas, demonstração e servidor perguntam aqui: `pode(papel, 'financeiro')`. Ninguém
// compara papel solto ("papel === 'dono'") para liberar uma ação.
//
// Matriz copiada do DaniPets V9.3.3:
//   - Dono e Administrador: tudo liberado (DaniPets: isManager);
//   - Vendedor: vender, caixa, clientes e cadastrar produto novo (DaniPets: VENDEDOR_PODE);
//   - brinde (preço R$ 0,00) sem senha, exclusão de dados (LGPD) e liberação de lançamento em dia com o caixa
//     já fechado: só o Dono (DaniPets: cliAnonimizar, askDono).
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
  'dia_fechado.liberar': 'Liberar lançamento em dia com o caixa já fechado',
  'fiado.liberar': 'Liberar venda no fiado acima do limite ou com fiado vencido',
} as const;

export type Permissao = keyof typeof PERMISSOES;

export const LISTA_PERMISSOES = Object.keys(PERMISSOES) as Permissao[];

const TODAS = new Set<Permissao>(LISTA_PERMISSOES);

/** Só o Dono, como no DaniPets. */
const SO_DONO = new Set<Permissao>(['brinde', 'usuarios.donos', 'usuarios.excluir_dados', 'clientes.excluir_dados', 'dia_fechado.liberar', 'fiado.liberar']);

/** A matriz. Dono: tudo. Administrador: tudo, menos o que é só do Dono. Vendedor: o do DaniPets. */
const PODE: Record<PapelDeLoja, ReadonlySet<Permissao>> = {
  dono: TODAS,
  administrador: new Set(LISTA_PERMISSOES.filter((p) => !SO_DONO.has(p))),
  vendedor: new Set<Permissao>(['vender', 'caixa', 'clientes', 'produtos.cadastrar']),
};

/** Papel que não está na matriz (dado alterado por fora) não pode nada (como o DaniPets V9.3.3). */
export function pode(papel: PapelDeLoja | string | null | undefined, permissao: Permissao): boolean {
  return Boolean(papel && Object.hasOwn(PODE, papel) && PODE[papel as PapelDeLoja].has(permissao));
}

/** Quem tem a permissão, para escrever a mensagem de recusa: "só o Dono ou o Administrador". */
export function quemPode(permissao: Permissao): PapelDeLoja[] {
  return (Object.keys(PODE) as PapelDeLoja[]).filter((p) => PODE[p].has(permissao));
}

const NOME: Record<PapelDeLoja, string> = { dono: 'o Dono', administrador: 'o Administrador', vendedor: 'o Vendedor' };

/** "Financeiro: só o Dono ou o Administrador." */
export function mensagemSemPermissao(permissao: Permissao): string {
  const papeis = quemPode(permissao).map((p) => NOME[p]);
  const lista = papeis.length <= 1 ? (papeis[0] ?? 'ninguém') : `${papeis.slice(0, -1).join(', ')} ou ${papeis.at(-1)}`;
  return `${PERMISSOES[permissao]}: só ${lista}.`;
}
