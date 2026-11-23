// packages/core/src/configuracao.ts
// CONFIGURAÇÕES DE CADA LOJA (Fase 2, módulo 1). O que no DaniPets V9.3.3 era fixo no código vira
// configuração da loja, com os valores do DaniPets como padrão (diagnóstico ESP-01, 05 a 08, 10):
//   - dados da loja: nome, descrição e logo (vão na barra lateral, na entrada, nas mensagens e no regulamento);
//   - regras: desconto que o Vendedor dá sem senha, diferença aceita no caixa, fiado, cashback, cupom de
//     retorno, mensagens de WhatsApp, motivos de ajuste de estoque, categorias de despesa, unidades de venda,
//     o campo extra do cliente (o "Pet" do DaniPets, desligado por padrão) e o nome de cada conta do Financeiro
//     ("Banco Itaú" no lugar de "Conta bancária"; pedido do Luan, 23/11/2026).
// Cada número tem os limites do DaniPets (REGRAS_LIMITES). O que vem guardado de outra versão, ou alterado
// por fora, é completado com o padrão (normalizar*), nunca recusado — como o cliNormalizar do DaniPets.
// Quem altera: Dono e Administrador (permissão 'loja.configurar'); todos os logados leem.
import { CONTAS, LIMITES_NOME_CONTA, NOME_CONTA, type NomesDasContas, PRAZO_FIADO_PADRAO_DIAS } from './financeiro';
import { CONTROLE, ehObjeto } from './interno';
import { UNIDADES_VENDA, type UnidadeVenda } from './quantidade';
import type { ErroCampo, Resultado } from './resultado';
import { LIMITE_DESCONTO_VENDEDOR_PCT } from './venda';

export const LIMITES_LOJA = {
  nomeMin: 2,
  /** DaniPets: NOME_MAX. */
  nomeMax: 80,
  /** DaniPets: TEXTO_MAX. */
  descricaoMax: 160,
  /** DaniPets: MSG_MAX. */
  mensagemMax: 1000,
  itemMin: 2,
  itemMax: 60,
  itensMax: 30,
  rotuloMin: 2,
  rotuloMax: 30,
  /** Logo em data URL (PNG, JPEG ou WebP), até ~200 KB. A tela reduz a imagem antes de enviar. */
  logoMaxCaracteres: 280_000,
} as const;

// ------------------------------------------------------------------ dados da loja

export interface DadosDaLoja {
  nome: string;
  /** Linha abaixo do nome na barra lateral ("Rações, petiscos e acessórios"). */
  descricao: string | null;
  /** data:image/png;base64,... — null = sem logo (a barra mostra as iniciais do nome). */
  logo: string | null;
}

export type CampoDadosDaLoja = keyof DadosDaLoja;

const FORMATO_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Texto de uma linha: NFC, sem espaço sobrando, sem caractere de controle. */
/** Cópia funda (as regras só têm números, textos, listas e sim/não). */
const copiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const linha = (v: unknown): string => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

function lerNomeDaLoja(v: unknown, erros: ErroCampo[]): string {
  const nome = linha(v);
  if (nome.length < LIMITES_LOJA.nomeMin) erros.push({ campo: 'nome', mensagem: 'Informe o nome da loja.' });
  else if (nome.length > LIMITES_LOJA.nomeMax) erros.push({ campo: 'nome', mensagem: `O nome da loja pode ter até ${LIMITES_LOJA.nomeMax} caracteres.` });
  else if (CONTROLE.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });
  return nome;
}

function lerDescricao(v: unknown, erros: ErroCampo[]): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') {
    erros.push({ campo: 'descricao', mensagem: 'A descrição deve ser um texto.' });
    return null;
  }
  const d = linha(v);
  if (d.length > LIMITES_LOJA.descricaoMax) erros.push({ campo: 'descricao', mensagem: `A descrição pode ter até ${LIMITES_LOJA.descricaoMax} caracteres.` });
  return d || null;
}

