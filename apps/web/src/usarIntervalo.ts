// apps/web/src/usarIntervalo.ts
// "Realtime" da Fase -1: polling a cada 5 s, só com a aba visível.
// (WebSocket entra depois, conforme a arquitetura decidida.)
import { useEffect, useRef } from 'react';

export function usarIntervalo(acao: () => void, ms: number): void {
  const ref = useRef(acao);
  ref.current = acao;

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [ms]);
}
