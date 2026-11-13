// apps/web/src/demo/apiLocal.ts
// SÓ PARA A DEMONSTRAÇÃO (sistema-padrao-demo.html): faz o papel da API, mas
// guarda produtos e vendas no próprio navegador (localStorage), separados por loja.
// Segue as mesmas regras da API/@saas/core: validação do produto e da venda,
// código interno sequencial, preço vindo do cadastro e QUEM VENDEU = quem está
// logado (o operador da sessão, nunca um campo enviado pela tela).
//
// Na primeira vez de cada loja, cria produtos de exemplo e algumas vendas de
// dias anteriores (para os Relatórios terem o que mostrar; a Visão geral de
// hoje começa zerada).
//
// NÃO é segurança: aqui não há Auth0, RLS nem servidor.
import {
  calcularVenda,
  formatarCodigoInterno,
  FUSO_PADRAO,
  type Operador,
  type ProdutoParaVenda,
  validarNovaVenda,
  validarNovoProduto,
  type Venda,
  vendasNoPeriodo,
} from '@saas/core';
import { type ApiPainel, ErroApi, type Produto } from '../api';

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

// ------------------------------------------------------------------ exemplos
const PRODUTOS_EXEMPLO: { nome: string; codigoBarras: string | null; precoCentavos: number }[] = [
  { nome: 'Ração Premium Cães Adultos 15 kg', codigoBarras: '7891000100103', precoCentavos: 18990 },
  { nome: 'Ração Gatos Castrados 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 },
  { nome: 'Areia Sanitária 4 kg', codigoBarras: '7896000300306', precoCentavos: 2490 },
  { nome: 'Petisco Bifinho Carne 65 g', codigoBarras: '7897000400403', precoCentavos: 750 },
  { nome: 'Shampoo Neutro 500 ml', codigoBarras: null, precoCentavos: 3200 },
  { nome: 'Coleira Ajustável M', codigoBarras: null, precoCentavos: 2990 },
];

const VENDAS_EXEMPLO: { diasAtras: number; hora: number; minuto: number; vendedor: Operador; itens: [number, number][]; forma: Venda['formaPagamento'] }[] = [
  { diasAtras: 2, hora: 9, minuto: 32, vendedor: { id: 'ana', nome: 'Ana' }, itens: [[0, 1]], forma: 'credito' },
  { diasAtras: 2, hora: 16, minuto: 18, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 3], [2, 1]], forma: 'pix' },
  { diasAtras: 1, hora: 10, minuto: 5, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[1, 2]], forma: 'debito' },
  { diasAtras: 1, hora: 14, minuto: 41, vendedor: { id: 'ana', nome: 'Ana' }, itens: [[4, 1], [5, 1]], forma: 'dinheiro' },
  { diasAtras: 1, hora: 17, minuto: 56, vendedor: { id: 'bruno', nome: 'Bruno' }, itens: [[3, 6]], forma: 'pix' },
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
    VENDAS_EXEMPLO.forEach((e, i) => {
      const quando = new Date(agora);
      quando.setDate(quando.getDate() - e.diasAtras);
      quando.setHours(e.hora, e.minuto, 0, 0);
      const itens = e.itens.map(([indice, quantidade]) => {
        const p = produtos[indice]!;
        return {
          produtoId: p.id,
          codigoInterno: p.codigoInterno,
          nome: p.nome,
          precoCentavos: p.precoCentavos,
          quantidade,
          subtotalCentavos: p.precoCentavos * quantidade,
        };
      });
      vendas.push({
        id: novoId(),
        numero: i + 1,
        criadaEm: quando.toISOString(),
        vendedor: e.vendedor,
        itens,
        totalCentavos: itens.reduce((s, it) => s + it.subtotalCentavos, 0),
        formaPagamento: e.forma,
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
  operador?: Operador | null;
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
  const produtosDaLoja = () => ler<PorLoja<Produto>>(CHAVES.produtos, {})[lojaId] ?? [];
  const vendasDaLoja = () => ler<PorLoja<Venda>>(CHAVES.vendas, {})[lojaId] ?? [];

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
      if (!operador) throw new ErroApi(401, 'Faça login para vender.');

      const validacao = validarNovaVenda(dados);
      if (!validacao.ok) throw new ErroApi(400, 'Dados da venda inválidos.', validacao.erros);

      const catalogo = new Map<string, ProdutoParaVenda>(produtosDaLoja().map((p) => [p.id, p]));
      const calculo = calcularVenda(validacao.valor, catalogo);
      if (!calculo.ok) throw new ErroApi(409, calculo.erros[0]?.mensagem ?? 'Não foi possível registrar a venda.', calculo.erros);

      const daLoja = vendasDaLoja();
      const venda: Venda = {
        id: novoId(),
        numero: daLoja.reduce((maior, v) => Math.max(maior, v.numero), 0) + 1,
        criadaEm: agora().toISOString(),
        vendedor: { id: operador.id, nome: operador.nome },
        itens: calculo.valor.itens,
        totalCentavos: calculo.valor.totalCentavos,
        formaPagamento: validacao.valor.formaPagamento,
      };
      gravar(CHAVES.vendas, { ...ler<PorLoja<Venda>>(CHAVES.vendas, {}), [lojaId]: [...daLoja, venda] });
      return venda;
    },
  };
}
