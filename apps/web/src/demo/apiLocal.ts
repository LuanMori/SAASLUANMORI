// apps/web/src/demo/apiLocal.ts
// SÓ PARA A DEMONSTRAÇÃO (sistema-padrao-demo.html): faz o papel da API, mas
// guarda produtos e vendas no próprio navegador (localStorage), separados por loja.
// Segue as mesmas regras da API/@saas/core: validação do produto e da venda,
// código interno sequencial, preço vindo do cadastro, QUEM VENDEU = quem está
// logado (o operador da sessão, nunca um campo enviado pela tela), desconto e
// estorno conferidos com as autorizações dadas com senha.
//
// Na primeira vez de cada loja, cria produtos de exemplo e algumas vendas de
// dias anteriores (para os Relatórios terem o que mostrar; a Visão geral de
// hoje começa zerada).
//
// NÃO é segurança: aqui não há Auth0, RLS nem servidor.
import {
  type AcaoAutorizada,
  type Autorizacao,
  calcularCancelamento,
  calcularDevolucao,
  calcularVenda,
  type Devolucao,
  type DevolucaoComVenda,
  formatarCodigoInterno,
  FUSO_PADRAO,
  type OperadorComPapel,
  type Pagamento,
  type ProdutoParaVenda,
  validarNovaVenda,
  validarNovoProduto,
  validarPedidoCancelamento,
  validarPedidoDevolucao,
  type Venda,
  vendasNoPeriodo,
} from '@saas/core';
import { type ApiPainel, ErroApi, type Produto } from '../api';
import { conferirSenhaDemo, gestoresDemo } from './contasDemo';

const CHAVES = {
  produtos: 'saas-demo:produtos:v1',
  vendas: 'saas-demo:vendas:v1',
  exemplos: 'saas-demo:exemplos:v1',
} as const;

type PorLoja<T> = Record<string, T[]>;
const memoria: Record<string, unknown> = {};

function ler<T>(chave: string, vazio: T): T {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? (JSON.parse(texto) as T) : vazio;
  } catch {
    // Sem localStorage (ou dado corrompido): usa a cópia em memória desta aba.
    return (memoria[chave] as T | undefined) ?? vazio;
  }
}

function gravar(chave: string, valor: unknown): void {
  memoria[chave] = valor;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Navegador sem localStorage (ex.: aba anônima restrita): fica só na memória.
  }
}

