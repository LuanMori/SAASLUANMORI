// apps/api/src/auth/limites.ts
// Limites de tentativa de login que ficam na memória da API (item 3.5 da revisão):
//   - por IP: 5 logins errados em 1 minuto bloqueiam aquele IP por 5 minutos (força bruta e
//     "credential stuffing", em que cada usuário é tentado uma vez só);
//   - por login que NÃO existe: o mesmo bloqueio de 5 erradas = 5 minutos do usuário de verdade,
//     para o bloqueio não revelar quais usuários existem.
// O bloqueio do usuário que existe fica no banco (usuarios.tentativas_erradas / bloqueado_ate).
// Com mais de uma cópia da API rodando, cada cópia conta as suas: para várias cópias, levar estes
// contadores para o banco ou para um Redis (docs/deploy.md).
import { aposSenhaErrada, BLOQUEIO_MINUTOS, type EstadoTentativas, SEM_TENTATIVAS, situacaoBloqueio } from '@saas/core';

export const LIMITE_IP = { falhas: 5, janelaMs: 60_000, bloqueioMs: BLOQUEIO_MINUTOS * 60_000 } as const;

/** Teto de entradas guardadas: um ataque com milhões de IPs não esgota a memória. */
const TETO = 50_000;

export class LimitadorPorIp {
  private readonly mapa = new Map<string, { falhas: number[]; bloqueadoAte: number }>();

  /** Segundos que faltam de bloqueio (0 = liberado). */
  bloqueado(ip: string, agora = Date.now()): number {
    const e = this.mapa.get(ip);
    return e && e.bloqueadoAte > agora ? Math.ceil((e.bloqueadoAte - agora) / 1000) : 0;
  }

  registrarFalha(ip: string, agora = Date.now()): void {
    const e = this.mapa.get(ip) ?? { falhas: [], bloqueadoAte: 0 };
    e.falhas = [...e.falhas.filter((t) => agora - t < LIMITE_IP.janelaMs), agora];
    if (e.falhas.length >= LIMITE_IP.falhas) {
      e.bloqueadoAte = agora + LIMITE_IP.bloqueioMs;
      e.falhas = [];
    }
    this.mapa.delete(ip); // reinsere no fim: a ordem do Map vira "menos recente primeiro"
    this.mapa.set(ip, e);
    if (this.mapa.size > TETO) this.mapa.delete(this.mapa.keys().next().value!);
  }
}

export class TentativasSemUsuario {
  private readonly mapa = new Map<string, EstadoTentativas>();

  situacao(chave: string, agora = new Date()): { bloqueado: boolean; restanteSegundos: number } {
    return situacaoBloqueio(this.mapa.get(chave) ?? SEM_TENTATIVAS, agora);
  }

  registrarFalha(chave: string, agora = new Date()): boolean {
    const r = aposSenhaErrada(this.mapa.get(chave) ?? SEM_TENTATIVAS, agora);
    this.mapa.delete(chave);
    this.mapa.set(chave, r.estado);
    if (this.mapa.size > TETO) this.mapa.delete(this.mapa.keys().next().value!);
    return r.bloqueou;
  }
}

/**
 * Uma tentativa de login por vez para o mesmo usuário (nesta cópia da API): sem isso, 100 tentativas
 * disparadas juntas seriam todas conferidas antes de o bloqueio ser gravado. Não segura conexão do
 * banco enquanto espera. (Entre cópias da API, o FOR UPDATE no banco faz o mesmo papel.)
 */
export class FilaPorChave {
  private readonly filas = new Map<string, Promise<unknown>>();

  async executar<T>(chave: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(fn, fn);
    const fim = atual.catch(() => undefined);
    this.filas.set(chave, fim);
    try {
      return await atual;
    } finally {
      if (this.filas.get(chave) === fim) this.filas.delete(chave);
    }
  }

  /** Quantas chaves têm fila agora (testes). */
  get tamanho(): number {
    return this.filas.size;
  }
}
