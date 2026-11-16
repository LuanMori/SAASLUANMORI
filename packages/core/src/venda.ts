// packages/core/src/venda.ts
// Regras da venda (Frente de caixa), usadas pela tela e, depois, pela API.
// Copiadas do DaniPets V9.3.3, no que já cabe no SaaS:
//   - pagamento numa forma só ou dividido em várias; dinheiro pede o valor recebido e calcula o troco;
//   - desconto por item com motivo: o Vendedor dá até 10% sozinho; acima disso precisa da senha do
//     Dono ou do Administrador; brinde (preço final R$ 0,00) só com a autorização de um Dono;
//   - cancelamento da venda inteira (no mesmo dia e sem devolução) e devolução de itens, com o valor
//     voltando pelas mesmas formas de pagamento da venda; o Vendedor precisa de autorização;
//   - venda sem estoque é recusada ("Estoque insuficiente para X. Disponível: N un.");
//   - cliente identificado (F6) opcional: vem do cadastro, nunca um nome digitado na tela.
//   Os efeitos no estoque, no financeiro e no histórico do cliente estão em estoque.ts, financeiro.ts e cliente.ts.
//
// Segurança (mesma ideia do cadastro de produto):
//   - Quem vendeu NÃO vem do cliente: é sempre a pessoa logada.
//   - Preço de tabela e nome saem do cadastro na hora da venda. Do cliente vêm só produto, quantidade,
//     o preço final pedido no desconto (com motivo) e, quando precisa, a autorização obtida com senha.
//   - Quem autorizou o desconto/cancelamento é decidido aqui, a partir da autorização guardada pelo
//     servidor, nunca de um nome enviado pela tela.
//
// "Vendas de hoje" = vendas cujo dia, no fuso da loja, é o dia de hoje. Nada é apagado à meia-noite.
import type { ClienteParaVenda } from './cliente';
import { CENTAVOS_MAX, formatarCentavos } from './dinheiro';
import { conferirEstoque } from './estoque';
import { CONTROLE, ehObjeto } from './interno';
import { ehGestor, type PapelDeLoja } from './papeis';
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
  clienteIdMax: 64,
  /** Partes de um pagamento dividido. */
  pagamentosMax: 8,
  motivoMax: 200,
  autorizacaoMax: 100,
} as const;

/** % de desconto por item que o Vendedor pode dar sozinho (igual ao DaniPets). */
export const LIMITE_DESCONTO_VENDEDOR_PCT = 10;

/** Por quanto tempo vale uma autorização dada com senha (igual ao DaniPets). */
export const VALIDADE_AUTORIZACAO_HORAS = 4;

/** Fuso padrão das lojas (Brasília). Cada loja poderá ter o seu. */
export const FUSO_PADRAO = 'America/Sao_Paulo';

// ------------------------------------------------------------------ tipos
export interface Operador {
  id: string;
  nome: string;
}

export interface OperadorComPapel extends Operador {
  papel: PapelDeLoja;
}

/** Desconto pedido pela tela para um item. */
export interface DescontoPedido {
  precoFinalCentavos: number;
  motivo: string;
  /** Identificador da autorização dada com senha, quando o desconto passa do que a pessoa pode dar. */
  autorizacao?: string | null;
}

export interface ItemPedido {
  produtoId: string;
  quantidade: number;
  desconto?: DescontoPedido | null;
}

export interface Pagamento {
  forma: FormaPagamento;
  valorCentavos: number;
}

/** O que a Frente de caixa envia. */
export interface NovaVenda {
  itens: ItemPedido[];
  /** Uma forma (venda comum) ou várias (pagamento dividido). Vazio só numa venda de brinde (total zero). */
  pagamentos: Pagamento[];
  /** Quanto o cliente entregou em dinheiro (para o troco). Obrigatório quando há parte em dinheiro. */
  recebidoDinheiroCentavos?: number | null;
  /** Cliente identificado (F6). O nome sai do cadastro. */
  clienteId?: string | null;
}

/** Cliente gravado na venda (o nome como estava no cadastro na hora da venda). */
export interface ClienteDaVenda {
  id: string;
  nome: string;
}

export interface DescontoAplicado {
  motivo: string;
  /** Quem deu o desconto: a própria pessoa ou quem autorizou com senha. */
  responsavel: Operador;
  autorizadoComSenha: boolean;
}

export interface ItemVendido {
  produtoId: string;
  codigoInterno: string;
  nome: string;
  /** Preço do cadastro na hora da venda. */
  precoListaCentavos: number;
  /** Preço cobrado (com desconto, se houver). */
  precoCentavos: number;
  quantidade: number;
  subtotalCentavos: number;
  desconto?: DescontoAplicado | null;
}

export interface Cancelamento {
  em: string;
  por: Operador;
  autorizadoPor: Operador | null;
  motivo: string;
  /** Como o dinheiro voltou para o cliente. */
  estornos: Pagamento[];
}

export interface ItemDevolvido {
  /** Posição do item na venda (0, 1, 2…). */
  linha: number;
  produtoId: string;
  nome: string;
  quantidade: number;
  valorCentavos: number;
  /** true = voltou para a prateleira (soma no estoque); false = descartado (avaria, vencido). */
  voltaAoEstoque: boolean;
}

