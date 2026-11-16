// packages/core/test/cliente.test.ts
import { describe, expect, it } from 'vitest';
import {
  buscarClientes,
  cadastroCompleto,
  calcularVenda,
  type Cliente,
  type ClienteParaVenda,
  conferirCpfUnico,
  cpfValido,
  formatarTelefone,
  mascararCpf,
  type ProdutoParaVenda,
  resumirCliente,
  sugestaoDeCadastro,
  telefoneValido,
  validarNovaVenda,
  validarNovoCliente,
  type Venda,
} from '../src';

const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && r.erros ? r.erros.map((e) => e.campo) : []);

const cliente = (c: Partial<Cliente>): Cliente => ({
  id: 'c1',
  nome: 'Maria Souza',
  telefone: '41999998888',
  cpf: '52998224725',
  ativo: true,
  criadoEm: '2026-11-01T00:00:00Z',
  atualizadoEm: '2026-11-01T00:00:00Z',
  ...c,
});

describe('CPF e telefone', () => {
  it('CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('12345678909')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false); // todos iguais
    expect(cpfValido('1234')).toBe(false);
  });

  it('telefone: fixo com 10, celular com 11 começando com 9; DDD sem zero', () => {
    expect(telefoneValido('(41) 99999-8888')).toBe(true);
    expect(telefoneValido('4133334444')).toBe(true);
    expect(telefoneValido('41899998888')).toBe(false); // 11 números sem o 9
    expect(telefoneValido('0199998888')).toBe(false);
    expect(telefoneValido('999998888')).toBe(false);
  });

  it('formatação e máscara (LGPD)', () => {
    expect(formatarTelefone('41999998888')).toBe('(41) 99999-8888');
    expect(formatarTelefone('4133334444')).toBe('(41) 3333-4444');
    expect(formatarTelefone('123')).toBe('123');
    expect(formatarTelefone(null)).toBe('');
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
    expect(mascararCpf('')).toBe('—');
  });
});

