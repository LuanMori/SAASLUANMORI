// apps/api/test/apoio/app.ts
// Sobe a API completa (AppModule + configurarApp, igual ao main.ts), trocando
// apenas a origem das chaves públicas: JWKS local em vez do Auth0.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { RESOLVER_CHAVE, criarResolverJwks } from '../../src/auth/verificador-jwt.js';
import { lerAmbiente } from '../../src/config/ambiente.js';
import { configurarApp } from '../../src/http/configurar-app.js';

export async function criarAppTeste(urlJwks: string): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RESOLVER_CHAVE)
    .useValue(criarResolverJwks(urlJwks))
    .compile();
  const app = modulo.createNestApplication({ bodyParser: false, logger: ['error'] });
  configurarApp(app, lerAmbiente());
  await app.init();
  return app;
}
