// packages/core/src/visoes.ts
// VISÕES SOB MEDIDA, ferramenta do Adm. Sup (Fase 2, módulo 13g; pedido do Luan, 25/11/2026: "criar visões, para
// conseguirmos ter acesso mesmo quando vender"). O suporte monta, para cada loja, tabelas dos Relatórios do jeito que
// ela precisa:
//   - a BASE é uma das tabelas dos Relatórios (vendas, itens vendidos, pagamentos, estoque, clientes, financeiro...);
//   - escolhe as COLUNAS, até 3 FILTROS, AGRUPAR por uma coluna (uma linha por valor, com a quantidade de linhas e a
//     soma das colunas de número) e a ORDEM;
//   - a visão segue o período escolhido nos Relatórios e vai para o Excel como as outras abas;
//   - quem vê os Relatórios vê as visões da loja (aba "Visões"); só o Adm. Sup cria, altera e exclui;
//   - as visões são do suporte: não vão na cópia de segurança da loja.
// As tabelas chegam prontas (as mesmas que os Relatórios mostram e exportam). Aqui ficam a regra da visão e a conta.
import { dataBr } from './compra';
import { formatarCentavos, reaisParaCentavos } from './dinheiro';
import { CONTROLE, ehObjeto } from './interno';
import type { ErroCampo, Resultado } from './resultado';
import { semAcento } from './texto';
import type { Operador } from './venda';

/** As tabelas dos Relatórios que podem ser a base de uma visão, na ordem da tela. */
export const BASES_DAS_VISOES = {
  vendas: 'Vendas',
  itensVendidos: 'Itens vendidos',
  pagamentos: 'Pagamentos',
  devolucoes: 'Devoluções',
  produtos: 'Produtos vendidos',
  estoque: 'Estoque',
  movimentos: 'Movimentos de estoque',
  clientes: 'Clientes',
  vales: 'Vales-troca',
  lancamentos: 'Lançamentos do financeiro',
  aReceber: 'A receber',
  aPagar: 'A pagar',
  caixas: 'Caixas do dia',
  compras: 'Compras',
  itensComprados: 'Itens comprados',
  historico: 'Histórico',
  vendasAntigas: 'Vendas antigas',
  itensVendasAntigas: 'Itens das vendas antigas',
} as const satisfies Record<string, string>;

export type BaseDaVisao = keyof typeof BASES_DAS_VISOES;
export const LISTA_BASES_DAS_VISOES = Object.keys(BASES_DAS_VISOES) as BaseDaVisao[];
export const ehBaseDaVisao = (v: unknown): v is BaseDaVisao => typeof v === 'string' && Object.hasOwn(BASES_DAS_VISOES, v);

/** Os tipos de coluna das tabelas dos Relatórios (dinheiro em centavos, data "AAAA-MM-DD", pct de 0 a 100). */
export type TipoDaColunaDaVisao = 'texto' | 'dinheiro' | 'numero' | 'inteiro' | 'data' | 'pct';

/** Uma tabela dos Relatórios (o mesmo formato que vai para o Excel). null = célula vazia. */
export interface TabelaDaVisao {
  colunas: { titulo: string; tipo?: TipoDaColunaDaVisao }[];
  linhas: (string | number | null)[][];
}

export const OPERADORES_DO_FILTRO = {
  contem: 'contém',
  igual: 'é igual a',
  diferente: 'é diferente de',
  maior: 'é maior ou igual a',
  menor: 'é menor ou igual a',
  vazio: 'está vazio',
  preenchido: 'está preenchido',
} as const;
export type OperadorDoFiltro = keyof typeof OPERADORES_DO_FILTRO;
const ehOperador = (v: unknown): v is OperadorDoFiltro => typeof v === 'string' && Object.hasOwn(OPERADORES_DO_FILTRO, v);
/** Os que não pedem valor. */
export const OPERADORES_SEM_VALOR: readonly OperadorDoFiltro[] = ['vazio', 'preenchido'];

