// packages/core/src/venda.ts
// Regras da venda (Frente de caixa), usadas pela tela e, depois, pela API.
// Copiadas do DaniPets V9.3.3, no que já cabe no SaaS:
//   - pagamento numa forma só ou dividido em várias; dinheiro pede o valor recebido e calcula o troco;
//   - desconto por item com motivo: o Vendedor dá até 10% sozinho; acima disso precisa da senha do
//     Dono ou do Administrador; brinde (preço final R$ 0,00) só com a autorização de um Dono;
//   - cancelamento da venda inteira (no mesmo dia e sem devolução) e devolução de itens, com o valor
//     voltando pelas mesmas formas de pagamento da venda; o Vendedor precisa de autorização;
//   - venda sem estoque é recusada ("Estoque insuficiente para X. Disponível: N un.");
//   - cliente identificado (F6) opcional: vem do cadastro, nunca um nome digitado na tela;
//   - fiado (F7): venda a prazo, SÓ para cliente identificado; sem cliente, a venda é recusada;
//   - cashback (módulo 7): o saldo do cliente identificado abate do total e a forma escolhida paga o resto; o
//     cupom de retorno do cliente dá o desconto sozinho nos itens sem desconto manual (fidelidade.ts);
//   - vale-troca (módulo 8): cada vale abate do total pelo que cobre (depois do cashback), com ou sem cliente; a
//     devolução pode voltar como vale-troca novo (vale.ts).
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
import { formatarQuantidade, QUANTIDADE_MAX, type UnidadeVenda, unidadeDe, valorDaQuantidade } from './quantidade';
import { CONTROLE, ehObjeto } from './interno';
import type { PapelNaLoja } from './papeis';
import { pode, type QuemAcessa } from './permissoes';
import type { ErroCampo, Resultado } from './resultado';

/** Na ordem do DaniPets (PAY_METHODS): as formas da tela, os créditos do cliente (vale-troca e cashback) e o fiado. */
export const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'vale', 'cashback', 'fiado'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Nomes iguais aos do DaniPets. */
export const NOME_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  vale: 'Vale-troca',
  cashback: 'Cashback',
  fiado: 'Fiado',
};

/** Crédito do cliente: abate do total pelo que cobre, e a forma escolhida paga o resto (DaniPets CREDIT_METHODS). */
export type FormaDeCredito = Extract<FormaPagamento, 'cashback' | 'vale'>;
export const ehFormaDeCredito = (forma: FormaPagamento): forma is FormaDeCredito => forma === 'cashback' || forma === 'vale';

/**
 * As formas que a pessoa escolhe nos botões da Frente de caixa (o cashback e o vale-troca entram pelos botões
 * "Usar cashback" e "Usar vale-troca").
 */
export const FORMAS_DA_TELA: readonly FormaPagamento[] = FORMAS_PAGAMENTO.filter((f) => !ehFormaDeCredito(f));

/** Fiado (venda a prazo na conta do cliente) e cashback (saldo do cliente): só com cliente identificado (F6). */
export const formaPrecisaDeCliente = (forma: FormaPagamento): boolean => forma === 'fiado' || forma === 'cashback';

export const MENSAGEM_FIADO_SEM_CLIENTE = 'Venda no fiado precisa de cliente identificado. Identifique o cliente (F6).';
export const MENSAGEM_CASHBACK_SEM_CLIENTE = 'O cashback precisa de cliente identificado. Identifique o cliente (F6).';
export const mensagemFormaSemCliente = (forma: FormaPagamento): string => (forma === 'cashback' ? MENSAGEM_CASHBACK_SEM_CLIENTE : MENSAGEM_FIADO_SEM_CLIENTE);

/**
 * Preço com o cupom de retorno (DaniPets precoCupom), em centavos. O % tem até 2 casas: a conta é feita em
 * inteiros, sem float.
 */
export const precoComCupom = (precoCentavos: number, pct: number): number => Math.round((precoCentavos * (10_000 - Math.round(pct * 100))) / 10_000);

export const motivoDoCupom = (pct: number): string => `Cupom de retorno ${String(Math.round(pct * 100) / 100).replace('.', ',')}%`;

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
  papel: PapelNaLoja;
  /** Só no Personalizado: as funções escolhidas para ele. */
  permissoes?: readonly string[] | null;
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
  /** Cupom de retorno do cliente identificado (id): o preço sai da regra, nunca da tela. Não vai junto com `desconto`. */
  cupom?: string | null;
}

