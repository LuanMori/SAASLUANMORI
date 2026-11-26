// packages/core/test/visoes.test.ts — visões sob medida (Adm. Sup, módulo 13g): a conferência da visão e a conta
// (filtros, agrupar e somar, ordem e colunas) em cima de uma tabela dos Relatórios.
import { describe, expect, it } from 'vitest';
import { aplicarVisao, descreverVisao, LISTA_BASES_DAS_VISOES, operadoresDoTipo, resumirAuditoria, type TabelaDaVisao, validarVisao } from '../src';

const mensagens = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (r.ok ? [] : r.erros!.map((e) => e.mensagem));

/** Um pedaço da tabela "Vendas" dos Relatórios. */
const VENDAS: TabelaDaVisao = {
  colunas: [
    { titulo: 'Número', tipo: 'inteiro' },
    { titulo: 'Data', tipo: 'data' },
    { titulo: 'Vendedor' },
    { titulo: 'Pagamento' },
    { titulo: 'Total', tipo: 'dinheiro' },
    { titulo: 'Desconto', tipo: 'pct' },
  ],
  linhas: [
    [1, '2026-11-01', 'Ana', 'Pix', 5000, 0],
    [2, '2026-11-02', 'Bruno', 'Dinheiro', 1990, 10],
    [3, '2026-11-02', 'Ana', 'Crédito', 12000, null],
    [4, '2026-11-05', 'Ângela', 'Pix', 800, 5],
    [5, '2026-11-06', null, 'Pix', 3000, 0],
  ],
};

const VISAO = { colunas: [] as string[], filtros: [], agruparPor: null, ordem: null };

describe('conferir a visão', () => {
  it('nome, base, colunas, filtros, agrupamento e ordem; o nome não repete na loja', () => {
    const r = validarVisao(
      {
        nome: '  Vendas  por vendedor ',
        base: 'vendas',
        colunas: ['Vendedor', 'Total', 'Vendedor'],
        filtros: [{ coluna: 'Pagamento', operador: 'igual', valor: ' Pix ' }, { coluna: 'Vendedor', operador: 'preenchido', valor: 'ignorado' }],
        agruparPor: 'Vendedor',
        ordem: { coluna: 'Total', sentido: 'desc' },
      },
      { outras: [] },
    );
    expect(r).toEqual({
      ok: true,
      valor: {
        nome: 'Vendas por vendedor',
        base: 'vendas',
        colunas: ['Vendedor', 'Total'],
        filtros: [
          { coluna: 'Pagamento', operador: 'igual', valor: 'Pix' },
          { coluna: 'Vendedor', operador: 'preenchido', valor: '' },
        ],
        agruparPor: 'Vendedor',
        ordem: { coluna: 'Total', sentido: 'desc' },
      },
    });
    expect(validarVisao({ nome: 'Só o básico', base: 'clientes' }, { outras: [] })).toEqual({
      ok: true,
      valor: { nome: 'Só o básico', base: 'clientes', colunas: [], filtros: [], agruparPor: null, ordem: null },
    });
    const outras = [{ id: 'v1', nome: 'Vendas por Vendedor' }];
    expect(mensagens(validarVisao({ nome: 'vendas por vendedor', base: 'vendas' }, { outras }))).toEqual(['Já existe a visão "vendas por vendedor" nesta loja. Escolha outro nome.']);
    expect(validarVisao({ nome: 'vendas por vendedor', base: 'vendas' }, { outras, id: 'v1' }).ok).toBe(true); // a própria, alterada
    expect(mensagens(validarVisao({ nome: 'ab', base: 'caixa', extra: 1 }, { outras: [] }))).toEqual([
      'Campo não permitido.',
      'Dê um nome à visão (pelo menos 3 letras), como "Vendas por vendedor".',
      'Escolha a base da visão (uma das tabelas dos Relatórios).',
    ]);
    expect(
      mensagens(
        validarVisao(
          {
            nome: 'Filtros',
            base: 'vendas',
            filtros: [{ coluna: 'Total', operador: 'maior', valor: '' }, { coluna: 'Total', operador: 'parecido', valor: '1' }, { coluna: '', operador: 'igual', valor: '1' }],
            ordem: { coluna: 'Total', sentido: 'baixo' },
          },
          { outras: [] },
        ),
      ),
    ).toEqual([
      'Filtro 1: escreva o valor (ou escolha "está vazio" / "está preenchido").',
      'Filtro 2: escolha a condição.',
      'Filtro 3: escolha uma coluna da base.',
      'Ordem: escolha a coluna e se é crescente ou decrescente.',
    ]);
    expect(mensagens(validarVisao({ nome: 'Muitos', base: 'vendas', filtros: [1, 2, 3, 4] }, { outras: [] }))).toEqual(['Use até 3 filtros.']);
    expect(LISTA_BASES_DAS_VISOES).toHaveLength(18);
  });

  it('os operadores de cada tipo de coluna', () => {
    expect(operadoresDoTipo('texto')).toEqual(['contem', 'igual', 'diferente', 'vazio', 'preenchido']);
    expect(operadoresDoTipo('dinheiro')).toEqual(['igual', 'diferente', 'maior', 'menor', 'vazio', 'preenchido']);
  });
});

