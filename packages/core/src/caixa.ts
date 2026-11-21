// packages/core/src/caixa.ts
// CAIXA DO DIA (Fase 2, módulo 5), com as regras do DaniPets V9.3.3 (CX-01 a 08, PDV-12, DEV-05):
//   - UM CAIXA POR LOJA POR DIA (no fuso da loja). ABRIR: quem está logado é o responsável e informa o
//     fundo de troco (todo o dinheiro que está na gaveta agora). Só abre o de hoje, e só depois de fechar
//     os dias anteriores;
//   - ESPERADO NA GAVETA = fundo de troco + o dinheiro que entrou e saiu do Caixa físico depois da abertura
//     (o saldo inicial de implantação e o ajuste do fechamento não entram);
//   - SANGRIA (tira da gaveta e deposita na Conta bancária), RETIRADA DO DONO (tira da gaveta; o Vendedor
//     precisa da senha do Dono ou do Administrador) e SUPRIMENTO (põe dinheiro na gaveta). Ninguém tira da
//     gaveta mais do que o esperado nela;
//   - FECHAR: conta o dinheiro; a falta ou a sobra precisa de justificativa e vira ajuste no Caixa físico.
//     Acima da tolerância da loja (padrão R$ 10,00), o Vendedor precisa da senha do Dono ou do
//     Administrador. Fecha sempre o dia mais antigo em aberto;
//   - DESFAZER: só o último fechamento, pelo Dono ou pelo Administrador, com motivo. O ajuste é estornado
//     com um lançamento contrário (nada é apagado; o fechamento desfeito fica guardado no caixa);
//   - FECHAMENTO AUTOMÁTICO: o caixa que passou da meia-noite aberto fecha sozinho, sem contagem e sem ajuste.
//     Fica como pendência até o Dono ou o Administrador VERIFICAR (conferiu a gaveta, com observação opcional).
//     O dia reaberto hoje com "Desfazer fechamento" não fecha sozinho de novo até a próxima meia-noite;
//   - DIA TRAVADO: dia anterior a hoje e até o último caixa fechado. Lançar nele (compra, ajuste de estoque,
//     lançamento financeiro com data) só com a liberação de um Dono, com motivo.
// Valores em centavos. As datas são AAAA-MM-DD no fuso da loja; os instantes, ISO 8601.
import { dataBr, dataValida } from './compra';
import { CENTAVOS_MAX, formatarCentavos } from './dinheiro';
import { diaDoLancamento, type Lancamento, type NovoLancamento } from './financeiro';
import { CONTROLE, ehObjeto } from './interno';
import { type Permissao, pode } from './permissoes';
import type { ErroCampo, Resultado } from './resultado';
import {
  type AcaoAutorizada,
  type Autorizacao,
  diaNoFuso,
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  type Operador,
  VALIDADE_AUTORIZACAO_HORAS,
  type Venda,
} from './venda';

export const LIMITES_CAIXA = { observacaoMax: 200, descricaoMax: 120, justificativaMax: 300, motivoMax: 200 } as const;

/** Texto do fechamento automático (DaniPets: "Fechamento automático às 00:00"). */
export const TEXTO_FECHAMENTO_AUTOMATICO = 'Fechamento automático à meia-noite: sem valor contado e sem ajuste no saldo.';

export interface AberturaCaixa {
  /** Fundo de troco informado: todo o dinheiro que estava na gaveta na abertura. */
  fundoCentavos: number;
  observacao: string | null;
  /** ISO 8601. */
  em: string;
  /** Responsável: quem abriu. */
  por: Operador;
}

/** Números do dia guardados no fechamento (DaniPets: salesCash, salesPix, sangrias, retiradas...). */
export interface ResumoDoCaixa {
  /** Vendas do dia por forma de pagamento (sem as canceladas). */
  vendas: Record<FormaPagamento, number>;
  /** Dinheiro que entrou e que saiu da gaveta depois da abertura. */
  entradasCentavos: number;
  saidasCentavos: number;
  sangriasCentavos: number;
  retiradasCentavos: number;
  suprimentosCentavos: number;
  /** Dinheiro devolvido a clientes (cancelamentos e devoluções). */
  estornosCentavos: number;
}

