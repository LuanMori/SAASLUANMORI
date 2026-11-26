// apps/api/test/apoio/app.ts
// Sobe a API completa (AppModule + configurarApp, igual ao main.ts). `ajustes` troca só o que o
// teste precisa (ex.: cookie seguro, DOMINIO_BASE), no mesmo objeto que a API inteira usa.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { usarCustoDeTeste } from '../../src/auth/senhas.js';
import { AMBIENTE, type Ambiente, lerAmbiente } from '../../src/config/ambiente.js';
import { configurarApp } from '../../src/http/configurar-app.js';
import { configurarLog } from '../../src/http/log.js';

export async function criarAppTeste(ajustes: Partial<Ambiente> = {}): Promise<INestApplication> {
  usarCustoDeTeste();
  const amb: Ambiente = { ...lerAmbiente(), ...ajustes };
  configurarLog(amb.logNivel);
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AMBIENTE)
    .useValue(amb)
    .compile();
  const app = modulo.createNestApplication({ bodyParser: false, logger: false });
  configurarApp(app, amb);
  await app.init();
  return app;
}