export interface Devolucao {
  id: string;
  numero: number;
  criadaEm: string;
  itens: ItemDevolvido[];
  totalCentavos: number;
  estornos: Pagamento[];
  motivo: string;
  feitaPor: Operador;
  autorizadaPor: Operador | null;
}

export type StatusVenda = 'finalizada' | 'cancelada';

/** Venda registrada. */
export interface Venda {
  id: string;
  /** Número sequencial da venda na loja: 1, 2, 3… (mostrado como #00001). */
  numero: number;
  /** ISO 8601 (UTC). */
  criadaEm: string;
  /** Quem estava logado e fez a venda. */
  vendedor: Operador;
  /** Cliente identificado (F6) ou null (venda sem cliente). */
  cliente: ClienteDaVenda | null;
  itens: ItemVendido[];
  totalCentavos: number;
  /** Soma dos descontos dados nos itens. */
  descontoCentavos: number;
  pagamentos: Pagamento[];
  recebidoDinheiroCentavos: number | null;
  trocoCentavos: number;
  status: StatusVenda;
  cancelamento: Cancelamento | null;
  devolucoes: Devolucao[];
}

/** Produto como o cadastro o tem na hora da venda. */
export interface ProdutoParaVenda {
  id: string;
  codigoInterno: string;
  nome: string;
  precoCentavos: number;
  ativo: boolean;
}

/** O que uma autorização dada com senha permite fazer (uma vez só). */
export type AcaoAutorizada =
  | { tipo: 'desconto'; produtoId: string; precoFinalCentavos: number }
  | { tipo: 'cancelamento'; vendaId: string }
  | { tipo: 'devolucao'; vendaId: string };

/** Autorização guardada pelo servidor depois de conferir a senha de quem autoriza. */
export interface Autorizacao {
  id: string;
  autorizador: OperadorComPapel;
  acao: AcaoAutorizada;
  /** ISO 8601. */
  criadaEm: string;
}

/** Quem pode autorizar: `gestor` = Dono ou Administrador; `dono` = só Dono. */
export type QuemAutoriza = 'gestor' | 'dono';

// ------------------------------------------------------------------ utilidades
export function ehFormaPagamento(valor: unknown): valor is FormaPagamento {
  return typeof valor === 'string' && (FORMAS_PAGAMENTO as readonly string[]).includes(valor);
}

/** 12 -> "#00012" (como no DaniPets). */
export function formatarNumeroVenda(numero: number): string {
  return `#${String(numero).padStart(5, '0')}`;
}

/** "Pix" numa forma só; "Dinheiro R$ 10,00 + Pix R$ 22,40" no pagamento dividido. */
export function descreverPagamentos(pagamentos: readonly Pagamento[]): string {
  if (pagamentos.length === 0) return 'Sem pagamento (brinde)';
  if (pagamentos.length === 1) return NOME_FORMA_PAGAMENTO[pagamentos[0]!.forma];
  return pagamentos.map((p) => `${NOME_FORMA_PAGAMENTO[p.forma]} ${formatarCentavos(p.valorCentavos)}`).join(' + ');
}

function lerMotivo(valor: unknown, campo: string, erros: ErroCampo[], obrigatorio = 'Informe o motivo.'): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    erros.push({ campo, mensagem: obrigatorio });
    return '';
  }
  const t = valor.trim();
  if (t.length > LIMITES_VENDA.motivoMax) erros.push({ campo, mensagem: `O motivo pode ter até ${LIMITES_VENDA.motivoMax} caracteres.` });
  else if (CONTROLE.test(t)) erros.push({ campo, mensagem: 'O motivo contém caracteres inválidos.' });
  return t;
}

function lerAutorizacao(valor: unknown, campo: string, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.length > LIMITES_VENDA.autorizacaoMax || CONTROLE.test(valor)) {
    erros.push({ campo, mensagem: 'Autorização inválida.' });
    return null;
  }
  return valor;
}

function camposDesconhecidos(dados: Record<string, unknown>, permitidos: ReadonlySet<string>, prefixo: string, erros: ErroCampo[], mensagem?: (chave: string) => string) {
  for (const chave of Object.keys(dados)) {
    if (!permitidos.has(chave)) erros.push({ campo: `${prefixo}${chave}`, mensagem: mensagem?.(chave) ?? 'Campo não permitido.' });
  }
}

// ------------------------------------------------------------------ desconto
export type TipoDesconto = 'nenhum' | 'dentro-do-limite' | 'acima-do-limite' | 'brinde' | 'invalido';

/** Classifica o desconto de um item pelo preço final pedido. */
export function classificarDesconto(precoListaCentavos: number, precoFinalCentavos: number): { tipo: TipoDesconto; pct: number } {
  if (!Number.isInteger(precoFinalCentavos) || precoFinalCentavos < 0 || precoFinalCentavos >= precoListaCentavos) {
    return { tipo: precoFinalCentavos === precoListaCentavos ? 'nenhum' : 'invalido', pct: 0 };
  }
  const pct = ((precoListaCentavos - precoFinalCentavos) / precoListaCentavos) * 100;
  if (precoFinalCentavos === 0) return { tipo: 'brinde', pct: 100 };
  return { tipo: pct <= LIMITE_DESCONTO_VENDEDOR_PCT + 1e-9 ? 'dentro-do-limite' : 'acima-do-limite', pct };
}

