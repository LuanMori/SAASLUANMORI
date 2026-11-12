// apps/api/src/main.ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { lerAmbiente } from './config/ambiente.js';
import { configurarApp } from './http/configurar-app.js';

async function iniciar(): Promise<void> {
  const amb = lerAmbiente();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app, amb);
  await app.listen(amb.porta);
  console.log(`API ouvindo na porta ${amb.porta}`);
}

iniciar().catch((e: unknown) => {
  console.error('Falha ao iniciar a API:', e instanceof Error ? e.message : e);
  process.exit(1);
});
