// packages/core/test/importacao.test.ts — importar planilhas de cadastro (módulo 13; DaniPets DAT-07).
import { describe, expect, it } from 'vitest';
import {
  type CelulaImportada,
  conferirClientes,
  conferirFornecedores,
  conferirProdutos,
  type ContextoProdutos,
  dataDaCelula,
  dinheiroDaCelula,
  lerCabecalho,
  COLUNAS_PRODUTOS,
  numeroDaCelula,
  resumirAuditoria,
  resumoDaImportacao,
  simNaoDaCelula,
  textoDaCelula,
  validarNovoCliente,
} from '../src';

const ok = <T>(r: { ok: true; valor: T } | { ok: false; erros?: unknown }): T => {
  if (!r.ok) throw new Error(`Esperava ok: ${JSON.stringify(r)}`);
  return r.valor;
};
const erro = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (r.ok ? '' : r.erros![0]!.mensagem);

describe('células', () => {
  it('texto: número vira texto sem perder dígitos; espaços somem nas pontas e no meio', () => {
    expect(textoDaCelula(7891000100103)).toBe('7891000100103');
    expect(textoDaCelula('  Ração   Premium ')).toBe('Ração Premium');
    expect(textoDaCelula(null)).toBe('');
    expect(textoDaCelula(true)).toBe('Sim');
  });

  it('dinheiro: número da planilha ou texto em reais', () => {
    expect(dinheiroDaCelula(24.9)).toEqual({ ok: true, valor: 2490 });
    expect(dinheiroDaCelula('R$ 1.234,56')).toEqual({ ok: true, valor: 123456 });
    expect(dinheiroDaCelula('12,5')).toEqual({ ok: true, valor: 1250 });
    expect(dinheiroDaCelula('')).toEqual({ ok: true, valor: null });
    expect(dinheiroDaCelula('doze')).toEqual({ ok: false });
    expect(dinheiroDaCelula(-1)).toEqual({ ok: false });
  });

  it('número: com vírgula, com ponto ou com milhar', () => {
    expect(numeroDaCelula('2,5')).toEqual({ ok: true, valor: 2.5 });
    expect(numeroDaCelula('2.5')).toEqual({ ok: true, valor: 2.5 });
    expect(numeroDaCelula('1.234,5')).toEqual({ ok: true, valor: 1234.5 });
    expect(numeroDaCelula(12)).toEqual({ ok: true, valor: 12 });
    expect(numeroDaCelula(' ')).toEqual({ ok: true, valor: null });
    expect(numeroDaCelula('dez')).toEqual({ ok: false });
  });

  it('data: número de data do Excel, dd/mm/aaaa ou aaaa-mm-dd', () => {
    expect(dataDaCelula(33010)).toEqual({ ok: true, valor: '1990-05-17' });
    expect(dataDaCelula('17/05/1990')).toEqual({ ok: true, valor: '1990-05-17' });
    expect(dataDaCelula('7/5/1990')).toEqual({ ok: true, valor: '1990-05-07' });
    expect(dataDaCelula('1990-05-17')).toEqual({ ok: true, valor: '1990-05-17' });
    expect(dataDaCelula('31/02/1990')).toEqual({ ok: false });
    expect(dataDaCelula('maio')).toEqual({ ok: false });
    expect(dataDaCelula(null)).toEqual({ ok: true, valor: null });
  });

  it('sim ou não', () => {
    for (const s of ['Sim', 'S', 'x', '1', 'TRUE', true]) expect(simNaoDaCelula(s as CelulaImportada)).toEqual({ ok: true, valor: true });
    for (const n of ['Não', 'nao', 'N', '0', false]) expect(simNaoDaCelula(n as CelulaImportada)).toEqual({ ok: true, valor: false });
    expect(simNaoDaCelula('')).toEqual({ ok: true, valor: null });
    expect(simNaoDaCelula('talvez')).toEqual({ ok: false });
  });
});