function lerLogo(v: unknown, erros: ErroCampo[]): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !FORMATO_LOGO.test(v)) {
    erros.push({ campo: 'logo', mensagem: 'O logo precisa ser uma imagem PNG, JPEG ou WebP.' });
    return null;
  }
  if (v.length > LIMITES_LOJA.logoMaxCaracteres) {
    erros.push({ campo: 'logo', mensagem: 'O logo é grande demais. Use uma imagem menor (até 200 KB).' });
    return null;
  }
  return v;
}

/**
 * Aplica a mudança (só os campos enviados) aos dados atuais. `campos` = o que mudou de fato
 * (vazio = nada mudou: não precisa gravar nem registrar no histórico).
 */
export function aplicarMudancaNosDados(atuais: DadosDaLoja, mudanca: unknown): Resultado<{ dados: DadosDaLoja; campos: CampoDadosDaLoja[] }> {
  if (!ehObjeto(mudanca)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o que muda.' }] };
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(mudanca)) if (k !== 'nome' && k !== 'descricao' && k !== 'logo') erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  const dados: DadosDaLoja = { ...atuais };
  if (mudanca.nome !== undefined) dados.nome = lerNomeDaLoja(mudanca.nome, erros);
  if (mudanca.descricao !== undefined) dados.descricao = lerDescricao(mudanca.descricao, erros);
  if (mudanca.logo !== undefined) dados.logo = lerLogo(mudanca.logo, erros);
  if (!erros.length && Object.keys(mudanca).length === 0) erros.push({ campo: '_', mensagem: 'Nada para alterar.' });
  if (erros.length) return { ok: false, erros };
  const campos = (['nome', 'descricao', 'logo'] as const).filter((k) => dados[k] !== atuais[k]);
  return { ok: true, valor: { dados, campos } };
}

/** Dados guardados (de qualquer versão) completados com o padrão. */
export function normalizarDadosDaLoja(guardados: unknown, padrao: DadosDaLoja): DadosDaLoja {
  const g = ehObjeto(guardados) ? guardados : {};
  const pegar = <T,>(ler: (v: unknown, e: ErroCampo[]) => T, v: unknown, reserva: T): T => {
    const e: ErroCampo[] = [];
    const r = ler(v, e);
    return e.length ? reserva : r;
  };
  return {
    nome: g.nome === undefined ? padrao.nome : pegar(lerNomeDaLoja, g.nome, padrao.nome),
    descricao: g.descricao === undefined ? padrao.descricao : pegar(lerDescricao, g.descricao, padrao.descricao),
    logo: g.logo === undefined ? padrao.logo : pegar(lerLogo, g.logo, null),
  };
}

// ------------------------------------------------------------------ regras da loja


export interface RegrasDaLoja {
  /** DaniPets DISCOUNT_LIMIT: acima disso, o Vendedor pede a senha do Dono ou do Administrador. */
  venda: { descontoSemSenhaPct: number };
  /** DaniPets CLOSE_TOLERANCE (R$ 10): diferença no fechamento acima disso pede autorização. */
  caixa: { toleranciaCentavos: number };
  /** Prazo do fiado e se o fiado vencido só sai com a liberação do Dono. */
  fiado: { prazoDias: number; vencidoPedeDono: boolean };
  /** % da compra que volta como cashback, por quantos dias vale e quantos dias antes avisar. */
  cashback: { percentual: number; validadeDias: number; avisoDias: number };
  /** Cliente sumido: depois de quantos dias sem comprar, o desconto do cupom e a validade dele. */
  retorno: { diasSemComprar: number; cupomPct: number; cupomValidadeDias: number };
  /** Mensagens de WhatsApp (com {nome}, {loja}, {valor}...). */
  mensagens: { retorno: string; cashback: string; cobranca: string };
  estoque: { motivosAjuste: string[] };
  /** Categorias de despesa e o nome que a loja deu a cada conta (Caixa físico e Conta bancária). */
  financeiro: { categoriasDespesa: string[]; nomesContas: NomesDasContas };
  /** Como os produtos podem ser vendidos: por unidade e/ou por quilo. */
  produtos: { unidades: UnidadeVenda[] };
  /** Campo extra no cadastro do cliente, com o nome que a loja escolher ("Pet", "Veículo"...). */
  clientes: { campoExtra: { ativo: boolean; rotulo: string } };
}

