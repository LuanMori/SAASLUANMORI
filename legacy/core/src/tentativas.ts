// packages/core/src/tentativas.ts
// Senha errada demais bloqueia (revisão de 18/11/2026, item 3.5). Igual ao DaniPets V9.3.3:
// 5 senhas erradas seguidas bloqueiam o usuário por 5 minutos (MAX_TRIES, LOCK_MINUTES).
// Vale para o login e para a senha de quem autoriza (desconto, brinde, cancelamento, devolução).
// As mensagens não dizem se o que errou foi o usuário ou a senha: não ajudam quem tenta adivinhar contas.
// O servidor guarda o estado no banco (por usuário) e ainda limita as tentativas por IP.

export const TENTATIVAS_MAX = 5;
export const BLOQUEIO_MINUTOS = 5;

export const MENSAGEM_CREDENCIAIS = 'Usuário ou senha incorretos.';

export interface EstadoTentativas {
  /** Senhas erradas seguidas (zera ao acertar ou ao bloquear). */
  tentativasErradas: number;
  /** ISO 8601; null = não está bloqueado. */
  bloqueadoAte: string | null;
}

export const SEM_TENTATIVAS: EstadoTentativas = { tentativasErradas: 0, bloqueadoAte: null };

export function situacaoBloqueio(estado: EstadoTentativas, agora: Date): { bloqueado: boolean; restanteSegundos: number } {
  const ate = estado.bloqueadoAte ? new Date(estado.bloqueadoAte).getTime() : 0;
  const restante = Math.ceil((ate - agora.getTime()) / 1000);
  return restante > 0 ? { bloqueado: true, restanteSegundos: restante } : { bloqueado: false, restanteSegundos: 0 };
}

/** Mais uma senha errada: na quinta, bloqueia e zera a contagem. */
export function aposSenhaErrada(estado: EstadoTentativas, agora: Date): { estado: EstadoTentativas; bloqueou: boolean } {
  const tentativas = estado.tentativasErradas + 1;
  if (tentativas >= TENTATIVAS_MAX) {
    return { estado: { tentativasErradas: 0, bloqueadoAte: new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60_000).toISOString() }, bloqueou: true };
  }
  return { estado: { tentativasErradas: tentativas, bloqueadoAte: null }, bloqueou: false };
}

export const MENSAGEM_ACABOU_DE_BLOQUEAR = `Muitas tentativas erradas. Este usuário ficou bloqueado por ${BLOQUEIO_MINUTOS} minutos.`;

/** "Muitas tentativas erradas. Tente de novo em 4 min ou peça ao dono para trocar sua senha." */
export function mensagemBloqueado(restanteSegundos: number): string {
  const quando = restanteSegundos >= 60 ? `${Math.ceil(restanteSegundos / 60)} min` : `${Math.max(1, restanteSegundos)} s`;
  return `Muitas tentativas erradas. Tente de novo em ${quando} ou peça ao dono para trocar sua senha.`;
}
