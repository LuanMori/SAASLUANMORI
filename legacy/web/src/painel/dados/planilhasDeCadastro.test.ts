// apps/web/src/painel/dados/planilhasDeCadastro.test.ts — as planilhas de cadastro de Dados e backup (módulo 13).
import { type Cliente, colunasClientes, COLUNAS_FORNECEDORES, COLUNAS_PRODUTOS, type Fornecedor } from '@saas/core';
import { describe, expect, it } from 'vitest';
import type { Produto, SaldoEstoque } from '../../api';
import { momentoParaArquivo, nomeParaArquivo, planilhaDeClientes, planilhaDeFornecedores, planilhaDeProdutos } from './planilhasDeCadastro';

const QUANDO = '2026-11-20T12:00:00.000Z';
const produto = (p: Partial<Produto> & Pick<Produto, 'id' | 'nome'>): Produto => ({
  codigoInterno: '0001',
  codigoBarras: null,
  precoCentavos: 1000,
  ativo: true,
  criadoEm: QUANDO,
  atualizadoEm: QUANDO,
  ...p,
});
const fornecedor: Fornecedor = { id: 'f1', nome: 'Distribuidora Pet', documento: '11222333000181', telefone: '4133334444', contato: 'Rui', observacao: 'Entrega às terças', ativo: false, criadoEm: QUANDO, atualizadoEm: QUANDO };
const cliente = (c: Partial<Cliente> & Pick<Cliente, 'id' | 'nome'>): Cliente => ({ telefone: '41999998888', cpf: '52998224725', ativo: true, criadoEm: QUANDO, atualizadoEm: QUANDO, ...c });
/** A linha como registro "título da coluna → valor". */
const comoRegistro = (p: { colunas: { titulo: string }[]; linhas: unknown[][] }, i = 0) => Object.fromEntries(p.colunas.map((c, j) => [c.titulo, p.linhas[i]![j]]));

describe('planilha de produtos', () => {
  it('as colunas do modelo, com o estoque e o mínimo em quilos no produto por kg, o custo e o fornecedor', () => {
    const p = planilhaDeProdutos(
      [
        produto({ id: 'b', nome: 'Ração a granel', codigoInterno: '0002', codigoBarras: '2000000000015', marca: 'Da casa', unidade: 'kg', pesoGramas: 15000, precoCentavos: 1990, fornecedorId: 'f1' }),
        produto({ id: 'a', nome: 'Areia 4 kg', ativo: false }),
      ],
      [
        { produtoId: 'b', saldo: 25_500, minimo: 5000, situacao: 'ok', custoMedioCentavos: 1200 },
        { produtoId: 'a', saldo: 3, minimo: null, situacao: 'ok' },
      ] satisfies SaldoEstoque[],
      [fornecedor],
    );
    expect(p.nome).toBe('Produtos');
    expect(p.colunas.map((c) => c.titulo)).toEqual(COLUNAS_PRODUTOS.map((c) => c.titulo));
    // em ordem de nome
    expect(p.linhas.map((l) => l[1])).toEqual(['Areia 4 kg', 'Ração a granel']);
    expect(comoRegistro(p, 1)).toEqual({
      'Código interno': '0002',
      Nome: 'Ração a granel',
      'Código de barras': '2000000000015',
      Marca: 'Da casa',
      Unidade: 'kg',
      'Peso da embalagem (kg)': 15,
      'Preço de venda': 1990,
      Estoque: 25.5,
      Custo: 1200,
      'Estoque mínimo': 5,
      Fornecedor: 'Distribuidora Pet',
      Situação: 'Ativo',
    });
    expect(comoRegistro(p, 0)).toMatchObject({ Unidade: 'un', Estoque: 3, Custo: null, 'Estoque mínimo': null, Fornecedor: null, Situação: 'Inativo' });
  });

  it('sem o estoque (sistema da loja sem essa parte): as colunas de estoque e custo vão vazias', () => {
    const p = planilhaDeProdutos([produto({ id: 'a', nome: 'Areia' })], null, null);
    expect(comoRegistro(p)).toMatchObject({ Nome: 'Areia', Estoque: null, Custo: null, 'Estoque mínimo': null });
  });
});

