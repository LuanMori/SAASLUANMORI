// apps/api/src/banco/banco.service.ts
// ÚNICA porta de acesso ao banco:
//
//   buscarLojaPorSubdominio() -> lê o cadastro de lojas (lojas não tem RLS; a API só tem SELECT)
//   comLoja(lojaId, fn, usuarioId?) -> abre uma transação, fixa app.loja_id (e app.usuario_id, quem
//                          está logado) com set_config(..., true) e só então roda fn(tx)
//   verificar()            -> o banco responde? (/saude)
//
// Por que transação: o Prisma usa pool de conexões. Um "SET app.loja_id"
// comum ficaria grudado na conexão e vazaria para a próxima requisição
// (de outra loja). Com is_local = true o valor morre no COMMIT/ROLLBACK.
//
// O PrismaClient fica privado: nenhum outro código consegue consultar
// tabela de tenant sem passar por comLoja(). E se alguém der um jeito, o
// RLS devolve zero linhas (falha fechada).
//
// Ao subir (onModuleInit), confere se a conexão é segura (conferencia.ts) e se recusa a subir se não for.
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { problemasDeSeguranca } from './conferencia.js';

export type Tx = Prisma.TransactionClient;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LojaResumo {
  id: string;
  nome: string;
  subdominio: string;
  ativa: boolean;
}

@Injectable()
export class BancoService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;

  constructor(@Inject(AMBIENTE) ambiente: Ambiente) {
    const adapter = new PrismaPg({ connectionString: ambiente.databaseUrlApp, max: 10 });
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleInit(): Promise<void> {
    const problemas = await problemasDeSeguranca((sql) => this.prisma.$queryRawUnsafe(sql));
    if (problemas.length > 0) {
      throw new Error(`Conexão com o banco insegura: a API não sobe. ${problemas.join(' ')} Veja docs/SEGURANCA.md.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async verificar(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  buscarLojaPorSubdominio(subdominio: string): Promise<LojaResumo | null> {
    return this.prisma.loja.findUnique({
      where: { subdominio },
      select: { id: true, nome: true, subdominio: true, ativa: true },
    });
  }

  async comLoja<T>(lojaId: string, fn: (tx: Tx) => Promise<T>, usuarioId: string | null = null): Promise<T> {
    if (!UUID.test(lojaId)) throw new Error('comLoja: lojaId inválido');
    if (usuarioId !== null && !UUID.test(usuarioId)) throw new Error('comLoja: usuarioId inválido');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.loja_id', ${lojaId}, true), set_config('app.usuario_id', ${usuarioId ?? ''}, true)`;
      return fn(tx);
    });
  }
}
