// packages/core/test/fornecedor.test.ts — cadastro simples de fornecedores (Fase 2, módulo 3; decisão P9).
import { describe, expect, it } from 'vitest';
import { cnpjValido, conferirDocumentoUnico, formatarDocumento, resumirAuditoria, validarAlteracaoProduto, validarFornecedor, validarNovoProduto } from '../src';

const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem : '');

describe('fornecedor', () => {
  it('nome obrigatório; documento e telefone opcionais, guardados só com números', () => {
    const r = validarFornecedor({ nome: '  Distribuidora  Pet Sul ', documento: '11.222.333/0001-81', telefone: '(41) 3333-4444', contato: ' Marcos ', observacao: '' });
    expect(r.ok && r.valor).toEqual({ nome: 'Distribuidora Pet Sul', documento: '11222333000181', telefone: '4133334444', contato: 'Marcos', observacao: null });
    const so = validarFornecedor({ nome: 'Feira do Bairro' });
    expect(so.ok && so.valor).toEqual({ nome: 'Feira do Bairro', documento: null, telefone: null, contato: null, observacao: null });
    expect(mensagem(validarFornecedor({ nome: ' ' }))).toBe('Informe o nome do fornecedor.');
    expect(mensagem(validarFornecedor({ nome: 'x'.repeat(121) }))).toMatch(/até 120/);
  });

  it('confere CNPJ e CPF (dígitos verificadores) e o telefone com DDD', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(validarFornecedor({ nome: 'Pessoa física', documento: '529.982.247-25' }).ok).toBe(true);
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', documento: '11222333000182' }))).toMatch(/Documento inválido/);
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', documento: '123' }))).toMatch(/Documento inválido/);
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', telefone: '3333-4444' }))).toBe('Telefone com DDD: 10 ou 11 números.');
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', contato: 5 }))).toBe('Envie um texto.');
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', observacao: 'x'.repeat(301) }))).toMatch(/até 300/);
    expect(mensagem(validarFornecedor({ nome: 'X Ltda', lojaId: 'outra' }))).toBe('Campo não permitido.');
    expect(mensagem(validarFornecedor('x'))).toMatch(/objeto/);
  });

  it('documento não se repete na loja; formatação para mostrar', () => {
    const lista = [{ id: 'a', nome: 'Pet Sul', documento: '11222333000181' }];
    expect(mensagem(conferirDocumentoUnico('11222333000181', lista))).toBe('Este documento já é do fornecedor "Pet Sul".');
    expect(conferirDocumentoUnico('11222333000181', lista, 'a').ok).toBe(true);
    expect(conferirDocumentoUnico(null, lista).ok).toBe(true);
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento(null)).toBe('');
  });

  it('o produto aponta para o fornecedor principal (só no cadastro completo)', () => {
    const r = validarNovoProduto({ nome: 'Areia', precoCentavos: 100, fornecedorId: 'f1' }, { completo: true });
    expect(r.ok && r.valor.fornecedorId).toBe('f1');
    expect(validarNovoProduto({ nome: 'Areia', precoCentavos: 100, fornecedorId: 'f1' }).ok).toBe(false); // servidor: ainda não
    expect(mensagem(validarNovoProduto({ nome: 'Areia', precoCentavos: 100, fornecedorId: 7 }, { completo: true }))).toBe('Escolha o fornecedor na lista.');
    const m = validarAlteracaoProduto({ fornecedorId: '' });
    expect(m.ok && m.valor).toEqual({ fornecedorId: null });
  });

  it('histórico do fornecedor', () => {
    expect(resumirAuditoria('fornecedor.alterado', { campos: ['telefone', 'contato'] })).toBe('telefone, contato');
  });
});
