// apps/api/src/auth/sessoes.ts
// Peças usadas pelo login e pela tela Usuários, sempre dentro de uma transação de comLoja().
import type { EstadoTentativas } from '@saas/core';
import type { Tx } from '../banco/banco.service.js';

/** Encerra as sessões abertas da pessoa (sair de todos os aparelhos), menos `exceto` (a atual). */
export function encerrarSessoes(tx: Tx, lojaId: string, usuarioId: string, exceto?: string): Promise<{ count: number }> {
  return tx.sessao.updateMany({
    where: { lojaId, usuarioId, encerradaEm: null, ...(exceto ? { NOT: { id: exceto } } : {}) },
    data: { encerradaEm: new Date() },
  });
}

/**
 * Lê a contagem de senhas erradas TRAVANDO a linha (FOR UPDATE) até o fim da transação: duas
 * tentativas ao mesmo tempo (mesmo em cópias diferentes da API) não contam a mesma senha errada uma vez só.
 */
export async function lerTentativasTravando(tx: Tx, usuarioId: string): Promise<EstadoTentativas> {
  const [linha] = await tx.$queryRaw<{ tentativas_erradas: number; bloqueado_ate: Date | null }[]>`
    SELECT tentativas_erradas, bloqueado_ate FROM usuarios WHERE id = ${usuarioId}::uuid FOR UPDATE`;
  return { tentativasErradas: linha?.tentativas_erradas ?? 0, bloqueadoAte: linha?.bloqueado_ate?.toISOString() ?? null };
}

export const paraBanco = (e: EstadoTentativas) => ({
  tentativasErradas: e.tentativasErradas,
  bloqueadoAte: e.bloqueadoAte ? new Date(e.bloqueadoAte) : null,
});