export interface Pagamento {
  forma: FormaPagamento;
  valorCentavos: number;
  /** No vale-troca: qual vale (cada vale é uma parte do pagamento). */
  valeId?: string | null;
  /** O código do vale (VT-0001-ABC), gravado pelo servidor para mostrar. */
  valeCodigo?: string | null;
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
  /** Fiado acima do limite ou com fiado vencido: a liberação de um Dono (autorização dada com senha e motivo). */
  liberacaoFiado?: { autorizacao: string; motivo: string } | null;
}

/** Cliente gravado na venda (o nome como estava no cadastro na hora da venda). */
export interface ClienteDaVenda {
  id: string;
  nome: string;
}

export interface DescontoAplicado {
  motivo: string;
  /** Quem deu o desconto: a própria pessoa ou quem autorizou com senha (no cupom: quem vendeu). */
  responsavel: Operador;
  autorizadoComSenha: boolean;
  /** Desconto do cupom de retorno (módulo 7). */
  cupom?: { id: string; pct: number } | null;
}

export interface ItemVendido {
  produtoId: string;
  codigoInterno: string;
  nome: string;
  /** Preço do cadastro na hora da venda. */
  precoListaCentavos: number;
  /** Preço cobrado (com desconto, se houver). No kg, o preço do quilo. */
  precoCentavos: number;
  /** Unidades, ou gramas no produto vendido por kg. */
  quantidade: number;
  /** Como o produto era vendido na hora da venda (sem: unidade, como nas vendas antigas). */
  unidade?: UnidadeVenda;
  subtotalCentavos: number;
  desconto?: DescontoAplicado | null;
  /** Custo médio de cada unidade (ou kg) na hora da venda (DaniPets PRD-10), para o lucro. null = sem custo. */
  custoCentavos?: number | null;
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
  /** Unidades, ou gramas no produto vendido por kg. */
  quantidade: number;
  unidade?: UnidadeVenda;
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
  /** O que voltou pelas mesmas formas da venda (no vale-troca, só o fiado em aberto que foi abatido). */
  estornos: Pagamento[];
  /** Devolução como vale-troca (módulo 8): o vale emitido com o resto. */
  vale?: { id: string; codigo: string; valorCentavos: number } | null;
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
  /** Caixa do dia em que a venda foi feita (sem: venda de antes do Caixa do dia). */
  caixaId?: string | null;
  /** Fiado liberado por um Dono (acima do limite ou com fiado vencido): quem, o motivo e por quê. */
  fiadoLiberado?: { por: Operador; motivo: string; motivos: string[] } | null;
  /** Cashback que a compra gerou para o cliente (módulo 7) e quanto dele já foi retirado (devolução ou cancelamento). */
  cashbackGeradoCentavos?: number;
  cashbackRetiradoCentavos?: number;
  /** Cupom de retorno usado nesta compra. */
  cupomId?: string | null;
}

/** Produto como o cadastro o tem na hora da venda. */
export interface ProdutoParaVenda {
  id: string;
  codigoInterno: string;
  nome: string;
  precoCentavos: number;
  ativo: boolean;
  /** Sem: unidade. */
  unidade?: UnidadeVenda;
}

/** O que uma autorização dada com senha permite fazer (uma vez só). */
export type AcaoAutorizada =
  | { tipo: 'desconto'; produtoId: string; precoFinalCentavos: number }
  | { tipo: 'cancelamento'; vendaId: string }
  | { tipo: 'devolucao'; vendaId: string }
  /** Retirada do dono da gaveta feita pelo Vendedor (Caixa do dia). */
  | { tipo: 'retirada'; valorCentavos: number }
  /** Fechamento com diferença acima da tolerância feito pelo Vendedor. */
  | { tipo: 'fechamento'; dia: string; contadoCentavos: number }
  /** Lançamento num dia com o caixa já fechado: só com a liberação de um Dono. */
  | { tipo: 'dia_fechado'; dia: string }
  /** Venda no fiado acima do limite ou com fiado vencido: só com a liberação de um Dono. */
  | { tipo: 'fiado'; clienteId: string; valorCentavos: number }
  /** Excluir os dados de um cliente (LGPD): só com a liberação de um Dono. */
  | { tipo: 'excluir_dados_cliente'; clienteId: string };

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

