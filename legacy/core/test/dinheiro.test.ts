// packages/core/test/dinheiro.test.ts
import { describe, expect, it } from 'vitest';
import { CENTAVOS_MAX, ehPapel, ehPapelDeLoja, formatarCentavos, reaisParaCentavos } from '../src';

describe('formatarCentavos', () => {
  it('formata em BRL', () => {
    expect(formatarCentavos(1250)).toBe('R$\u00a012,50');
    expect(formatarCentavos(0)).toBe('R$\u00a00,00');
    expect(formatarCentavos(123456789)).toBe('R$\u00a01.234.567,89');
  });

  it('zero negativo aparece sem o "-"', () => {
    expect(formatarCentavos(-0)).toBe('R$\u00a00,00');
    expect(formatarCentavos(-[].reduce((s: number, x: number) => s + x, 0))).toBe('R$\u00a00,00');
    expect(formatarCentavos(-150)).toBe('-R$\u00a01,50');
  });

  it('recusa não-inteiro', () => {
    expect(() => formatarCentavos(10.5)).toThrow(RangeError);
  });
});

describe('reaisParaCentavos', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['0,99', 99],
    ['1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['R$\u00a010,00', 1000],
    ['12.50', 1250],
    ['12.5', 1250],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['12,', 1200],
    ['0.1', 10],
  ])('"%s" -> %i', (texto, esperado) => {
    expect(reaisParaCentavos(texto)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', '-5', '12,345', '1,2,3', '1.2.3', '1.23,45', '12.3456', ',50', '1e3', '21474836,48'])(
    'recusa "%s"',
    (texto) => {
      expect(reaisParaCentavos(texto)).toBeNull();
    },
  );

  it('aceita o limite técnico exato', () => {
    expect(reaisParaCentavos('21474836,47')).toBe(CENTAVOS_MAX);
  });

  it('evita erro de ponto flutuante', () => {
    // 0.1 + 0.2 em float daria 30.000000000000004 centavos
    expect(reaisParaCentavos('0,30')).toBe(30);
    expect(reaisParaCentavos('19,99')).toBe(1999);
  });
});

describe('ehPapel', () => {
  it('reconhece papéis válidos', () => {
    expect(ehPapel('vendedor')).toBe(true);
    expect(ehPapel('super_admin')).toBe(true);
    expect(ehPapel('root')).toBe(false);
    expect(ehPapel(1)).toBe(false);
  });

  it('super_admin não é papel de loja', () => {
    expect(ehPapelDeLoja('dono')).toBe(true);
    expect(ehPapelDeLoja('administrador')).toBe(true);
    expect(ehPapelDeLoja('vendedor')).toBe(true);
    expect(ehPapelDeLoja('super_admin')).toBe(false);
    expect(ehPapelDeLoja(undefined)).toBe(false);
  });
});