/** Apaga produtos e vendas de todas as lojas (os exemplos não voltam). */
export function apagarDadosDemo(): void {
  const lojas = Object.keys(ler<PorLoja<Produto>>(CHAVES.produtos, {}));
  gravar(CHAVES.produtos, {});
  gravar(CHAVES.vendas, {});
  gravar(CHAVES.exemplos, [...new Set([...ler<string[]>(CHAVES.exemplos, []), ...lojas, 'loja-a', 'loja-b'])]);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Vendas gravadas por versões anteriores da demonstração (uma forma de pagamento só, sem
 * desconto, sem cancelamento) passam para o formato atual na leitura. Nada se perde.
 */
export function normalizarVenda(bruta: Venda & { formaPagamento?: Pagamento['forma'] }): Venda {
  const pagamentos =
    Array.isArray(bruta.pagamentos) ? bruta.pagamentos : bruta.formaPagamento ? [{ forma: bruta.formaPagamento, valorCentavos: bruta.totalCentavos }] : [];
  const { formaPagamento: _antiga, ...resto } = bruta;
  return {
    ...resto,
    itens: bruta.itens.map((i) => ({ ...i, precoListaCentavos: i.precoListaCentavos ?? i.precoCentavos, desconto: i.desconto ?? null })),
    descontoCentavos: bruta.descontoCentavos ?? 0,
    pagamentos,
    recebidoDinheiroCentavos: bruta.recebidoDinheiroCentavos ?? null,
    trocoCentavos: bruta.trocoCentavos ?? 0,
    status: bruta.status ?? 'finalizada',
    cancelamento: bruta.cancelamento ?? null,
    devolucoes: bruta.devolucoes ?? [],
  };
}

// ------------------------------------------------------------------ autorizações dadas com senha
// Ficam só na memória desta aba (como no DaniPets): recarregar a página não cria autorização.
const autorizacoes = new Map<string, Autorizacao & { lojaId: string }>();

// ------------------------------------------------------------------ exemplos
const PRODUTOS_EXEMPLO: { nome: string; codigoBarras: string | null; precoCentavos: number }[] = [
  { nome: 'Ração Premium Cães Adultos 15 kg', codigoBarras: '7891000100103', precoCentavos: 18990 },
  { nome: 'Ração Gatos Castrados 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 },
  { nome: 'Areia Sanitária 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490 },
  { nome: 'Petisco Bifinho Carne 65 g', codigoBarras: '7897000400403', precoCentavos: 750 },
  { nome: 'Shampoo Neutro 500 ml', codigoBarras: null, precoCentavos: 3200 },
  { nome: 'Coleira Ajustável M', codigoBarras: null, precoCentavos: 2990 },
];

type ExemploVenda = {
  diasAtras: number;
  hora: number;
  minuto: number;
  vendedor: { id: string; nome: string };
  /** [índice do produto, quantidade, preço final (desconto) opcional] */
  itens: [number, number, number?][];
  /** Partes do pagamento; a última recebe o que faltar. */
  pagamentos: [Pagamento['forma'], number?][];
  recebido?: number;
  motivoDesconto?: string;
};

const VENDAS_EXEMPLO: ExemploVenda[] = [
  { diasAtras: 2, hora: 9, minuto: 32, vendedor: { id: 'ana', nome: 'Ana' }, itens: [[0, 1]], pagamentos: [['credito']] },
  { diasAtras: 2, hora: 16, minuto: 18, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 3], [2, 1]], pagamentos: [['pix']] },
  { diasAtras: 1, hora: 10, minuto: 5, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[1, 2]], pagamentos: [['debito']] },
  {
    diasAtras: 1,
    hora: 14,
    minuto: 41,
    vendedor: { id: 'ana', nome: 'Ana' },
    itens: [[4, 1], [5, 1]],
    pagamentos: [['dinheiro', 3000], ['pix']],
    recebido: 5000,
  },
  { diasAtras: 1, hora: 17, minuto: 56, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 6, 700]], pagamentos: [['pix']], motivoDesconto: 'Leve 6, pague menos' },
];