/** Os operadores que a tela oferece para cada tipo de coluna (texto: contém; número e data: maior e menor). */
export const operadoresDoTipo = (tipo: TipoDaColunaDaVisao | undefined): OperadorDoFiltro[] =>
  !tipo || tipo === 'texto' ? ['contem', 'igual', 'diferente', 'vazio', 'preenchido'] : ['igual', 'diferente', 'maior', 'menor', 'vazio', 'preenchido'];

export interface FiltroDaVisao {
  coluna: string;
  operador: OperadorDoFiltro;
  /** Como a pessoa digitou ("Ana", "10,50", "01/11/2026"); vazio nos operadores sem valor. */
  valor: string;
}

export interface OrdemDaVisao {
  coluna: string;
  sentido: 'asc' | 'desc';
}

/** O que o Adm. Sup escolhe. */
export interface DefinicaoDaVisao {
  nome: string;
  base: BaseDaVisao;
  /** Os títulos das colunas que aparecem, na ordem da base. Vazio = todas. */
  colunas: string[];
  filtros: FiltroDaVisao[];
  /** Uma linha por valor desta coluna, com a quantidade de linhas e a soma das colunas de número. */
  agruparPor: string | null;
  ordem: OrdemDaVisao | null;
}

export interface VisaoSobMedida extends DefinicaoDaVisao {
  id: string;
  criadaEm: string;
  criadaPor: Operador;
  alteradaEm: string | null;
  alteradaPor: Operador | null;
}

export const LIMITES_VISOES = { nomeMin: 3, nomeMax: 60, porLoja: 30, colunasMax: 40, tituloMax: 60, filtrosMax: 3, valorMax: 80 } as const;

/** A coluna que o agrupamento cria com a quantidade de linhas de cada valor. */
export const COLUNA_QUANTIDADE = 'Quantidade';

const limpo = (t: string) => t.normalize('NFC').replace(/\s+/g, ' ').trim();

function tituloValido(v: unknown, campo: string, rotulo: string, erros: ErroCampo[]): string | null {
  if (typeof v !== 'string' || !limpo(v) || limpo(v).length > LIMITES_VISOES.tituloMax || CONTROLE.test(v)) {
    erros.push({ campo, mensagem: `${rotulo}: escolha uma coluna da base.` });
    return null;
  }
  return limpo(v);
}

/**
 * Confere a visão que o Adm. Sup enviou. `outras`: as visões da loja (o nome não repete); `id`: a que está sendo
 * alterada (fica de fora da conferência do nome). As colunas são conferidas na hora de montar (a base pode mudar).
 */
