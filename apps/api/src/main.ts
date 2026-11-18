// apps/api/src/main.ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { lerAmbiente } from './config/ambiente.js';
import { configurarApp } from './http/configurar-app.js';
import { configurarLog, LogJson, registrar } from './http/log.js';

async function iniciar(): Promise<void> {
  const amb = lerAmbiente();
  configurarLog(amb.logNivel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: new LogJson() });
  configurarApp(app, amb);
  await app.listen(amb.porta);
  registrar('info', 'api_iniciada', { porta: amb.porta });
}

iniciar().catch((e: unknown) => {
  // Só a mensagem (nomes de variáveis, roles e tabelas): nunca a URL de conexão ou a pilha.
  registrar('erro', 'falha_ao_iniciar', { msg: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
