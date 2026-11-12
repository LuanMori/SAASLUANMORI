// apps/api/src/http/configurar-app.ts
// Configuração HTTP compartilhada entre main.ts e os testes, para que os
// testes exercitem exatamente o mesmo app que vai para produção.
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Ambiente } from '../config/ambiente.js';
import { FiltroErros } from './filtro-erros.js';

export function configurarApp(app: INestApplication, amb: Ambiente): void {
  const express = app as NestExpressApplication;
  // Atrás de proxy: confia em 1 salto (ALB). Com Cloudflare na frente serão 2 saltos —
  // ajustar na Fase 8, antes de qualquer rate limit por IP (Fase 9).
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  express.use(helmet());
  express.useBodyParser('json', { limit: '100kb' });
  app.enableCors({
    origin: amb.origensWeb,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalFilters(new FiltroErros());
  app.enableShutdownHooks();
}