/** Quem precisa autorizar este desconto, para quem está operando. null = a própria pessoa pode dar. */
export function quemAutorizaDesconto(tipo: TipoDesconto, papelOperador: PapelDeLoja): QuemAutoriza | null {
  if (tipo === 'brinde') return papelOperador === 'dono' ? null : 'dono';
  if (tipo === 'acima-do-limite') return ehGestor(papelOperador) ? null : 'gestor';
  return null;
}

/** Cancelamento e devolução: o Vendedor precisa do Dono ou do Administrador. */
export const quemAutorizaEstorno = (papelOperador: PapelDeLoja): QuemAutoriza | null => (ehGestor(papelOperador) ? null : 'gestor');

const atende = (papel: PapelDeLoja, quem: QuemAutoriza) => (quem === 'dono' ? papel === 'dono' : ehGestor(papel));

function autorizacaoValida(a: Autorizacao | undefined | null, quem: QuemAutoriza, agora: Date): a is Autorizacao {
  if (!a || !atende(a.autorizador.papel, quem)) return false;
  const idade = agora.getTime() - new Date(a.criadaEm).getTime();
  return idade >= 0 && idade <= VALIDADE_AUTORIZACAO_HORAS * 3_600_000;
}

// ------------------------------------------------------------------ validação do pedido
const CAMPOS_VENDA = new Set(['itens', 'pagamentos', 'recebidoDinheiroCentavos', 'clienteId']);
const CAMPOS_ITEM = new Set(['produtoId', 'quantidade', 'desconto']);
const CAMPOS_DESCONTO = new Set(['precoFinalCentavos', 'motivo', 'autorizacao']);
const CAMPOS_PAGAMENTO = new Set(['forma', 'valorCentavos']);

/**
 * Valida o pedido da Frente de caixa. O mesmo produto repetido sem desconto é somado numa linha só
 * (o leitor pode bipar o mesmo código várias vezes); repetido com desconto, é recusado.
 * Partes do pagamento na mesma forma são somadas.
 */