export interface FechamentoCaixa {
  /** ISO 8601. */
  em: string;
  /** Quem fechou. null = fechamento automático (Sistema). */
  por: Operador | null;
  automatico: boolean;
  fundoCentavos: number;
  esperadoCentavos: number;
  /** Dinheiro contado na gaveta. null no fechamento automático (sem contagem). */
  contadoCentavos: number | null;
  /** Contado − esperado. null no fechamento automático. */
  diferencaCentavos: number | null;
  /** Falta (negativo) ou sobra lançada como ajuste no Caixa físico. 0 = sem ajuste. */
  ajusteCentavos: number;
  justificativa: string | null;
  /** Quem autorizou com senha a diferença acima da tolerância. */
  autorizadoPor: Operador | null;
  resumo: ResumoDoCaixa;
  /**
   * Só no fechamento automático: quem conferiu (Dono ou Administrador) e quando. Ausente ou null = ninguém
   * conferiu ainda (vira a pendência "Deseja verificar?" na Visão geral).
   */
  verificacao?: VerificacaoFechamento | null;
}

/** O Dono ou o Administrador conferiu o fechamento automático (a gaveta bateu, ou anotou o que achou). */
export interface VerificacaoFechamento {
  /** ISO 8601. */
  em: string;
  por: Operador;
  observacao: string | null;
}

export interface FechamentoDesfeito extends FechamentoCaixa {
  desfeitoEm: string;
  desfeitoPor: Operador;
  motivo: string;
  /** No fechamento automático, a explicação de por que precisava ser ajustado. */
  explicacao: string | null;
}

export interface CaixaDoDia {
  id: string;
  /** AAAA-MM-DD no fuso da loja. Um caixa por dia. */
  dia: string;
  abertura: AberturaCaixa;
  /** null = aberto. */
  fechamento: FechamentoCaixa | null;
  /** Fechamentos que foram desfeitos (nada é apagado). */
  desfeitos: FechamentoDesfeito[];
}

export type EstadoCaixa = 'nao_aberto' | 'aberto' | 'fechado';

export interface SituacaoCaixa {
  hoje: string;
  /** Situação do caixa de hoje. */
  estado: EstadoCaixa;
  /** O caixa de hoje (aberto ou fechado), ou null. */
  caixa: CaixaDoDia | null;
  /** O dia mais antigo ainda aberto antes de hoje: precisa ser fechado antes de abrir o de hoje. */
  atrasado: CaixaDoDia | null;
  /** Último dia com o caixa fechado: os dias até ele (antes de hoje) ficam travados. */
  ultimoDiaFechado: string | null;
}

const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const erro = (mensagem: string, campo = '_'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
const centavosValidos = (v: unknown, zeroPode: boolean): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && (zeroPode ? v >= 0 : v > 0) && v <= CENTAVOS_MAX;

/** Texto opcional (vazio = null), sem caracteres de controle e com limite. */
function textoOpcional(valor: unknown, campo: string, max: number, rotulo: string, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    erros.push({ campo, mensagem: `${rotulo} deve ser um texto.` });
    return null;
  }
  const t = valor.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (t.length > max) erros.push({ campo, mensagem: `${rotulo} pode ter até ${max} caracteres.` });
  else if (CONTROLE.test(t)) erros.push({ campo, mensagem: `${rotulo} contém caracteres inválidos.` });
  return t || null;
}

function camposPermitidos(entrada: Record<string, unknown>, permitidos: readonly string[], erros: ErroCampo[]) {
  for (const k of Object.keys(entrada)) if (!permitidos.includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });
}

// ------------------------------------------------------------------ situação e dias travados
export const ultimoDiaFechado = (caixas: readonly CaixaDoDia[]): string | null =>
  caixas.reduce<string | null>((maior, c) => (c.fechamento && (!maior || c.dia > maior) ? c.dia : maior), null);

/** Situação do caixa de hoje, para a tela, o cabeçalho e as travas. */
export function situacaoDoCaixa(caixas: readonly CaixaDoDia[], hoje: string): SituacaoCaixa {
  const caixa = caixas.find((c) => c.dia === hoje) ?? null;
  const atrasado = caixas.filter((c) => !c.fechamento && c.dia < hoje).sort((a, b) => a.dia.localeCompare(b.dia))[0] ?? null;
  return { hoje, estado: !caixa ? 'nao_aberto' : caixa.fechamento ? 'fechado' : 'aberto', caixa, atrasado, ultimoDiaFechado: ultimoDiaFechado(caixas) };
}

/** Dia já conferido: antes de hoje e até o último caixa fechado (DaniPets lockedDay). */
export function diaTravado(dia: string, hoje: string, caixas: readonly CaixaDoDia[]): boolean {
  const ultimo = ultimoDiaFechado(caixas);
  return dia < hoje && ultimo !== null && dia <= ultimo;
}

