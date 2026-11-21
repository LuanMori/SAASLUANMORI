// apps/web/src/painel/usarViradaDoDia.ts
// Virada do dia com o sistema aberto (DaniPets V9.3.3: "verifica a cada minuto e fecha automaticamente o dia
// anterior"). Confere a cada 10 segundos e quando a tela volta a ficar visível (notebook que dormiu): à
// meia-noite, no fuso da loja, chama `aoVirar(diaAnterior, diaNovo)`. O painel usa isso para fechar sozinho o
// caixa que ficou aberto, avisar e recarregar as telas.
// O fechamento em si não depende deste relógio: qualquer leitura ou gravação depois da meia-noite já fecha
// o caixa do dia anterior (e a venda é recusada sem o caixa de hoje aberto).
import { diaNoFuso } from '@saas/core';
import { useEffect, useRef } from 'react';

export const CONFERIR_VIRADA_MS = 10_000;

export function usarViradaDoDia(fuso: string, agora: () => Date, aoVirar: (anterior: string, novo: string) => void, conferirMs = CONFERIR_VIRADA_MS): void {
  const ref = useRef({ dia: diaNoFuso(agora(), fuso), agora, aoVirar });
  ref.current.agora = agora;
  ref.current.aoVirar = aoVirar;

  useEffect(() => {
    ref.current.dia = diaNoFuso(ref.current.agora(), fuso);
    const conferir = () => {
      const novo = diaNoFuso(ref.current.agora(), fuso);
      const anterior = ref.current.dia;
      if (novo === anterior) return;
      ref.current.dia = novo;
      ref.current.aoVirar(anterior, novo);
    };
    const id = window.setInterval(conferir, conferirMs);
    document.addEventListener('visibilitychange', conferir);
    window.addEventListener('focus', conferir);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', conferir);
      window.removeEventListener('focus', conferir);
    };
  }, [fuso, conferirMs]);
}