/** "Vale-troca VT-0001-ABC" no vale; o nome da forma nas outras. */
export const nomeDoPagamento = (p: Pick<Pagamento, 'forma' | 'valeCodigo'>): string => (p.forma === 'vale' && p.valeCodigo ? `Vale-troca ${p.valeCodigo}` : NOME_FORMA_PAGAMENTO[p.forma]);

/** "Pix" numa forma só; "Dinheiro R$ 10,00 + Pix R$ 22,40" no pagamento dividido. */
export function descreverPagamentos(pagamentos: readonly Pagamento[]): string {
  if (pagamentos.length === 0) return 'Sem pagamento (brinde)';
  if (pagamentos.length === 1) return nomeDoPagamento(pagamentos[0]!);
  return pagamentos.map((p) => `${nomeDoPagamento(p)} ${formatarCentavos(p.valorCentavos)}`).join(' + ');
}

function lerMotivo(valor: unknown, campo: string, erros: ErroCampo[], obrigatorio = 'Informe o motivo.'): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    erros.push({ campo, mensagem: obrigatorio });
    return '';
  }
  const t = valor.normalize('NFC').trim();
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

/**
 * Classifica o desconto de um item pelo preço final pedido. `limitePct` = quanto o Vendedor dá sem senha
 * (regra da loja; padrão do DaniPets: 10%).
 */
export function classificarDesconto(
  precoListaCentavos: number,
  precoFinalCentavos: number,
  limitePct: number = LIMITE_DESCONTO_VENDEDOR_PCT,
): { tipo: TipoDesconto; pct: number } {
  if (!Number.isInteger(precoFinalCentavos) || precoFinalCentavos < 0 || precoFinalCentavos >= precoListaCentavos) {
    return { tipo: precoFinalCentavos === precoListaCentavos ? 'nenhum' : 'invalido', pct: 0 };
  }
  const pct = ((precoListaCentavos - precoFinalCentavos) / precoListaCentavos) * 100;
  if (precoFinalCentavos === 0) return { tipo: 'brinde', pct: 100 };
  return { tipo: pct <= limitePct + 1e-9 ? 'dentro-do-limite' : 'acima-do-limite', pct };
}

/** Quem precisa autorizar este desconto, para quem está operando. null = a própria pessoa pode dar. */
export function quemAutorizaDesconto(tipo: TipoDesconto, papelOperador: QuemAcessa): QuemAutoriza | null {
  // quem pode o quê vem da matriz única (permissoes.ts)
  if (tipo === 'brinde') return pode(papelOperador, 'brinde') ? null : 'dono';
  if (tipo === 'acima-do-limite') return pode(papelOperador, 'desconto.acima_do_limite') ? null : 'gestor';
  return null;
}

/** Cancelamento e devolução: o Vendedor precisa do Dono ou do Administrador. */
export const quemAutorizaEstorno = (papelOperador: QuemAcessa): QuemAutoriza | null => (pode(papelOperador, 'estorno') ? null : 'gestor');

/** A senha de quem autoriza vale se essa pessoa pode fazer aquilo sozinha. */
const atende = (papel: QuemAcessa, quem: QuemAutoriza) => (quem === 'dono' ? pode(papel, 'brinde') : pode(papel, 'desconto.acima_do_limite') && pode(papel, 'estorno'));

function autorizacaoValida(a: Autorizacao | undefined | null, quem: QuemAutoriza, agora: Date): a is Autorizacao {
  if (!a || !atende(a.autorizador, quem)) return false;
  const idade = agora.getTime() - new Date(a.criadaEm).getTime();
  return idade >= 0 && idade <= VALIDADE_AUTORIZACAO_HORAS * 3_600_000;
}

