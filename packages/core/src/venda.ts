// packages/core/src/venda.ts
// Regras da venda (Frente de caixa), usadas pela tela e, depois, pela API.
//
// Segurança (mesma ideia do cadastro de produto):
//   - Quem vendeu NÃO vem do cliente: é sempre a pessoa logada (sessão/token).
//   - Preço e nome NÃO vêm do cliente: saem do cadastro de produtos da loja na
//     hora da venda (calcularVenda). O cliente só manda produto + quantidade.
//   - Campos desconhecidos no pedido são recusados (vendedor, total, preço, loja…).
//
// "Vendas de hoje" = vendas cujo dia, no fuso da loja, é o dia de hoje. Nada é
// apagado à meia-noite: o dia muda e a Visão geral volta a zero; todas as vendas
// continuam disponíveis nos Relatórios.
import { CENTAVOS_MAX } from './dinheiro';
import type { ErroCampo, Resultado } from './resultado';

export const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Nomes iguais aos do DaniPets. */
export const NOME_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
};

export const LIMITES_VENDA = {
  /** Produtos diferentes numa venda. */
  itensMax: 200,
  /** Unidades de um mesmo produto numa venda. */
  quantidadeMax: 9999,
  produtoIdMax: 64,
} as const;

/** Fuso padrão das lojas (Brasília). Cada loja poderá ter o seu. */
export const FUSO_PADRAO = 'America/Sao_Paulo';

export interface ItemPedido {
  produtoId: string;
  quantidade: number;
}

/** O que a Frente de caixa envia. */
export interface NovaVenda {
  itens: ItemPedido[];
  formaPagamento: FormaPagamento;
}

export interface ItemVendido {
  produtoId: string;
  codigoInterno: string;
  nome: string;
  precoCentavos: number;
  quantidade: number;
  subtotalCentavos: number;
}

export interface Operador {
  id: string;
  nome: string;
}

/** Venda registrada. */
export interface Venda {
  id: string;
  /** Número sequencial da venda na loja: 1, 2, 3… */
  numero: number;
  /** ISO 8601 (UTC). */
  criadaEm: string;
  /** Quem estava logado e fez a venda. */
  vendedor: Operador;
  itens: ItemVendido[];
  totalCentavos: number;
  formaPagamento: FormaPagamento;
}

/** Produto como o cadastro o tem na hora da venda. */
export interface ProdutoParaVenda {
  id: string;
  codigoInterno: string;
  nome: string;
  precoCentavos: number;
  ativo: boolean;
}

export function ehFormaPagamento(valor: unknown): valor is FormaPagamento {
  return typeof valor === 'string' && (FORMAS_PAGAMENTO as readonly string[]).includes(valor);
}

const CAMPOS_VENDA = new Set(['itens', 'formaPagamento']);
const CAMPOS_ITEM = new Set(['produtoId', 'quantidade']);

/**
 * Valida o pedido da Frente de caixa. O mesmo produto repetido é somado numa
 * linha só (o leitor pode bipar o mesmo código várias vezes).
 */
export function validarNovaVenda(entrada: unknown): Resultado<NovaVenda> {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados da venda.' }] };
  }
  const dados = entrada as Record<string, unknown>;
  const erros: ErroCampo[] = [];

  for (const chave of Object.keys(dados)) {
    if (!CAMPOS_VENDA.has(chave)) {
      erros.push({
        campo: chave,
        mensagem: chave === 'vendedor' ? 'Quem vendeu é sempre quem está logado.' : 'Campo não permitido.',
      });
    }
  }

  const somados = new Map<string, number>();
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    erros.push({ campo: 'itens', mensagem: 'Adicione pelo menos um produto à venda.' });
  } else {
    dados.itens.forEach((bruto, i) => {
      const campo = `itens.${i}`;
      if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
        erros.push({ campo, mensagem: 'Item inválido.' });
        return;
      }
      const item = bruto as Record<string, unknown>;
      for (const chave of Object.keys(item)) {
        if (!CAMPOS_ITEM.has(chave)) {
          erros.push({
            campo: `${campo}.${chave}`,
            mensagem: chave.toLowerCase().includes('preco') ? 'O preço vem do cadastro do produto.' : 'Campo não permitido.',
          });
        }
      }
      const id = typeof item.produtoId === 'string' ? item.produtoId.trim() : '';
      if (id === '' || id.length > LIMITES_VENDA.produtoIdMax) {
        erros.push({ campo: `${campo}.produtoId`, mensagem: 'Produto inválido.' });
        return;
      }
      const q = item.quantidade;
      if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) {
        erros.push({ campo: `${campo}.quantidade`, mensagem: 'A quantidade deve ser um número inteiro maior que zero.' });
        return;
      }
      somados.set(id, (somados.get(id) ?? 0) + q);
    });
  }

  for (const [id, q] of somados) {
    if (q > LIMITES_VENDA.quantidadeMax) {
      erros.push({ campo: 'itens', mensagem: `Quantidade acima de ${LIMITES_VENDA.quantidadeMax} unidades num mesmo produto (${id}).` });
    }
  }
  if (somados.size > LIMITES_VENDA.itensMax) {
    erros.push({ campo: 'itens', mensagem: `Uma venda pode ter até ${LIMITES_VENDA.itensMax} produtos diferentes.` });
  }

  if (!ehFormaPagamento(dados.formaPagamento)) {
    erros.push({ campo: 'formaPagamento', mensagem: 'Escolha a forma de pagamento.' });
  }

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      itens: [...somados].map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      formaPagamento: dados.formaPagamento as FormaPagamento,
    },
  };
}

