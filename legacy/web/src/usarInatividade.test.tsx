// apps/web/src/usarInatividade.test.tsx
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usarInatividade } from './usarInatividade';

function Tela({ minutos, aoExpirar }: { minutos: number | null; aoExpirar: () => void }) {
  usarInatividade(minutos, aoExpirar);
  return <p>logado</p>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usarInatividade (30 min sem uso = sai, como no DaniPets)', () => {
  it('sai depois de 30 minutos parado, uma vez só', () => {
    const aoExpirar = vi.fn();
    render(<Tela minutos={30} aoExpirar={aoExpirar} />);
    act(() => vi.advanceTimersByTime(29 * 60_000));
    expect(aoExpirar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000 + 15_000));
    expect(aoExpirar).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it('usar (tecla, clique, toque) zera a contagem', () => {
    const aoExpirar = vi.fn();
    render(<Tela minutos={30} aoExpirar={aoExpirar} />);
    act(() => vi.advanceTimersByTime(25 * 60_000));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    act(() => vi.advanceTimersByTime(25 * 60_000));
    expect(aoExpirar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(6 * 60_000));
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it('null não sai nunca', () => {
    const aoExpirar = vi.fn();
    render(<Tela minutos={null} aoExpirar={aoExpirar} />);
    act(() => vi.advanceTimersByTime(24 * 60 * 60_000));
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});