describe('cadastro', () => {
  it('nome completo, telefone e CPF obrigatórios; guarda só os números', () => {
    expect(validarNovoCliente({ nome: '  Maria   Souza ', telefone: '(41) 99999-8888', cpf: '529.982.247-25' })).toEqual({
      ok: true,
      valor: { nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' },
    });
    expect(campos(validarNovoCliente({ nome: 'Al', telefone: '123', cpf: '111' }))).toEqual(['nome', 'telefone', 'cpf']);
    expect(campos(validarNovoCliente({ nome: '1234', telefone: '41999998888', cpf: '52998224725' }))).toEqual(['nome']);
    expect(campos(validarNovoCliente({ nome: 'x'.repeat(121), telefone: '41999998888', cpf: '52998224725' }))).toEqual(['nome']);
    expect(campos(validarNovoCliente({ nome: 'Ana\u0007 Lima', telefone: '41999998888', cpf: '52998224725' }))).toEqual(['nome']);
    expect(validarNovoCliente({ nome: 'Maria', telefone: '41999998888', cpf: '52998224724' })).toMatchObject({
      ok: false,
      erros: [{ campo: 'cpf', mensagem: 'CPF inválido. Confira os números.' }],
    });
    expect(campos(validarNovoCliente({ nome: 'Maria', telefone: '41999998888', cpf: '52998224725', limite: 1 }))).toEqual(['limite']);
    expect(campos(validarNovoCliente('Maria'))).toEqual(['_']);
  });

  it('CPF único entre os clientes ativos (na edição, o próprio não conta)', () => {
    const lista = [cliente({}), cliente({ id: 'c2', nome: 'Antigo', cpf: '12345678909', ativo: false })];
    expect(conferirCpfUnico('529.982.247-25', lista)).toMatchObject({ ok: false, erros: [{ mensagem: 'Este CPF já está no cadastro de Maria Souza.' }] });
    expect(conferirCpfUnico('52998224725', lista, 'c1').ok).toBe(true);
    expect(conferirCpfUnico('12345678909', lista).ok).toBe(true); // inativo não bloqueia
  });

  it('cadastro completo', () => {
    expect(cadastroCompleto(cliente({}))).toBe(true);
    expect(cadastroCompleto(cliente({ cpf: '' }))).toBe(false);
    expect(cadastroCompleto(null)).toBe(false);
  });
});

describe('busca (F6)', () => {
  const lista = [
    cliente({ id: 'c1', nome: 'João Ávila', telefone: '41999990001', cpf: '52998224725' }),
    cliente({ id: 'c2', nome: 'Ana Lima', telefone: '41988887777', cpf: '12345678909' }),
    cliente({ id: 'c3', nome: 'Joana Inativa', ativo: false }),
  ];
  const nomes = (l: Cliente[]) => l.map((c) => c.nome);

  it('por nome sem acento, por CPF e por telefone; só ativos, em ordem alfabética', () => {
    expect(nomes(buscarClientes(lista, 'joao avila'))).toEqual(['João Ávila']);
    expect(nomes(buscarClientes(lista, 'jo'))).toEqual(['João Ávila']);
    expect(nomes(buscarClientes(lista, '982.247'))).toEqual(['João Ávila']);
    expect(nomes(buscarClientes(lista, '8888'))).toEqual(['Ana Lima']);
    expect(nomes(buscarClientes(lista, '41'))).toEqual([]); // menos de 3 números não busca
    expect(nomes(buscarClientes(lista, ''))).toEqual(['Ana Lima', 'João Ávila']);
    expect(nomes(buscarClientes(lista, '', 1))).toEqual(['Ana Lima']);
  });

  it('o que foi digitado já preenche o cadastro novo', () => {
    expect(sugestaoDeCadastro('529.982.247-25')).toEqual({ cpf: '52998224725' });
    expect(sugestaoDeCadastro('(41) 99999-1234')).toEqual({ telefone: '41999991234' });
    expect(sugestaoDeCadastro('  Maria  Clara ')).toEqual({ nome: 'Maria Clara' });
    expect(sugestaoDeCadastro('123')).toEqual({});
  });
});

describe('cliente na venda', () => {
  const catalogo = new Map<string, ProdutoParaVenda>([['p1', { id: 'p1', codigoInterno: '0001', nome: 'Ração', precoCentavos: 1000, ativo: true }]]);
  const operador = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' as const };
  const clientes = new Map<string, ClienteParaVenda>([
    ['c1', { id: 'c1', nome: 'Maria Souza', ativo: true }],
    ['c9', { id: 'c9', nome: 'Inativo', ativo: false }],
  ]);
  const pedido = (clienteId: string | null) => ({ itens: [{ produtoId: 'p1', quantidade: 1 }], pagamentos: [{ forma: 'pix' as const, valorCentavos: 1000 }], clienteId });

  it('o pedido manda só o clienteId; nome do cliente vindo da tela é recusado', () => {
    const r = validarNovaVenda({ ...pedido(' c1 ') });
    expect(r.ok && r.valor.clienteId).toBe('c1');
    expect(validarNovaVenda({ ...pedido(''), clienteNome: 'Fulano' })).toMatchObject({ ok: false, erros: [{ campo: 'clienteNome', mensagem: expect.stringMatching(/vem do cadastro/) }] });
    expect(campos(validarNovaVenda({ ...pedido(null), clienteId: 42 }))).toEqual(['clienteId']);
    expect(campos(validarNovaVenda({ ...pedido('x'.repeat(65)) }))).toEqual(['clienteId']);
  });

  it('o nome sai do cadastro; cliente desconhecido ou desativado recusa a venda', () => {
    const r = calcularVenda(pedido('c1'), catalogo, { operador, clientes });
    expect(r.ok && r.valor.cliente).toEqual({ id: 'c1', nome: 'Maria Souza' });
    expect(calcularVenda(pedido(null), catalogo, { operador, clientes })).toMatchObject({ ok: true, valor: { cliente: null } });
    for (const id of ['c9', 'zz']) {
      expect(calcularVenda(pedido(id), catalogo, { operador, clientes })).toMatchObject({ ok: false, erros: [{ campo: 'clienteId', mensagem: expect.stringMatching(/Identifique o cliente de novo \(F6\)/) }] });
    }
    expect(calcularVenda(pedido('c1'), catalogo, { operador }).ok).toBe(false); // sem a lista, não confia no id
  });
});

describe('histórico de compras', () => {
  const venda = (v: Partial<Venda>): Venda => ({
    id: 'v',
    numero: 1,
    criadaEm: '2026-11-10T12:00:00Z',
    vendedor: { id: 'bruno', nome: 'Bruno' },
    cliente: { id: 'c1', nome: 'Maria' },
    itens: [],
    totalCentavos: 1000,
    descontoCentavos: 0,
    pagamentos: [{ forma: 'pix', valorCentavos: 1000 }],
    recebidoDinheiroCentavos: null,
    trocoCentavos: 0,
    status: 'finalizada',
    cancelamento: null,
    devolucoes: [],
    ...v,
  });

  it('soma o que comprou menos o que devolveu; cancelada e venda de outro cliente não contam', () => {
    const vendas = [
      venda({ id: 'a', criadaEm: '2026-11-12T12:00:00Z', totalCentavos: 3000 }),
      venda({ id: 'b', devolucoes: [{ totalCentavos: 400 } as Venda['devolucoes'][number]] }),
      venda({ id: 'c', status: 'cancelada', criadaEm: '2026-11-15T12:00:00Z' }),
      venda({ id: 'd', cliente: { id: 'c2', nome: 'Outro' } }),
      venda({ id: 'e', cliente: null }),
    ];
    expect(resumirCliente(vendas, 'c1')).toEqual({ compras: 2, totalCentavos: 3600, ticketMedioCentavos: 1800, ultimaCompraEm: '2026-11-12T12:00:00Z' });
    expect(resumirCliente([], 'c1')).toEqual({ compras: 0, totalCentavos: 0, ticketMedioCentavos: 0, ultimaCompraEm: null });
  });
});