describe('planilha de clientes', () => {
  const clientes = [
    cliente({ id: 'm', nome: 'Maria Souza', nascimento: '1990-05-17', endereco: 'Rua A, 10', extra: 'Thor', limiteFiadoCentavos: 20000, observacoes: 'Prefere Pix', autorizaMensagens: { em: QUANDO, por: { id: 'ana', nome: 'Ana' } } }),
    cliente({ id: 'j', nome: 'João Lima', telefone: '4133330003', whatsapp: undefined }),
    cliente({ id: 'x', nome: 'Cliente removido', cpf: '', telefone: '', dadosExcluidos: { em: QUANDO, por: { id: 'ana', nome: 'Ana' }, motivo: 'pedido' } }),
  ];

  it('com o campo extra da loja e o CPF completo; quem teve os dados excluídos (LGPD) fica de fora', () => {
    const p = planilhaDeClientes(clientes, { ativo: true, rotulo: 'Pet' }, true);
    expect(p.colunas.map((c) => c.titulo)).toEqual(colunasClientes('Pet').map((c) => c.titulo));
    expect(p.linhas.map((l) => l[0])).toEqual(['João Lima', 'Maria Souza']);
    expect(comoRegistro(p, 1)).toEqual({
      Nome: 'Maria Souza',
      Telefone: '(41) 99999-8888',
      CPF: '529.982.247-25',
      WhatsApp: 'Sim',
      Nascimento: '1990-05-17',
      Endereço: 'Rua A, 10',
      Pet: 'Thor',
      'Limite de fiado': 20000,
      'Aceita mensagens': 'Sim',
      Observações: 'Prefere Pix',
    });
    // telefone fixo: sem WhatsApp; sem limite: 0
    expect(comoRegistro(p, 0)).toMatchObject({ Telefone: '(41) 3333-0003', WhatsApp: 'Não', 'Limite de fiado': 0, 'Aceita mensagens': 'Não' });
  });

  it('sem poder ver o CPF completo: a coluna vai em branco (nunca mascarada); campo extra desligado: sem a coluna', () => {
    const p = planilhaDeClientes(clientes, { ativo: false, rotulo: 'Pet' }, false);
    expect(p.colunas.map((c) => c.titulo)).not.toContain('Pet');
    expect(p.linhas.every((l) => l[2] === null)).toBe(true);
  });
});

describe('planilha de fornecedores e nomes de arquivo', () => {
  it('fornecedores com o documento e o telefone formatados e a situação', () => {
    const p = planilhaDeFornecedores([fornecedor]);
    expect(p.colunas.map((c) => c.titulo)).toEqual(COLUNAS_FORNECEDORES.map((c) => c.titulo));
    expect(comoRegistro(p)).toEqual({ Nome: 'Distribuidora Pet', 'CNPJ ou CPF': '11.222.333/0001-81', Telefone: '(41) 3333-4444', Contato: 'Rui', Observação: 'Entrega às terças', Situação: 'Desativado' });
  });

  it('o nome da loja e a hora da loja no nome do arquivo', () => {
    expect(nomeParaArquivo('Pet & Cia — Água Verde')).toBe('pet-cia-agua-verde');
    expect(nomeParaArquivo('***')).toBe('loja');
    expect(momentoParaArquivo(new Date('2026-11-25T17:32:00Z'), 'America/Sao_Paulo')).toBe('2026-11-25-1432');
    expect(momentoParaArquivo(new Date('2026-11-26T02:05:00Z'), 'America/Sao_Paulo')).toBe('2026-11-25-2305');
  });
});