export type SecaoRegras = keyof RegrasDaLoja;
export const SECOES_REGRAS: readonly SecaoRegras[] = ['venda', 'caixa', 'fiado', 'cashback', 'retorno', 'mensagens', 'estoque', 'financeiro', 'produtos', 'clientes'];

/** Mudança nas regras: só as partes e os campos que mudam. */
export type MudancaRegras = { [S in SecaoRegras]?: Partial<RegrasDaLoja[S]> };

export interface ConfiguracaoDaLoja {
  dados: DadosDaLoja;
  regras: RegrasDaLoja;
}

/** As mensagens do DaniPets V9.3.3 (o nome da loja entra no lugar de {loja}). */
export const MENSAGENS_PADRAO: RegrasDaLoja['mensagens'] = {
  retorno:
    'Olá, {nome}! Aqui é da {loja}. Faz {dias} dias desde a sua última compra e sentimos sua falta. Separamos {desconto}% de desconto para você, válido até {validade}. É só informar seu CPF no caixa.',
  cashback: 'Olá, {nome}! Aqui é da {loja}. Você tem {valor} de cashback para usar até {validade}. Aproveite na sua próxima compra!',
  cobranca:
    'Olá, {nome}, tudo bem? Aqui é da {loja}. Passando para lembrar que há {valor} em aberto na sua conta, com vencimento em {vencimento}. Se já pagou, por favor desconsidere. Qualquer dúvida, estamos à disposição.',
};

/** O que cada mensagem pode usar entre chaves. */
export const VARIAVEIS_MENSAGEM: Record<keyof RegrasDaLoja['mensagens'], readonly string[]> = {
  retorno: ['nome', 'loja', 'dias', 'desconto', 'validade'],
  cashback: ['nome', 'loja', 'valor', 'validade'],
  cobranca: ['nome', 'loja', 'valor', 'vencimento'],
};

/** DaniPets: ADJ_REASONS. */
export const MOTIVOS_AJUSTE_PADRAO: readonly string[] = ['Perda ou avaria', 'Produto vencido', 'Correção de contagem', 'Outro'];
/** DaniPets: CATEGORIES. */
export const CATEGORIAS_DESPESA_PADRAO: readonly string[] = ['Aluguel', 'Energia e água', 'Funcionários', 'Impostos e taxas', 'Fornecedores', 'Transporte', 'Outras despesas'];

/** As regras do DaniPets V9.3.3 (cada chamada devolve uma cópia nova). */
export function regrasPadrao(): RegrasDaLoja {
  return {
    venda: { descontoSemSenhaPct: LIMITE_DESCONTO_VENDEDOR_PCT },
    caixa: { toleranciaCentavos: 1000 },
    fiado: { prazoDias: PRAZO_FIADO_PADRAO_DIAS, vencidoPedeDono: true },
    cashback: { percentual: 3.5, validadeDias: 31, avisoDias: 7 },
    retorno: { diasSemComprar: 30, cupomPct: 5, cupomValidadeDias: 7 },
    mensagens: { ...MENSAGENS_PADRAO },
    estoque: { motivosAjuste: [...MOTIVOS_AJUSTE_PADRAO] },
    financeiro: { categoriasDespesa: [...CATEGORIAS_DESPESA_PADRAO], nomesContas: { ...NOME_CONTA } },
    produtos: { unidades: [...UNIDADES_VENDA] },
    clientes: { campoExtra: { ativo: false, rotulo: 'Pet' } },
  };
}