export function validarVisao(entrada: unknown, ctx: { outras: readonly Pick<VisaoSobMedida, 'id' | 'nome'>[]; id?: string | null }): Resultado<DefinicaoDaVisao> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: 'visao', mensagem: 'Envie a visão: nome, base, colunas, filtros, agrupamento e ordem.' }] };
  const erros: ErroCampo[] = [];
  const PERMITIDOS = ['nome', 'base', 'colunas', 'filtros', 'agruparPor', 'ordem'];
  for (const k of Object.keys(entrada)) if (!PERMITIDOS.includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });

  const nome = typeof entrada.nome === 'string' ? limpo(entrada.nome) : '';
  if (nome.length < LIMITES_VISOES.nomeMin || (typeof entrada.nome === 'string' && CONTROLE.test(entrada.nome))) {
    erros.push({ campo: 'nome', mensagem: 'Dê um nome à visão (pelo menos 3 letras), como "Vendas por vendedor".' });
  } else if (nome.length > LIMITES_VISOES.nomeMax) {
    erros.push({ campo: 'nome', mensagem: `O nome da visão pode ter até ${LIMITES_VISOES.nomeMax} caracteres.` });
  } else if (ctx.outras.some((o) => o.id !== ctx.id && semAcento(o.nome) === semAcento(nome))) {
    erros.push({ campo: 'nome', mensagem: `Já existe a visão "${nome}" nesta loja. Escolha outro nome.` });
  }

  if (!ehBaseDaVisao(entrada.base)) erros.push({ campo: 'base', mensagem: 'Escolha a base da visão (uma das tabelas dos Relatórios).' });

  const colunas: string[] = [];
  const pedidas = entrada.colunas ?? [];
  if (!Array.isArray(pedidas) || pedidas.length > LIMITES_VISOES.colunasMax) {
    erros.push({ campo: 'colunas', mensagem: `Escolha até ${LIMITES_VISOES.colunasMax} colunas.` });
  } else {
    for (const c of pedidas) {
      const t = tituloValido(c, 'colunas', 'Colunas', erros);
      if (t && !colunas.includes(t)) colunas.push(t);
    }
  }

  const filtros: FiltroDaVisao[] = [];
  const pedidos = entrada.filtros ?? [];
  if (!Array.isArray(pedidos) || pedidos.length > LIMITES_VISOES.filtrosMax) {
    erros.push({ campo: 'filtros', mensagem: `Use até ${LIMITES_VISOES.filtrosMax} filtros.` });
  } else {
    pedidos.forEach((f, i) => {
      const campo = `filtros.${i}`;
      if (!ehObjeto(f)) return void erros.push({ campo, mensagem: 'Filtro inválido.' });
      const coluna = tituloValido(f.coluna, `${campo}.coluna`, `Filtro ${i + 1}`, erros);
      if (!ehOperador(f.operador)) return void erros.push({ campo: `${campo}.operador`, mensagem: `Filtro ${i + 1}: escolha a condição.` });
      const semValor = OPERADORES_SEM_VALOR.includes(f.operador);
      const valor = semValor ? '' : typeof f.valor === 'string' || typeof f.valor === 'number' ? limpo(String(f.valor)) : '';
      if (!semValor && !valor) return void erros.push({ campo: `${campo}.valor`, mensagem: `Filtro ${i + 1}: escreva o valor (ou escolha "está vazio" / "está preenchido").` });
      if (valor.length > LIMITES_VISOES.valorMax || CONTROLE.test(valor)) return void erros.push({ campo: `${campo}.valor`, mensagem: `Filtro ${i + 1}: o valor pode ter até ${LIMITES_VISOES.valorMax} caracteres.` });
      if (coluna) filtros.push({ coluna, operador: f.operador, valor });
    });
  }

  const agruparPor = entrada.agruparPor === undefined || entrada.agruparPor === null || entrada.agruparPor === '' ? null : tituloValido(entrada.agruparPor, 'agruparPor', 'Agrupar por', erros);

  let ordem: OrdemDaVisao | null = null;
  if (entrada.ordem !== undefined && entrada.ordem !== null) {
    const o = entrada.ordem;
    if (!ehObjeto(o) || (o.sentido !== 'asc' && o.sentido !== 'desc')) erros.push({ campo: 'ordem', mensagem: 'Ordem: escolha a coluna e se é crescente ou decrescente.' });
    else {
      const coluna = tituloValido(o.coluna, 'ordem.coluna', 'Ordem', erros);
      if (coluna) ordem = { coluna, sentido: o.sentido };
    }
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, valor: { nome, base: entrada.base as BaseDaVisao, colunas, filtros, agruparPor, ordem } };
}

// ------------------------------------------------------------------ montar a visão

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
/** As colunas que o agrupamento soma (o percentual não se soma). */
const somavel = (t: TipoDaColunaDaVisao | undefined) => t === 'dinheiro' || t === 'numero' || t === 'inteiro';

/** A célula como aparece na tela (para "contém" e para comparar texto). */
function textoDaCelula(v: string | number | null, tipo: TipoDaColunaDaVisao | undefined): string {
  if (v === null || v === '') return '';
  if (typeof v === 'string') return tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dataBr(v) : v;
  if (tipo === 'dinheiro') return formatarCentavos(v);
  if (tipo === 'pct') return `${NUMERO.format(v)}%`;
  return NUMERO.format(v);
}

/** "10,50" -> 1050 (dinheiro, em centavos) ou 10,5 (número). Aceita o sinal de menos. null = não é número. */
function numeroDoFiltro(valor: string, tipo: TipoDaColunaDaVisao): number | null {
  const t = valor.replace(/%$/, '').trim();
  const negativo = t.startsWith('-');
  const sem = negativo ? t.slice(1) : t;
  let n: number | null;
  if (tipo === 'dinheiro') n = reaisParaCentavos(sem);
  else {
    const normal = /,/.test(sem) ? sem.replace(/\./g, '').replace(',', '.') : sem;
    n = /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : null;
  }
  return n === null ? null : negativo ? -n : n;
}

