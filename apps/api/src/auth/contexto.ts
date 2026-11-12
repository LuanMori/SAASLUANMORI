// apps/api/src/auth/contexto.ts
// Contexto da requisição, montado SÓ pela guarda de autenticação a partir do
// token validado. Controllers e services leem a loja daqui — nunca do corpo,
// da URL ou de header escolhido pelo cliente.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Papel } from '@saas/core';

export interface ContextoRequisicao {
  lojaId: string;
  usuarioId: string;
  papel: Papel;
  auth0Sub: string;
}

export interface RequisicaoAutenticada extends Request {
  contexto?: ContextoRequisicao;
}

export const Contexto = createParamDecorator((_dados: unknown, ctx: ExecutionContext): ContextoRequisicao => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  if (!req.contexto) {
    // Só acontece se alguém registrar rota fora da guarda global: erro de programação.
    throw new Error('Contexto de autenticação ausente');
  }
  return req.contexto;
});
