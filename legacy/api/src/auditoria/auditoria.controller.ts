// apps/api/src/auditoria/auditoria.controller.ts
// GET /auditoria?limite=40 -> { itens } da loja da sessão, do mais novo para o mais antigo.
// Só Dono e Administrador (os mesmos que cuidam dos usuários).
import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ACOES_AUDITORIA, type AcaoAuditoria, NOME_SUPORTE, resumirAuditoria } from '@saas/core';
import { Contexto, type ContextoRequisicao } from '../auth/contexto.js';
import { Exige } from '../auth/decoradores.js';
import { BancoService } from '../banco/banco.service.js';

export interface ItemAuditoria {
  id: string;
  acao: string;
  /** Texto da ação para a tela ("Usuário criado"). */
  texto: string;
  /** Nome de quem fez (null = sistema ou tentativa sem login). */
  quem: string | null;
  alvo: { tipo: string; id: string; nome: string | null } | null;
  detalhes: unknown;
  /** Resumo dos detalhes para a tela ("venda nº 00012 • R$ 5,00 • autorizado por Ana"), igual ao da demonstração. */
  resumo: string;
  criadoEm: Date;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly banco: BancoService) {}

  listar(ctx: ContextoRequisicao, limite: number): Promise<ItemAuditoria[]> {
    return this.banco.comLoja(ctx.lojaId, async (tx) => {
      const linhas = await tx.auditoria.findMany({
        where: { lojaId: ctx.lojaId },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: limite,
        select: { id: true, usuarioId: true, acao: true, alvoTipo: true, alvoId: true, detalhes: true, criadoEm: true },
      });
      const ids = new Set<string>();
      for (const l of linhas) {
        if (l.usuarioId) ids.add(l.usuarioId);
        if (l.alvoTipo === 'usuario' && l.alvoId) ids.add(l.alvoId);
        const d = l.detalhes as { autorizadoPor?: unknown } | null;
        if (d && typeof d.autorizadoPor === 'string') ids.add(d.autorizadoPor);
      }
      const produtos = linhas.filter((l) => l.alvoTipo === 'produto' && l.alvoId).map((l) => l.alvoId!);
      const [pessoas, itens] = await Promise.all([
        ids.size ? tx.usuario.findMany({ where: { lojaId: ctx.lojaId, id: { in: [...ids] } }, select: { id: true, nome: true } }) : [],
        produtos.length ? tx.produto.findMany({ where: { lojaId: ctx.lojaId, id: { in: produtos } }, select: { id: true, nome: true } }) : [],
      ]);
      const nome = new Map([...pessoas, ...itens].map((p) => [p.id, p.nome]));
      // quem não é da loja pode ser o Adm. Sup: aparece como "Suporte" (a linha dele não aparece para a API)
      for (const id of ids) {
        if (nome.has(id)) continue;
        const sup = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app_suporte_por_id(${id}::uuid)`;
        if (sup.length) nome.set(id, NOME_SUPORTE);
      }
      return linhas.map((l) => ({
        id: l.id,
        acao: l.acao,
        texto: ACOES_AUDITORIA[l.acao as AcaoAuditoria] ?? l.acao,
        quem: l.usuarioId ? (nome.get(l.usuarioId) ?? null) : null,
        alvo: l.alvoTipo && l.alvoId ? { tipo: l.alvoTipo, id: l.alvoId, nome: nome.get(l.alvoId) ?? null } : null,
        detalhes: l.detalhes,
        resumo: resumirAuditoria(l.acao, l.detalhes, (id) => nome.get(id) ?? null),
        criadoEm: l.criadoEm,
      }));
    });
  }
}

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @Exige('usuarios')
  async listar(@Contexto() ctx: ContextoRequisicao, @Query('limite') limite?: string): Promise<{ itens: ItemAuditoria[] }> {
    const n = limite === undefined ? 40 : Number(limite);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      throw new BadRequestException({ mensagem: 'limite deve ser um número de 1 a 200.', erros: [{ campo: 'limite', mensagem: 'Use de 1 a 200.' }] });
    }
    return { itens: await this.auditoria.listar(ctx, n) };
  }
}

@Module({ controllers: [AuditoriaController], providers: [AuditoriaService] })
export class AuditoriaModule {}