/** "01/11/2026" ou "2026-11-01" -> "2026-11-01". */
function diaDoFiltro(valor: string): string | null {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor.trim());
  const iso = br ? `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}` : valor.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

const vazia = (v: string | number | null) => v === null || v === '';

/** O teste de um filtro numa coluna; null = o valor não serve para o tipo da coluna (o filtro fica de fora). */
function testeDoFiltro(f: FiltroDaVisao, tipo: TipoDaColunaDaVisao | undefined): ((v: string | number | null) => boolean) | null {
  if (f.operador === 'vazio') return vazia;
  if (f.operador === 'preenchido') return (v) => !vazia(v);
  if (f.operador === 'contem' || !tipo || tipo === 'texto') {
    const alvo = semAcento(f.valor);
    return (v) => {
      const texto = semAcento(textoDaCelula(v, tipo));
      switch (f.operador) {
        case 'contem':
          return texto.includes(alvo);
        case 'igual':
          return texto === alvo;
        case 'diferente':
          return texto !== alvo;
        case 'maior':
          return !vazia(v) && texto.localeCompare(alvo, 'pt-BR') >= 0;
        default:
          return !vazia(v) && texto.localeCompare(alvo, 'pt-BR') <= 0;
      }
    };
  }
  const alvo = tipo === 'data' ? diaDoFiltro(f.valor) : numeroDoFiltro(f.valor, tipo);
  if (alvo === null) return null;
  return (v) => {
    if (vazia(v)) return f.operador === 'diferente';
    const x = tipo === 'data' ? String(v).slice(0, 10) : typeof v === 'number' ? v : null;
    if (x === null) return f.operador === 'diferente';
    switch (f.operador) {
      case 'igual':
        return x === alvo;
      case 'diferente':
        return x !== alvo;
      case 'maior':
        return x >= alvo;
      default:
        return x <= alvo;
    }
  };
}

/** Compara duas células para ordenar (vazias sempre por último, nos dois sentidos). */
function comparar(a: string | number | null, b: string | number | null, sentido: 'asc' | 'desc'): number {
  if (vazia(a) || vazia(b)) return vazia(a) === vazia(b) ? 0 : vazia(a) ? 1 : -1;
  const d = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  return sentido === 'asc' ? d : -d;
}

/**
 * Monta a visão a partir da tabela da base (já no período escolhido): filtros, agrupamento, ordem e colunas.
 * `avisos`: o que ficou de fora (coluna que a base não tem mais, valor que não serve para o filtro).
 */