function criarExemplos(lojaId: string, agora: Date): void {
  const feitos = ler<string[]>(CHAVES.exemplos, []);
  if (feitos.includes(lojaId)) return;

  const produtosBanco = ler<PorLoja<Produto>>(CHAVES.produtos, {});
  const vendasBanco = ler<PorLoja<Venda>>(CHAVES.vendas, {});
  const criadoEm = new Date(agora.getTime() - 3 * 86_400_000).toISOString();

  const produtos: Produto[] =
    produtosBanco[lojaId] && produtosBanco[lojaId].length > 0
      ? produtosBanco[lojaId]
      : PRODUTOS_EXEMPLO.map((p, i) => ({
          id: novoId(),
          codigoInterno: formatarCodigoInterno(i + 1),
          codigoBarras: p.codigoBarras,
          nome: p.nome,
          precoCentavos: p.precoCentavos,
          ativo: true,
          criadoEm,
          atualizadoEm: criadoEm,
        }));

  const vendas: Venda[] = [...(vendasBanco[lojaId] ?? [])];
  if (vendas.length === 0 && produtos.length >= PRODUTOS_EXEMPLO.length) {
    VENDAS_EXEMPLO.forEach((e, n) => {
      const quando = new Date(agora);
      quando.setDate(quando.getDate() - e.diasAtras);
      quando.setHours(e.hora, e.minuto, 0, 0);
      const itens = e.itens.map(([indice, quantidade, precoFinal]) => {
        const p = produtos[indice]!;
        const preco = precoFinal ?? p.precoCentavos;
        return {
          produtoId: p.id,
          codigoInterno: p.codigoInterno,
          nome: p.nome,
          precoListaCentavos: p.precoCentavos,
          precoCentavos: preco,
          quantidade,
          subtotalCentavos: preco * quantidade,
          desconto: precoFinal === undefined ? null : { motivo: e.motivoDesconto ?? 'Desconto', responsavel: e.vendedor, autorizadoComSenha: false },
        };
      });
      const total = itens.reduce((s, it) => s + it.subtotalCentavos, 0);
      let falta = total;
      const pagamentos = e.pagamentos.map(([forma, valor], i) => {
        const v = i === e.pagamentos.length - 1 ? falta : valor!;
        falta -= v;
        return { forma, valorCentavos: v };
      });
      const dinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valorCentavos, 0);
      vendas.push({
        id: novoId(),
        numero: n + 1,
        criadaEm: quando.toISOString(),
        vendedor: e.vendedor,
        itens,
        totalCentavos: total,
        descontoCentavos: itens.reduce((s, it) => s + (it.precoListaCentavos - it.precoCentavos) * it.quantidade, 0),
        pagamentos,
        recebidoDinheiroCentavos: dinheiro > 0 ? (e.recebido ?? dinheiro) : null,
        trocoCentavos: dinheiro > 0 ? (e.recebido ?? dinheiro) - dinheiro : 0,
        status: 'finalizada',
        cancelamento: null,
        devolucoes: [],
      });
    });
  }

  gravar(CHAVES.produtos, { ...produtosBanco, [lojaId]: produtos });
  gravar(CHAVES.vendas, { ...vendasBanco, [lojaId]: vendas });
  gravar(CHAVES.exemplos, [...feitos, lojaId]);
}

// ------------------------------------------------------------------ API local
export interface OpcoesApiLocal {
  /** Loja ativa (no sistema real vem do token, nunca do cliente). */
  lojaId: string;
  /** Quem está logado. É quem fica registrado como vendedor. */
  operador?: OperadorComPapel | null;
  /** Simula a pessoa sem acesso: a API responde 403. */
  bloqueio?: string | null;
  fuso?: string;
  /** Relógio (para testes). */
  agora?: () => Date;
  /** Cria produtos e vendas de exemplo na primeira vez da loja. */
  exemplos?: boolean;
  /** Atraso simulado da rede, em ms. */
  atrasoMs?: number;
}

