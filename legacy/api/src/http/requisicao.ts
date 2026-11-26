// apps/api/src/http/requisicao.ts
// Middlewares que valem para TODA requisição, antes das rotas:
//   - X-Request-Id: o id que liga a linha de log do servidor ao erro que a pessoa viu na tela
//     (aceita o que o nginx mandar, se for um id razoável; senão cria um);
//   - Cache-Control: no-store (resposta da API tem dado da loja; nada de cache no navegador ou proxy);
//   - uma linha de log em JSON ao terminar (rota, status, tempo, loja e usuário — só ids);
//   - conferência de origem: pedido que muda dados (POST/PATCH) vindo de OUTRO site é recusado.
//     O cookie já é SameSite=Strict; isto é a segunda camada (cobre também um subdomínio vizinho).
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequisicaoAutenticada } from '../auth/contexto.js';
import type { Ambiente } from '../config/ambiente.js';
import { registrar } from './log.js';

const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;
const SO_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Padrão da rota ("/usuarios/:id"), nunca o endereço com os valores. */
export function rotaDe(req: Request): string {
  const padrao = (req.route as { path?: string } | undefined)?.path;
  return typeof padrao === 'string' ? `${req.baseUrl}${padrao}` : '(sem rota)';
}

export function prepararRequisicao(req: Request, res: Response, next: NextFunction): void {
  const r = req as RequisicaoAutenticada;
  const recebido = req.get('x-request-id');
  r.idRequisicao = recebido && ID_VALIDO.test(recebido) ? recebido : randomUUID();
  res.setHeader('X-Request-Id', r.idRequisicao);
  res.setHeader('Cache-Control', 'no-store');
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    // /saude respondendo ok a cada 10 s (Docker, balanceador) só aparece com LOG_NIVEL=debug
    const nivel = res.statusCode >= 500 ? 'erro' : rotaDe(req) === '/saude' && res.statusCode === 200 ? 'debug' : 'info';
    registrar(nivel, 'requisicao', {
      id: r.idRequisicao,
      metodo: req.method,
      rota: rotaDe(req),
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - inicio) / 1e6),
      loja: r.contexto?.lojaId,
      usuario: r.contexto?.usuarioId,
    });
  });
  next();
}

function mesmoEndereco(origem: string, host: string | undefined): boolean {
  try {
    return Boolean(host) && new URL(origem).host === host;
  } catch {
    return false;
  }
}

export function conferirOrigem(amb: Pick<Ambiente, 'origensWeb'>) {
  const liberadas = new Set(amb.origensWeb);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SO_LEITURA.has(req.method)) return next();
    const origem = req.get('origin');
    const site = req.get('sec-fetch-site');
    const liberada = origem !== undefined && liberadas.has(origem);
    const recusar = origem !== undefined ? !liberada && !mesmoEndereco(origem, req.get('host')) : site === 'cross-site';
    if (recusar) {
      registrar('aviso', 'origem_recusada', { id: (req as RequisicaoAutenticada).idRequisicao, metodo: req.method });
      res.status(403).json({ status: 403, mensagem: 'Pedido vindo de outro site recusado.' });
      return;
    }
    next();
  };
}