/** A Frente de caixa só vende com o caixa de hoje aberto (DaniPets PDV-12). */
export function conferirCaixaParaVender(s: SituacaoCaixa): Resultado<CaixaDoDia> {
  if (s.estado === 'fechado') return erro('O caixa de hoje já foi fechado. Para vender hoje, o Dono ou o Administrador pode desfazer o fechamento em Caixa do dia.', 'caixa');
  if (!s.caixa) return erro('Abra o caixa de hoje (Caixa do dia) antes de vender.', 'caixa');
  return ok(s.caixa);
}

/** Lançar hoje (pagar conta, devolver, lançamento no Financeiro): o caixa de hoje não pode estar fechado (DaniPets assertOpen). */
export function conferirHojeNaoFechado(s: SituacaoCaixa): Resultado<null> {
  if (s.estado === 'fechado') {
    return erro('O caixa de hoje já foi fechado: não é possível lançar hoje. O Dono ou o Administrador pode desfazer o fechamento em Caixa do dia.', 'caixa');
  }
  return ok(null);
}

/** Dinheiro que entra ou sai da gaveta pela tela (devolver em dinheiro, receber em dinheiro) precisa do caixa de hoje aberto. */
export function conferirCaixaAberto(s: SituacaoCaixa, oque: string): Resultado<CaixaDoDia> {
  const naoFechado = conferirHojeNaoFechado(s);
  if (!naoFechado.ok) return naoFechado;
  if (!s.caixa) return erro(`${oque}: abra o caixa de hoje (Caixa do dia) primeiro.`, 'caixa');
  return ok(s.caixa);
}

// ------------------------------------------------------------------ abrir
export interface NovaAbertura {
  fundoCentavos: number;
  observacao: string | null;
}

/** Confere a abertura do caixa de hoje (DaniPets openCash). */
export function validarAbertura(entrada: unknown, ctx: { hoje: string; caixas: readonly CaixaDoDia[] }): Resultado<NovaAbertura> {
  if (!ehObjeto(entrada)) return erro('Envie um objeto com a abertura.');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['fundoCentavos', 'observacao'], erros);
  const s = situacaoDoCaixa(ctx.caixas, ctx.hoje);
  if (s.estado === 'aberto') erros.push({ campo: '_', mensagem: 'O caixa de hoje já está aberto.' });
  else if (s.estado === 'fechado') erros.push({ campo: '_', mensagem: 'O caixa de hoje já foi fechado. O Dono ou o Administrador pode desfazer o fechamento.' });
  else if (s.atrasado) erros.push({ campo: '_', mensagem: `Feche o caixa de ${dataBr(s.atrasado.dia)} antes de abrir o de hoje.` });
  if (!centavosValidos(entrada.fundoCentavos, true)) erros.push({ campo: 'fundoCentavos', mensagem: 'Informe o fundo de troco (todo o dinheiro que está na gaveta agora).' });
  const observacao = textoOpcional(entrada.observacao, 'observacao', LIMITES_CAIXA.observacaoMax, 'A observação', erros);
  if (erros.length) return { ok: false, erros };
  return ok({ fundoCentavos: entrada.fundoCentavos as number, observacao });
}

export function abrirCaixa(a: NovaAbertura, ctx: { id: string; hoje: string; em: string; por: Operador }): CaixaDoDia {
  return { id: ctx.id, dia: ctx.hoje, abertura: { fundoCentavos: a.fundoCentavos, observacao: a.observacao, em: ctx.em, por: ctx.por }, fechamento: null, desfeitos: [] };
}

// ------------------------------------------------------------------ gaveta
type LancamentoDaGaveta = Pick<Lancamento, 'conta' | 'tipo' | 'criadoEm' | 'dia' | 'valorCentavos'>;

/** Fora da conta da gaveta: o saldo de implantação e o ajuste do fechamento (DaniPets drawerMoves). */
const FORA_DA_GAVETA = new Set<string>(['saldo_inicial', 'ajuste_caixa']);

/** Lançamentos do Caixa físico do dia do caixa, feitos depois da abertura. */
export function movimentosDaGaveta<T extends LancamentoDaGaveta>(caixa: CaixaDoDia, lancamentos: readonly T[], fuso: string): T[] {
  return lancamentos.filter((l) => l.conta === 'caixa' && !FORA_DA_GAVETA.has(l.tipo) && diaDoLancamento(l, fuso) === caixa.dia && l.criadoEm >= caixa.abertura.em);
}

