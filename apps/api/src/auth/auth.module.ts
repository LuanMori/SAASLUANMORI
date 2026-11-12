// apps/api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { GuardaAutenticacao } from './guarda-autenticacao.js';
import { RESOLVER_CHAVE, VerificadorJwt, criarResolverJwks } from './verificador-jwt.js';

@Module({
  providers: [
    {
      provide: RESOLVER_CHAVE,
      inject: [AMBIENTE],
      useFactory: (amb: Ambiente) => criarResolverJwks(`https://${amb.auth0Domain}/.well-known/jwks.json`),
    },
    VerificadorJwt,
    { provide: APP_GUARD, useClass: GuardaAutenticacao },
  ],
})
export class AuthModule {}