// ------------------------------------------------------------------ validação do pedido
const CAMPOS_VENDA = new Set(['itens', 'pagamentos', 'recebidoDinheiroCentavos', 'clienteId', 'liberacaoFiado']);
const CAMPOS_ITEM = new Set(['produtoId', 'quantidade', 'desconto', 'cupom']);
const CAMPOS_DESCONTO = new Set(['precoFinalCentavos', 'motivo', 'autorizacao']);
const CAMPOS_PAGAMENTO = new Set(['forma', 'valorCentavos', 'valeId']);

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
      let cupom: string | null = null;
      if (bruto.cupom !== undefined && bruto.cupom !== null) {
        const k = bruto.cupom;
        if (typeof k !== 'string' || k.trim() === '' || k.length > LIMITES_VENDA.autorizacaoMax || CONTROLE.test(k)) {
          erros.push({ campo: `${campo}.cupom`, mensagem: 'Cupom inválido.' });
          return;
        }
        if (desconto) {
          erros.push({ campo: `${campo}.cupom`, mensagem: 'Use o cupom de retorno ou o desconto manual, não os dois no mesmo item.' });
          return;
        }
        cupom = k.trim();
      }
      linhas.push({ produtoId: id, quantidade: q, desconto, ...(cupom ? { cupom } : {}) });
    });
  }

  const porProduto = new Map<string, ItemPedido>();
  for (const l of linhas) {
    const ja = porProduto.get(l.produtoId);
    if (!ja) porProduto.set(l.produtoId, { ...l });
    else if (ja.desconto || l.desconto || ja.cupom || l.cupom) erros.push({ campo: 'itens', mensagem: 'Produto repetido na venda: junte as quantidades numa linha só.' });
    else ja.quantidade += l.quantidade;
  }
  // o limite de cada unidade (9999 un ou 999,999 kg) é conferido no cálculo, que conhece o produto
  for (const [id, l] of porProduto) {
    if (l.quantidade > QUANTIDADE_MAX.kg) {
      erros.push({ campo: 'itens', mensagem: `Quantidade acima do limite num mesmo produto (${id}).` });
    }
  }
  if (porProduto.size > LIMITES_VENDA.itensMax) {
    erros.push({ campo: 'itens', mensagem: `Uma venda pode ter até ${LIMITES_VENDA.itensMax} produtos diferentes.` });
  }

  // pagamentos (cada vale-troca é uma parte; o mesmo vale duas vezes soma)
  const porForma = new Map<FormaPagamento, number>();
  const porVale = new Map<string, number>();
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
      if (bruto.forma === 'vale') {
        const id = bruto.valeId;
        if (typeof id !== 'string' || id.trim() === '' || id.length > LIMITES_VENDA.autorizacaoMax || CONTROLE.test(id)) {
          erros.push({ campo: `${campo}.valeId`, mensagem: 'Escolha o vale-troca.' });
          return;
        }
        porVale.set(id.trim(), (porVale.get(id.trim()) ?? 0) + v);
        return;
      }
      if (bruto.valeId !== undefined && bruto.valeId !== null) {
        erros.push({ campo: `${campo}.valeId`, mensagem: 'Só o vale-troca leva o vale.' });
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

  // liberação do Dono para o fiado acima do limite ou com fiado vencido (módulo 6)
  let liberacaoFiado: { autorizacao: string; motivo: string } | null = null;
  const lf = entrada.liberacaoFiado;
  if (lf !== undefined && lf !== null) {
    const ok = ehObjeto(lf) && typeof lf.autorizacao === 'string' && lf.autorizacao.trim() !== '' && typeof lf.motivo === 'string';
    const motivo = ok ? (lf.motivo as string).normalize('NFC').trim().replace(/\s+/g, ' ') : '';
    if (!ok || !motivo || motivo.length > 200 || CONTROLE.test(motivo)) erros.push({ campo: 'liberacaoFiado', mensagem: 'Liberação do fiado inválida: informe o motivo.' });
    else liberacaoFiado = { autorizacao: (lf.autorizacao as string).trim(), motivo };
  }

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      clienteId,
      ...(liberacaoFiado ? { liberacaoFiado } : {}),
      itens: [...porProduto.values()],
      // na ordem de FORMAS_PAGAMENTO, para a venda ficar igual não importa a ordem em que foi digitada (os vales,
      // na ordem em que entraram)
      pagamentos: FORMAS_PAGAMENTO.flatMap((forma): Pagamento[] =>
        forma === 'vale' ? [...porVale].map(([valeId, valorCentavos]) => ({ forma, valorCentavos, valeId })) : porForma.has(forma) ? [{ forma, valorCentavos: porForma.get(forma)! }] : [],
      ),
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
  /** Desconto que o Vendedor dá sem senha, em % (regra da loja; padrão 10, como o DaniPets). */
  limiteDescontoPct?: number;
  /** Custo médio de cada produto (compra.ts custosMedios): fica guardado no item vendido. */
  custos?: ReadonlyMap<string, number | null>;
  /** Saldo de cashback do cliente identificado, hoje (fidelidade.ts saldoCashback). Sem: 0. */
  cashbackDisponivelCentavos?: number;
  /** Cupom de retorno que vale hoje para o cliente identificado (fidelidade.ts cupomAtivo). */
  cupom?: { id: string; clienteId: string; pct: number } | null;
  /** Vales-troca da loja (vale.ts): o vale do pagamento precisa estar em aberto e ter saldo. */
  vales?: ReadonlyMap<string, { id: string; codigo: string; saldoCentavos: number; aberto: boolean }>;
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
  /** Cupom de retorno usado (o servidor marca como usado). */
  cupomUsado: string | null;
}