export function validarNovaVenda(entrada: unknown): Resultado<NovaVenda> {
  if (!ehObjeto(entrada)) {
    return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados da venda.' }] };
  }
  const erros: ErroCampo[] = [];
  camposDesconhecidos(entrada, CAMPOS_VENDA, '', erros, (c) =>
    c === 'vendedor' ? 'Quem vendeu é sempre quem está logado.' : c.startsWith('cliente') ? 'O cliente vem do cadastro: envie só o clienteId.' : 'Campo não permitido.',
  );

  // itens
  const linhas: ItemPedido[] = [];
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) {
    erros.push({ campo: 'itens', mensagem: 'Adicione pelo menos um produto à venda.' });
  } else {
    entrada.itens.forEach((bruto, i) => {
      const campo = `itens.${i}`;
      if (!ehObjeto(bruto)) {
        erros.push({ campo, mensagem: 'Item inválido.' });
        return;
      }
      camposDesconhecidos(bruto, CAMPOS_ITEM, `${campo}.`, erros, (c) =>
        c.toLowerCase().includes('preco') ? 'O preço vem do cadastro do produto.' : 'Campo não permitido.',
      );
      const id = typeof bruto.produtoId === 'string' ? bruto.produtoId.trim() : '';
      if (id === '' || id.length > LIMITES_VENDA.produtoIdMax) {
        erros.push({ campo: `${campo}.produtoId`, mensagem: 'Produto inválido.' });
        return;
      }
      const q = bruto.quantidade;
      if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) {
        erros.push({ campo: `${campo}.quantidade`, mensagem: 'A quantidade deve ser um número inteiro maior que zero.' });
        return;
      }
      let desconto: DescontoPedido | null = null;
      if (bruto.desconto !== undefined && bruto.desconto !== null) {
        if (!ehObjeto(bruto.desconto)) {
          erros.push({ campo: `${campo}.desconto`, mensagem: 'Desconto inválido.' });
          return;
        }
        camposDesconhecidos(bruto.desconto, CAMPOS_DESCONTO, `${campo}.desconto.`, erros);
        const pf = bruto.desconto.precoFinalCentavos;
        if (typeof pf !== 'number' || !Number.isInteger(pf) || pf < 0) {
          erros.push({ campo: `${campo}.desconto.precoFinalCentavos`, mensagem: 'O preço final deve ser em centavos, zero ou mais.' });
        }
        const motivo = lerMotivo(bruto.desconto.motivo, `${campo}.desconto.motivo`, erros, 'Informe o motivo do desconto.');
        const autorizacao = lerAutorizacao(bruto.desconto.autorizacao, `${campo}.desconto.autorizacao`, erros);
        desconto = { precoFinalCentavos: pf as number, motivo, autorizacao };
      }
      linhas.push({ produtoId: id, quantidade: q, desconto });
    });
  }

  const porProduto = new Map<string, ItemPedido>();
  for (const l of linhas) {
    const ja = porProduto.get(l.produtoId);
    if (!ja) porProduto.set(l.produtoId, { ...l });
    else if (ja.desconto || l.desconto) erros.push({ campo: 'itens', mensagem: 'Produto repetido na venda: junte as quantidades numa linha só.' });
    else ja.quantidade += l.quantidade;
  }
  for (const [id, l] of porProduto) {
    if (l.quantidade > LIMITES_VENDA.quantidadeMax) {
      erros.push({ campo: 'itens', mensagem: `Quantidade acima de ${LIMITES_VENDA.quantidadeMax} unidades num mesmo produto (${id}).` });
    }
  }
  if (porProduto.size > LIMITES_VENDA.itensMax) {
    erros.push({ campo: 'itens', mensagem: `Uma venda pode ter até ${LIMITES_VENDA.itensMax} produtos diferentes.` });
  }

  // pagamentos
  const porForma = new Map<FormaPagamento, number>();
  if (!Array.isArray(entrada.pagamentos)) {
    erros.push({ campo: 'pagamentos', mensagem: 'Informe a forma de pagamento.' });
  } else if (entrada.pagamentos.length > LIMITES_VENDA.pagamentosMax) {
    erros.push({ campo: 'pagamentos', mensagem: `O pagamento pode ser dividido em até ${LIMITES_VENDA.pagamentosMax} partes.` });
  } else {
    entrada.pagamentos.forEach((bruto, i) => {
      const campo = `pagamentos.${i}`;
      if (!ehObjeto(bruto)) {
        erros.push({ campo, mensagem: 'Pagamento inválido.' });
        return;
      }
      camposDesconhecidos(bruto, CAMPOS_PAGAMENTO, `${campo}.`, erros);
      if (!ehFormaPagamento(bruto.forma)) {
        erros.push({ campo: `${campo}.forma`, mensagem: 'Escolha a forma de pagamento.' });
        return;
      }
      const v = bruto.valorCentavos;
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
        erros.push({ campo: `${campo}.valorCentavos`, mensagem: 'O valor de cada parte deve ser maior que zero.' });
        return;
      }
      porForma.set(bruto.forma, (porForma.get(bruto.forma) ?? 0) + v);
    });
  }

  // recebido em dinheiro
  let recebido: number | null = null;
  const r = entrada.recebidoDinheiroCentavos;
  if (r !== undefined && r !== null) {
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > CENTAVOS_MAX) {
      erros.push({ campo: 'recebidoDinheiroCentavos', mensagem: 'Valor recebido inválido.' });
    } else recebido = r;
  }

  // cliente (F6)
  let clienteId: string | null = null;
  const c = entrada.clienteId;
  if (c !== undefined && c !== null && c !== '') {
    if (typeof c !== 'string' || c.trim() === '' || c.length > LIMITES_VENDA.clienteIdMax || CONTROLE.test(c)) {
      erros.push({ campo: 'clienteId', mensagem: 'Cliente inválido.' });
    } else clienteId = c.trim();
  }

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      clienteId,
      itens: [...porProduto.values()],
      // na ordem de FORMAS_PAGAMENTO, para a venda ficar igual não importa a ordem em que foi digitada
      pagamentos: FORMAS_PAGAMENTO.filter((f) => porForma.has(f)).map((forma) => ({ forma, valorCentavos: porForma.get(forma)! })),
      recebidoDinheiroCentavos: recebido,
    },
  };
}

// ------------------------------------------------------------------ cálculo da venda
export interface ContextoVenda {
  /** Quem está logado (vem da sessão, nunca do pedido). */
  operador: OperadorComPapel;
  /** Autorizações dadas com senha, guardadas pelo servidor. */
  autorizacoes?: ReadonlyMap<string, Autorizacao>;
  /** Saldo de estoque de cada produto. Com ele, a venda sem estoque é recusada. */
  estoque?: ReadonlyMap<string, number>;
  /** Clientes da loja, para conferir o cliente identificado (F6). */
  clientes?: ReadonlyMap<string, ClienteParaVenda>;
  agora?: Date;
}

export interface VendaCalculada {
  itens: ItemVendido[];
  totalCentavos: number;
  descontoCentavos: number;
  pagamentos: Pagamento[];
  recebidoDinheiroCentavos: number | null;
  trocoCentavos: number;
  cliente: ClienteDaVenda | null;
  /** Autorizações usadas nesta venda: o servidor apaga (uso único). */
  autorizacoesUsadas: string[];
}

/**
 * Monta os itens com nome e preço do CADASTRO, aplica os descontos (conferindo quem pode dar),
 * soma o total e confere os pagamentos e o troco. Produto inexistente ou desativado recusa a venda;
 * com o saldo de estoque no contexto, falta de estoque também; cliente não encontrado também.
 */
