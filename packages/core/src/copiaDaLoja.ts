// packages/core/src/copiaDaLoja.ts
// CÓPIA DE SEGURANÇA da loja (Fase 2, módulo 13; DaniPets DAT-01 e DAT-05; pedido do Luan em 25/11/2026).
// Um arquivo (JSON) com todos os dados de UMA loja: cadastros, vendas, estoque, caixa, financeiro, fidelidade e
// vales. Leva também a equipe (sem senha) e o histórico, só para consulta.
//   - BAIXAR: quem tem Dados e backup e pode ver o CPF completo (a cópia leva o CPF completo dos clientes).
//     Dono e Administrador podem; o Personalizado, só com as duas funções;
//   - RESTAURAR: só o Adm. Sup (troca os dados atuais). Antes, a tela baixa uma cópia dos dados de agora (DAT-05);
//   - a cópia só volta na MESMA loja. É recusado o arquivo de outro formato, de versão mais nova do sistema ou
//     alterado depois de gerado;
//   - a CONFERÊNCIA é o SHA-256 do conteúdo em JSON canônico (chaves em ordem). Ela pega arquivo corrompido ou
//     mexido à mão. NÃO é assinatura: quem souber recalcular passa. No servidor, antes de a restauração existir lá,
//     a conferência ganha uma chave que só o servidor tem;
//   - a equipe e o histórico NÃO voltam na restauração. As pessoas continuam com as senhas de hoje, e o histórico só
//     acrescenta (docs/decisoes/0001-auditoria.md): a própria restauração entra nele.
import { ehObjeto } from './interno';
import { pode, type QuemAcessa } from './permissoes';
import type { Resultado } from './resultado';

export const FORMATO_DA_COPIA = 'sistema-padrao/copia-da-loja';
export const VERSAO_DA_COPIA = 1;
/** Maior arquivo aceito para restaurar (a demonstração guarda bem menos que isso). */
export const COPIA_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Os assuntos da cópia, na ordem da prévia. lista: um registro por item; mapa: um registro por chave (estoque
 * mínimo por produto); objeto: um registro só (dados e regras, taxas do cartão), null = a loja usa o padrão.
 */
export const ASSUNTOS_DA_COPIA = {
  configuracao: { nome: 'Dados e regras da loja', tipo: 'objeto' },
  produtos: { nome: 'Produtos', tipo: 'lista' },
  estoque: { nome: 'Movimentos de estoque', tipo: 'lista' },
  minimos: { nome: 'Estoques mínimos', tipo: 'mapa' },
  fornecedores: { nome: 'Fornecedores', tipo: 'lista' },
  compras: { nome: 'Compras', tipo: 'lista' },
  contasPagar: { nome: 'Contas a pagar', tipo: 'lista' },
  clientes: { nome: 'Clientes', tipo: 'lista' },
  vendas: { nome: 'Vendas', tipo: 'lista' },
  lancamentos: { nome: 'Lançamentos do financeiro', tipo: 'lista' },
  recebiveis: { nome: 'A receber', tipo: 'lista' },
  taxas: { nome: 'Taxas do cartão', tipo: 'objeto' },
  caixas: { nome: 'Caixas do dia', tipo: 'lista' },
  avisosClientes: { nome: 'Avisos de clientes excluídos', tipo: 'lista' },
  cashback: { nome: 'Cashback', tipo: 'lista' },
  usosCashback: { nome: 'Usos do cashback', tipo: 'lista' },
  cupons: { nome: 'Cupons de retorno', tipo: 'lista' },
  contatos: { nome: 'Contatos com clientes', tipo: 'lista' },
  vales: { nome: 'Vales-troca', tipo: 'lista' },
  vendasAntigas: { nome: 'Vendas antigas (importadas)', tipo: 'lista' },
} as const satisfies Record<string, { nome: string; tipo: 'lista' | 'mapa' | 'objeto' }>;

export type AssuntoDaCopia = keyof typeof ASSUNTOS_DA_COPIA;
export const LISTA_ASSUNTOS_DA_COPIA = Object.keys(ASSUNTOS_DA_COPIA) as AssuntoDaCopia[];

export type DadosDaCopia = Record<AssuntoDaCopia, unknown>;

export interface CopiaDaLoja {
  formato: typeof FORMATO_DA_COPIA;
  versao: number;
  loja: { id: string; nome: string };
  /** ISO. */
  geradaEm: string;
  geradaPor: { id: string; nome: string } | null;
  /** Quantos registros de cada assunto (a prévia da restauração mostra). */
  contagem: Record<AssuntoDaCopia, number>;
  dados: DadosDaCopia;
  /** Só para consulta: não voltam na restauração. A equipe vai sem senha. */
  equipe: unknown[];
  historico: unknown[];
  /** SHA-256 (hexadecimal, minúsculo) de `textoParaConferencia`. */
  conferencia: string;
}