export function aplicarVisao(tabela: TabelaDaVisao, visao: Pick<DefinicaoDaVisao, 'colunas' | 'filtros' | 'agruparPor' | 'ordem'>): { tabela: TabelaDaVisao; avisos: string[] } {
  const avisos = new Set<string>();
  const indice = new Map(tabela.colunas.map((c, i) => [c.titulo, i]));
  const tipoDe = (i: number) => tabela.colunas[i]?.tipo;
  const falta = (titulo: string) => avisos.add(`A coluna "${titulo}" não existe nesta base e ficou de fora.`);

  // 1. filtros (todos precisam valer)
  let linhas = tabela.linhas;
  for (const f of visao.filtros) {
    const i = indice.get(f.coluna);
    if (i === undefined) {
      falta(f.coluna);
      continue;
    }
    const teste = testeDoFiltro(f, tipoDe(i));
    if (!teste) {
      avisos.add(`O filtro "${f.coluna} ${OPERADORES_DO_FILTRO[f.operador]} ${f.valor}" ficou de fora: "${f.valor}" não é ${tipoDe(i) === 'data' ? 'uma data (dd/mm/aaaa)' : 'um número'}.`);
      continue;
    }
    linhas = linhas.filter((l) => teste(l[i] ?? null));
  }

  // as colunas escolhidas (na ordem da escolha); nenhuma que exista = todas
  let escolhidas = visao.colunas.flatMap((t) => {
    const i = indice.get(t);
    if (i === undefined) falta(t);
    return i === undefined ? [] : [i];
  });
  if (escolhidas.length === 0) escolhidas = tabela.colunas.map((_, i) => i);

  const g = visao.agruparPor === null ? undefined : indice.get(visao.agruparPor);
  if (visao.agruparPor !== null && g === undefined) falta(visao.agruparPor);

  let saida: TabelaDaVisao;
  if (g === undefined) {
    // 2. ordem (pode ser por uma coluna que não aparece) e 3. as colunas
    if (visao.ordem) {
      const o = indice.get(visao.ordem.coluna);
      const sentido = visao.ordem.sentido;
      if (o === undefined) falta(visao.ordem.coluna);
      else linhas = [...linhas].sort((a, b) => comparar(a[o] ?? null, b[o] ?? null, sentido));
    }
    saida = { colunas: escolhidas.map((i) => tabela.colunas[i]!), linhas: linhas.map((l) => escolhidas.map((i) => l[i] ?? null)) };
  } else {
    // 2. agrupar: uma linha por valor, com a quantidade e a soma das colunas de número escolhidas
    const somadas = escolhidas.filter((i) => i !== g && somavel(tipoDe(i)));
    const grupos = new Map<string, { chave: string | number | null; n: number; somas: number[] }>();
    for (const l of linhas) {
      const chave = l[g] ?? null;
      const k = vazia(chave) ? '' : `${typeof chave}:${chave}`;
      const grupo = grupos.get(k) ?? { chave: vazia(chave) ? null : chave, n: 0, somas: somadas.map(() => 0) };
      grupo.n++;
      somadas.forEach((i, j) => {
        const v = l[i];
        if (typeof v === 'number') grupo.somas[j]! += v;
      });
      grupos.set(k, grupo);
    }
    const tituloDaQuantidade = somadas.some((i) => tabela.colunas[i]!.titulo === COLUNA_QUANTIDADE) || tabela.colunas[g]!.titulo === COLUNA_QUANTIDADE ? 'Quantidade de linhas' : COLUNA_QUANTIDADE;
    const colunas = [tabela.colunas[g]!, { titulo: tituloDaQuantidade, tipo: 'inteiro' as const }, ...somadas.map((i) => tabela.colunas[i]!)];
    let agrupadas = [...grupos.values()].map((x) => [x.chave, x.n, ...x.somas.map((s) => Math.round(s * 1000) / 1000)]);
    // 3. ordem: por uma das colunas da visão agrupada; sem ordem, pelo valor do grupo
    const o = visao.ordem ? colunas.findIndex((c) => c.titulo === visao.ordem!.coluna) : 0;
    if (visao.ordem && o < 0) avisos.add(`Ordem por "${visao.ordem.coluna}": agrupada, a visão só tem o grupo, a quantidade e as somas; ficou pela ordem do grupo.`);
    const coluna = o < 0 ? 0 : o;
    const sentido = visao.ordem && o >= 0 ? visao.ordem.sentido : 'asc';
    agrupadas = agrupadas.sort((a, b) => comparar(a[coluna] ?? null, b[coluna] ?? null, sentido));
    saida = { colunas, linhas: agrupadas };
  }
  return { tabela: saida, avisos: [...avisos] };
}

/** "Vendas · 4 colunas · Vendedor contém "Ana" · agrupada por Pagamento · ordem: Total (decrescente)". */
export function descreverVisao(v: Pick<DefinicaoDaVisao, 'base' | 'colunas' | 'filtros' | 'agruparPor' | 'ordem'>): string {
  return [
    BASES_DAS_VISOES[v.base],
    v.colunas.length === 0 ? 'todas as colunas' : `${v.colunas.length} ${v.colunas.length === 1 ? 'coluna' : 'colunas'}`,
    ...v.filtros.map((f) => `${f.coluna} ${OPERADORES_DO_FILTRO[f.operador]}${OPERADORES_SEM_VALOR.includes(f.operador) ? '' : ` "${f.valor}"`}`),
    v.agruparPor ? `agrupada por ${v.agruparPor}` : null,
    v.ordem ? `ordem: ${v.ordem.coluna} (${v.ordem.sentido === 'asc' ? 'crescente' : 'decrescente'})` : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(' · ');
}