/**
 * Monta os itens com nome e preço do CADASTRO (nunca do pedido) e soma o total.
 * Produto inexistente ou desativado recusa a venda inteira.
 */
export function calcularVenda(
  pedido: NovaVenda,
  catalogo: ReadonlyMap<string, ProdutoParaVenda>,
): Resultado<{ itens: ItemVendido[]; totalCentavos: number }> {
  const erros: ErroCampo[] = [];
  const itens: ItemVendido[] = [];
  let total = 0;

  pedido.itens.forEach((item, i) => {
    const p = catalogo.get(item.produtoId);
    if (!p || !p.ativo) {
      erros.push({ campo: `itens.${i}.produtoId`, mensagem: 'Produto não encontrado ou desativado.' });
      return;
    }
    const subtotal = p.precoCentavos * item.quantidade;
    total += subtotal;
    itens.push({
      produtoId: p.id,
      codigoInterno: p.codigoInterno,
      nome: p.nome,
      precoCentavos: p.precoCentavos,
      quantidade: item.quantidade,
      subtotalCentavos: subtotal,
    });
  });

  if (erros.length === 0 && (!Number.isSafeInteger(total) || total > CENTAVOS_MAX)) {
    erros.push({ campo: 'itens', mensagem: 'Total da venda acima do limite permitido.' });
  }
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, valor: { itens, totalCentavos: total } };
}

/** Dia (AAAA-MM-DD) em que o instante cai no fuso da loja. */
export function diaNoFuso(instante: string | Date, fuso: string = FUSO_PADRAO): string {
  const data = typeof instante === 'string' ? new Date(instante) : instante;
  if (Number.isNaN(data.getTime())) throw new RangeError('Data inválida.');
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(data)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Vendas entre dois dias (inclusive), no fuso da loja. Sem limite = sem filtro. */
export function vendasNoPeriodo<T extends Pick<Venda, 'criadaEm'>>(
  vendas: readonly T[],
  periodo: { de?: string | null; ate?: string | null },
  fuso: string = FUSO_PADRAO,
): T[] {
  return vendas.filter((v) => {
    const dia = diaNoFuso(v.criadaEm, fuso);
    return (!periodo.de || dia >= periodo.de) && (!periodo.ate || dia <= periodo.ate);
  });
}

export interface ResumoVendas {
  totalCentavos: number;
  quantidadeVendas: number;
  itensVendidos: number;
  /** Total ÷ número de vendas, arredondado ao centavo. 0 sem vendas. */
  ticketMedioCentavos: number;
  /** Só as formas que tiveram venda, na ordem de FORMAS_PAGAMENTO. */
  porForma: { forma: FormaPagamento; totalCentavos: number; quantidade: number }[];
  /** Do que mais vendeu para o que menos vendeu. */
  porVendedor: { id: string; nome: string; totalCentavos: number; quantidade: number }[];
}

export function resumirVendas(vendas: readonly Venda[]): ResumoVendas {
  let total = 0;
  let itens = 0;
  const formas = new Map<FormaPagamento, { totalCentavos: number; quantidade: number }>();
  const vendedores = new Map<string, { id: string; nome: string; totalCentavos: number; quantidade: number }>();

  for (const v of vendas) {
    total += v.totalCentavos;
    itens += v.itens.reduce((s, i) => s + i.quantidade, 0);
    const f = formas.get(v.formaPagamento) ?? { totalCentavos: 0, quantidade: 0 };
    f.totalCentavos += v.totalCentavos;
    f.quantidade += 1;
    formas.set(v.formaPagamento, f);
    const p = vendedores.get(v.vendedor.id) ?? { id: v.vendedor.id, nome: v.vendedor.nome, totalCentavos: 0, quantidade: 0 };
    p.totalCentavos += v.totalCentavos;
    p.quantidade += 1;
    vendedores.set(v.vendedor.id, p);
  }

  return {
    totalCentavos: total,
    quantidadeVendas: vendas.length,
    itensVendidos: itens,
    ticketMedioCentavos: vendas.length ? Math.round(total / vendas.length) : 0,
    porForma: FORMAS_PAGAMENTO.filter((f) => formas.has(f)).map((forma) => ({ forma, ...formas.get(forma)! })),
    porVendedor: [...vendedores.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}