export type CopiaSemConferencia = Omit<CopiaDaLoja, 'conferencia'>;

export const MENSAGENS_DA_COPIA = {
  naoE: 'Este arquivo não é uma cópia de segurança do sistema.',
  grande: 'O arquivo passa do tamanho máximo de uma cópia de segurança (50 MB).',
  versaoNova: 'Esta cópia foi feita por uma versão mais nova do sistema. Atualize o sistema antes de restaurar.',
  alterada: 'O arquivo foi alterado depois de gerado (ou está corrompido). Por segurança, ele não pode ser restaurado.',
  precisaCpf: 'A cópia de segurança leva o CPF completo dos clientes: precisa também da função "Ver o CPF completo do cliente".',
} as const;

export const outraLoja = (nome: string) => `Esta cópia é da loja "${nome}". Só dá para restaurar a cópia na mesma loja.`;

/** Quem pode baixar a cópia: Dados e backup, e ver o CPF completo dos clientes (ela leva o CPF). */
export const podeBaixarCopia = (quem: QuemAcessa): boolean => pode(quem, 'dados') && pode(quem, 'clientes.cpf');

/**
 * JSON com as chaves de cada objeto em ordem: o mesmo conteúdo dá sempre o mesmo texto, seja qual for a ordem em
 * que as chaves foram gravadas ou lidas. Chave com undefined fica de fora, como no JSON.stringify.
 */
