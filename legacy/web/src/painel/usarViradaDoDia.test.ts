// apps/web/src/painel/usarViradaDoDia.test.ts — virada do dia com o sistema aberto (fuso da loja).
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usarViradaDoDia } from './usarViradaDoDia';

afterEach(() => vi.useRealTimers());

describe('usarViradaDoDia', () => {
  it('avisa uma vez quando passa da meia-noite no fuso da loja (a cada 10 s e ao voltar para a tela)', () => {
    vi.useFakeTimers();
    let agora = new Date('2026-11-21T02:59:55Z'); // 23:59:55 de 20/11 em Brasília
    const aoVirar = vi.fn();
    const { unmount } = renderHook(() => usarViradaDoDia('America/Sao_Paulo', () => agora, aoVirar));
    vi.advanceTimersByTime(10_000);
    expect(aoVirar).not.toHaveBeenCalled(); // 00:00 em UTC, mas ainda 20/11 na loja
    agora = new Date('2026-11-21T03:00:05Z'); // 00:00:05 de 21/11
    vi.advanceTimersByTime(10_000);
    expect(aoVirar).toHaveBeenCalledExactlyOnceWith('2026-11-20', '2026-11-21');
    vi.advanceTimersByTime(60_000);
    expect(aoVirar).toHaveBeenCalledTimes(1);
    // o notebook dormiu e acordou no outro dia: confere ao voltar para a tela
    agora = new Date('2026-11-22T11:00:00Z');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(aoVirar).toHaveBeenLastCalledWith('2026-11-21', '2026-11-22');
    unmount();
    agora = new Date('2026-11-23T11:00:00Z');
    vi.advanceTimersByTime(10_000);
    window.dispatchEvent(new Event('focus'));
    expect(aoVirar).toHaveBeenCalledTimes(2);
  });
});