export function calcularVenda(pedido: NovaVenda, catalogo: ReadonlyMap<string, ProdutoParaVenda>, ctx: ContextoVenda): Resultado<VendaCalculada> {
  const agora = ctx.agora ?? new Date();
  const erros: ErroCampo[] = [];
  const itens: ItemVendido[] = [];
  const usadas: string[] = [];
  let total = 0;
  let desconto = 0;

  pedido.itens.forEach((item, i) => {
    const p = catalogo.get(item.produtoId);
    if (!p || !p.ativo) {
      erros.push({ campo: `itens.${i}.produtoId`, mensagem: 'Produto não encontrado ou desativado.' });
      return;
    }
    let preco = p.precoCentavos;
    let aplicado: DescontoAplicado | null = null;
    if (item.desconto) {
      const { tipo } = classificarDesconto(p.precoCentavos, item.desconto.precoFinalCentavos);
      if (tipo === 'nenhum' || tipo === 'invalido') {
        erros.push({ campo: `itens.${i}.desconto`, mensagem: `O preço final de ${p.nome} deve ser menor que o preço de tabela (0 para brinde).` });
        return;
      }
      const quem = quemAutorizaDesconto(tipo, ctx.operador.papel);
      let responsavel: Operador = { id: ctx.operador.id, nome: ctx.operador.nome };
      let comSenha = false;
      if (quem) {
        const a = item.desconto.autorizacao ? ctx.autorizacoes?.get(item.desconto.autorizacao) : undefined;
        const certa =
          autorizacaoValida(a, quem, agora) &&
          a.acao.tipo === 'desconto' &&
          a.acao.produtoId === p.id &&
          (tipo === 'brinde' ? a.acao.precoFinalCentavos === 0 : item.desconto.precoFinalCentavos >= a.acao.precoFinalCentavos);
        if (!certa) {
          erros.push({
            campo: `itens.${i}.desconto.autorizacao`,
            mensagem:
              tipo === 'brinde'
                ? `O brinde de ${p.nome} precisa da autorização de um Dono. Aplique o desconto de novo.`
                : `O desconto de ${p.nome} passa de ${LIMITE_DESCONTO_VENDEDOR_PCT}% e precisa da autorização do Dono ou do Administrador. Aplique o desconto de novo.`,
          });
          return;
        }
        responsavel = { id: a.autorizador.id, nome: a.autorizador.nome };
        comSenha = true;
        usadas.push(a.id);
      }
      preco = item.desconto.precoFinalCentavos;
      aplicado = { motivo: item.desconto.motivo, responsavel, autorizadoComSenha: comSenha };
      desconto += (p.precoCentavos - preco) * item.quantidade;
    }
    const subtotal = preco * item.quantidade;
    total += subtotal;
    itens.push({
      produtoId: p.id,
      codigoInterno: p.codigoInterno,
      nome: p.nome,
      precoListaCentavos: p.precoCentavos,
      precoCentavos: preco,
      quantidade: item.quantidade,
      subtotalCentavos: subtotal,
      desconto: aplicado,
    });
  });

  if (erros.length === 0 && (!Number.isSafeInteger(total) || total > CENTAVOS_MAX)) {
    erros.push({ campo: 'itens', mensagem: 'Total da venda acima do limite permitido.' });
  }
  if (erros.length > 0) return { ok: false, erros };

  // estoque: só passa se houver saldo para todos os itens
  if (ctx.estoque) {
    const estoque = conferirEstoque(itens, ctx.estoque);
    if (!estoque.ok) return estoque;
  }

  // cliente: sai do cadastro (nome de hoje), nunca da tela
  let cliente: ClienteDaVenda | null = null;
  if (pedido.clienteId) {
    const c = ctx.clientes?.get(pedido.clienteId);
    if (!c || !c.ativo) {
      return { ok: false, erros: [{ campo: 'clienteId', mensagem: 'Cliente não encontrado. Identifique o cliente de novo (F6) ou tire o cliente da venda.' }] };
    }
    cliente = { id: c.id, nome: c.nome };
  }

  // pagamentos e troco
  const pago = pedido.pagamentos.reduce((s, p) => s + p.valorCentavos, 0);
  if (total > 0 && pedido.pagamentos.length === 0) return { ok: false, erros: [{ campo: 'pagamentos', mensagem: 'Informe a forma de pagamento.' }] };
  if (pago !== total) {
    return {
      ok: false,
      erros: [{ campo: 'pagamentos', mensagem: `Os pagamentos somam ${formatarCentavos(pago)}, e a venda é ${formatarCentavos(total)}.` }],
    };
  }
  const emDinheiro = pedido.pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valorCentavos, 0);
  let recebido: number | null = null;
  let troco = 0;
  if (emDinheiro > 0) {
    const r = pedido.recebidoDinheiroCentavos;
    if (r === undefined || r === null || r < emDinheiro) {
      return {
        ok: false,
        erros: [
          { campo: 'recebidoDinheiroCentavos', mensagem: `Informe o valor recebido em dinheiro (igual ou maior que ${formatarCentavos(emDinheiro)}).` },
        ],
      };
    }
    recebido = r;
    troco = r - emDinheiro;
  }

  return {
    ok: true,
    valor: {
      itens,
      totalCentavos: total,
      descontoCentavos: desconto,
      pagamentos: pedido.pagamentos.map((p) => ({ ...p })),
      recebidoDinheiroCentavos: recebido,
      trocoCentavos: troco,
      cliente,
      autorizacoesUsadas: usadas,
    },
  };
}

