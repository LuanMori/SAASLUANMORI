// apps/api/src/auth/decoradores.ts
// Marcas que a guarda global lê. Toda rota nasce protegida (exige sessão); estas marcas só AFROUXAM
// de propósito (@Publico, @ComSenhaProvisoria) ou APERTAM (@Exige).
import { SetMetadata } from '@nestjs/common';
import type { Permissao } from '@saas/core';

export const PUBLICO = 'saas:publico';
/** Rota sem login: tela de entrada, login e /saude. */
export const Publico = () => SetMetadata(PUBLICO, true);

export const PERMISSAO = 'saas:permissao';
/** Só quem tem a permissão (matriz única de @saas/core/permissoes). */
export const Exige = (permissao: Permissao) => SetMetadata(PERMISSAO, permissao);

export const LIBERA_PROVISORIA = 'saas:senha-provisoria-ok';
/** Rota liberada mesmo antes de trocar a senha provisória (ver a sessão, trocar a senha, sair). */
export const ComSenhaProvisoria = () => SetMetadata(LIBERA_PROVISORIA, true);