/** Limites de cada número (os do DaniPets: REGRAS_LIMITES). casas = casas decimais aceitas. */
export const LIMITES_REGRAS = {
  'venda.descontoSemSenhaPct': { min: 0, max: 50, casas: 2, rotulo: 'Desconto que o Vendedor dá sem senha (%)' },
  'caixa.toleranciaCentavos': { min: 0, max: 100_000, casas: 0, rotulo: 'Diferença aceita no fechamento do caixa' },
  'fiado.prazoDias': { min: 1, max: 365, casas: 0, rotulo: 'Prazo para pagar o fiado (dias)' },
  'cashback.percentual': { min: 0, max: 20, casas: 2, rotulo: 'Percentual de cashback' },
  'cashback.validadeDias': { min: 1, max: 3650, casas: 0, rotulo: 'Prazo para usar o cashback (dias)' },
  'cashback.avisoDias': { min: 0, max: 365, casas: 0, rotulo: 'Aviso de cashback vencendo (dias antes)' },
  'retorno.diasSemComprar': { min: 1, max: 3650, casas: 0, rotulo: 'Dias sem comprar para lembrar' },
  'retorno.cupomPct': { min: 0, max: 50, casas: 2, rotulo: 'Desconto do cupom de retorno (%)' },
  'retorno.cupomValidadeDias': { min: 1, max: 365, casas: 0, rotulo: 'Validade do cupom (dias)' },
} as const satisfies Record<string, { min: number; max: number; casas: 0 | 2; rotulo: string }>;

type CampoNumerico = keyof typeof LIMITES_REGRAS;

const numeroBr = (n: number) => String(n).replace('.', ',');

function lerNumero(campo: CampoNumerico, v: unknown, erros: ErroCampo[]): number {
  const l = LIMITES_REGRAS[campo];
  const ok = typeof v === 'number' && Number.isFinite(v) && v >= l.min && v <= l.max && Math.abs(Math.round(v * 10 ** l.casas) - v * 10 ** l.casas) < 1e-6;
  if (!ok) {
    const casas = l.casas ? `, com até ${l.casas} casas` : ', sem casas decimais';
    erros.push({ campo, mensagem: `${l.rotulo}: de ${numeroBr(l.min)} a ${numeroBr(l.max)}${casas}.` });
    return 0;
  }
  return l.casas ? Math.round((v as number) * 100) / 100 : (v as number);
}

function lerBooleano(campo: string, v: unknown, erros: ErroCampo[]): boolean {
  if (typeof v !== 'boolean') erros.push({ campo, mensagem: 'Informe sim ou não (true ou false).' });
  return v === true;
}

/** Mensagem: pode ter quebra de linha; não pode ficar vazia nem usar variável que não existe. */
function lerMensagem(qual: keyof RegrasDaLoja['mensagens'], v: unknown, erros: ErroCampo[]): string {
  const campo = `mensagens.${qual}`;
  const texto = typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').trim() : '';
  if (!texto) erros.push({ campo, mensagem: 'A mensagem não pode ficar vazia.' });
  else if (texto.length > LIMITES_LOJA.mensagemMax) erros.push({ campo, mensagem: `A mensagem pode ter até ${LIMITES_LOJA.mensagemMax} caracteres.` });
  else if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(texto)) erros.push({ campo, mensagem: 'A mensagem contém caracteres inválidos.' });
  else {
    const usadas = [...texto.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
    const estranhas = usadas.filter((x) => !VARIAVEIS_MENSAGEM[qual].includes(x));
    if (estranhas.length) {
      erros.push({ campo, mensagem: `Use só ${VARIAVEIS_MENSAGEM[qual].map((x) => `{${x}}`).join(', ')} (não existe {${estranhas[0]}}).` });
    }
  }
  return texto;
}

/** Lista de nomes (motivos, categorias): 1 a 30 itens, de 2 a 60 caracteres, sem repetir. */
function lerLista(campo: string, v: unknown, erros: ErroCampo[]): string[] {
  if (!Array.isArray(v)) {
    erros.push({ campo, mensagem: 'Envie uma lista.' });
    return [];
  }
  const itens = v.map(linha);
  if (itens.length === 0) erros.push({ campo, mensagem: 'A lista precisa de pelo menos um item.' });
  else if (itens.length > LIMITES_LOJA.itensMax) erros.push({ campo, mensagem: `A lista pode ter até ${LIMITES_LOJA.itensMax} itens.` });
  const vistos = new Set<string>();
  for (const item of itens) {
    if (item.length < LIMITES_LOJA.itemMin || item.length > LIMITES_LOJA.itemMax || CONTROLE.test(item)) {
      erros.push({ campo, mensagem: `Cada item tem de ${LIMITES_LOJA.itemMin} a ${LIMITES_LOJA.itemMax} caracteres.` });
      break;
    }
    const chave = item.toLocaleLowerCase('pt-BR');
    if (vistos.has(chave)) {
      erros.push({ campo, mensagem: `"${item}" aparece mais de uma vez.` });
      break;
    }
    vistos.add(chave);
  }
  return itens;
}

