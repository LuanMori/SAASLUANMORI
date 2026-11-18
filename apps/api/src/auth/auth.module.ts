// apps/api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GuardaAutenticacao } from './guarda-autenticacao.js';
import { SessaoController } from './sessao.controller.js';
import { SessaoService } from './sessao.service.js';

@Module({
  controllers: [SessaoController],
  providers: [SessaoService, { provide: APP_GUARD, useClass: GuardaAutenticacao }],
})
export class AuthModule {}
