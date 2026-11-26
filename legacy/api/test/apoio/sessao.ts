// apps/api/test/apoio/sessao.ts
// Entrar pela API de verdade (POST /sessao) e usar o cookie nas próximas requisições.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SENHA_TESTE } from './banco.js';

/** Cookie "sessao=..." devolvido no login (Set-Cookie), pronto para `.set('Cookie', ...)`. */
export function cookieDe(resposta: request.Response): string {
  const bruto = resposta.headers['set-cookie'] as unknown as string[] | string | undefined;
  const linha = (Array.isArray(bruto) ? bruto : [bruto ?? '']).find((c) => /^(__Host-)?sessao=[^;]+/.test(c));
  if (!linha) throw new Error(`Login sem cookie de sessão (status ${resposta.status}: ${JSON.stringify(resposta.body)})`);
  return linha.split(';')[0]!;
}

export async function entrar(
  app: INestApplication,
  loja: string,
  usuario: string,
  senha = SENHA_TESTE,
  ip = '198.51.100.10',
): Promise<string> {
  const r = await request(app.getHttpServer()).post('/sessao').set('X-Forwarded-For', ip).send({ loja, usuario, senha });
  if (r.status !== 200) throw new Error(`Login de ${usuario}@${loja} falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return cookieDe(r);
}
