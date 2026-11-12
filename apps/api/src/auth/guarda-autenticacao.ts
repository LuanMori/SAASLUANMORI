// apps/api/src/auth/guarda-autenticacao.ts
// Guarda GLOBAL (APP_GUARD): toda rota nasce protegida. Fluxo:
//   1. Bearer token presente?                  não -> 401
//   2. Token válido (assinatura, iss, aud, exp)? não -> 401
//   3. Token tem org_id (login numa loja)?      não -> 403
//   4. org_id corresponde a loja ATIVA?         não -> 403 (mesma mensagem p/ inexistente e inativa)
//   5. Pessoa cadastrada pelo dono NESTA loja?  não -> 403; desativada -> 403
//   6. Monta req.contexto { lojaId, usuarioId, papel, auth0Sub }
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { BancoService } from '../banco/banco.service.js';
import type { RequisicaoAutenticada } from './contexto.js';
import { buscarUsuario } from './usuarios.js';
import { VerificadorJwt } from './verificador-jwt.js';

function extrairBearer(cabecalho: string | undefined): string | null {
  if (!cabecalho) return null;
  const [esquema, token, ...resto] = cabecalho.split(' ');
  if (esquema?.toLowerCase() !== 'bearer' || !token || resto.length > 0) return null;
  return token;
}

@Injectable()
export class GuardaAutenticacao implements CanActivate {
  constructor(
    private readonly verificador: VerificadorJwt,
    private readonly banco: BancoService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();

    const token = extrairBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Faça login para continuar.');

    let identidade;
    try {
      identidade = await this.verificador.verificar(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada. Faça login novamente.');
    }

    if (!identidade.orgId) {
      throw new ForbiddenException('Sua conta não está vinculada a uma loja.');
    }

    const loja = await this.banco.buscarLojaPorOrg(identidade.orgId);
    if (!loja || !loja.ativa) {
      throw new ForbiddenException('Loja não encontrada ou inativa.');
    }

    const usuario = await this.banco.comLoja(loja.id, (tx) => buscarUsuario(tx, loja.id, identidade.sub));
    if (!usuario) {
      throw new ForbiddenException('Seu acesso a esta loja ainda não foi liberado. Peça ao dono da loja para cadastrar você.');
    }
    if (!usuario.ativo) {
      throw new ForbiddenException('Seu acesso a esta loja está desativado.');
    }

    req.contexto = {
      lojaId: loja.id,
      usuarioId: usuario.id,
      papel: usuario.papel,
      auth0Sub: identidade.sub,
    };
    return true;
  }
}
