// apps/api/src/http/filtro-erros.ts
// Formato único de erro: { status, mensagem, codigo?, erros? }.
//   - codigo: para a tela reagir sem comparar texto (ex.: "senha_provisoria", "sessao_encerrada").
// Erros inesperados: resposta genérica para a pessoa; no log (JSON) só o id da requisição, método,
// rota (padrão, sem valores), nome e código do erro. Nada de corpo, cookie, senha ou mensagem do banco.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import type { RequisicaoAutenticada } from '../auth/contexto.js';
import { registrar } from './log.js';
import { rotaDe } from './requisicao.js';

interface CorpoErro {
  status: number;
  mensagem: string;
  codigo?: string;
  erros?: { campo: string; mensagem: string }[];
}

/** 429 com o tempo de espera (cabeçalho Retry-After). */
export class MuitasTentativasException extends HttpException {
  constructor(
    mensagem: string,
    readonly segundos: number,
  ) {
    super({ mensagem, codigo: 'muitas_tentativas' }, 429);
  }
}

function corpoDeHttpException(exc: HttpException): CorpoErro {
  const status = exc.getStatus();
  const resposta = exc.getResponse();
  if (typeof resposta === 'object' && resposta !== null) {
    const r = resposta as Record<string, unknown>;
    if (typeof r.mensagem === 'string') {
      return {
        status,
        mensagem: r.mensagem,
        ...(typeof r.codigo === 'string' ? { codigo: r.codigo } : {}),
        ...(Array.isArray(r.erros) ? { erros: r.erros as CorpoErro['erros'] } : {}),
      };
    }
    if (typeof r.message === 'string') return { status, mensagem: r.message };
  }
  return { status, mensagem: typeof resposta === 'string' ? resposta : 'Erro na requisição.' };
}

/** A trava do banco (usuarios_trava_api) ou um GRANT negou: a API deixou passar algo que não devia. */
function ehPermissaoNegadaPeloBanco(exc: unknown): boolean {
  const texto = JSON.stringify(exc, Object.getOwnPropertyNames(exc ?? {}));
  return /42501|permission denied|usuarios: /.test(texto);
}

@Catch()
export class FiltroErros implements ExceptionFilter {
  catch(exc: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<RequisicaoAutenticada>();

    if (exc instanceof HttpException) {
      const corpo = corpoDeHttpException(exc);
      // O adapter do Nest converte erros do body-parser/Express em HttpException,
      // com a mensagem técnica original. Trocamos por mensagens nossas.
      if (exc.cause instanceof SyntaxError) corpo.mensagem = 'JSON inválido.';
      else if (exc.cause instanceof URIError) corpo.mensagem = 'Endereço inválido.';
      else if (corpo.status === 413) corpo.mensagem = 'Requisição grande demais.';
      else if (corpo.status === 404 && !req.route) corpo.mensagem = 'Rota não encontrada.';
      if (exc instanceof MuitasTentativasException) res.setHeader('Retry-After', String(exc.segundos));
      res.status(corpo.status).json(corpo);
      return;
    }

    const e = exc as { name?: string; code?: unknown };
    const negado = ehPermissaoNegadaPeloBanco(exc);
    registrar(negado ? 'aviso' : 'erro', negado ? 'banco_negou' : 'erro_interno', {
      id: req.idRequisicao,
      metodo: req.method,
      rota: rotaDe(req),
      erro: e?.name ?? 'Erro',
      codigo: typeof e?.code === 'string' ? e.code : undefined,
      loja: req.contexto?.lojaId,
    });
    if (negado) {
      res.status(403).json({ status: 403, mensagem: 'Você não tem permissão para fazer isso.' } satisfies CorpoErro);
      return;
    }
    res.status(500).json({ status: 500, mensagem: 'Erro interno. Tente novamente.' } satisfies CorpoErro);
  }
}
