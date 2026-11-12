// packages/core/test/produto.test.ts
import { describe, expect, it } from 'vitest';
import { CENTAVOS_MAX, MENSAGEM_PRECO_ZERO, formatarCodigoInterno, validarNovoProduto } from '../src';

describe('validarNovoProduto', () => {
  it('aceita produto mínimo e normaliza espaços', () => {
    const r = validarNovoProduto({ nome: '  Ração Premium 15kg  ', precoCentavos: 18990 });
    expect(r).toEqual({ ok: true, valor: { nome: 'Ração Premium 15kg', codigoBarras: null, precoCentavos: 18990 } });
  });

  it('aceita código de barras, remove \\r\\n do leitor nas pontas e preserva zeros à esquerda', () => {
    const r = validarNovoProduto({ nome: 'Areia', codigoBarras: ' 0078912345678\r\n', precoCentavos: 2500 });
    expect(r.ok && r.valor.codigoBarras).toBe('0078912345678');
  });

  it('código de barras vazio ou null vira null', () => {
    for (const codigoBarras of ['   ', '', null]) {
      const r = validarNovoProduto({ nome: 'X', codigoBarras, precoCentavos: 1 });
      expect(r.ok && r.valor.codigoBarras).toBeNull();
    }
  });

  it.each(['COL-01', '789 123', '78912.3', '7891234567895a', '-123', '٣٤٥'])(
    'recusa código de barras com algo além de números: "%s"',
    (codigoBarras) => {
      const r = validarNovoProduto({ nome: 'X', codigoBarras, precoCentavos: 100 });
      expect(!r.ok && r.erros).toContainEqual({ campo: 'codigoBarras', mensagem: 'O código de barras deve ter só números.' });
    },
  );

  it('recusa código de barras que não é texto ou é longo demais', () => {
    for (const codigoBarras of [7891234567895, '1'.repeat(65)]) {
      const r = validarNovoProduto({ nome: 'X', codigoBarras, precoCentavos: 100 });
      expect(!r.ok && r.erros.some((e) => e.campo === 'codigoBarras'), String(codigoBarras)).toBe(true);
    }
    expect(validarNovoProduto({ nome: 'X', codigoBarras: '1'.repeat(64), precoCentavos: 1 }).ok).toBe(true);
  });

  it('preço zero é recusado e a mensagem explica como dar brinde', () => {
    const r = validarNovoProduto({ nome: 'Brinde', precoCentavos: 0 });
    expect(!r.ok && r.erros).toEqual([{ campo: 'precoCentavos', mensagem: MENSAGEM_PRECO_ZERO }]);
  });

  it('o código interno nunca vem do cliente', () => {
    const r = validarNovoProduto({ nome: 'X', precoCentavos: 100, codigoInterno: '0001' });
    expect(!r.ok && r.erros).toEqual([{ campo: 'codigoInterno', mensagem: 'O código interno é gerado pelo sistema.' }]);
  });

  it.each(['lojaId', 'id', 'codigo'])('recusa campo desconhecido: %s', (campo) => {
    const r = validarNovoProduto({ nome: 'X', precoCentavos: 100, [campo]: 'qualquer' });
    expect(!r.ok && r.erros).toContainEqual({ campo, mensagem: 'Campo não permitido.' });
  });

  it.each([null, undefined, 'texto', 42, []])('recusa entrada que não é objeto: %s', (entrada) => {
    const r = validarNovoProduto(entrada);
    expect(!r.ok && r.erros[0]?.campo).toBe('_');
  });

  it('recusa nome ausente, vazio, longo ou com controle', () => {
    for (const nome of [undefined, 123, '   ', 'a'.repeat(121), 'linha1\nlinha2']) {
      const r = validarNovoProduto({ nome, precoCentavos: 100 });
      expect(!r.ok && r.erros.some((e) => e.campo === 'nome'), String(nome)).toBe(true);
    }
    expect(validarNovoProduto({ nome: 'a'.repeat(120), precoCentavos: 1 }).ok).toBe(true);
  });

  it('recusa preço inválido', () => {
    for (const precoCentavos of [undefined, '100', 10.5, -1, CENTAVOS_MAX + 1, Number.NaN]) {
      const r = validarNovoProduto({ nome: 'X', precoCentavos });
      expect(!r.ok && r.erros.some((e) => e.campo === 'precoCentavos'), String(precoCentavos)).toBe(true);
    }
    expect(validarNovoProduto({ nome: 'X', precoCentavos: 1 }).ok).toBe(true);
    expect(validarNovoProduto({ nome: 'X', precoCentavos: CENTAVOS_MAX }).ok).toBe(true);
  });

  it('junta todos os erros de uma vez', () => {
    const r = validarNovoProduto({ nome: '', codigoBarras: 'ABC', precoCentavos: 0, extra: 1 });
    expect(!r.ok && r.erros.map((e) => e.campo).sort()).toEqual(['codigoBarras', 'extra', 'nome', 'precoCentavos']);
  });
});

describe('formatarCodigoInterno', () => {
  it.each([
    [1, '0001'],
    [42, '0042'],
    [9999, '9999'],
    [10000, '10000'],
    [123456789, '123456789'],
  ])('%i -> %s', (n, esperado) => {
    expect(formatarCodigoInterno(n)).toBe(esperado);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('recusa %s', (n) => {
    expect(() => formatarCodigoInterno(n)).toThrow(RangeError);
  });

  it('recusa passar de 18 dígitos', () => {
    expect(formatarCodigoInterno(999_999_999_999_999)).toBe('999999999999999');
    expect(() => formatarCodigoInterno(1e18)).toThrow(RangeError);
  });
});