// ------------------------------------------------------------------ cancelamento e devolução
/** Cancelar a venda inteira só no mesmo dia (no fuso da loja) e se ela não tiver devolução. */
export function podeCancelarVenda(venda: Venda, agora: Date, fuso: string = FUSO_PADRAO): boolean {
  return venda.status === 'finalizada' && venda.devolucoes.length === 0 && diaNoFuso(venda.criadaEm, fuso) === diaNoFuso(agora, fuso);
}

/** Quanto de cada item ainda pode ser devolvido. */
export function restanteParaDevolver(venda: Venda): number[] {
  return venda.itens.map((item, linha) => item.quantidade - venda.devolucoes.reduce((s, d) => s + d.itens.filter((x) => x.linha === linha).reduce((t, x) => t + x.quantidade, 0), 0));
}

/** Quanto ainda pode voltar por cada forma de pagamento da venda (o pago menos o já devolvido). */
export function estornavelPorForma(venda: Venda): Pagamento[] {
  const m = new Map<FormaPagamento, number>();
  venda.pagamentos.forEach((p) => m.set(p.forma, (m.get(p.forma) ?? 0) + p.valorCentavos));
  venda.devolucoes.forEach((d) => d.estornos.forEach((e) => m.set(e.forma, (m.get(e.forma) ?? 0) - e.valorCentavos)));
  return FORMAS_PAGAMENTO.filter((f) => (m.get(f) ?? 0) > 0).map((forma) => ({ forma, valorCentavos: m.get(forma)! }));
}

/**
 * Reparte o valor a devolver entre as formas de pagamento da venda, na proporção do que cada uma ainda
 * pode devolver (em centavos), como o DaniPets: arredonda para baixo e completa pelas maiores.
 */
export function repartirEstorno(venda: Venda, valorCentavos: number): Resultado<Pagamento[]> {
  const disponiveis = estornavelPorForma(venda).sort((a, b) => a.valorCentavos - b.valorCentavos);
  const total = disponiveis.reduce((s, p) => s + p.valorCentavos, 0);
  if (valorCentavos > total) {
    return { ok: false, erros: [{ campo: 'itens', mensagem: `Só ${formatarCentavos(total)} desta venda ainda pode voltar pela mesma forma de pagamento.` }] };
  }
  if (total === 0 || valorCentavos === 0) return { ok: true, valor: [] };
  const partes = disponiveis.map((p) => Math.min(p.valorCentavos, Math.floor((valorCentavos * p.valorCentavos) / total)));
  let resto = valorCentavos - partes.reduce((s, v) => s + v, 0);
  for (let i = disponiveis.length - 1; i >= 0 && resto > 0; i--) {
    const mais = Math.min(resto, disponiveis[i]!.valorCentavos - partes[i]!);
    partes[i]! += mais;
    resto -= mais;
  }
  const estornos = disponiveis.map((p, i) => ({ forma: p.forma, valorCentavos: partes[i]! })).filter((e) => e.valorCentavos > 0);
  // devolve na ordem das formas, como a venda mostra
  return { ok: true, valor: FORMAS_PAGAMENTO.flatMap((f) => estornos.filter((e) => e.forma === f)) };
}

export interface PedidoCancelamento {
  motivo: string;
  autorizacao?: string | null;
}

export interface PedidoDevolucao {
  /** voltaAoEstoque: padrão true (volta para a prateleira); false para avaria ou vencido. */
  itens: { linha: number; quantidade: number; voltaAoEstoque?: boolean }[];
  motivo: string;
  autorizacao?: string | null;
}

export function validarPedidoCancelamento(entrada: unknown): Resultado<PedidoCancelamento> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o motivo.' }] };
  const erros: ErroCampo[] = [];
  camposDesconhecidos(entrada, new Set(['motivo', 'autorizacao']), '', erros);
  const motivo = lerMotivo(entrada.motivo, 'motivo', erros, 'Informe o motivo do cancelamento.');
  const autorizacao = lerAutorizacao(entrada.autorizacao, 'autorizacao', erros);
  return erros.length ? { ok: false, erros } : { ok: true, valor: { motivo, autorizacao } };
}

