// apps/web/src/tema.test.ts — tema claro / escuro (DaniPets ACE-15).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alternarTema, aplicarTema, escolhaDoTema, iniciarTema, temaAtual } from './tema';

let escuroNoSistema = false;
const mudancas: (() => void)[] = [];

beforeEach(() => {
  localStorage.clear();
  escuroNoSistema = false;
  mudancas.length = 0;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return escuroNoSistema;
      },
      addEventListener: (_: string, f: () => void) => mudancas.push(f),
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('tema', () => {
  it('sem escolha, segue o computador (e muda junto com ele)', () => {
    expect(escolhaDoTema()).toBe('auto');
    expect(temaAtual()).toBe('claro');
    escuroNoSistema = true;
    expect(temaAtual()).toBe('escuro');
    iniciarTema();
    expect(document.documentElement.dataset.tema).toBe('escuro');
    escuroNoSistema = false;
    mudancas.forEach((f) => f());
    expect(document.documentElement.dataset.tema).toBe('claro');
  });

  it('o botão troca e a escolha fica guardada (vale mais que o computador)', () => {
    expect(alternarTema()).toBe('escuro');
    expect(localStorage.getItem('saas:tema')).toBe('escuro');
    expect(document.documentElement.dataset.tema).toBe('escuro');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    escuroNoSistema = false;
    expect(aplicarTema()).toBe('escuro');
    expect(alternarTema()).toBe('claro');
    expect(escolhaDoTema()).toBe('claro');
  });

  it('valor estranho guardado vale como "seguir o computador"', () => {
    localStorage.setItem('saas:tema', 'roxo');
    expect(escolhaDoTema()).toBe('auto');
  });

  it('navegador que não deixa guardar: a escolha vale só nesta aba', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    try {
      expect(alternarTema()).toBe('escuro');
      expect(document.documentElement.dataset.tema).toBe('escuro');
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
