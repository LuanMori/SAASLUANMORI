// apps/api/src/auth/guarda-autenticacao.ts
// Guarda GLOBAL (APP_GUARD): toda rota nasce protegida. Fluxo:
//   1. Rota @Publico()?                                     sim -> passa
//   2. Cookie de sessão válido no banco (SessaoService.validar)? não -> 401 (e apaga o cookie)
//   3. Monta req.contexto { lojaId, usuarioId, papel, ... } — a loja vem SÓ da sessão
//   4. Senha provisória e a rota não é @ComSenhaProvisoria()? -> 403 "Crie a sua senha"
//   5. Rota com @Exige(permissao) e o papel não pode?       -> 403 com quem pode
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mensagemSemPermissao, type Permissao, pode } from '@saas/core';
import type { Response } from 'express';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import type { RequisicaoAutenticada } from './contexto.js';
import { cookieApagado, lerCookies, nomeDoCookie } from './cookies.js';
import { LIBERA_PROVISORIA, PERMISSAO, PUBLICO } from './decoradores.js';
import { SessaoService } from './sessao.service.js';

@Injectable()
export class GuardaAutenticacao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessao: SessaoService,
    @Inject(AMBIENTE) private readonly amb: Ambiente,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, alvos)) return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest<RequisicaoAutenticada>();
    const tinhaCookie = lerCookies(req.headers.cookie).has(nomeDoCookie(this.amb));
    const contexto = await this.sessao.validar(req);
    if (!contexto) {
      if (tinhaCookie) http.getResponse<Response>().setHeader('Set-Cookie', cookieApagado(this.amb));
      throw new UnauthorizedException(
        tinhaCookie
          ? { mensagem: 'Sua sessão terminou. Entre de novo.', codigo: 'sessao_encerrada' }
          : { mensagem: 'Faça login para continuar.', codigo: 'sem_sessao' },
      );
    }
    req.contexto = contexto;

    if (contexto.senhaProvisoria && !this.reflector.getAllAndOverride<boolean>(LIBERA_PROVISORIA, alvos)) {
      throw new ForbiddenException({ mensagem: 'Crie a sua senha antes de continuar.', codigo: 'senha_provisoria' });
    }
    const permissao = this.reflector.getAllAndOverride<Permissao | undefined>(PERMISSAO, alvos);
    if (permissao && !pode(contexto, permissao)) {
      throw new ForbiddenException({ mensagem: mensagemSemPermissao(permissao), codigo: 'sem_permissao' });
    }
    return true;
  }
}
