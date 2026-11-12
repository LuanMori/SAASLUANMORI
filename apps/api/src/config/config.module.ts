// apps/api/src/config/config.module.ts
import { Global, Module } from '@nestjs/common';
import { AMBIENTE, lerAmbiente } from './ambiente.js';

@Global()
@Module({
  providers: [{ provide: AMBIENTE, useFactory: () => lerAmbiente() }],
  exports: [AMBIENTE],
})
export class ConfigModule {}