export function criarApiLocal({
  lojaId,
  operador = null,
  bloqueio = null,
  fuso = FUSO_PADRAO,
  agora = () => new Date(),
  exemplos = true,
  atrasoMs = 120,
}: OpcoesApiLocal): ApiPainel {
  const preparar = async (ms = atrasoMs) => {
    await esperar(ms);
    if (bloqueio) throw new ErroApi(403, bloqueio);
    if (exemplos) criarExemplos(lojaId, agora());
  };
  const exigirOperador = (): OperadorComPapel => {
    if (!operador) throw new ErroApi(401, 'Faça login para continuar.');
    return operador;
  };
  const produtosDaLoja = () => ler<PorLoja<Produto>>(CHAVES.produtos, {})[lojaId] ?? [];
  const vendasDaLoja = () => (ler<PorLoja<Venda>>(CHAVES.vendas, {})[lojaId] ?? []).map(normalizarVenda);
  const gravarVendas = (vendas: Venda[]) => gravar(CHAVES.vendas, { ...ler<PorLoja<Venda>>(CHAVES.vendas, {}), [lojaId]: vendas });
  const autorizacoesDaLoja = () => new Map([...autorizacoes].filter(([, a]) => a.lojaId === lojaId));
  const acharVenda = (vendas: Venda[], vendaId: string) => {
    const i = vendas.findIndex((v) => v.id === vendaId);
    if (i < 0) throw new ErroApi(404, 'Venda não encontrada.');
    return i;
  };

  return {
    async listarProdutos() {
      await preparar();
      return [...produtosDaLoja()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
    },

    async criarProduto(dados) {
      await preparar(atrasoMs * 2);
      const validacao = validarNovoProduto(dados);
      if (!validacao.ok) throw new ErroApi(400, 'Dados do produto inválidos.', validacao.erros);
      const novo = validacao.valor;

      const daLoja = produtosDaLoja();
      const comCodigo = (codigo: string) =>
        daLoja.find((p) => p.codigoInterno === codigo || p.codigoBarras === codigo) ?? null;

      if (novo.codigoBarras) {
        const dono = comCodigo(novo.codigoBarras);
        if (dono) {
          throw new ErroApi(
            409,
            `Código de barras repetido: ${novo.codigoBarras} já está vinculado ao produto "${dono.nome}".`,
            [{ campo: 'codigoBarras', mensagem: `Já usado em "${dono.nome}".` }],
          );
        }
      }

      // Maior código interno da loja + 1, pulando números já usados como código de barras.
      let numero = daLoja.reduce((maior, p) => Math.max(maior, Number(p.codigoInterno)), 0) + 1;
      let codigoInterno = formatarCodigoInterno(numero);
      while (codigoInterno === novo.codigoBarras || comCodigo(codigoInterno)) {
        numero += 1;
        codigoInterno = formatarCodigoInterno(numero);
      }

      const quando = agora().toISOString();
      const produto: Produto = { id: novoId(), codigoInterno, ...novo, ativo: true, criadoEm: quando, atualizadoEm: quando };
      gravar(CHAVES.produtos, { ...ler<PorLoja<Produto>>(CHAVES.produtos, {}), [lojaId]: [...daLoja, produto] });
      return produto;
    },

    async listarVendas(filtro = {}) {
      await preparar();
      return vendasNoPeriodo(vendasDaLoja(), filtro, fuso).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm) || b.numero - a.numero);
    },

    async criarVenda(dados) {
      await preparar(atrasoMs * 2);
      const quem = exigirOperador();

      const validacao = validarNovaVenda(dados);
      if (!validacao.ok) throw new ErroApi(400, 'Dados da venda inválidos.', validacao.erros);

      const catalogo = new Map<string, ProdutoParaVenda>(produtosDaLoja().map((p) => [p.id, p]));
      const calculo = calcularVenda(validacao.valor, catalogo, { operador: quem, autorizacoes: autorizacoesDaLoja(), agora: agora() });
      if (!calculo.ok) throw new ErroApi(409, calculo.erros[0]?.mensagem ?? 'Não foi possível registrar a venda.', calculo.erros);
      calculo.valor.autorizacoesUsadas.forEach((id) => autorizacoes.delete(id)); // uso único

      const daLoja = vendasDaLoja();
      const venda: Venda = {
        id: novoId(),
        numero: daLoja.reduce((maior, v) => Math.max(maior, v.numero), 0) + 1,
        criadaEm: agora().toISOString(),
        vendedor: { id: quem.id, nome: quem.nome },
        itens: calculo.valor.itens,
        totalCentavos: calculo.valor.totalCentavos,
        descontoCentavos: calculo.valor.descontoCentavos,
        pagamentos: calculo.valor.pagamentos,
        recebidoDinheiroCentavos: calculo.valor.recebidoDinheiroCentavos,
        trocoCentavos: calculo.valor.trocoCentavos,
        status: 'finalizada',
        cancelamento: null,
        devolucoes: [],
      };
      gravarVendas([...daLoja, venda]);
      return venda;
    },

    async listarAutorizadores() {
      await preparar();
      exigirOperador();
      return gestoresDemo();
    },

    async autorizar({ usuarioId, senha, acao }) {
      await preparar(atrasoMs * 2);
      exigirOperador();
      const g = conferirSenhaDemo(usuarioId, senha);
      if (!g) throw new ErroApi(403, 'Senha incorreta.');
      if (acao.tipo === 'desconto' && acao.precoFinalCentavos === 0 && g.papel !== 'dono') {
        throw new ErroApi(403, 'Brinde só com a autorização de um Dono.');
      }
      const id = novoId();
      autorizacoes.set(id, { id, autorizador: g, acao: { ...acao } as AcaoAutorizada, criadaEm: agora().toISOString(), lojaId });
      return { autorizacao: id, autorizador: g };
    },

    async cancelarVenda(vendaId, pedido) {
      await preparar(atrasoMs * 2);
      const quem = exigirOperador();
      const validacao = validarPedidoCancelamento(pedido);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Pedido inválido.', validacao.erros);
      const vendas = vendasDaLoja();
      const i = acharVenda(vendas, vendaId);
      const venda = vendas[i]!;
      const a = validacao.valor.autorizacao ? (autorizacoesDaLoja().get(validacao.valor.autorizacao) ?? null) : null;
      const r = calcularCancelamento(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso });
      if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível cancelar.', r.erros);
      if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
      const cancelada: Venda = {
        ...venda,
        status: 'cancelada',
        cancelamento: {
          em: agora().toISOString(),
          por: { id: quem.id, nome: quem.nome },
          autorizadoPor: r.valor.autorizadoPor,
          motivo: validacao.valor.motivo,
          estornos: r.valor.estornos,
        },
      };
      vendas[i] = cancelada;
      gravarVendas(vendas);
      return cancelada;
    },

    async devolverItens(vendaId, pedido) {
      await preparar(atrasoMs * 2);
      const quem = exigirOperador();
      const validacao = validarPedidoDevolucao(pedido);
      if (!validacao.ok) throw new ErroApi(400, validacao.erros[0]?.mensagem ?? 'Pedido inválido.', validacao.erros);
      const vendas = vendasDaLoja();
      const i = acharVenda(vendas, vendaId);
      const venda = vendas[i]!;
      const a = validacao.valor.autorizacao ? (autorizacoesDaLoja().get(validacao.valor.autorizacao) ?? null) : null;
      const r = calcularDevolucao(venda, validacao.valor, { operador: quem, autorizacao: a, agora: agora(), fuso });
      if (!r.ok) throw new ErroApi(409, r.erros[0]?.mensagem ?? 'Não foi possível registrar a devolução.', r.erros);
      if (r.valor.autorizacaoUsada) autorizacoes.delete(r.valor.autorizacaoUsada);
      const numero = vendas.reduce((maior, v) => Math.max(maior, ...v.devolucoes.map((d) => d.numero)), 0) + 1;
      const devolucao: Devolucao = {
        id: novoId(),
        numero,
        criadaEm: agora().toISOString(),
        itens: r.valor.itens,
        totalCentavos: r.valor.totalCentavos,
        estornos: r.valor.estornos,
        motivo: validacao.valor.motivo,
        feitaPor: { id: quem.id, nome: quem.nome },
        autorizadaPor: r.valor.autorizadoPor,
      };
      vendas[i] = { ...venda, devolucoes: [...venda.devolucoes, devolucao] };
      gravarVendas(vendas);
      return { venda: vendas[i]!, devolucao };
    },

    async listarDevolucoes(filtro = {}) {
      await preparar();
      const todas: DevolucaoComVenda[] = vendasDaLoja().flatMap((v) => v.devolucoes.map((d) => ({ ...d, vendaId: v.id, vendaNumero: v.numero })));
      return vendasNoPeriodo(todas, filtro, fuso).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
    },
  };
}