export function validarPedidoDevolucao(entrada: unknown): Resultado<PedidoDevolucao> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os itens e o motivo.' }] };
  const erros: ErroCampo[] = [];
  camposDesconhecidos(entrada, new Set(['itens', 'motivo', 'autorizacao']), '', erros);
  const itens: { linha: number; quantidade: number; voltaAoEstoque: boolean }[] = [];
  if (!Array.isArray(entrada.itens)) erros.push({ campo: 'itens', mensagem: 'Escolha o que vai ser devolvido.' });
  else
    entrada.itens.forEach((x, i) => {
      if (!ehObjeto(x) || !Number.isInteger(x.linha) || (x.linha as number) < 0 || !Number.isInteger(x.quantidade) || (x.quantidade as number) < 0) {
        erros.push({ campo: `itens.${i}`, mensagem: 'Item inválido.' });
        return;
      }
      camposDesconhecidos(x, new Set(['linha', 'quantidade', 'voltaAoEstoque']), `itens.${i}.`, erros);
      if (x.voltaAoEstoque !== undefined && typeof x.voltaAoEstoque !== 'boolean') {
        erros.push({ campo: `itens.${i}.voltaAoEstoque`, mensagem: 'Marque se o item volta para o estoque.' });
        return;
      }
      if ((x.quantidade as number) > 0) itens.push({ linha: x.linha as number, quantidade: x.quantidade as number, voltaAoEstoque: x.voltaAoEstoque !== false });
    });
  if (erros.length === 0 && itens.length === 0) erros.push({ campo: 'itens', mensagem: 'Informe a quantidade de pelo menos um item.' });
  const motivo = lerMotivo(entrada.motivo, 'motivo', erros, 'Informe o motivo da devolução.');
  const autorizacao = lerAutorizacao(entrada.autorizacao, 'autorizacao', erros);
  return erros.length ? { ok: false, erros } : { ok: true, valor: { itens, motivo, autorizacao } };
}

export interface ContextoEstorno {
  operador: OperadorComPapel;
  /** A autorização indicada no pedido, já buscada pelo servidor (ou null). */
  autorizacao?: Autorizacao | null;
  agora?: Date;
  fuso?: string;
}

function conferirAutorizacaoEstorno(
  venda: Venda,
  tipo: 'cancelamento' | 'devolucao',
  ctx: ContextoEstorno,
): Resultado<{ autorizadoPor: Operador | null; usada: string | null }> {
  const quem = quemAutorizaEstorno(ctx.operador.papel);
  if (!quem) return { ok: true, valor: { autorizadoPor: null, usada: null } };
  const a = ctx.autorizacao;
  if (!autorizacaoValida(a, quem, ctx.agora ?? new Date()) || a.acao.tipo !== tipo || a.acao.vendaId !== venda.id) {
    return {
      ok: false,
      erros: [{ campo: 'autorizacao', mensagem: `${tipo === 'cancelamento' ? 'O cancelamento' : 'A devolução'} precisa da autorização do Dono ou do Administrador.` }],
    };
  }
  return { ok: true, valor: { autorizadoPor: { id: a.autorizador.id, nome: a.autorizador.nome }, usada: a.id } };
}

/** Confere o cancelamento e diz como o dinheiro volta (tudo, pelas mesmas formas da venda). */
export function calcularCancelamento(
  venda: Venda,
  pedido: PedidoCancelamento,
  ctx: ContextoEstorno,
): Resultado<{ estornos: Pagamento[]; autorizadoPor: Operador | null; autorizacaoUsada: string | null }> {
  if (venda.status === 'cancelada') return { ok: false, erros: [{ campo: '_', mensagem: 'Esta venda já foi cancelada.' }] };
  if (!podeCancelarVenda(venda, ctx.agora ?? new Date(), ctx.fuso)) {
    return {
      ok: false,
      erros: [{ campo: '_', mensagem: 'Cancelar a venda inteira só é possível no mesmo dia e sem devoluções. Use "Devolver itens".' }],
    };
  }
  const aut = conferirAutorizacaoEstorno(venda, 'cancelamento', ctx);
  if (!aut.ok) return aut;
  return { ok: true, valor: { estornos: venda.pagamentos.map((p) => ({ ...p })), autorizadoPor: aut.valor.autorizadoPor, autorizacaoUsada: aut.valor.usada } };
}

/** Confere a devolução de itens: quantidades, valor (preço cobrado) e como o dinheiro volta. */
export function calcularDevolucao(
  venda: Venda,
  pedido: PedidoDevolucao,
  ctx: ContextoEstorno,
): Resultado<{ itens: ItemDevolvido[]; totalCentavos: number; estornos: Pagamento[]; autorizadoPor: Operador | null; autorizacaoUsada: string | null }> {
  if (venda.status === 'cancelada') return { ok: false, erros: [{ campo: '_', mensagem: 'Esta venda foi cancelada.' }] };
  const restante = restanteParaDevolver(venda);
  const erros: ErroCampo[] = [];
  const itens: ItemDevolvido[] = [];
  const vistas = new Set<number>();
  pedido.itens.forEach((x, i) => {
    const item = venda.itens[x.linha];
    if (!item) return void erros.push({ campo: `itens.${i}`, mensagem: 'Item da venda não encontrado.' });
    if (vistas.has(x.linha)) return void erros.push({ campo: `itens.${i}`, mensagem: 'Item repetido na devolução.' });
    vistas.add(x.linha);
    if (x.quantidade > restante[x.linha]!) {
      return void erros.push({ campo: `itens.${i}`, mensagem: `De ${item.nome} ainda dá para devolver no máximo ${restante[x.linha]} un.` });
    }
    itens.push({
      linha: x.linha,
      produtoId: item.produtoId,
      nome: item.nome,
      quantidade: x.quantidade,
      valorCentavos: item.precoCentavos * x.quantidade,
      voltaAoEstoque: x.voltaAoEstoque !== false,
    });
  });
  if (erros.length) return { ok: false, erros };
  const total = itens.reduce((s, x) => s + x.valorCentavos, 0);
  const aut = conferirAutorizacaoEstorno(venda, 'devolucao', ctx);
  if (!aut.ok) return aut;
  const estornos = repartirEstorno(venda, total);
  if (!estornos.ok) return estornos;
  return { ok: true, valor: { itens, totalCentavos: total, estornos: estornos.valor, autorizadoPor: aut.valor.autorizadoPor, autorizacaoUsada: aut.valor.usada } };
}