export interface Gaveta {
  fundoCentavos: number;
  entradasCentavos: number;
  saidasCentavos: number;
  /** Fundo + entradas − saídas: o dinheiro que deveria estar na gaveta. */
  esperadoCentavos: number;
}

export function gavetaDoCaixa(caixa: CaixaDoDia, lancamentos: readonly LancamentoDaGaveta[], fuso: string): Gaveta {
  const mv = movimentosDaGaveta(caixa, lancamentos, fuso);
  const entradas = mv.filter((m) => m.valorCentavos > 0).reduce((s, m) => s + m.valorCentavos, 0);
  const saidas = mv.filter((m) => m.valorCentavos < 0).reduce((s, m) => s - m.valorCentavos, 0);
  const fundo = caixa.abertura.fundoCentavos;
  return { fundoCentavos: fundo, entradasCentavos: entradas, saidasCentavos: saidas, esperadoCentavos: fundo + entradas - saidas };
}

/** Os números do dia (vendas por forma, sangrias, retiradas, suprimentos e devoluções em dinheiro). */
export function resumoDoCaixa(
  caixa: CaixaDoDia,
  vendas: readonly Pick<Venda, 'criadaEm' | 'status' | 'pagamentos'>[],
  lancamentos: readonly LancamentoDaGaveta[],
  fuso: string,
): ResumoDoCaixa {
  const porForma = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, 0])) as Record<FormaPagamento, number>;
  for (const v of vendas) {
    if (v.status === 'cancelada' || diaNoFuso(v.criadaEm, fuso) !== caixa.dia) continue;
    for (const p of v.pagamentos) porForma[p.forma] += p.valorCentavos;
  }
  const mv = movimentosDaGaveta(caixa, lancamentos, fuso);
  const soma = (tipo: string) => Math.abs(mv.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valorCentavos, 0));
  const g = gavetaDoCaixa(caixa, lancamentos, fuso);
  return {
    vendas: porForma,
    entradasCentavos: g.entradasCentavos,
    saidasCentavos: g.saidasCentavos,
    sangriasCentavos: soma('sangria'),
    retiradasCentavos: soma('retirada'),
    suprimentosCentavos: soma('suprimento'),
    estornosCentavos: soma('estorno_venda'),
  };
}

// ------------------------------------------------------------------ sangria, retirada e suprimento
export const TIPOS_OPERACAO_CAIXA = ['sangria', 'retirada', 'suprimento'] as const;
export type TipoOperacaoCaixa = (typeof TIPOS_OPERACAO_CAIXA)[number];

export const NOME_OPERACAO_CAIXA: Record<TipoOperacaoCaixa, string> = {
  sangria: 'Sangria (depositar no banco)',
  retirada: 'Retirada do dono (levou para casa)',
  suprimento: 'Suprimento (pôr na gaveta)',
};

export interface OperacaoCaixa {
  tipo: TipoOperacaoCaixa;
  valorCentavos: number;
  descricao: string;
  /** Retirada do dono feita pelo Vendedor: a autorização dada com a senha do Dono ou do Administrador. */
  autorizacao: string | null;
}

export function validarOperacaoCaixa(entrada: unknown): Resultado<OperacaoCaixa> {
  if (!ehObjeto(entrada)) return erro('Envie um objeto com a operação.');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['tipo', 'valorCentavos', 'descricao', 'autorizacao'], erros);
  const tipo = entrada.tipo;
  if (typeof tipo !== 'string' || !(TIPOS_OPERACAO_CAIXA as readonly string[]).includes(tipo)) erros.push({ campo: 'tipo', mensagem: 'Escolha sangria, retirada do dono ou suprimento.' });
  if (!centavosValidos(entrada.valorCentavos, false)) erros.push({ campo: 'valorCentavos', mensagem: 'Informe o valor.' });
  const descricao = textoOpcional(entrada.descricao, 'descricao', LIMITES_CAIXA.descricaoMax, 'A descrição', erros);
  if (!descricao && !erros.some((e) => e.campo === 'descricao')) erros.push({ campo: 'descricao', mensagem: 'Descreva a operação (ex.: levou ao banco).' });
  const autorizacao = entrada.autorizacao;
  if (autorizacao !== undefined && autorizacao !== null && typeof autorizacao !== 'string') erros.push({ campo: 'autorizacao', mensagem: 'Autorização inválida.' });
  if (erros.length) return { ok: false, erros };
  return ok({ tipo: tipo as TipoOperacaoCaixa, valorCentavos: entrada.valorCentavos as number, descricao: descricao!, autorizacao: typeof autorizacao === 'string' && autorizacao ? autorizacao : null });
}