describe('títulos', () => {
  it('acha as colunas sem diferenciar maiúsculas, acentos e espaços; o que não é do modelo fica de fora', () => {
    const cab = ok(lerCabecalho([['NOME', ' preco  de venda ', 'Código interno', 'Cor', 'Situação']], COLUNAS_PRODUTOS));
    expect(cab.colunas).toEqual(['Nome', 'Preço de venda']);
    expect(cab.ignoradas).toEqual(['Código interno', 'Cor', 'Situação']); // as de consulta também ficam de fora
  });

  it('falta coluna obrigatória, planilha vazia ou grande demais: o arquivo é recusado', () => {
    expect(erro(lerCabecalho([['Marca', 'Estoque']], COLUNAS_PRODUTOS))).toBe('A planilha não tem as colunas "Nome" e "Preço de venda". Baixe o modelo para conferir os títulos.');
    expect(erro(lerCabecalho([['Nome']], COLUNAS_PRODUTOS))).toBe('A planilha não tem a coluna "Preço de venda". Baixe o modelo para conferir os títulos.');
    expect(erro(lerCabecalho([], COLUNAS_PRODUTOS))).toMatch(/está vazia/);
    expect(erro(lerCabecalho([[null, '']], COLUNAS_PRODUTOS))).toMatch(/está vazia/);
    const grande = [['Nome', 'Preço de venda'], ...Array.from({ length: 5001 }, () => ['x', 1])];
    expect(erro(lerCabecalho(grande, COLUNAS_PRODUTOS))).toMatch(/mais de 5\.000 linhas/);
  });
});

const ctxProdutos = (mais: Partial<ContextoProdutos> = {}): ContextoProdutos => ({
  existentes: [{ id: 'p1', nome: 'Areia 4 kg', codigoInterno: '0001', codigoBarras: '7896000300306', marca: null, pesoGramas: null }],
  fornecedores: [
    { id: 'f1', nome: 'Distribuidora Pet', ativo: true },
    { id: 'f2', nome: 'Antiga Ltda', ativo: false },
  ],
  unidades: ['un', 'kg'],
  podeCusto: true,
  podeMinimo: true,
  ...mais,
});

const TITULOS = ['Nome', 'Código de barras', 'Marca', 'Unidade', 'Peso da embalagem (kg)', 'Preço de venda', 'Estoque', 'Custo', 'Estoque mínimo', 'Fornecedor'];

describe('produtos', () => {
  it('a linha certa vira o cadastro completo: kg em gramas, custo, mínimo e fornecedor; linhas vazias são puladas', () => {
    const c = ok(
      conferirProdutos(
        [
          TITULOS,
          ['Ração a granel', '2000000000015', 'Da casa', 'kg', 1, 19.9, '25,5', 12, 5, 'distribuidora pet'],
          [null, '', null],
          ['Petisco 65 g', null, null, '', null, 'R$ 7,50', 60, null, null, null],
        ],
        ctxProdutos(),
      ),
    );
    expect(c.contagem).toEqual({ nova: 2, existe: 0, repetida: 0, erro: 0 });
    expect(c.linhas.map((l) => l.numero)).toEqual([2, 4]);
    expect(c.linhas[0]!.valor).toEqual({
      produto: { nome: 'Ração a granel', codigoBarras: '2000000000015', precoCentavos: 1990, marca: 'Da casa', pesoGramas: 1000, unidade: 'kg', estoqueInicial: 25_500, custoInicialCentavos: 1200, fornecedorId: 'f1' },
      minimo: 5000,
    });
    expect(c.linhas[1]!.valor?.produto).toMatchObject({ nome: 'Petisco 65 g', unidade: 'un', precoCentavos: 750, estoqueInicial: 60, custoInicialCentavos: null, fornecedorId: null });
  });

  it('erros com o motivo de cada linha', () => {
    const c = ok(
      conferirProdutos(
        [
          TITULOS,
          ['', null, null, null, null, 10],
          ['Sem preço', null, null, null, null, null],
          ['Preço errado', null, null, null, null, 'dez reais'],
          ['Unidade estranha', null, null, 'caixa', null, 10],
          ['Estoque quebrado', null, null, 'un', null, 10, 2.5],
          ['Código com letras', 'ABC123', null, null, null, 10],
          ['Grátis', null, null, null, null, 0],
        ],
        ctxProdutos(),
      ),
    );
    expect(c.contagem.erro).toBe(7);
    expect(c.linhas.map((l) => l.motivos[0])).toEqual([
      'Informe o nome do produto.',
      'Informe o preço de venda.',
      'Preço de venda: use um valor em reais, como 24,90.',
      'Unidade "caixa": use un (por unidade) ou kg (por quilo).',
      'Estoque: no produto por unidade, use um número inteiro.',
      'O código de barras deve ter só números.',
      'O preço de venda deve ser maior que zero. Brinde é lançado na venda (100% de desconto, com autorização do Dono).',
    ]);
  });

  it('o que já existe fica de fora; repetida na planilha entra uma vez; código de barras igual a um código interno é erro', () => {
    const c = ok(
      conferirProdutos(
        [
          TITULOS,
          ['Areia Sanitária', '7896000300306', null, null, null, 25],
          ['areia 4 KG', null, null, null, null, 25],
          ['Bifinho', '7897000400403', null, null, null, 7.5],
          ['Bifinho de novo', '7897000400403', null, null, null, 7.5],
          ['Coleira M', null, null, null, null, 29.9],
          ['coleira m', null, null, null, null, 31],
          ['Código interno', '0001', null, null, null, 10],
        ],
        ctxProdutos(),
      ),
    );
    expect(c.linhas.map((l) => [l.numero, l.situacao, l.motivos[0] ?? ''])).toEqual([
      [2, 'existe', 'Já cadastrado com o código de barras 7896000300306: "Areia 4 kg".'],
      [3, 'existe', 'Já cadastrado: "Areia 4 kg" (código 0001).'],
      [4, 'nova', ''],
      [5, 'repetida', 'Repetida: igual à linha 4.'],
      [6, 'nova', ''],
      [7, 'repetida', 'Repetida: igual à linha 6.'],
      [8, 'erro', 'O código de barras 0001 é o código interno do produto "Areia 4 kg".'],
    ]);
  });

  it('avisos: custo e mínimo sem permissão, fornecedor que não existe ou está desativado; loja sem kg', () => {
    const c = ok(
      conferirProdutos(
        [TITULOS, ['Ração', null, null, null, null, 10, 5, 6, 2, 'Fornecedor Novo'], ['Areia', null, null, null, null, 10, null, 6, null, 'Antiga Ltda']],
        ctxProdutos({ podeCusto: false, podeMinimo: false }),
      ),
    );
    expect(c.linhas[0]).toMatchObject({ situacao: 'nova' });
    expect(c.linhas[0]!.avisos).toEqual([
      'O custo fica de fora: só o Dono e o Administrador informam o custo.',
      'O estoque mínimo fica de fora: só quem lança no estoque define o mínimo.',
      'O fornecedor "Fornecedor Novo" não está cadastrado: o produto entra sem fornecedor.',
    ]);
    expect(c.linhas[0]!.valor).toMatchObject({ produto: { custoInicialCentavos: null }, minimo: null });
    expect(c.linhas[1]!.avisos).toEqual([
      'O custo fica de fora: só o Dono e o Administrador informam o custo.',
      'O fornecedor "Antiga Ltda" está desativado: o produto entra sem fornecedor.',
    ]);
    const semKg = ok(conferirProdutos([TITULOS, ['Granel', null, null, 'kg', null, 10]], ctxProdutos({ unidades: ['un'] })));
    expect(semKg.linhas[0]!.motivos).toEqual(['Esta loja não vende por quilo. Ligue o kg em Produtos e estoque → Regras do estoque.']);
  });
});

