// apps/api/src/auth/contexto.ts
// Contexto da requisição, montado SÓ pela guarda a partir da sessão conferida no banco. Controllers e
// services leem a loja e a pessoa daqui — nunca do corpo, da URL ou de cabeçalho escolhido pela tela.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PapelDeLoja } from '@saas/core';
import type { Request } from 'express';

export interface ContextoRequisicao {
  lojaId: string;
  lojaNome: string;
  lojaSubdominio: string;
  usuarioId: string;
  papel: PapelDeLoja;
  nome: string;
  /** Login. */
  usuario: string;
  sessaoId: string;
  senhaProvisoria: boolean;
}

export interface RequisicaoAutenticada extends Request {
  contexto?: ContextoRequisicao;
  /** Id da requisição (logs). */
  idRequisicao?: string;
}

export const Contexto = createParamDecorator((_dados: unknown, ctx: ExecutionContext): ContextoRequisicao => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  if (!req.contexto) {
    // Só acontece se alguém ler o contexto numa rota @Publico: erro de programação.
    throw new Error('Contexto de autenticação ausente');
  }
  return req.contexto;
});