/** O que a operação lança: a sangria tira do Caixa físico e põe na Conta bancária; a retirada só tira; o suprimento põe. */
export function lancamentosDaOperacao(op: OperacaoCaixa, ctx: { caixa: CaixaDoDia; em: string; por: Operador; autorizadoPor?: Operador | null }): NovoLancamento[] {
  const base = {
    criadoEm: ctx.em,
    dia: ctx.caixa.dia,
    caixaId: ctx.caixa.id,
    vendaId: null,
    vendaNumero: null,
    recebivelId: null,
    categoria: null,
    por: ctx.por,
  };
  const v = op.valorCentavos;
  if (op.tipo === 'sangria') {
    return [
      { ...base, conta: 'caixa', tipo: 'sangria', valorCentavos: -v, descricao: `Sangria • ${op.descricao}` },
      { ...base, conta: 'banco', tipo: 'deposito_sangria', valorCentavos: v, descricao: `Sangria do caixa • ${op.descricao}` },
    ];
  }
  if (op.tipo === 'retirada') {
    return [{ ...base, conta: 'caixa', tipo: 'retirada', valorCentavos: -v, descricao: `Retirada do dono (gaveta) • ${op.descricao}`, autorizadoPor: ctx.autorizadoPor ?? null }];
  }
  return [{ ...base, conta: 'caixa', tipo: 'suprimento', valorCentavos: v, descricao: `Suprimento • ${op.descricao}` }];
}

// ------------------------------------------------------------------ fechar
export interface PedidoFechamento {
  dia: string;
  contadoCentavos: number;
  justificativa: string | null;
  /** Diferença acima da tolerância fechada pelo Vendedor: a autorização dada com senha. */
  autorizacao: string | null;
}

export function validarPedidoFechamento(entrada: unknown): Resultado<PedidoFechamento> {
  if (!ehObjeto(entrada)) return erro('Envie um objeto com o fechamento.');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['dia', 'contadoCentavos', 'justificativa', 'autorizacao'], erros);
  if (!dataValida(entrada.dia)) erros.push({ campo: 'dia', mensagem: 'Dia do caixa inválido.' });
  if (!centavosValidos(entrada.contadoCentavos, true)) erros.push({ campo: 'contadoCentavos', mensagem: 'Informe o dinheiro contado na gaveta.' });
  const justificativa = textoOpcional(entrada.justificativa, 'justificativa', LIMITES_CAIXA.justificativaMax, 'A justificativa', erros);
  const autorizacao = entrada.autorizacao;
  if (autorizacao !== undefined && autorizacao !== null && typeof autorizacao !== 'string') erros.push({ campo: 'autorizacao', mensagem: 'Autorização inválida.' });
  if (erros.length) return { ok: false, erros };
  return ok({
    dia: entrada.dia as string,
    contadoCentavos: entrada.contadoCentavos as number,
    justificativa,
    autorizacao: typeof autorizacao === 'string' && autorizacao ? autorizacao : null,
  });
}

export interface ConferenciaFechamento {
  caixa: CaixaDoDia;
  gaveta: Gaveta;
  contadoCentavos: number;
  diferencaCentavos: number;
  justificativa: string | null;
  /** Diferença acima da tolerância e quem fecha não pode sozinho: precisa da senha do Dono ou do Administrador. */
  precisaAutorizacao: boolean;
}

/** Confere o fechamento antes de gravar (DaniPets closingCheck). */
export function conferirFechamento(
  pedido: PedidoFechamento,
  ctx: {
    caixas: readonly CaixaDoDia[];
    hoje: string;
    lancamentos: readonly LancamentoDaGaveta[];
    fuso: string;
    toleranciaCentavos: number;
    /** Quem fecha pode fechar com qualquer diferença (Dono e Administrador). */
    podeQualquerDiferenca: boolean;
  },
): Resultado<ConferenciaFechamento> {
  const caixa = ctx.caixas.find((c) => c.dia === pedido.dia);
  if (!caixa) return erro('Este dia não tem caixa aberto.');
  if (caixa.fechamento) return erro('Este dia já foi fechado.');
  if (pedido.dia > ctx.hoje) return erro('Data no futuro não é permitida.');
  const primeiro = ctx.caixas.filter((c) => !c.fechamento).sort((a, b) => a.dia.localeCompare(b.dia))[0]!;
  if (primeiro.dia !== pedido.dia) return erro(`Feche primeiro o caixa de ${dataBr(primeiro.dia)}.`);
  const gaveta = gavetaDoCaixa(caixa, ctx.lancamentos, ctx.fuso);
  const diferenca = pedido.contadoCentavos - gaveta.esperadoCentavos;
  if (diferenca !== 0 && !pedido.justificativa) {
    return erro(
      `Há ${diferenca < 0 ? 'falta' : 'sobra'} de ${formatarCentavos(Math.abs(diferenca))} na gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).`,
      'justificativa',
    );
  }
  return ok({
    caixa,
    gaveta,
    contadoCentavos: pedido.contadoCentavos,
    diferencaCentavos: diferenca,
    justificativa: pedido.justificativa,
    precisaAutorizacao: Math.abs(diferenca) > ctx.toleranciaCentavos && !ctx.podeQualquerDiferenca,
  });
}