export function jsonCanonico(v: unknown): string {
  if (v === null || v === undefined || typeof v === 'function' || typeof v === 'symbol') return 'null';
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  const chaves = Object.keys(o)
    .filter((k) => o[k] !== undefined && typeof o[k] !== 'function' && typeof o[k] !== 'symbol')
    .sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`;
}

/** Quantos registros o assunto tem. */
export function contarAssunto(assunto: AssuntoDaCopia, valor: unknown): number {
  const tipo = ASSUNTOS_DA_COPIA[assunto].tipo;
  if (tipo === 'lista') return Array.isArray(valor) ? valor.length : 0;
  if (!ehObjeto(valor)) return 0;
  return tipo === 'mapa' ? Object.keys(valor).length : 1;
}

/** Vazio do assunto: lista vazia, ou null (o padrão da loja). */
const vazio = (assunto: AssuntoDaCopia) => (ASSUNTOS_DA_COPIA[assunto].tipo === 'lista' ? [] : null);

/** Monta a cópia (sem a conferência, que é calculada sobre o texto). Assunto que falta vai vazio. */
export function montarCopiaDaLoja(e: {
  loja: { id: string; nome: string };
  geradaEm: string;
  geradaPor: { id: string; nome: string } | null;
  dados: Partial<Record<AssuntoDaCopia, unknown>>;
  equipe?: readonly unknown[];
  historico?: readonly unknown[];
}): CopiaSemConferencia {
  const dados = Object.fromEntries(LISTA_ASSUNTOS_DA_COPIA.map((a) => [a, e.dados[a] ?? vazio(a)])) as DadosDaCopia;
  const contagem = Object.fromEntries(LISTA_ASSUNTOS_DA_COPIA.map((a) => [a, contarAssunto(a, dados[a])])) as Record<AssuntoDaCopia, number>;
  return {
    formato: FORMATO_DA_COPIA,
    versao: VERSAO_DA_COPIA,
    loja: { id: e.loja.id, nome: e.loja.nome },
    geradaEm: e.geradaEm,
    geradaPor: e.geradaPor ? { id: e.geradaPor.id, nome: e.geradaPor.nome } : null,
    contagem,
    dados,
    equipe: [...(e.equipe ?? [])],
    historico: [...(e.historico ?? [])],
  };
}

/** O texto sobre o qual a conferência (SHA-256) é calculada: tudo, menos a própria conferência. */
export function textoParaConferencia(c: CopiaSemConferencia | CopiaDaLoja): string {
  const { formato, versao, loja, geradaEm, geradaPor, contagem, dados, equipe, historico } = c;
  return jsonCanonico({ formato, versao, loja, geradaEm, geradaPor, contagem, dados, equipe, historico });
}

/** Total de registros da cópia (soma dos assuntos). */
export const totalDeRegistros = (contagem: Partial<Record<AssuntoDaCopia, number>>): number =>
  LISTA_ASSUNTOS_DA_COPIA.reduce((s, a) => s + (contagem[a] ?? 0), 0);

/** A prévia da restauração: cada assunto com quantos registros a cópia tem. */
export function resumoDaCopia(c: Pick<CopiaDaLoja, 'contagem'>): { assunto: AssuntoDaCopia; nome: string; quantidade: number }[] {
  return LISTA_ASSUNTOS_DA_COPIA.map((a) => ({ assunto: a, nome: ASSUNTOS_DA_COPIA[a].nome, quantidade: c.contagem[a] ?? 0 }));
}

const erro = (mensagem: string, campo = 'arquivo'): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });
const ehTexto = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const ehPessoa = (v: unknown): v is { id: string; nome: string } => ehObjeto(v) && ehTexto(v.id) && typeof v.nome === 'string' && v.nome.length <= 200;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Lê o arquivo da cópia e confere o formato, a versão, a loja e o jeito de cada assunto. A conferência (SHA-256) é
 * comparada por quem lê, sobre `textoDaConferencia` (o cálculo fica com a plataforma: o navegador ou o servidor).
 * `textoDaConferencia` é o do arquivo como ele veio: uma cópia feita antes de um assunto novo existir (sem ele) continua
 * valendo, e o assunto que falta volta vazio.
 */
export function lerCopiaDaLoja(texto: string, lojaId: string): Resultado<CopiaDaLoja & { textoDaConferencia: string }> {
  if (typeof texto !== 'string' || texto.trim() === '') return erro(MENSAGENS_DA_COPIA.naoE);
  if (texto.length > COPIA_MAX_BYTES) return erro(MENSAGENS_DA_COPIA.grande);
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);
  } catch {
    return erro(MENSAGENS_DA_COPIA.naoE);
  }
  if (!ehObjeto(bruto) || bruto.formato !== FORMATO_DA_COPIA) return erro(MENSAGENS_DA_COPIA.naoE);
  const c = bruto;
  if (typeof c.versao !== 'number' || !Number.isInteger(c.versao) || c.versao < 1) return erro(MENSAGENS_DA_COPIA.alterada);
  if (c.versao > VERSAO_DA_COPIA) return erro(MENSAGENS_DA_COPIA.versaoNova);
  if (!ehObjeto(c.loja) || !ehTexto(c.loja.id) || typeof c.loja.nome !== 'string') return erro(MENSAGENS_DA_COPIA.alterada);
  if (c.loja.id !== lojaId) return erro(outraLoja(c.loja.nome || c.loja.id));
  if (typeof c.geradaEm !== 'string' || !ISO.test(c.geradaEm) || Number.isNaN(Date.parse(c.geradaEm))) return erro(MENSAGENS_DA_COPIA.alterada);
  if (c.geradaPor !== null && !ehPessoa(c.geradaPor)) return erro(MENSAGENS_DA_COPIA.alterada);
  if (!ehObjeto(c.contagem) || !ehObjeto(c.dados) || !Array.isArray(c.equipe) || !Array.isArray(c.historico)) return erro(MENSAGENS_DA_COPIA.alterada);
  if (typeof c.conferencia !== 'string' || !/^[0-9a-f]{64}$/.test(c.conferencia)) return erro(MENSAGENS_DA_COPIA.alterada);

  const dados = {} as DadosDaCopia;
  const contagem = {} as Record<AssuntoDaCopia, number>;
  for (const a of LISTA_ASSUNTOS_DA_COPIA) {
    const v = c.dados[a] ?? vazio(a);
    const tipo = ASSUNTOS_DA_COPIA[a].tipo;
    const certo = tipo === 'lista' ? Array.isArray(v) && v.every(ehObjeto) : v === null || ehObjeto(v);
    if (!certo) return erro(MENSAGENS_DA_COPIA.alterada);
    dados[a] = v;
    contagem[a] = contarAssunto(a, v);
    // a contagem do arquivo tem de bater com o que ele leva
    if ((c.contagem[a] ?? 0) !== contagem[a]) return erro(MENSAGENS_DA_COPIA.alterada);
  }
  return {
    ok: true,
    valor: {
      formato: FORMATO_DA_COPIA,
      versao: c.versao,
      loja: { id: c.loja.id, nome: c.loja.nome },
      geradaEm: c.geradaEm,
      geradaPor: c.geradaPor === null ? null : { id: (c.geradaPor as { id: string }).id, nome: (c.geradaPor as { nome: string }).nome },
      contagem,
      dados,
      equipe: c.equipe as unknown[],
      historico: c.historico as unknown[],
      conferencia: c.conferencia,
      textoDaConferencia: jsonCanonico({
        formato: c.formato,
        versao: c.versao,
        loja: c.loja,
        geradaEm: c.geradaEm,
        geradaPor: c.geradaPor,
        contagem: c.contagem,
        dados: c.dados,
        equipe: c.equipe,
        historico: c.historico,
      }),
    },
  };
}