/**
 * Monta os itens com nome e preço do CADASTRO, aplica os descontos (conferindo quem pode dar),
 * soma o total e confere os pagamentos e o troco. Produto inexistente ou desativado recusa a venda;
 * com o saldo de estoque no contexto, falta de estoque também; cliente não encontrado também.
 */
export function calcularVenda(pedido: NovaVenda, catalogo: ReadonlyMap<string, ProdutoParaVenda>, ctx: ContextoVenda): Resultado<VendaCalculada> {
  const agora = ctx.agora ?? new Date();
  const limiteDesconto = ctx.limiteDescontoPct ?? LIMITE_DESCONTO_VENDEDOR_PCT;
  const erros: ErroCampo[] = [];
  const itens: ItemVendido[] = [];
  const usadas: string[] = [];
  let cupomUsado: string | null = null;
  let total = 0;
  let desconto = 0;

  pedido.itens.forEach((item, i) => {
    const p = catalogo.get(item.produtoId);
    if (!p || !p.ativo) {
      erros.push({ campo: `itens.${i}.produtoId`, mensagem: 'Produto não encontrado ou desativado.' });
      return;
    }
    const unidade = unidadeDe(p.unidade);
    if (item.quantidade > QUANTIDADE_MAX[unidade]) {
      erros.push({
        campo: `itens.${i}.quantidade`,
        mensagem: unidade === 'kg' ? `Quantidade acima de ${formatarQuantidade(QUANTIDADE_MAX.kg, 'kg')} de ${p.nome} numa venda.` : `Quantidade acima de ${QUANTIDADE_MAX.un} unidades num mesmo produto (${p.nome}).`,
      });
      return;
    }
    let preco = p.precoCentavos;
    let aplicado: DescontoAplicado | null = null;
    if (item.cupom) {
      // o cupom vale para o cliente identificado nesta venda, e o preço sai da regra (nunca da tela)
      const k = ctx.cupom;
      const novoPreco = k ? precoComCupom(p.precoCentavos, k.pct) : p.precoCentavos;
      if (!k || k.id !== item.cupom || k.clienteId !== pedido.clienteId || novoPreco >= p.precoCentavos) {
        erros.push({ campo: `itens.${i}.cupom`, mensagem: `O cupom de retorno de ${p.nome} não vale para esta venda. Identifique o cliente de novo.` });
        return;
      }
      preco = novoPreco;
      aplicado = { motivo: motivoDoCupom(k.pct), responsavel: { id: ctx.operador.id, nome: ctx.operador.nome }, autorizadoComSenha: false, cupom: { id: k.id, pct: k.pct } };
      cupomUsado = k.id;
    } else if (item.desconto) {
      const { tipo } = classificarDesconto(p.precoCentavos, item.desconto.precoFinalCentavos, limiteDesconto);
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
                : `O desconto de ${p.nome} passa de ${String(limiteDesconto).replace('.', ',')}% e precisa da autorização do Dono ou do Administrador. Aplique o desconto de novo.`,
          });
          return;
        }
        responsavel = { id: a.autorizador.id, nome: a.autorizador.nome };
        comSenha = true;
        usadas.push(a.id);
      }
      preco = item.desconto.precoFinalCentavos;
      aplicado = { motivo: item.desconto.motivo, responsavel, autorizadoComSenha: comSenha };
    }
    const subtotal = valorDaQuantidade(preco, item.quantidade, unidade);
    desconto += valorDaQuantidade(p.precoCentavos, item.quantidade, unidade) - subtotal;
    total += subtotal;
    itens.push({
      produtoId: p.id,
      codigoInterno: p.codigoInterno,
      nome: p.nome,
      precoListaCentavos: p.precoCentavos,
      precoCentavos: preco,
      quantidade: item.quantidade,
      unidade,
      subtotalCentavos: subtotal,
      desconto: aplicado,
      ...(ctx.custos ? { custoCentavos: ctx.custos.get(p.id) == null ? null : Math.round(ctx.custos.get(p.id)!) } : {}),
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
  // fiado e cashback só na conta de um cliente identificado
  const semCliente = cliente ? undefined : pedido.pagamentos.find((p) => formaPrecisaDeCliente(p.forma));
  if (semCliente) return { ok: false, erros: [{ campo: 'pagamentos', mensagem: mensagemFormaSemCliente(semCliente.forma) }] };
  // o cashback não passa do saldo do cliente
  const cashback = pedido.pagamentos.filter((p) => p.forma === 'cashback').reduce((s, p) => s + p.valorCentavos, 0);
  const disponivel = ctx.cashbackDisponivelCentavos ?? 0;
  if (cliente && cashback > disponivel) {
    return { ok: false, erros: [{ campo: 'pagamentos', mensagem: `O cashback disponível de ${cliente.nome} é ${formatarCentavos(disponivel)}.` }] };
  }
  // vale-troca: vale para quem está com o código, com ou sem cliente; não passa do saldo do vale
  const codigos = new Map<string, string>();
  for (const p of pedido.pagamentos) {
    if (p.forma !== 'vale') continue;
    const v = p.valeId ? ctx.vales?.get(p.valeId) : undefined;
    if (!v || !v.aberto) return { ok: false, erros: [{ campo: 'pagamentos', mensagem: 'Vale-troca inválido ou já usado. Remova o vale do pagamento.' }] };
    if (p.valorCentavos > v.saldoCentavos) return { ok: false, erros: [{ campo: 'pagamentos', mensagem: `O vale ${v.codigo} tem saldo de ${formatarCentavos(v.saldoCentavos)}.` }] };
    codigos.set(v.id, v.codigo);
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
      pagamentos: pedido.pagamentos.map((p) => (p.forma === 'vale' && p.valeId ? { ...p, valeCodigo: codigos.get(p.valeId) ?? null } : { ...p })),
      recebidoDinheiroCentavos: recebido,
      trocoCentavos: troco,
      cliente,
      autorizacoesUsadas: usadas,
      cupomUsado,
    },
  };
}

