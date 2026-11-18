// apps/api/src/produtos/produtos.service.ts
// Validação de entrada vem do @saas/core (a mesma que o frontend usa).
// Isolamento por loja em duas camadas:
//   1. filtro explícito por lojaId do contexto (aplicação)
//   2. RLS no Postgres via comLoja() (banco) — vale mesmo se (1) for esquecido
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { validarNovoProduto } from '@saas/core';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { ContextoRequisicao } from '../auth/contexto.js';
import { BancoService } from '../banco/banco.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { produtoComCodigo, proximoCodigoInterno, travarCodigosDaLoja } from './codigos.js';

/** Teto de segurança da listagem até a paginação entrar (Fase 5.1). */
export const LIMITE_LISTAGEM = 1000;

const CAMPOS_PUBLICOS = {
  id: true,
  codigoInterno: true,
  codigoBarras: true,
  nome: true,
  precoCentavos: true,
  ativo: true,
  criadoEm: true,
  atualizadoEm: true,
} as const satisfies Prisma.ProdutoSelect;

export type ProdutoPublico = Prisma.ProdutoGetPayload<{ select: typeof CAMPOS_PUBLICOS }>;

@Injectable()
export class ProdutosService {
  constructor(private readonly banco: BancoService) {}

  listar(ctx: ContextoRequisicao): Promise<ProdutoPublico[]> {
    return this.banco.comLoja(ctx.lojaId, (tx) =>
      tx.produto.findMany({
        where: { lojaId: ctx.lojaId },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        take: LIMITE_LISTAGEM,
        select: CAMPOS_PUBLICOS,
      }),
    );
  }

  async criar(ctx: ContextoRequisicao, entrada: unknown): Promise<ProdutoPublico> {
    const validacao = validarNovoProduto(entrada);
    if (!validacao.ok) {
      throw new BadRequestException({ mensagem: 'Dados do produto inválidos.', erros: validacao.erros });
    }
    const novo = validacao.valor;

    try {
      return await this.banco.comLoja(ctx.lojaId, async (tx) => {
        await travarCodigosDaLoja(tx, ctx.lojaId);

        if (novo.codigoBarras) {
          const dono = await produtoComCodigo(tx, ctx.lojaId, novo.codigoBarras);
          if (dono) throw codigoBarrasRepetido(novo.codigoBarras, dono.nome);
        }

        const codigoInterno = await proximoCodigoInterno(tx, ctx.lojaId, novo.codigoBarras);
        const criado = await tx.produto.create({
          data: { ...novo, codigoInterno, lojaId: ctx.lojaId },
          select: CAMPOS_PUBLICOS,
        });
        await registrarAuditoria(tx, ctx.lojaId, ctx.usuarioId, 'produto.criado', { tipo: 'produto', id: criado.id }, { codigoInterno });
        return criado;
      }, ctx.usuarioId);
    } catch (erro) {
      // Rede de segurança: com a trava por loja isto não deveria acontecer.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException({ mensagem: 'Código já cadastrado nesta loja. Tente de novo.' });
      }
      throw erro;
    }
  }
}

function codigoBarrasRepetido(codigo: string, nomeProduto: string): ConflictException {
  // Mesma mensagem do DaniPets. O nome é de um produto da PRÓPRIA loja.
  return new ConflictException({
    mensagem: `Código de barras repetido: ${codigo} já está vinculado ao produto "${nomeProduto}".`,
    erros: [{ campo: 'codigoBarras', mensagem: `Já usado em "${nomeProduto}".` }],
  });
}
