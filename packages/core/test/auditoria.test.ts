// packages/core/test/auditoria.test.ts — textos e resumo do histórico (iguais no servidor e na demonstração).
import { describe, expect, it } from 'vitest';
import { ACOES_AUDITORIA, ehAcaoAuditoria, resumirAuditoria } from '../src';

const nomes = new Map([['ana', 'Ana']]);
const nome = (id: string) => nomes.get(id) ?? null;
const limpo = (t: string) => t.replace(/ /g, ' ');

describe('ações do histórico', () => {
  it('texto de cada ação (nomes do DaniPets)', () => {
    expect(ACOES_AUDITORIA['venda.cancelada']).toBe('Venda cancelada');
    expect(ACOES_AUDITORIA['venda.devolucao']).toBe('Devolução de venda');
    expect(ACOES_AUDITORIA['estoque.ajuste']).toBe('Ajuste de estoque');
    expect(ACOES_AUDITORIA['financeiro.retirada']).toBe('Retirada do dono');
    expect(ACOES_AUDITORIA['loja.regras_alteradas']).toBe('Regras da loja alteradas');
    expect(ehAcaoAuditoria('cliente.cadastrado')).toBe(true);
    expect(ehAcaoAuditoria('toString')).toBe(false);
    expect(ehAcaoAuditoria(1)).toBe(false);
  });
});

describe('resumo dos detalhes', () => {
  it('vendas: número, valor e quem autorizou (nome buscado na hora)', () => {
    expect(limpo(resumirAuditoria('venda.desconto', { numero: 12, descontoCentavos: 500, autorizadoPor: 'ana' }, nome))).toBe(
      'venda nº 00012 • R$ 5,00 de desconto • autorizado por Ana',
    );
    expect(limpo(resumirAuditoria('venda.desconto', { numero: 3, descontoCentavos: 750, brinde: true }, nome))).toBe('venda nº 00003 • R$ 7,50 de desconto • com brinde');
    expect(limpo(resumirAuditoria('venda.cancelada', { numero: 7, valorCentavos: 18990, autorizadoPor: 'removido' }, nome))).toBe('venda nº 00007 • R$ 189,90');
    expect(limpo(resumirAuditoria('venda.devolucao', { numero: 7, valorCentavos: 2490 }))).toBe('venda nº 00007 • R$ 24,90');
  });

  it('usuários, loja, estoque e financeiro', () => {
    expect(resumirAuditoria('usuario.criado', { papel: 'vendedor' })).toBe('Vendedor');
    expect(resumirAuditoria('usuario.alterado', { papelAntes: 'vendedor', papelDepois: 'administrador' })).toBe('papel: Vendedor → Administrador');
    expect(resumirAuditoria('usuario.alterado', { campos: ['nome'] })).toBe('');
    expect(resumirAuditoria('loja.dados_alterados', { campos: ['nome', 'logo'] })).toBe('nome, logo');
    expect(resumirAuditoria('loja.regras_alteradas', { secoes: ['fiado', 'cashback'] })).toBe('fiado, cashback');
    expect(resumirAuditoria('estoque.ajuste', { quantidade: -2, motivo: 'Perda ou avaria' })).toBe('-2 un • Perda ou avaria');
    expect(resumirAuditoria('estoque.ajuste', { quantidade: -1500, unidade: 'kg', motivo: 'Outro', observacao: 'saco rasgado' })).toBe('-1,5 kg • Outro • saco rasgado');
    expect(resumirAuditoria('estoque.entrada', { quantidade: 10 })).toBe('+10 un');
    expect(resumirAuditoria('estoque.minimo', { minimo: 4 })).toBe('mínimo 4 un');
    expect(resumirAuditoria('estoque.minimo', { minimo: 2500, unidade: 'kg' })).toBe('mínimo 2,5 kg');
    expect(limpo(resumirAuditoria('produto.preco_alterado', { de: 1500, para: 1690 }))).toBe('R$ 15,00 → R$ 16,90');
    expect(resumirAuditoria('produto.alterado', { campos: ['nome', 'codigoBarras', 'unidade'] })).toBe('nome, código de barras, unidade');
    expect(resumirAuditoria('produto.excluido', { nome: 'Coleira M', codigo: '0007' })).toBe('Coleira M • código 0007');
    expect(resumirAuditoria('produto.criado', { codigoInterno: '0012' })).toBe('código 0012');
    expect(resumirAuditoria('estoque.minimo', { minimo: null })).toBe('sem aviso de estoque baixo');
    expect(limpo(resumirAuditoria('financeiro.despesa', { valorCentavos: 12000, conta: 'caixa', categoria: 'Aluguel' }))).toBe('R$ 120,00 • Caixa físico • Aluguel');
    expect(limpo(resumirAuditoria('financeiro.transferencia', { valorCentavos: 5000, de: 'caixa', para: 'banco' }))).toBe('R$ 50,00 • Caixa físico → Conta bancária');
    expect(limpo(resumirAuditoria('financeiro.transferencia', { valorCentavos: 5000, de: 'x', para: 'banco' }))).toBe('R$ 50,00');
    // os nomes que a loja deu às contas saem na hora de mostrar (o histórico guarda só o id)
    const nomes = { banco: 'Banco Itaú', caixa: 'Gaveta' };
    expect(limpo(resumirAuditoria('financeiro.transferencia', { valorCentavos: 5000, de: 'caixa', para: 'banco' }, () => null, nomes))).toBe('R$ 50,00 • Gaveta → Banco Itaú');
    expect(limpo(resumirAuditoria('conta_pagar.paga', { valorCentavos: 5000, conta: 'banco' }, () => null, nomes))).toBe('R$ 50,00 • Banco Itaú');
    expect(limpo(resumirAuditoria('caixa.sangria', { valorCentavos: 5000 }, () => null, nomes))).toBe('R$ 50,00 da gaveta para “Banco Itaú”');
    expect(limpo(resumirAuditoria('caixa.sangria', { valorCentavos: 5000 }))).toBe('R$ 50,00 da gaveta para a Conta bancária');
    expect(limpo(resumirAuditoria('caixa.fechado', { dia: '2026-11-20', esperadoCentavos: 1000, contadoCentavos: 900, diferencaCentavos: -100 }, () => null, nomes))).toBe(
      '20/11/2026 • esperado R$ 10,00 • contado R$ 9,00 • falta de R$ 1,00 (ajuste em “Gaveta”)',
    );
    // conta a pagar avulsa do Financeiro: valor, vencimento e categoria (a descrição fica na própria conta)
    expect(limpo(resumirAuditoria('conta_pagar.criada', { valorCentavos: 180000, vencimento: '2026-12-10', categoria: 'Aluguel' }))).toBe('R$ 1.800,00 • vence 10/12/2026 • Aluguel');
    expect(ACOES_AUDITORIA['conta_pagar.criada']).toBe('Conta a pagar lançada');
  });

  it('detalhes estranhos ou vazios não quebram o histórico', () => {
    expect(resumirAuditoria('venda.desconto', null)).toBe('');
    expect(resumirAuditoria('venda.desconto', { numero: 'doze', descontoCentavos: 1.5 })).toBe('');
    expect(resumirAuditoria('sessao.entrou', { qualquer: 1 })).toBe('');
    expect(resumirAuditoria('acao.que.nao.existe', { autorizadoPor: 'ana' }, nome)).toBe('autorizado por Ana');
    expect(resumirAuditoria('loja.regras_alteradas', { secoes: 'fiado' })).toBe('');
  });
});
