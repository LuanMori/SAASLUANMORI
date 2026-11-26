// packages/core/test/manutencao.test.ts — manutenção (Adm. Sup, módulo 13h): o registro de erros e a conferência do
// estoque.
import { describe, expect, it } from 'vitest';
import { ajusteParaZerar, conferirEstoqueDaLoja, juntarErro, lerErro, LIMITES_ERROS, MOTIVO_ZERAR_NEGATIVO, type RegistroDeErro, resumirAuditoria } from '../src';

const POR = { id: 'adm-sup', nome: 'Suporte' };

describe('registro de erros', () => {
  it('lê só textos, sem caractere de controle, cortados no tamanho máximo', () => {
    expect(lerErro({ mensagem: '  Cannot read\nproperties  ', onde: 'app.js:10:5', tela: 'frente-de-caixa', extra: 1 })).toEqual({
      ok: true,
      valor: { mensagem: 'Cannot read properties', onde: 'app.js:10:5', tela: 'frente-de-caixa' },
    });
    expect(lerErro({ mensagem: 'x'.repeat(400) })).toMatchObject({ ok: true, valor: { onde: null, tela: null } });
    expect((lerErro({ mensagem: 'x'.repeat(400) }) as { valor: { mensagem: string } }).valor.mensagem).toHaveLength(LIMITES_ERROS.mensagemMax);
    expect(lerErro({ mensagem: ' ' }).ok).toBe(false);
    expect(lerErro('erro').ok).toBe(false);
  });

  it('o mesmo erro logo em seguida vira "mais uma vez"; guarda só os mais novos', () => {
    const novo = { mensagem: 'Falhou', onde: 'a.js:1', tela: 'clientes' };
    let lista: RegistroDeErro[] = [];
    lista = juntarErro(lista, novo, { id: 'e1', em: '2026-11-26T12:00:00.000Z', quem: 'ana' });
    lista = juntarErro(lista, novo, { id: 'e2', em: '2026-11-26T12:00:30.000Z', quem: 'ana' });
    expect(lista).toEqual([{ id: 'e1', em: '2026-11-26T12:00:00.000Z', ultimoEm: '2026-11-26T12:00:30.000Z', vezes: 2, ...novo, quem: 'ana' }]);
    // outra pessoa, outra aba ou depois de um minuto: linha nova
    lista = juntarErro(lista, novo, { id: 'e3', em: '2026-11-26T12:00:40.000Z', quem: 'bruno' });
    lista = juntarErro(lista, { ...novo, tela: 'relatorios' }, { id: 'e4', em: '2026-11-26T12:00:50.000Z', quem: 'bruno' });
    lista = juntarErro(lista, { ...novo, tela: 'relatorios' }, { id: 'e5', em: '2026-11-26T12:02:00.000Z', quem: 'bruno' });
    expect(lista.map((e) => [e.id, e.vezes])).toEqual([
      ['e1', 2],
      ['e3', 1],
      ['e4', 1],
      ['e5', 1],
    ]);
    for (let i = 0; i < 120; i++) lista = juntarErro(lista, { mensagem: `erro ${i}`, onde: null, tela: null }, { id: `x${i}`, em: '2026-11-26T13:00:00.000Z', quem: null });
    expect(lista).toHaveLength(LIMITES_ERROS.porLoja);
    expect(lista.at(-1)!.mensagem).toBe('erro 119');
  });
});

describe('conferir o estoque', () => {
  const produtos = [
    { id: 'p1', nome: 'Ração', unidade: 'kg' },
    { id: 'p2', nome: 'Petisco', unidade: 'un' },
    { id: 'p3', nome: 'Areia', unidade: null },
  ];

  it('os produtos com saldo negativo (o mais negativo primeiro) e os movimentos sem produto', () => {
    const movimentos = [
      { produtoId: 'p1', quantidade: 1000 },
      { produtoId: 'p1', quantidade: -1500 },
      { produtoId: 'p2', quantidade: 3 },
      { produtoId: 'p3', quantidade: -2 },
      { produtoId: 'sumiu', quantidade: 5 },
      { produtoId: 'sumiu', quantidade: -1 },
    ];
    expect(conferirEstoqueDaLoja(produtos, movimentos)).toEqual({
      negativos: [
        { produtoId: 'p1', nome: 'Ração', saldo: -500, unidade: 'kg' },
        { produtoId: 'p3', nome: 'Areia', saldo: -2, unidade: 'un' },
      ],
      movimentosSemProduto: 2,
    });
    expect(conferirEstoqueDaLoja(produtos, [])).toEqual({ negativos: [], movimentosSemProduto: 0 });
  });

  it('zerar o saldo é um ajuste com o motivo do suporte; o histórico mostra quanto entrou', () => {
    expect(ajusteParaZerar('p3', -2, { em: '2026-11-26T12:00:00.000Z', por: POR })).toEqual({
      produtoId: 'p3',
      tipo: 'ajuste',
      quantidade: 2,
      criadoEm: '2026-11-26T12:00:00.000Z',
      motivo: MOTIVO_ZERAR_NEGATIVO,
      observacao: null,
      vendaId: null,
      vendaNumero: null,
      por: POR,
    });
    expect(resumirAuditoria('suporte.estoque_zerado', { quantidade: 500, unidade: 'kg' })).toBe('+0,5 kg');
    expect(resumirAuditoria('suporte.estoque_zerado', { quantidade: 2, unidade: 'un' })).toBe('+2 un');
    expect(resumirAuditoria('suporte.erros_limpos', { erros: 12 })).toBe('12 erros');
  });
});