function lerUnidades(v: unknown, erros: ErroCampo[]): UnidadeVenda[] {
  const lista = Array.isArray(v) ? v : [];
  const validas = UNIDADES_VENDA.filter((u) => lista.includes(u));
  if (!Array.isArray(v) || validas.length === 0 || validas.length !== new Set(lista).size || lista.length !== new Set(lista).size) {
    erros.push({ campo: 'produtos.unidades', mensagem: 'Escolha pelo menos uma unidade de venda: un (unidade) ou kg (quilo).' });
  }
  return validas;
}

/**
 * Nomes das contas: { caixa?, banco? }, cada um de 2 a 30 caracteres; vazio volta ao nome padrão. As duas contas
 * não podem ficar com o mesmo nome (a tela e o extrato ficariam confusos).
 */
function lerNomesContas(v: unknown, atuais: NomesDasContas, erros: ErroCampo[]): NomesDasContas {
  const campo = 'financeiro.nomesContas';
  if (!ehObjeto(v)) {
    erros.push({ campo, mensagem: 'Envie { caixa, banco } com os nomes das contas.' });
    return atuais;
  }
  const r: NomesDasContas = { ...atuais };
  for (const k of Object.keys(v)) {
    if (!(CONTAS as readonly string[]).includes(k)) {
      erros.push({ campo: `${campo}.${k}`, mensagem: 'Conta desconhecida.' });
      continue;
    }
    const id = k as keyof NomesDasContas;
    const nome = linha(v[k]);
    if (!nome) r[id] = NOME_CONTA[id];
    else if (nome.length < LIMITES_NOME_CONTA.min || nome.length > LIMITES_NOME_CONTA.max || CONTROLE.test(nome)) {
      erros.push({ campo: `${campo}.${k}`, mensagem: `O nome da conta tem de ${LIMITES_NOME_CONTA.min} a ${LIMITES_NOME_CONTA.max} caracteres.` });
    } else r[id] = nome;
  }
  if (r.caixa.toLocaleLowerCase('pt-BR') === r.banco.toLocaleLowerCase('pt-BR')) erros.push({ campo, mensagem: 'As duas contas precisam de nomes diferentes.' });
  return r;
}

function lerRotulo(v: unknown, erros: ErroCampo[]): string {
  const r = linha(v);
  if (r.length < LIMITES_LOJA.rotuloMin || r.length > LIMITES_LOJA.rotuloMax || CONTROLE.test(r)) {
    erros.push({ campo: 'clientes.campoExtra.rotulo', mensagem: `O nome do campo tem de ${LIMITES_LOJA.rotuloMin} a ${LIMITES_LOJA.rotuloMax} caracteres.` });
  }
  return r;
}

