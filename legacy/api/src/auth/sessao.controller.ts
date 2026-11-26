// apps/api/src/auth/sessao.controller.ts
//   GET  /sessao/loja   (sem login) nome da loja na tela de entrada
//   POST /sessao        (sem login) { loja?, usuario, senha } -> entra; cookie HttpOnly
//   GET  /sessao                    quem está logado (também com senha provisória)
//   POST /sessao/senha              { senhaAtual, senhaNova } -> troca a própria senha
//   POST /sessao/sair   (sem login) encerra a sessão deste navegador e apaga o cookie
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { MuitasTentativasException } from '../http/filtro-erros.js';
import { Contexto, type ContextoRequisicao, type RequisicaoAutenticada } from './contexto.js';
import { cookieApagado } from './cookies.js';
import { ComSenhaProvisoria, Publico } from './decoradores.js';
import { type RespostaSessao, SessaoService } from './sessao.service.js';

@Controller('sessao')
export class SessaoController {
  constructor(
    private readonly sessao: SessaoService,
    @Inject(AMBIENTE) private readonly amb: Ambiente,
  ) {}

  @Get('loja')
  @Publico()
  loja(@Req() req: RequisicaoAutenticada, @Query('loja') loja?: string) {
    return this.sessao.lojaParaEntrada(req.get('host'), loja);
  }

  @Post()
  @Publico()
  @HttpCode(200)
  async entrar(@Req() req: RequisicaoAutenticada, @Body() corpo: unknown, @Res({ passthrough: true }) res: Response): Promise<RespostaSessao> {
    const r = await this.sessao.entrar(corpo, req);
    res.setHeader('Set-Cookie', r.cookie);
    return r.resposta;
  }

  @Get()
  @ComSenhaProvisoria()
  ver(@Contexto() ctx: ContextoRequisicao): RespostaSessao {
    return this.sessao.resposta(ctx);
  }

  @Post('senha')
  @ComSenhaProvisoria()
  @HttpCode(200)
  async trocarSenha(@Contexto() ctx: ContextoRequisicao, @Body() corpo: unknown, @Res({ passthrough: true }) res: Response): Promise<RespostaSessao> {
    try {
      return await this.sessao.trocarSenha(ctx, corpo);
    } catch (erro) {
      // errou a senha atual 5 vezes: usuário bloqueado e sessões encerradas
      if (erro instanceof MuitasTentativasException) res.setHeader('Set-Cookie', cookieApagado(this.amb));
      throw erro;
    }
  }

  @Post('sair')
  @Publico()
  @HttpCode(204)
  async sair(@Req() req: RequisicaoAutenticada, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessao.sair(req);
    res.setHeader('Set-Cookie', cookieApagado(this.amb));
  }
}
