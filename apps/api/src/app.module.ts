// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BancoModule } from './banco/banco.module.js';
import { ConfigModule } from './config/config.module.js';
import { ProdutosModule } from './produtos/produtos.module.js';

@Module({
  imports: [ConfigModule, BancoModule, AuthModule, ProdutosModule],
})
export class AppModule {}
