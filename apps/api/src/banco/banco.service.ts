// apps/api/src/banco/banco.service.ts
// ÚNICA porta de acesso ao banco. Duas operações, de propósito:
//
//   buscarLojaPorOrg()  -> lê o cadastro de tenants (lojas não tem RLS)
//   comLoja(lojaId, fn) -> abre uma transação, fixa app.loja_id com
//                          set_config(..., true) e só então roda fn(tx)
//
// Por que transação: o Prisma usa pool de conexões. Um "SET app.loja_id"
// comum ficaria grudado na conexão e vazaria para a próxima requisição
// (de outra loja). Com is_local = true o valor morre no COMMIT/ROLLBACK.
//
// O PrismaClient fica privado: nenhum outro código consegue consultar
// tabela de tenant sem passar por comLoja(). E se alguém der um jeito, o
// RLS devolve zero linhas (falha fechada).
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LojaResumo {
  id: string;
  ativa: boolean;
}

@Injectable()
export class BancoService implements OnModuleDestroy {
  private readonly prisma: PrismaClient;

  constructor(@Inject(AMBIENTE) ambiente: Ambiente) {
    const adapter = new PrismaPg({ connectionString: ambiente.databaseUrlApp, max: 10 });
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  buscarLojaPorOrg(auth0OrgId: string): Promise<LojaResumo | null> {
    return this.prisma.loja.findUnique({
      where: { auth0OrgId },
      select: { id: true, ativa: true },
    });
  }

  async comLoja<T>(lojaId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(lojaId)) {
      throw new Error('comLoja: lojaId inválido');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.loja_id', ${lojaId}, true)`;
      return fn(tx);
    });
  }
}
