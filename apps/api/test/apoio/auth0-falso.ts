// apps/api/test/apoio/auth0-falso.ts
// "Auth0 de mentira" para testes: gera chaves RSA, publica um JWKS num
// servidor HTTP local e emite tokens no formato que o Auth0 emite
// (iss, aud, sub, org_id, exp). A API valida esses tokens pelo MESMO código
// de produção (jose + JWKS remoto); só a URL do JWKS muda.
import { createHmac, createSign, generateKeyPairSync, type KeyObject, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AUDIENCE_TESTE, ISSUER_TESTE } from './config.js';

export interface ParChaves {
  kid: string;
  privada: KeyObject;
  publica: KeyObject;
}

export function gerarParChaves(): ParChaves {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid: randomUUID(), privada: privateKey, publica: publicKey };
}

export async function iniciarServidorJwks(chaves: ParChaves[]): Promise<{ url: string; fechar: () => Promise<void> }> {
  const corpo = JSON.stringify({
    keys: chaves.map((c) => ({ ...c.publica.export({ format: 'jwk' }), kid: c.kid, alg: 'RS256', use: 'sig' })),
  });
  const servidor = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(corpo);
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    fechar: () =>
      new Promise<void>((ok) => {
        servidor.closeAllConnections();
        servidor.close(() => ok());
      }),
  };
}

export interface OpcoesToken {
  issuer?: string;
  audience?: string;
  expiraEmSegundos?: number;
  kid?: string;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

function montar(header: object, claims: Record<string, unknown>, opcoes: OpcoesToken): string {
  const agora = Math.floor(Date.now() / 1000);
  const payload = {
    iss: opcoes.issuer ?? ISSUER_TESTE,
    aud: opcoes.audience ?? AUDIENCE_TESTE,
    iat: agora,
    exp: agora + (opcoes.expiraEmSegundos ?? 300),
    ...claims,
  };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
}

/** Token RS256 como o Auth0 emitiria para a nossa API. */
export function emitirToken(chave: ParChaves, claims: Record<string, unknown>, opcoes: OpcoesToken = {}): string {
  const corpo = montar({ alg: 'RS256', typ: 'JWT', kid: opcoes.kid ?? chave.kid }, claims, opcoes);
  const assinatura = createSign('RSA-SHA256').update(corpo).sign(chave.privada).toString('base64url');
  return `${corpo}.${assinatura}`;
}

/** Token forjado sem a chave privada (ataques "alg=none" e "HS256 com a chave pública"). */
export function forjarToken(alg: 'none' | 'HS256', claims: Record<string, unknown>, kid: string, segredo = ''): string {
  const corpo = montar({ alg, typ: 'JWT', kid }, claims, {});
  if (alg === 'none') return `${corpo}.`;
  return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`;
}
