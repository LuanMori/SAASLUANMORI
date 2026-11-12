// apps/api/src/auth/usuarios.ts
// Só entra quem o dono cadastrou (decisão do Luan, 11/11/2026). Ser membro da
// Organization no Auth0 não basta: a pessoa também precisa estar na tabela
// usuarios DESTA loja. A API só lê esta tabela (sem INSERT/UPDATE no banco).
import type { Papel } from '@saas/core';
import type { Tx } from '../banco/banco.service.js';

export interface UsuarioResumo {
  id: string;
  papel: Papel;
  ativo: boolean;
}

export function buscarUsuario(tx: Tx, lojaId: string, auth0Sub: string): Promise<UsuarioResumo | null> {
  return tx.usuario.findUnique({
    where: { lojaId_auth0Sub: { lojaId, auth0Sub } },
    select: { id: true, papel: true, ativo: true },
  });
}
