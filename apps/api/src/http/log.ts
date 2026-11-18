// apps/api/src/http/log.ts
// Logs em JSON, uma linha por evento (item 5.3 da revisão): um painel de logs (CloudWatch, Loki,
// Datadog...) filtra por loja, por requisição (X-Request-Id) e por nível sem precisar de regex.
// O que NUNCA entra num log: corpo da requisição, cookie, senha, token, nome, CPF, telefone, e-mail e
// mensagem de erro do banco (pode trazer dados). Só ids, rotas (o padrão, sem os valores), códigos e tempos.
import type { LoggerService } from '@nestjs/common';
import type { NivelLog } from '../config/ambiente.js';

const PESO: Record<NivelLog, number> = { erro: 0, aviso: 1, info: 2, debug: 3 };

let nivelAtual: NivelLog = 'info';
let destino: ((linha: string, nivel: NivelLog) => void) | null = null;

export function configurarLog(nivel: NivelLog): void {
  nivelAtual = nivel;
}

/** Só para os testes: recebe as linhas em vez de escrever no terminal (null volta ao normal). */
export function desviarLog(fn: ((linha: string, nivel: NivelLog) => void) | null): void {
  destino = fn;
}

export function registrar(nivel: NivelLog, evento: string, campos: Record<string, unknown> = {}): void {
  if (PESO[nivel] > PESO[nivelAtual]) return;
  const linha = JSON.stringify({ hora: new Date().toISOString(), nivel, evento, ...campos });
  if (destino) destino(linha, nivel);
  else (nivel === 'erro' ? process.stderr : process.stdout).write(`${linha}\n`);
}

/** Primeira linha, até 300 caracteres: mensagens do framework sem pilha nem dados colados. */
const curto = (v: unknown): string => String(v instanceof Error ? v.message : v).split('\n')[0]!.slice(0, 300);

/** Adaptador para o Logger do NestJS (mensagens de inicialização e do próprio framework). */
export class LogJson implements LoggerService {
  log(mensagem: unknown, contexto?: string): void {
    registrar('info', 'nest', { contexto, msg: curto(mensagem) });
  }
  error(mensagem: unknown, ...resto: unknown[]): void {
    registrar('erro', 'nest', { contexto: typeof resto.at(-1) === 'string' ? resto.at(-1) : undefined, msg: curto(mensagem) });
  }
  warn(mensagem: unknown, contexto?: string): void {
    registrar('aviso', 'nest', { contexto, msg: curto(mensagem) });
  }
  debug(mensagem: unknown, contexto?: string): void {
    registrar('debug', 'nest', { contexto, msg: curto(mensagem) });
  }
  verbose(mensagem: unknown, contexto?: string): void {
    registrar('debug', 'nest', { contexto, msg: curto(mensagem) });
  }
}
