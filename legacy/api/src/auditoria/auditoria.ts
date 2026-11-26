// apps/api/src/auditoria/auditoria.ts
// Histórico de quem fez o quê (docs/decisoes/0001-auditoria.md). Gravado na MESMA transação da ação:
// se a ação falhar, o registro some junto; se o registro falhar, a ação não acontece.
// Sem dado pessoal em `detalhes` (só ids, papéis, códigos, nomes de campos): os nomes das pessoas são
// lidos da tabela usuarios na hora de mostrar, e por isso a exclusão LGPD também vale para o histórico.
import type { AcaoAuditoria } from '@saas/core';
import type { Tx } from '../banco/banco.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AlvoAuditoria {
  tipo: 'usuario' | 'produto';
  id: string;
}

export async function registrarAuditoria(
  tx: Tx,
  lojaId: string,
  usuarioId: string | null,
  acao: AcaoAuditoria,
  alvo: AlvoAuditoria | null = null,
  detalhes: Record<string, string | number | boolean | string[] | null> = {},
): Promise<void> {
  await tx.auditoria.create({
    data: {
      lojaId,
      usuarioId,
      acao,
      alvoTipo: alvo?.tipo ?? null,
      alvoId: alvo?.id ?? null,
      detalhes: detalhes as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
}
