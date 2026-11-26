// apps/web/src/usarInatividade.ts
// Sai sozinho depois de N minutos sem uso (DaniPets: IDLE_MINUTES = 30). Conta como uso: teclado,
// clique, toque, mouse e rolagem. O servidor derruba a sessão do mesmo jeito (30 min sem pedido);
// isto só faz a TELA sair junto, para ninguém deixar o caixa aberto num computador largado.
import { useEffect, useRef } from 'react';

const EVENTOS = ['keydown', 'mousedown', 'mousemove', 'touchstart', 'wheel', 'scroll'] as const;

export function usarInatividade(minutos: number | null | undefined, aoExpirar: () => void, agora: () => number = () => Date.now()): void {
  const expirar = useRef(aoExpirar);
  expirar.current = aoExpirar;
  const relogio = useRef(agora);
  relogio.current = agora;

  useEffect(() => {
    if (!minutos || minutos <= 0) return;
    let ultimoUso = relogio.current();
    const marcar = () => {
      ultimoUso = relogio.current();
    };
    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true, capture: true });
    const conferir = () => {
      if (relogio.current() - ultimoUso >= minutos * 60_000) {
        parar();
        expirar.current();
      }
    };
    // a cada 15 s, e também quando a aba volta a aparecer (o navegador segura timers de aba escondida)
    const timer = setInterval(conferir, 15_000);
    const aoVoltar = () => document.visibilityState === 'visible' && conferir();
    document.addEventListener('visibilitychange', aoVoltar);
    function parar() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      for (const e of EVENTOS) window.removeEventListener(e, marcar, { capture: true });
    }
    return parar;
  }, [minutos]);
}
