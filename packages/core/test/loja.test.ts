// packages/core/test/loja.test.ts
import { describe, expect, it } from 'vitest';
import { subdominioDoEndereco, validarNovoProduto, validarSubdominio } from '../src';

describe('endereço da loja (subdomínio)', () => {
  it.each(['lojaa', 'pet-shop-da-ana', 'a', '1loja', 'x'.repeat(63)])('aceita "%s"', (s) => {
    expect(validarSubdominio(s)).toEqual({ ok: true, valor: s });
  });

  it('guarda em minúsculas e sem espaço nas pontas', () => {
    expect(validarSubdominio('  LojaA ')).toEqual({ ok: true, valor: 'lojaa' });
  });

  it.each(['', '-loja', 'loja-', 'loja a', 'lója', 'loja.a', 'x'.repeat(64), 42, null])('recusa %p', (s) => {
    expect(validarSubdominio(s).ok).toBe(false);
  });

  it.each(['www', 'app', 'api', 'login', 'admin'])('"%s" é reservado', (s) => {
    expect(validarSubdominio(s)).toEqual({ ok: false, erros: [{ campo: 'loja', mensagem: `"${s}" é reservado. Escolha outro endereço.` }] });
  });

  it('acha a loja pelo endereço acessado', () => {
    expect(subdominioDoEndereco('lojaa.nomedaempresa.com.br', 'nomedaempresa.com.br')).toBe('lojaa');
    expect(subdominioDoEndereco('LojaA.NomeDaEmpresa.com.br:443', 'nomedaempresa.com.br')).toBe('lojaa');
    expect(subdominioDoEndereco('lojaa.nomedaempresa.com.br.', 'nomedaempresa.com.br')).toBe('lojaa');
  });

  it.each([
    ['nomedaempresa.com.br', 'o próprio domínio'],
    ['a.b.nomedaempresa.com.br', 'dois níveis'],
    ['lojaa.outraempresa.com.br', 'outro domínio'],
    ['lojaa.nomedaempresa.com.br.evil.com', 'domínio de fora no fim'],
    ['www.nomedaempresa.com.br', 'reservado'],
    ['', 'vazio'],
  ])('"%s" não é loja (%s)', (host) => {
    expect(subdominioDoEndereco(host, 'nomedaempresa.com.br')).toBeNull();
  });

  it('sem Host não é loja', () => {
    expect(subdominioDoEndereco(undefined, 'nomedaempresa.com.br')).toBeNull();
  });
});

describe('acentos (item 4.5)', () => {
  it('o "ç" do Mac (c + cedilha) é guardado igual ao do Windows', () => {
    const decomposto = 'Ração Pássaro';
    expect(decomposto).not.toBe('Ração Pássaro');
    const r = validarNovoProduto({ nome: decomposto, precoCentavos: 100 });
    expect(r.ok && r.valor.nome).toBe('Ração Pássaro');
  });
});