/** Fecha o caixa conferido: guarda os números do dia e lança a falta ou a sobra como ajuste no Caixa físico. */
export function fecharCaixa(
  c: ConferenciaFechamento,
  ctx: { em: string; por: Operador; autorizadoPor: Operador | null; vendas: readonly Pick<Venda, 'criadaEm' | 'status' | 'pagamentos'>[]; lancamentos: readonly LancamentoDaGaveta[]; fuso: string },
): { caixa: CaixaDoDia; ajuste: NovoLancamento | null } {
  const fechamento: FechamentoCaixa = {
    em: ctx.em,
    por: ctx.por,
    automatico: false,
    fundoCentavos: c.gaveta.fundoCentavos,
    esperadoCentavos: c.gaveta.esperadoCentavos,
    contadoCentavos: c.contadoCentavos,
    diferencaCentavos: c.diferencaCentavos,
    ajusteCentavos: c.diferencaCentavos,
    justificativa: c.justificativa,
    autorizadoPor: ctx.autorizadoPor,
    resumo: resumoDoCaixa(c.caixa, ctx.vendas, ctx.lancamentos, ctx.fuso),
  };
  const d = c.diferencaCentavos;
  const ajuste: NovoLancamento | null =
    d === 0
      ? null
      : {
          conta: 'caixa',
          tipo: 'ajuste_caixa',
          valorCentavos: d,
          descricao: `${d < 0 ? 'Falta' : 'Sobra'} no fechamento de ${dataBr(c.caixa.dia)} • ${c.justificativa ?? ''}`.trim(),
          criadoEm: ctx.em,
          dia: c.caixa.dia,
          caixaId: c.caixa.id,
          vendaId: null,
          vendaNumero: null,
          recebivelId: null,
          categoria: null,
          por: ctx.por,
          autorizadoPor: ctx.autorizadoPor,
        };
  return { caixa: { ...c.caixa, fechamento }, ajuste };
}

/**
 * O caixa de um dia anterior ainda aberto fecha sozinho. A exceção é o dia que alguém reabriu HOJE com
 * "Desfazer fechamento" (para contar a gaveta e fechar com a contagem): esse fica aberto até a próxima
 * meia-noite, senão fecharia sozinho de novo na hora.
 */
export function precisaFecharSozinho(c: CaixaDoDia, hoje: string, fuso: string): boolean {
  return !c.fechamento && c.dia < hoje && !c.desfeitos.some((d) => diaNoFuso(d.desfeitoEm, fuso) >= hoje);
}

/** Caixas de dias anteriores ainda abertos fecham sozinhos, sem contagem e sem ajuste (DaniPets CX-06). */
export function fecharDiasPassados(
  caixas: readonly CaixaDoDia[],
  ctx: { hoje: string; em: string; vendas: readonly Pick<Venda, 'criadaEm' | 'status' | 'pagamentos'>[]; lancamentos: readonly LancamentoDaGaveta[]; fuso: string },
): { caixas: CaixaDoDia[]; fechados: CaixaDoDia[] } {
  const fechados: CaixaDoDia[] = [];
  const todos = caixas.map((c) => {
    if (!precisaFecharSozinho(c, ctx.hoje, ctx.fuso)) return c;
    const g = gavetaDoCaixa(c, ctx.lancamentos, ctx.fuso);
    const fechado: CaixaDoDia = {
      ...c,
      fechamento: {
        em: ctx.em,
        por: null,
        automatico: true,
        fundoCentavos: g.fundoCentavos,
        esperadoCentavos: g.esperadoCentavos,
        contadoCentavos: null,
        diferencaCentavos: null,
        ajusteCentavos: 0,
        justificativa: TEXTO_FECHAMENTO_AUTOMATICO,
        autorizadoPor: null,
        resumo: resumoDoCaixa(c, ctx.vendas, ctx.lancamentos, ctx.fuso),
      },
    };
    fechados.push(fechado);
    return fechado;
  });
  return { caixas: todos, fechados };
}