// ------------------------------------------------------------------ cancelamento e devolução
/**
 * Cancelar a venda inteira só no mesmo dia (no fuso da loja), se ela não tiver devolução e com o caixa
 * daquela venda aberto (DaniPets canCancelSale). `caixaAberto`: o caixa de hoje, se estiver aberto
 * (null = fechado ou não aberto); sem ele, a regra do caixa não é conferida.
 */
export function podeCancelarVenda(venda: Venda, agora: Date, fuso: string = FUSO_PADRAO, caixaAberto?: { id: string } | null): boolean {
  const doCaixa = caixaAberto === undefined || (caixaAberto !== null && (!venda.caixaId || venda.caixaId === caixaAberto.id));
  return venda.status === 'finalizada' && venda.devolucoes.length === 0 && diaNoFuso(venda.criadaEm, fuso) === diaNoFuso(agora, fuso) && doCaixa;
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

/** Como o valor da devolução volta: pelas mesmas formas da venda ou como vale-troca (DaniPets DEV-03). */
export type ModoDevolucao = 'mesma' | 'vale';

export interface PedidoDevolucao {
  /** voltaAoEstoque: padrão true (volta para a prateleira); false para avaria ou vencido. */
  itens: { linha: number; quantidade: number; voltaAoEstoque?: boolean }[];
  motivo: string;
  autorizacao?: string | null;
  /** Sem: pelas mesmas formas da venda. */
  modo?: ModoDevolucao;
  /** No vale-troca: o cliente do vale (sem: o cliente da venda, se houver). */
  clienteDoVale?: string | null;
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
  camposDesconhecidos(entrada, new Set(['itens', 'motivo', 'autorizacao', 'modo', 'clienteDoVale']), '', erros);
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
  const modo = entrada.modo === undefined || entrada.modo === null ? 'mesma' : entrada.modo;
  if (modo !== 'mesma' && modo !== 'vale') erros.push({ campo: 'modo', mensagem: 'Escolha como o valor volta para o cliente.' });
  let clienteDoVale: string | null = null;
  const cv = entrada.clienteDoVale;
  if (cv !== undefined && cv !== null && cv !== '') {
    if (typeof cv !== 'string' || cv.length > LIMITES_VENDA.clienteIdMax || CONTROLE.test(cv)) erros.push({ campo: 'clienteDoVale', mensagem: 'Cliente inválido.' });
    else if (modo !== 'vale') erros.push({ campo: 'clienteDoVale', mensagem: 'O cliente do vale só vale na devolução como vale-troca.' });
    else clienteDoVale = cv.trim();
  }
  return erros.length
    ? { ok: false, erros }
    : { ok: true, valor: { itens, motivo, autorizacao, ...(modo === 'vale' ? { modo: 'vale' as const, clienteDoVale } : {}) } };
}

export interface ContextoEstorno {
  operador: OperadorComPapel;
  /** A autorização indicada no pedido, já buscada pelo servidor (ou null). */
  autorizacao?: Autorizacao | null;
  agora?: Date;
  fuso?: string;
  /** O caixa de hoje, se estiver aberto (null = fechado ou não aberto). Sem: a regra do caixa não é conferida. */
  caixaAberto?: { id: string } | null;
  /** Devolução como vale-troca: o fiado desta venda que o cliente ainda não pagou (é abatido antes). */
  fiadoEmAbertoCentavos?: number;
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
  if (!podeCancelarVenda(venda, ctx.agora ?? new Date(), ctx.fuso, ctx.caixaAberto)) {
    return {
      ok: false,
      erros: [{ campo: '_', mensagem: 'Cancelar a venda inteira só com o caixa daquela venda aberto. Use "Devolver itens".' }],
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
): Resultado<{ itens: ItemDevolvido[]; totalCentavos: number; estornos: Pagamento[]; valeCentavos: number; autorizadoPor: Operador | null; autorizacaoUsada: string | null }> {
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
    const unidade = unidadeDe(item.unidade);
    if (x.quantidade > restante[x.linha]!) {
      return void erros.push({ campo: `itens.${i}`, mensagem: `De ${item.nome} ainda dá para devolver no máximo ${formatarQuantidade(restante[x.linha]!, unidade)}.` });
    }
    // no kg, o valor é a diferença entre o já devolvido com e sem esta parte: devolver tudo, aos poucos, dá o subtotal exato
    const jaDevolvido = item.quantidade - restante[x.linha]!;
    itens.push({
      linha: x.linha,
      produtoId: item.produtoId,
      nome: item.nome,
      quantidade: x.quantidade,
      unidade,
      valorCentavos: valorDaQuantidade(item.precoCentavos, jaDevolvido + x.quantidade, unidade) - valorDaQuantidade(item.precoCentavos, jaDevolvido, unidade),
      voltaAoEstoque: x.voltaAoEstoque !== false,
    });
  });
  if (erros.length) return { ok: false, erros };
  const total = itens.reduce((s, x) => s + x.valorCentavos, 0);
  const aut = conferirAutorizacaoEstorno(venda, 'devolucao', ctx);
  if (!aut.ok) return aut;
  const comum = { itens, totalCentavos: total, autorizadoPor: aut.valor.autorizadoPor, autorizacaoUsada: aut.valor.usada };
  if (pedido.modo === 'vale') {
    // DaniPets planRefund: abate primeiro o fiado em aberto desta venda; só o resto vira vale-troca
    const abate = Math.min(total, Math.max(0, ctx.fiadoEmAbertoCentavos ?? 0), estornavelPorForma(venda).find((p) => p.forma === 'fiado')?.valorCentavos ?? 0);
    return { ok: true, valor: { ...comum, estornos: abate > 0 ? [{ forma: 'fiado', valorCentavos: abate }] : [], valeCentavos: total - abate } };
  }
  const estornos = repartirEstorno(venda, total);
  if (!estornos.ok) return estornos;
  return { ok: true, valor: { ...comum, estornos: estornos.valor, valeCentavos: 0 } };
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
  /** Unidades vendidas dos produtos vendidos por unidade. */
  itensVendidos: number;
  /** Gramas vendidas dos produtos vendidos por kg (DaniPets: "un + kg"). */
  gramasVendidas: number;
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
  let gramas = 0;
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
    for (const i of v.itens) {
      if (unidadeDe(i.unidade) === 'kg') gramas += i.quantidade;
      else itens += i.quantidade;
    }
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
    gramasVendidas: gramas,
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
