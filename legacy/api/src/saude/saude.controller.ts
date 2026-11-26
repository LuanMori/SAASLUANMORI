// apps/api/src/saude/saude.controller.ts
// GET /saude (sem login): o que o Docker, o balanceador e o monitoramento consultam para saber se a
// API está de pé E falando com o banco. Não mostra versão, nome de banco nem nada da loja.
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { Publico } from '../auth/decoradores.js';
import { BancoService } from '../banco/banco.service.js';

@Controller('saude')
export class SaudeController {
  constructor(private readonly banco: BancoService) {}

  @Get()
  @Publico()
  async saude(): Promise<{ status: 'ok' }> {
    if (!(await this.banco.verificar())) throw new ServiceUnavailableException({ mensagem: 'Banco de dados indisponível.' });
    return { status: 'ok' };
  }
}

@Module({ controllers: [SaudeController] })
export class SaudeModule {}