// ------------------------------------------------------------------ verificar o fechamento automático
/** Fechamentos automáticos que ninguém conferiu ainda (pendência do Dono e do Administrador), do mais antigo. */
export function fechamentosAVerificar(caixas: readonly CaixaDoDia[]): CaixaDoDia[] {
  return caixas.filter((c) => c.fechamento?.automatico === true && !c.fechamento.verificacao).sort((a, b) => a.dia.localeCompare(b.dia));
}

export function validarPedidoVerificacao(entrada: unknown): Resultado<{ observacao: string | null }> {
  if (entrada === undefined || entrada === null) return ok({ observacao: null });
  if (!ehObjeto(entrada)) return erro('Envie um objeto com a observação.');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['observacao'], erros);
  const observacao = textoOpcional(entrada.observacao, 'observacao', LIMITES_CAIXA.justificativaMax, 'A observação', erros);
  if (erros.length) return { ok: false, erros };
  return ok({ observacao });
}

/** Só o fechamento automático, e uma vez só. */
export function conferirVerificacao(caixas: readonly CaixaDoDia[], caixaId: string): Resultado<CaixaDoDia> {
  const c = caixas.find((x) => x.id === caixaId);
  if (!c) return erro('Caixa não encontrado.');
  if (!c.fechamento) return erro('Este caixa não está fechado.');
  if (!c.fechamento.automatico) return erro('Só o fechamento automático precisa ser verificado.');
  if (c.fechamento.verificacao) return erro(`Este fechamento já foi verificado por ${c.fechamento.verificacao.por.nome}.`);
  return ok(c);
}

/** Marca o fechamento automático como conferido: a pendência some. Nada mais muda (sem ajuste no saldo). */
export function verificarFechamento(c: CaixaDoDia, ctx: { em: string; por: Operador; observacao: string | null }): CaixaDoDia {
  return { ...c, fechamento: { ...c.fechamento!, verificacao: { em: ctx.em, por: ctx.por, observacao: ctx.observacao } } };
}

// ------------------------------------------------------------------ desfazer o fechamento
export interface PedidoDesfazer {
  motivo: string;
  explicacao: string | null;
}

export function validarPedidoDesfazer(entrada: unknown): Resultado<PedidoDesfazer> {
  if (!ehObjeto(entrada)) return erro('Envie um objeto com o motivo.');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['motivo', 'explicacao'], erros);
  const motivo = textoOpcional(entrada.motivo, 'motivo', LIMITES_CAIXA.motivoMax, 'O motivo', erros);
  if (!motivo && !erros.some((e) => e.campo === 'motivo')) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo.' });
  const explicacao = textoOpcional(entrada.explicacao, 'explicacao', LIMITES_CAIXA.justificativaMax, 'A explicação', erros);
  if (erros.length) return { ok: false, erros };
  return ok({ motivo: motivo!, explicacao });
}

/** Só o último fechamento, e sem caixa aberto depois dele (DaniPets undoClosing). */
export function conferirDesfazer(caixas: readonly CaixaDoDia[], caixaId: string, pedido: PedidoDesfazer): Resultado<CaixaDoDia> {
  const c = caixas.find((x) => x.id === caixaId);
  if (!c) return erro('Caixa não encontrado.');
  if (!c.fechamento) return erro('Este caixa não está fechado.');
  if (ultimoDiaFechado(caixas) !== c.dia) return erro('Só é possível desfazer o último fechamento.');
  if (caixas.some((x) => x.dia > c.dia)) return erro('Há caixa aberto depois deste dia. Não é possível desfazer.');
  if (c.fechamento.automatico && !pedido.explicacao) return erro('Explique por que o fechamento automático precisa ser ajustado.', 'explicacao');
  return ok(c);
}

