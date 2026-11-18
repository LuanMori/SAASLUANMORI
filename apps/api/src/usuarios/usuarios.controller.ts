// apps/api/src/usuarios/usuarios.controller.ts
// Só Dono e Administrador (@Exige('usuarios')). Quem pode mexer em quem: @saas/core/usuario.ts.
//   GET   /usuarios                      lista da loja
//   POST  /usuarios                      { nome, usuario, papel, senha }  (senha provisória)
//   PATCH /usuarios/:id                  { nome?, papel?, ativo? }
//   POST  /usuarios/:id/senha            { senha }  nova senha provisória
//   POST  /usuarios/:id/excluir-dados    LGPD (só o Dono, só de desativado)
import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post } from '@nestjs/common';
import { Contexto, type ContextoRequisicao } from '../auth/contexto.js';
import { Exige } from '../auth/decoradores.js';
import { type UsuarioPublico, UsuariosService } from './usuarios.service.js';

@Controller('usuarios')
@Exige('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  async listar(@Contexto() ctx: ContextoRequisicao): Promise<{ itens: UsuarioPublico[] }> {
    return { itens: await this.usuarios.listar(ctx) };
  }

  @Post()
  @HttpCode(201)
  criar(@Contexto() ctx: ContextoRequisicao, @Body() corpo: unknown): Promise<UsuarioPublico> {
    return this.usuarios.criar(ctx, corpo);
  }

  @Patch(':id')
  alterar(@Contexto() ctx: ContextoRequisicao, @Param('id') id: string, @Body() corpo: unknown): Promise<UsuarioPublico> {
    return this.usuarios.alterar(ctx, id, corpo);
  }

  @Post(':id/senha')
  @HttpCode(204)
  async redefinirSenha(@Contexto() ctx: ContextoRequisicao, @Param('id') id: string, @Body() corpo: unknown): Promise<void> {
    await this.usuarios.redefinirSenha(ctx, id, corpo);
  }

  @Post(':id/excluir-dados')
  @HttpCode(200)
  excluirDados(@Contexto() ctx: ContextoRequisicao, @Param('id') id: string): Promise<UsuarioPublico> {
    return this.usuarios.excluirDados(ctx, id);
  }
}

@Module({ controllers: [UsuariosController], providers: [UsuariosService] })
export class UsuariosModule {}
