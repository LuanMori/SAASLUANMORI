// apps/api/src/auth/verificador-jwt.ts
// Valida o access token emitido pelo Auth0 (biblioteca `jose`):
//   - assinatura RS256 com chave pública do JWKS do tenant (nada de HS256/none)
//   - issuer = https://<AUTH0_DOMAIN>/
//   - audience = AUTH0_AUDIENCE (a nossa API)
//   - exp/nbf (com 5s de tolerância de relógio)
// O resolvedor de chave é injetável: em produção busca o JWKS do Auth0
// (com cache); nos testes, um JWKS local. O caminho de verificação é o MESMO.
import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { AMBIENTE, issuerAuth0, type Ambiente } from '../config/ambiente.js';

export const RESOLVER_CHAVE = Symbol('RESOLVER_CHAVE');
export type ResolverChave = JWTVerifyGetKey;

export function criarResolverJwks(jwksUri: string): ResolverChave {
  return createRemoteJWKSet(new URL(jwksUri), {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60 * 1000,
  });
}

export interface Identidade {
  /** ID da pessoa no Auth0 (ex.: auth0|abc123). */
  sub: string;
  /** Organization do Auth0 = loja. Null quando o login não foi feito numa organization. */
  orgId: string | null;
}

export class TokenInvalido extends Error {
  constructor() {
    super('token inválido');
    this.name = 'TokenInvalido';
  }
}

@Injectable()
export class VerificadorJwt {
  constructor(
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
    @Inject(RESOLVER_CHAVE) private readonly resolverChave: ResolverChave,
  ) {}

  async verificar(token: string): Promise<Identidade> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.resolverChave, {
        algorithms: ['RS256'],
        issuer: issuerAuth0(this.ambiente),
        audience: this.ambiente.auth0Audience,
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp'],
      }));
    } catch {
      // O motivo detalhado não sai daqui: nem para o cliente, nem para o log.
      throw new TokenInvalido();
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new TokenInvalido();

    const orgId = typeof payload.org_id === 'string' && payload.org_id !== '' ? payload.org_id : null;
    return { sub: payload.sub, orgId };
  }
}