/** Reabre o dia: o fechamento fica guardado como desfeito e o ajuste dele é estornado com um lançamento contrário. */
export function desfazerFechamento(c: CaixaDoDia, ctx: { em: string; por: Operador; motivo: string; explicacao: string | null }): { caixa: CaixaDoDia; estorno: NovoLancamento | null } {
  const f = c.fechamento!;
  const estorno: NovoLancamento | null =
    f.ajusteCentavos === 0
      ? null
      : {
          conta: 'caixa',
          tipo: 'ajuste_caixa',
          valorCentavos: -f.ajusteCentavos,
          descricao: `Estorno do ajuste do fechamento de ${dataBr(c.dia)} (fechamento desfeito)`,
          criadoEm: ctx.em,
          dia: c.dia,
          caixaId: c.id,
          vendaId: null,
          vendaNumero: null,
          recebivelId: null,
          categoria: null,
          por: ctx.por,
        };
  return {
    caixa: { ...c, fechamento: null, desfeitos: [...c.desfeitos, { ...f, desfeitoEm: ctx.em, desfeitoPor: ctx.por, motivo: ctx.motivo, explicacao: ctx.explicacao }] },
    estorno,
  };
}

// ------------------------------------------------------------------ autorizações e liberação do Dono
/** A autorização dada com senha serve: dentro do prazo, de quem tem a permissão e para esta mesma ação. */
export function autorizacaoServe(a: Autorizacao | null | undefined, permissao: Permissao, confere: (acao: AcaoAutorizada) => boolean, agora: Date): a is Autorizacao {
  if (!a || !pode(a.autorizador.papel, permissao) || !confere(a.acao)) return false;
  const idade = agora.getTime() - new Date(a.criadaEm).getTime();
  return idade >= 0 && idade <= VALIDADE_AUTORIZACAO_HORAS * 3_600_000;
}

/** O que o Dono libera para um dia com o caixa já fechado (vai junto com a operação). */
export interface PedidoLiberacao {
  /** A autorização dada com a senha do Dono (ação "dia_fechado" do mesmo dia). */
  autorizacao: string;
  motivo: string;
}

/** Liberação guardada na operação feita num dia já fechado. */
export interface Liberacao {
  por: Operador;
  motivo: string;
  em: string;
}

export function validarLiberacao(entrada: unknown): Resultado<PedidoLiberacao | null> {
  if (entrada === undefined || entrada === null) return ok(null);
  if (!ehObjeto(entrada)) return erro('Liberação inválida.', 'liberacao');
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, ['autorizacao', 'motivo'], erros);
  if (typeof entrada.autorizacao !== 'string' || !entrada.autorizacao) erros.push({ campo: 'liberacao', mensagem: 'Liberação inválida.' });
  const motivo = textoOpcional(entrada.motivo, 'motivo', LIMITES_CAIXA.motivoMax, 'O motivo', erros);
  if (!motivo && !erros.some((e) => e.campo === 'motivo')) erros.push({ campo: 'motivo', mensagem: 'Informe o motivo da liberação.' });
  if (erros.length) return { ok: false, erros };
  return ok({ autorizacao: entrada.autorizacao as string, motivo: motivo! });
}

/** Por que o dia está travado ("O caixa de 18/11/2026 já foi fechado"). */
export function motivoDaTrava(dia: string, caixas: readonly CaixaDoDia[]): string {
  const fechado = caixas.some((c) => c.dia === dia && c.fechamento);
  const ultimo = ultimoDiaFechado(caixas);
  return fechado ? `O caixa de ${dataBr(dia)} já foi fechado` : `${dataBr(dia)} fica antes do último caixa fechado (${ultimo ? dataBr(ultimo) : '—'})`;
}

/**
 * Lançar num dia travado precisa da liberação de um Dono (DaniPets assertRetro). `oque` vai na mensagem
 * ("compra", "ajuste de estoque"). Fora de dia travado, nada é pedido.
 */
export function conferirLiberacao(
  dia: string,
  ctx: { hoje: string; caixas: readonly CaixaDoDia[]; oque: string; liberacao: PedidoLiberacao | null; autorizacao: Autorizacao | null; agora: Date },
): Resultado<{ liberacao: Liberacao | null; autorizacaoUsada: string | null }> {
  if (!diaTravado(dia, ctx.hoje, ctx.caixas)) return ok({ liberacao: null, autorizacaoUsada: null });
  const a = ctx.autorizacao;
  if (!ctx.liberacao || !autorizacaoServe(a, 'dia_fechado.liberar', (x) => x.tipo === 'dia_fechado' && x.dia === dia, ctx.agora)) {
    return erro(`${motivoDaTrava(dia, ctx.caixas)}: ${ctx.oque} nesse dia precisa da liberação de um Dono.`, 'liberacao');
  }
  return ok({ liberacao: { por: { id: a.autorizador.id, nome: a.autorizador.nome }, motivo: ctx.liberacao.motivo, em: ctx.agora.toISOString() }, autorizacaoUsada: a.id });
}
