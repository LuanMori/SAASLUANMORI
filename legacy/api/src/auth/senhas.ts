// apps/api/src/auth/senhas.ts
// Senhas com scrypt (embutido no Node, sem dependência nova): sal aleatório por senha, custo guardado
// junto (dá para subir o custo depois sem perder as senhas antigas) e comparação em tempo constante.
// A senha é normalizada (NFC) antes: "ç" digitado no Mac e no Windows vira o mesmo texto (item 4.5).
// Formato guardado: scrypt$<logN>$<r>$<p>$<sal base64url>$<hash base64url>
import { randomBytes, scrypt as scryptCallback, type ScryptOptions, timingSafeEqual } from 'node:crypto';

const scrypt = (senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions) =>
  new Promise<Buffer>((ok, falha) => scryptCallback(senha, sal, tamanho, opcoes, (erro, chave) => (erro ? falha(erro) : ok(chave))));

export interface CustoSenha {
  logN: number;
  r: number;
  p: number;
}

/** N = 2^15, r = 8, p = 1 (~32 MB e dezenas de milissegundos por senha). */
export const CUSTO_PADRAO: CustoSenha = { logN: 15, r: 8, p: 1 };

let custo: CustoSenha = CUSTO_PADRAO;
let hashFalso: Promise<string> | null = null;

/** Só para os testes automatizados (senhas criadas com custo baixo; o formato guarda o custo). */
export function usarCustoDeTeste(): void {
  custo = { logN: 10, r: 8, p: 1 };
  hashFalso = null;
}

const opcoes = (c: CustoSenha): ScryptOptions => ({ N: 2 ** c.logN, r: c.r, p: c.p, maxmem: 256 * c.r * 2 ** c.logN + 1024 * 1024 });

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha.normalize('NFC'), sal, 32, opcoes(custo));
  return `scrypt$${custo.logN}$${custo.r}$${custo.p}$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

function lerGuardado(guardado: string): { c: CustoSenha; sal: Buffer; hash: Buffer } | null {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return null;
  const [logN, r, p] = partes.slice(1, 4).map(Number) as [number, number, number];
  if (![logN, r, p].every(Number.isInteger) || logN < 10 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4) return null;
  const sal = Buffer.from(partes[4]!, 'base64url');
  const hash = Buffer.from(partes[5]!, 'base64url');
  if (sal.length < 16 || hash.length < 32) return null;
  return { c: { logN, r, p }, sal, hash };
}

/**
 * Confere a senha. Sem hash (usuário sem senha ou inexistente), gasta o mesmo tempo com um hash falso:
 * pelo tempo de resposta não dá para saber se o usuário existe.
 */
export async function conferirSenha(senha: string, guardado: string | null | undefined): Promise<boolean> {
  const lido = guardado ? lerGuardado(guardado) : null;
  if (!lido) {
    hashFalso ??= gerarHashSenha(randomBytes(16).toString('hex'));
    const falso = lerGuardado(await hashFalso)!;
    await scrypt(senha.normalize('NFC'), falso.sal, falso.hash.length, opcoes(falso.c));
    return false;
  }
  const calculado = await scrypt(senha.normalize('NFC'), lido.sal, lido.hash.length, opcoes(lido.c));
  return timingSafeEqual(calculado, lido.hash);
}
