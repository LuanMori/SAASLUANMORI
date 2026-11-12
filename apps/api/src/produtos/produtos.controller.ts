// apps/api/src/produtos/produtos.controller.ts
// Controller fino: recebe, delega, devolve. Sem regra de negócio aqui.
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Contexto, type ContextoRequisicao } from '../auth/contexto.js';
import { type ProdutoPublico, ProdutosService } from './produtos.service.js';

@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtos: ProdutosService) {}

  /** GET /produtos -> { itens: Produto[] } da loja do token. */
  @Get()
  async listar(@Contexto() ctx: ContextoRequisicao): Promise<{ itens: ProdutoPublico[] }> {
    return { itens: await this.produtos.listar(ctx) };
  }

  /** POST /produtos { nome, codigo?, precoCentavos } -> Produto criado na loja do token. */
  @Post()
  @HttpCode(201)
  criar(@Contexto() ctx: ContextoRequisicao, @Body() corpo: unknown): Promise<ProdutoPublico> {
    return this.produtos.criar(ctx, corpo);
  }
}
