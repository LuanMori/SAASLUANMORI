// apps/web/src/painel/usarCarga.ts
// Carrega dados da API e (opcional) recarrega a cada N ms com a aba visível.
// Sem rede: mantém o que já está na tela e avisa. 401/403: bloqueia.
// Resposta atrasada de uma busca antiga nunca sobrescreve a mais nova.
import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { ErroApi } from '../api';
import { usarIntervalo } from '../usarIntervalo';

export type EstadoCarga<T> =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; dados: T; avisoRede: boolean }
  | { tipo: 'bloqueado'; mensagem: string }
  /** Falhou antes de ter qualquer dado (ex.: sem rede na primeira carga). */
  | { tipo: 'falhou'; mensagem: string };

export function usarCarga<T>(carregar: () => Promise<T>, deps: DependencyList, intervaloMs = 0) {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ tipo: 'carregando' });
  const pedido = useRef(0);

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const dados = await carregar();
      if (meu === pedido.current) setEstado({ tipo: 'pronto', dados, avisoRede: false });
    } catch (e) {
      if (meu !== pedido.current) return;
      const erro = e instanceof ErroApi ? e : new ErroApi(0, 'Algo deu errado.');
      if (erro.status === 401 || erro.status === 403) setEstado({ tipo: 'bloqueado', mensagem: erro.message });
      else setEstado((atual) => (atual.tipo === 'pronto' ? { ...atual, avisoRede: true } : { tipo: 'falhou', mensagem: erro.message }));
    }
  }, deps);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  usarIntervalo(() => {
    if (intervaloMs > 0) void recarregar();
  }, intervaloMs > 0 ? intervaloMs : 60_000);

  return { estado, recarregar };
}
