// apps/api/src/produtos/codigos.ts
// Códigos de produto dentro de uma loja (regras do DaniPets V8.6/V9.2):
//   - código interno é do sistema: maior código interno da loja + 1, com 4 dígitos
//     (0001, 0002, …, 9999, 10000…);
//   - o leitor do PDV aceita os dois códigos, então nenhum código interno pode ser
//     igual a um código de barras da mesma loja, e vice-versa. Se o próximo número
//     já estiver em uso como código de barras, pula para o seguinte.
//
// Concorrência: vários vendedores cadastrando ao mesmo tempo. Toda operação que
// cria ou muda códigos de produto chama travarCodigosDaLoja() primeiro, dentro
// da mesma transação: uma trava do Postgres por loja (pg_advisory_xact_lock),
// solta sozinha no COMMIT/ROLLBACK. Lojas diferentes não esperam umas pelas outras.
import { formatarCodigoInterno } from '@saas/core';
import type { Tx } from '../banco/banco.service.js';

/** Evita laço infinito num cenário absurdo (centenas de códigos de barras curtos em sequência). */
const MAX_TENTATIVAS = 1000;

export async function travarCodigosDaLoja(tx: Tx, lojaId: string): Promise<void> {
  // pg_advisory_xact_lock devolve void; $executeRaw não tenta ler o resultado.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`produtos:codigos:${lojaId}`}, 0))`;
}

/** Produto da loja que já usa `codigo` como código interno OU como código de barras. */
export function produtoComCodigo(tx: Tx, lojaId: string, codigo: string): Promise<{ nome: string } | null> {
  return tx.produto.findFirst({
    where: { lojaId, OR: [{ codigoInterno: codigo }, { codigoBarras: codigo }] },
    select: { nome: true },
  });
}

/**
 * Próximo código interno livre da loja. Exige travarCodigosDaLoja() antes, na
 * mesma transação. `codigoBarrasNovo` = código de barras do produto que está
 * sendo cadastrado (o código interno também não pode ser igual a ele).
 */
export async function proximoCodigoInterno(tx: Tx, lojaId: string, codigoBarrasNovo: string | null): Promise<string> {
  const [linha] = await tx.$queryRaw<{ maior: bigint | null }[]>`
    SELECT max(codigo_interno::bigint) AS maior FROM produtos WHERE loja_id = ${lojaId}::uuid`;
  let numero = Number(linha?.maior ?? 0n) + 1;

  for (let i = 0; i < MAX_TENTATIVAS; i += 1, numero += 1) {
    const candidato = formatarCodigoInterno(numero);
    if (candidato === codigoBarrasNovo) continue;
    if (!(await produtoComCodigo(tx, lojaId, candidato))) return candidato;
  }
  throw new Error('Não foi possível gerar o código interno.');
}