/** Lê uma parte das regras: `base` é o que fica onde a mudança não mexe. */
function lerSecao<S extends SecaoRegras>(secao: S, mudanca: unknown, base: RegrasDaLoja[S], erros: ErroCampo[]): RegrasDaLoja[S] {
  if (!ehObjeto(mudanca)) {
    erros.push({ campo: secao, mensagem: 'Envie um objeto com o que muda nesta parte.' });
    return base;
  }
  const permitidos = Object.keys(base);
  for (const k of Object.keys(mudanca)) if (!permitidos.includes(k)) erros.push({ campo: `${secao}.${k}`, mensagem: 'Campo não permitido.' });
  const r = copiar(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(mudanca)) {
    if (!permitidos.includes(k)) continue;
    const campo = `${secao}.${k}`;
    if (campo in LIMITES_REGRAS) r[k] = lerNumero(campo as CampoNumerico, v, erros);
    else if (campo === 'fiado.vencidoPedeDono') r[k] = lerBooleano(campo, v, erros);
    else if (secao === 'mensagens') r[k] = lerMensagem(k as keyof RegrasDaLoja['mensagens'], v, erros);
    else if (campo === 'estoque.motivosAjuste' || campo === 'financeiro.categoriasDespesa') r[k] = lerLista(campo, v, erros);
    else if (campo === 'produtos.unidades') r[k] = lerUnidades(v, erros);
    else if (campo === 'financeiro.nomesContas') r[k] = lerNomesContas(v, (base as RegrasDaLoja['financeiro']).nomesContas, erros);
    else if (campo === 'clientes.campoExtra') {
      const atual = (base as RegrasDaLoja['clientes']).campoExtra;
      if (!ehObjeto(v)) {
        erros.push({ campo, mensagem: 'Envie { ativo, rotulo }.' });
        continue;
      }
      for (const x of Object.keys(v)) if (x !== 'ativo' && x !== 'rotulo') erros.push({ campo: `${campo}.${x}`, mensagem: 'Campo não permitido.' });
      r[k] = {
        ativo: v.ativo === undefined ? atual.ativo : lerBooleano(`${campo}.ativo`, v.ativo, erros),
        rotulo: v.rotulo === undefined ? atual.rotulo : lerRotulo(v.rotulo, erros),
      };
    }
  }
  return r as RegrasDaLoja[S];
}

/**
 * Aplica a mudança às regras atuais, conferindo cada campo. `secoes` = as partes que mudaram de fato
 * (vazio = nada mudou: não precisa gravar nem registrar no histórico).
 */
export function aplicarMudancaNasRegras(atuais: RegrasDaLoja, mudanca: unknown): Resultado<{ regras: RegrasDaLoja; secoes: SecaoRegras[] }> {
  if (!ehObjeto(mudanca)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o que muda.' }] };
  const erros: ErroCampo[] = [];
  const regras = copiar(atuais);
  for (const k of Object.keys(mudanca)) {
    if (!(SECOES_REGRAS as readonly string[]).includes(k)) {
      erros.push({ campo: k, mensagem: 'Parte das regras desconhecida.' });
      continue;
    }
    const s = k as SecaoRegras;
    (regras as Record<SecaoRegras, unknown>)[s] = lerSecao(s, mudanca[k], atuais[s], erros);
  }
  if (!erros.length && Object.keys(mudanca).length === 0) erros.push({ campo: '_', mensagem: 'Nada para alterar.' });
  if (erros.length) return { ok: false, erros };
  const secoes = SECOES_REGRAS.filter((s) => JSON.stringify(regras[s]) !== JSON.stringify(atuais[s]));
  return { ok: true, valor: { regras, secoes } };
}

/** Regras guardadas (de qualquer versão, ou alteradas por fora): cada campo inválido ou ausente volta ao padrão. */
export function normalizarRegras(guardadas: unknown): RegrasDaLoja {
  const padrao = regrasPadrao();
  if (!ehObjeto(guardadas)) return padrao;
  const regras = regrasPadrao();
  for (const s of SECOES_REGRAS) {
    const g = guardadas[s];
    if (!ehObjeto(g)) continue;
    for (const [k, v] of Object.entries(g)) {
      if (!Object.hasOwn(padrao[s], k)) continue;
      const tentativa = aplicarMudancaNasRegras(regras, { [s]: { [k]: v } });
      if (tentativa.ok) (regras as Record<SecaoRegras, unknown>)[s] = tentativa.valor.regras[s];
    }
  }
  return regras;
}

/** Troca {nome}, {loja}... pelos valores. Variável sem valor fica como está. */
export function preencherModelo(modelo: string, valores: Readonly<Record<string, string | number>>): string {
  return modelo.replace(/\{([^{}]+)\}/g, (inteiro, chave: string) => (Object.hasOwn(valores, chave) ? String(valores[chave]) : inteiro));
}