// ------------------------------------------------------------------ datas e resumos
/** Dia (AAAA-MM-DD) em que o instante cai no fuso da loja. */
export function diaNoFuso(instante: string | Date, fuso: string = FUSO_PADRAO): string {
  const data = typeof instante === 'string' ? new Date(instante) : instante;
  if (Number.isNaN(data.getTime())) throw new RangeError('Data inválida.');
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(data)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Itens com data entre dois dias (inclusive), no fuso da loja. Sem limite = sem filtro. */
export function vendasNoPeriodo<T extends { criadaEm: string }>(
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
  /** Só vendas finalizadas (canceladas não entram). */
  totalCentavos: number;
  quantidadeVendas: number;
  itensVendidos: number;
  descontoCentavos: number;
  /** Total ÷ número de vendas, arredondado ao centavo. 0 sem vendas. */
  ticketMedioCentavos: number;
  canceladas: number;
  /** Só as formas que tiveram venda, na ordem de FORMAS_PAGAMENTO; no pagamento dividido, cada parte na sua forma. */
  porForma: { forma: FormaPagamento; totalCentavos: number; quantidade: number }[];
  /** Do que mais vendeu para o que menos vendeu. */
  porVendedor: { id: string; nome: string; totalCentavos: number; quantidade: number }[];
}

export function resumirVendas(vendas: readonly Venda[]): ResumoVendas {
  let total = 0;
  let itens = 0;
  let desconto = 0;
  let canceladas = 0;
  let quantidade = 0;
  const formas = new Map<FormaPagamento, { totalCentavos: number; quantidade: number }>();
  const vendedores = new Map<string, { id: string; nome: string; totalCentavos: number; quantidade: number }>();

  for (const v of vendas) {
    if (v.status === 'cancelada') {
      canceladas += 1;
      continue;
    }
    quantidade += 1;
    total += v.totalCentavos;
    desconto += v.descontoCentavos;
    itens += v.itens.reduce((s, i) => s + i.quantidade, 0);
    const usadas = new Set<FormaPagamento>();
    for (const p of v.pagamentos) {
      const f = formas.get(p.forma) ?? { totalCentavos: 0, quantidade: 0 };
      f.totalCentavos += p.valorCentavos;
      if (!usadas.has(p.forma)) f.quantidade += 1;
      usadas.add(p.forma);
      formas.set(p.forma, f);
    }
    const p = vendedores.get(v.vendedor.id) ?? { id: v.vendedor.id, nome: v.vendedor.nome, totalCentavos: 0, quantidade: 0 };
    p.totalCentavos += v.totalCentavos;
    p.quantidade += 1;
    vendedores.set(v.vendedor.id, p);
  }

  return {
    totalCentavos: total,
    quantidadeVendas: quantidade,
    itensVendidos: itens,
    descontoCentavos: desconto,
    ticketMedioCentavos: quantidade ? Math.round(total / quantidade) : 0,
    canceladas,
    porForma: FORMAS_PAGAMENTO.filter((f) => formas.has(f)).map((forma) => ({ forma, ...formas.get(forma)! })),
    porVendedor: [...vendedores.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

/** Devolução com a venda de origem (para listar e filtrar as devoluções de um período). */
export interface DevolucaoComVenda extends Devolucao {
  vendaId: string;
  vendaNumero: number;
  /** Quem fez a venda, o cliente e as formas de pagamento dela (para os filtros dos Relatórios). */
  vendaVendedor: Operador;
  vendaCliente: ClienteDaVenda | null;
  vendaFormas: FormaPagamento[];
}

export function devolucoesComVenda(vendas: readonly Venda[]): DevolucaoComVenda[] {
  return vendas.flatMap((v) =>
    v.devolucoes.map((d) => ({
      ...d,
      vendaId: v.id,
      vendaNumero: v.numero,
      vendaVendedor: v.vendedor,
      vendaCliente: v.cliente ?? null,
      vendaFormas: FORMAS_PAGAMENTO.filter((f) => v.pagamentos.some((p) => p.forma === f)),
    })),
  );
}

export function resumirDevolucoes(devolucoes: readonly Devolucao[]): { totalCentavos: number; quantidade: number } {
  return { totalCentavos: devolucoes.reduce((s, d) => s + d.totalCentavos, 0), quantidade: devolucoes.length };
}
