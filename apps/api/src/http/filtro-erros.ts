// apps/api/src/http/filtro-erros.ts
// Formato único de erro: { status, mensagem, erros? }.
// Erros inesperados: resposta genérica para o cliente; no log só método,
// rota (padrão, sem IDs), nome e código do erro. Nada de corpo, token,
// e-mail ou mensagem do banco (que pode conter dados).
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface CorpoErro {
  status: number;
  mensagem: string;
  erros?: { campo: string; mensagem: string }[];
}

function corpoDeHttpException(exc: HttpException): CorpoErro {
  const status = exc.getStatus();
  const resposta = exc.getResponse();
  if (typeof resposta === 'object' && resposta !== null) {
    const r = resposta as Record<string, unknown>;
    if (typeof r.mensagem === 'string') {
      return { status, mensagem: r.mensagem, ...(Array.isArray(r.erros) ? { erros: r.erros as CorpoErro['erros'] } : {}) };
    }
    if (typeof r.message === 'string') return { status, mensagem: r.message };
  }
  return { status, mensagem: typeof resposta === 'string' ? resposta : 'Erro na requisição.' };
}

@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly log = new Logger('Erros');

  catch(exc: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    if (exc instanceof HttpException) {
      const corpo = corpoDeHttpException(exc);
      // O adapter do Nest converte erros do body-parser/Express em HttpException,
      // com a mensagem técnica original. Trocamos por mensagens nossas.
      if (exc.cause instanceof SyntaxError) corpo.mensagem = 'JSON inválido.';
      else if (exc.cause instanceof URIError) corpo.mensagem = 'Endereço inválido.';
      else if (corpo.status === 413) corpo.mensagem = 'Requisição grande demais.';
      else if (corpo.status === 404 && !req.route) corpo.mensagem = 'Rota não encontrada.';
      res.status(corpo.status).json(corpo);
      return;
    }

    const e = exc as { name?: string; code?: unknown };
    const rota = (req.route as { path?: string } | undefined)?.path ?? '(sem rota)';
    const codigo = typeof e?.code === 'string' ? ` code=${e.code}` : '';
    this.log.error(`${req.method} ${rota} -> ${e?.name ?? 'Erro'}${codigo}`);
    res.status(500).json({ status: 500, mensagem: 'Erro interno. Tente novamente.' } satisfies CorpoErro);
  }
}
