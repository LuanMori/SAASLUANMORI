// apps/api/src/http/configurar-app.ts
// Configuração HTTP compartilhada entre main.ts e os testes, para que os
// testes exercitem exatamente o mesmo app que vai para produção.
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Ambiente } from '../config/ambiente.js';
import { FiltroErros } from './filtro-erros.js';
import { conferirOrigem, prepararRequisicao } from './requisicao.js';

export function configurarApp(app: INestApplication, amb: Ambiente): void {
  const express = app as NestExpressApplication;
  // IP real de quem acessa (limite de tentativas por IP): confia em SALTOS_DE_PROXY proxies na frente.
  // Com o nginx do docker-compose.prod.yml, 1. A porta da API nunca fica aberta para a internet:
  // sem proxy na frente, qualquer um mandaria um X-Forwarded-For inventado (docs/deploy.md).
  express.set('trust proxy', amb.saltosDeProxy);
  express.disable('x-powered-by');
  express.use(helmet());
  express.use(prepararRequisicao);
  express.use(conferirOrigem(amb));
  express.useBodyParser('json', { limit: '100kb' });
  // Em produção a tela e a API ficam no MESMO endereço (o nginx repassa /api), e o CORS nem entra
  // em jogo. WEB_ORIGINS só libera, com cookie, outra origem conhecida (ex.: Vite em outra porta).
  app.enableCors({
    origin: amb.origensWeb,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: true,
    maxAge: 600,
  });
  app.useGlobalFilters(new FiltroErros());
  app.enableShutdownHooks();
}
