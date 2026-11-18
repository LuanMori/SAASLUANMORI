// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { BancoModule } from './banco/banco.module.js';
import { ConfigModule } from './config/config.module.js';
import { ProdutosModule } from './produtos/produtos.module.js';
import { SaudeModule } from './saude/saude.controller.js';
import { UsuariosModule } from './usuarios/usuarios.controller.js';

@Module({
  imports: [ConfigModule, BancoModule, AuthModule, ProdutosModule, UsuariosModule, AuditoriaModule, SaudeModule],
})
export class AppModule {}