describe('montar a visão', () => {
  it('sem nada escolhido, é a própria tabela', () => {
    expect(aplicarVisao(VENDAS, VISAO)).toEqual({ tabela: VENDAS, avisos: [] });
  });

  it('filtros de texto sem acento e sem diferença de maiúsculas; de dinheiro em reais; de data em dd/mm/aaaa', () => {
    const numeros = (filtros: unknown[]) => aplicarVisao(VENDAS, { ...VISAO, filtros: filtros as never }).tabela.linhas.map((l) => l[0]);
    expect(numeros([{ coluna: 'Vendedor', operador: 'contem', valor: 'an' }])).toEqual([1, 3, 4]); // Ana, Ana e Ângela
    expect(numeros([{ coluna: 'Pagamento', operador: 'igual', valor: 'pix' }])).toEqual([1, 4, 5]);
    expect(numeros([{ coluna: 'Pagamento', operador: 'diferente', valor: 'Pix' }])).toEqual([2, 3]);
    expect(numeros([{ coluna: 'Total', operador: 'maior', valor: '30,00' }])).toEqual([1, 3, 5]);
    expect(numeros([{ coluna: 'Total', operador: 'menor', valor: 'R$ 19,90' }])).toEqual([2, 4]);
    expect(numeros([{ coluna: 'Data', operador: 'igual', valor: '02/11/2026' }])).toEqual([2, 3]);
    expect(numeros([{ coluna: 'Data', operador: 'maior', valor: '2026-11-05' }])).toEqual([4, 5]);
    expect(numeros([{ coluna: 'Vendedor', operador: 'vazio', valor: '' }])).toEqual([5]);
    expect(numeros([{ coluna: 'Desconto', operador: 'preenchido', valor: '' }])).toEqual([1, 2, 4, 5]);
    // todos os filtros precisam valer
    expect(numeros([{ coluna: 'Pagamento', operador: 'igual', valor: 'Pix' }, { coluna: 'Total', operador: 'maior', valor: '10' }])).toEqual([1, 5]);
  });

  it('o que não serve fica de fora com um aviso: coluna que a base não tem, valor que não é número ou data', () => {
    const r = aplicarVisao(VENDAS, {
      ...VISAO,
      colunas: ['Número', 'Cliente'],
      filtros: [
        { coluna: 'Total', operador: 'maior', valor: 'muito' },
        { coluna: 'Data', operador: 'igual', valor: '31/02/2026' },
        { coluna: 'Cliente', operador: 'contem', valor: 'Maria' },
      ],
    });
    expect(r.tabela.colunas.map((c) => c.titulo)).toEqual(['Número']);
    expect(r.tabela.linhas).toHaveLength(5);
    expect(r.avisos).toEqual([
      'O filtro "Total é maior ou igual a muito" ficou de fora: "muito" não é um número.',
      'O filtro "Data é igual a 31/02/2026" ficou de fora: "31/02/2026" não é uma data (dd/mm/aaaa).',
      'A coluna "Cliente" não existe nesta base e ficou de fora.',
    ]);
  });

  it('a ordem (pode ser por coluna que não aparece; vazias por último) e as colunas na ordem escolhida', () => {
    const r = aplicarVisao(VENDAS, { ...VISAO, colunas: ['Vendedor', 'Número'], ordem: { coluna: 'Total', sentido: 'desc' } });
    expect(r.tabela.colunas.map((c) => c.titulo)).toEqual(['Vendedor', 'Número']);
    expect(r.tabela.linhas).toEqual([
      ['Ana', 3],
      ['Ana', 1],
      [null, 5],
      ['Bruno', 2],
      ['Ângela', 4],
    ]);
    const porNome = aplicarVisao(VENDAS, { ...VISAO, colunas: ['Vendedor'], ordem: { coluna: 'Vendedor', sentido: 'asc' } });
    expect(porNome.tabela.linhas.map((l) => l[0])).toEqual(['Ana', 'Ana', 'Ângela', 'Bruno', null]);
  });

  it('agrupar: uma linha por valor, com a quantidade e a soma das colunas de número (o percentual não soma)', () => {
    const r = aplicarVisao(VENDAS, { ...VISAO, agruparPor: 'Pagamento', ordem: { coluna: 'Total', sentido: 'desc' } });
    expect(r.tabela.colunas).toEqual([{ titulo: 'Pagamento' }, { titulo: 'Quantidade', tipo: 'inteiro' }, { titulo: 'Número', tipo: 'inteiro' }, { titulo: 'Total', tipo: 'dinheiro' }]);
    expect(r.tabela.linhas).toEqual([
      ['Crédito', 1, 3, 12000],
      ['Pix', 3, 10, 8800],
      ['Dinheiro', 1, 2, 1990],
    ]);
    // só as colunas escolhidas; sem ordem, pelo valor do grupo (vazio por último)
    const porVendedor = aplicarVisao(VENDAS, { ...VISAO, colunas: ['Vendedor', 'Total', 'Pagamento'], agruparPor: 'Vendedor' });
    expect(porVendedor.tabela.colunas.map((c) => c.titulo)).toEqual(['Vendedor', 'Quantidade', 'Total']);
    expect(porVendedor.tabela.linhas).toEqual([
      ['Ana', 2, 17000],
      ['Ângela', 1, 800],
      ['Bruno', 1, 1990],
      [null, 1, 3000],
    ]);
    expect(porVendedor.avisos).toEqual([]);
    // ordem por "Quantidade" vale; por uma coluna que a visão agrupada não tem, avisa
    expect(aplicarVisao(VENDAS, { ...VISAO, agruparPor: 'Pagamento', ordem: { coluna: 'Quantidade', sentido: 'desc' } }).tabela.linhas[0]![0]).toBe('Pix');
    expect(aplicarVisao(VENDAS, { ...VISAO, agruparPor: 'Pagamento', ordem: { coluna: 'Data', sentido: 'asc' } }).avisos).toEqual([
      'Ordem por "Data": agrupada, a visão só tem o grupo, a quantidade e as somas; ficou pela ordem do grupo.',
    ]);
  });

  it('agrupar numa base que já tem a coluna "Quantidade": a contagem vira "Quantidade de linhas"', () => {
    const itens: TabelaDaVisao = {
      colunas: [{ titulo: 'Produto' }, { titulo: 'Quantidade', tipo: 'numero' }],
      linhas: [
        ['Ração', 1.5],
        ['Ração', 2.25],
        ['Areia', 1],
      ],
    };
    const r = aplicarVisao(itens, { ...VISAO, agruparPor: 'Produto' });
    expect(r.tabela.colunas.map((c) => c.titulo)).toEqual(['Produto', 'Quantidade de linhas', 'Quantidade']);
    expect(r.tabela.linhas).toEqual([
      ['Areia', 1, 1],
      ['Ração', 2, 3.75],
    ]);
  });

  it('a descrição da visão e o resumo no histórico', () => {
    expect(
      descreverVisao({
        base: 'vendas',
        colunas: ['Vendedor', 'Total'],
        filtros: [
          { coluna: 'Pagamento', operador: 'igual', valor: 'Pix' },
          { coluna: 'Vendedor', operador: 'preenchido', valor: '' },
        ],
        agruparPor: 'Vendedor',
        ordem: { coluna: 'Total', sentido: 'desc' },
      }),
    ).toBe('Vendas · 2 colunas · Pagamento é igual a "Pix" · Vendedor está preenchido · agrupada por Vendedor · ordem: Total (decrescente)');
    expect(descreverVisao({ base: 'estoque', ...VISAO })).toBe('Estoque · todas as colunas');
    expect(resumirAuditoria('suporte.visao_salva', { base: 'vendas', nova: true })).toBe('Vendas • nova');
    expect(resumirAuditoria('suporte.visao_salva', { base: 'aPagar', nova: false })).toBe('A pagar • alterada');
    expect(resumirAuditoria('suporte.visao_excluida', { base: 'clientes' })).toBe('Clientes');
  });
});