describe('clientes', () => {
  const ctx = { existentes: [{ id: 'c1', nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725', ativo: true }], hoje: '2026-11-25', rotuloDoExtra: 'Pet', podeLimite: true };
  const T = ['Nome', 'Telefone', 'CPF', 'WhatsApp', 'Nascimento', 'Endereço', 'Pet', 'Limite de fiado', 'Aceita mensagens', 'Observações'];

  it('cliente completo, com o campo extra da loja, data do Excel e as marcações', () => {
    const c = ok(conferirClientes([T, ['João Lima', '(41) 3333-0003', '111.444.777-35', 'Não', 33010, 'Rua B, 2', 'Rex', 150, 'Sim', 'Cliente antigo']], ctx));
    expect(c.linhas[0]).toMatchObject({ situacao: 'nova', avisos: [] });
    expect(c.linhas[0]!.valor).toEqual({
      nome: 'João Lima',
      telefone: '4133330003',
      cpf: '11144477735',
      whatsapp: false,
      nascimento: '1990-05-17',
      endereco: 'Rua B, 2',
      extra: 'Rex',
      limiteFiadoCentavos: 15000,
      autorizaMensagens: true,
      observacoes: 'Cliente antigo',
    });
  });

  it('sem CPF ou sem telefone entra com o cadastro incompleto; informado e errado é erro', () => {
    const c = ok(
      conferirClientes(
        [T, ['Ana Paula', '41988887777', null], ['Carlos Dias', null, null], ['Bia Rocha', '41988887777', '123.456.789-00'], ['Al', '41988887777', null]],
        ctx,
      ),
    );
    expect(c.linhas.map((l) => [l.situacao, [...l.motivos, ...l.avisos].join(' | ')])).toEqual([
      ['nova', 'Cadastro incompleto (sem CPF): só compra no fiado depois de completar.'],
      ['nova', 'Cadastro incompleto (sem CPF e sem telefone): só compra no fiado depois de completar.'],
      ['erro', 'CPF inválido. Confira os números.'],
      ['erro', 'Informe o nome completo do cliente (pelo menos 3 letras).'],
    ]);
    expect(c.linhas[0]!.valor).toMatchObject({ cpf: '', telefone: '41988887777' });
  });

  it('já cadastrado (pelo CPF, ou pelo nome e telefone sem CPF) e repetido na planilha ficam de fora', () => {
    const c = ok(
      conferirClientes(
        [T, ['Maria S. Souza', null, '529.982.247-25'], ['Pedro Alves', '41977776666', null], ['pedro alves', '(41) 97777-6666', null], ['Pedro Alves', '41911112222', null]],
        { ...ctx, existentes: [...ctx.existentes, { id: 'c2', nome: 'Velho Cliente', telefone: '', cpf: '', ativo: false }] },
      ),
    );
    expect(c.linhas.map((l) => [l.situacao, l.motivos[0] ?? ''])).toEqual([
      ['existe', 'Já cadastrado com o CPF ***.982.247-**: "Maria Souza".'],
      ['nova', ''],
      ['repetida', 'Repetida: o mesmo cliente da linha 3.'],
      ['nova', ''], // mesmo nome, outro telefone: outra pessoa
    ]);
  });

  it('limite sem permissão vira aviso; WhatsApp e nascimento errados são erro', () => {
    const c = ok(conferirClientes([T, ['Rita Moura', null, null, 'talvez'], ['Rui Prado', null, null, null, '30/02/1990'], ['Lia Melo', null, null, null, null, null, null, 300]], { ...ctx, podeLimite: false }));
    expect(c.linhas.map((l) => l.motivos[0] ?? l.avisos[0])).toEqual([
      'WhatsApp: use Sim ou Não.',
      'Nascimento: use dia, mês e ano (dd/mm/aaaa).',
      'O limite de fiado fica de fora: só o Dono e o Administrador definem o limite.',
    ]);
  });

  it('o cadastro pela tela continua pedindo telefone e CPF', () => {
    expect(validarNovoCliente({ nome: 'Ana Paula', telefone: '', cpf: '' }).ok).toBe(false);
    expect(validarNovoCliente({ nome: 'Ana Paula', telefone: '', cpf: '' }, { incompletoPermitido: true })).toEqual({ ok: true, valor: { nome: 'Ana Paula', telefone: '', cpf: '' } });
  });
});

describe('fornecedores e resumo', () => {
  it('pelo documento ou, sem ele, pelo nome; repetido e documento errado', () => {
    const c = ok(
      conferirFornecedores(
        [
          ['Nome', 'CNPJ ou CPF', 'Telefone', 'Contato', 'Observação', 'Situação'],
          ['Outra razão social', '11.222.333/0001-81', null, null, null, 'Ativo'],
          ['distribuidora pet', null, null, null, null, null],
          ['Rações Sul', null, '(41) 3030-4040', 'Rui', 'Entrega às terças', null],
          ['RAÇÕES SUL', null, null, null, null, null],
          ['Documento ruim', '123', null, null, null, null],
        ],
        { existentes: [{ id: 'f1', nome: 'Distribuidora Pet', documento: '11222333000181', ativo: true }] },
      ),
    );
    expect(c.linhas.map((l) => [l.situacao, l.motivos[0] ?? ''])).toEqual([
      ['existe', 'Já cadastrado: "Distribuidora Pet".'],
      ['existe', 'Já cadastrado: "Distribuidora Pet".'],
      ['nova', ''],
      ['repetida', 'Repetida: o mesmo fornecedor da linha 4.'],
      ['erro', 'Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números).'],
    ]);
    expect(c.linhas[2]!.valor).toEqual({ nome: 'Rações Sul', documento: null, telefone: '4130304040', contato: 'Rui', observacao: 'Entrega às terças' });
    expect(c.ignoradas).toEqual(['Situação']);
  });

  it('o resumo da prévia e do histórico', () => {
    expect(resumoDaImportacao({ nova: 95, existe: 20, repetida: 2, erro: 3 })).toBe('95 linhas entram, 20 já cadastradas, 2 repetidas e 3 com erro.');
    expect(resumoDaImportacao({ nova: 1, existe: 0, repetida: 0, erro: 0 })).toBe('1 linha entra.');
    expect(resumirAuditoria('dados.importados', { assunto: 'Produtos', linhas: 95, existentes: 20 })).toBe('Produtos • 95 cadastros novos • 20 já existiam');
    expect(resumirAuditoria('dados.importados', { assunto: 'Clientes', linhas: 1, existentes: 0 })).toBe('Clientes • 1 cadastro novo');
  });
});
