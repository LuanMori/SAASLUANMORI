// packages/core/src/comunicados.ts
// Ferramentas do Adm. Sup (Fase 2, módulo 13; pedido do Luan, 25/11/2026: "lançar atualizações"):
//   - ATUALIZAÇÕES DO SISTEMA: a versão nova e as novidades dela. Valem para todas as lojas. A versão mais nova aparece no
//     rodapé da barra lateral, e cada pessoa vê as novidades uma vez, até clicar em "Entendi";
//   - AVISOS PARA A EQUIPE: um recado do suporte para a equipe de UMA loja (ex.: "manutenção amanhã às 22h"). Aparece no
//     alto da tela de todos da loja enquanto está ativo, até cada pessoa clicar em "Entendi". Pode ter data para acabar,
//     e o Adm. Sup pode encerrar antes.
// Só o Adm. Sup publica (permissão 'suporte.ferramentas').
import { CONTROLE, ehObjeto } from './interno';
import type { ErroCampo, Resultado } from './resultado';
import type { Operador } from './venda';

export const LIMITES_COMUNICADOS = { versaoMax: 20, novidadesMax: 20, novidadeMax: 200, avisoMin: 3, avisoMax: 300 } as const;

/** A versão antes de qualquer atualização publicada. */
export const VERSAO_INICIAL = 'V0.1';

export interface Atualizacao {
  id: string;
  /** "V0.2". */
  versao: string;
  novidades: string[];
  publicadaEm: string;
  publicadaPor: Operador;
}

export type ImportanciaDoAviso = 'info' | 'atencao';

export interface AvisoDaEquipe {
  id: string;
  texto: string;
  importancia: ImportanciaDoAviso;
  /** AAAA-MM-DD: o último dia em que aparece (null = até encerrar). */
  ate: string | null;
  criadoEm: string;
  criadoPor: Operador;
  encerradoEm: string | null;
}

const linhaLimpa = (t: string) => t.normalize('NFC').replace(/\s+/g, ' ').trim();
const erro = (campo: string, mensagem: string): Resultado<never> => ({ ok: false, erros: [{ campo, mensagem }] });

/** "v1.2" ou "1.2" -> "V1.2"; null = não é uma versão (números separados por ponto). */
export function normalizarVersao(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/^v/i, '');
  return /^\d{1,4}(\.\d{1,4}){1,3}$/.test(t) ? `V${t}` : null;
}

/** Compara duas versões ("V0.10" vem depois de "V0.9"). */
export function compararVersoes(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map(Number);
  const pb = b.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** A versão de agora: a maior publicada (sem nenhuma, a inicial). */
export const versaoAtual = (atualizacoes: readonly Pick<Atualizacao, 'versao'>[]): string =>
  atualizacoes.reduce((maior, a) => (compararVersoes(a.versao, maior) > 0 ? a.versao : maior), VERSAO_INICIAL);

/** A atualização publicada: a versão nova (maior que a de agora) e as novidades, uma por linha. */
export function validarAtualizacao(entrada: unknown, ctx: { publicadas: readonly Pick<Atualizacao, 'versao'>[] }): Resultado<{ versao: string; novidades: string[] }> {
  if (!ehObjeto(entrada)) return erro('_', 'Envie a versão e as novidades.');
  const versao = normalizarVersao(entrada.versao);
  if (!versao) return erro('versao', 'Versão: use números separados por ponto, como V0.2 ou V1.0.3.');
  const atual = versaoAtual(ctx.publicadas);
  if (compararVersoes(versao, atual) <= 0) return erro('versao', `A versão nova precisa ser maior que a de agora (${atual}).`);
  const texto = typeof entrada.novidades === 'string' ? entrada.novidades : Array.isArray(entrada.novidades) ? entrada.novidades.join('\n') : '';
  const novidades = texto
    .split(/\r?\n/)
    .map((l) => linhaLimpa(l.replace(/^[-•*]\s*/, '')))
    .filter(Boolean);
  if (novidades.length === 0) return erro('novidades', 'Escreva pelo menos uma novidade (uma por linha).');
  if (novidades.length > LIMITES_COMUNICADOS.novidadesMax) return erro('novidades', `Até ${LIMITES_COMUNICADOS.novidadesMax} novidades por versão.`);
  const longa = novidades.find((n) => n.length > LIMITES_COMUNICADOS.novidadeMax || CONTROLE.test(n));
  if (longa) return erro('novidades', `Cada novidade pode ter até ${LIMITES_COMUNICADOS.novidadeMax} caracteres.`);
  return { ok: true, valor: { versao, novidades } };
}

/** O aviso para a equipe: o texto, a importância e o último dia (opcional, de hoje em diante). */
export function validarAviso(entrada: unknown, ctx: { hoje: string }): Resultado<{ texto: string; importancia: ImportanciaDoAviso; ate: string | null }> {
  if (!ehObjeto(entrada)) return erro('_', 'Envie o texto do aviso.');
  const erros: ErroCampo[] = [];
  const texto = typeof entrada.texto === 'string' ? linhaLimpa(entrada.texto) : '';
  if (texto.length < LIMITES_COMUNICADOS.avisoMin) erros.push({ campo: 'texto', mensagem: 'Escreva o aviso para a equipe.' });
  else if (texto.length > LIMITES_COMUNICADOS.avisoMax) erros.push({ campo: 'texto', mensagem: `O aviso pode ter até ${LIMITES_COMUNICADOS.avisoMax} caracteres.` });
  else if (CONTROLE.test(texto)) erros.push({ campo: 'texto', mensagem: 'O aviso contém caracteres inválidos.' });
  const importancia = entrada.importancia === undefined || entrada.importancia === null ? 'info' : entrada.importancia;
  if (importancia !== 'info' && importancia !== 'atencao') erros.push({ campo: 'importancia', mensagem: 'Escolha a importância: informação ou atenção.' });
  let ate: string | null = null;
  if (entrada.ate !== undefined && entrada.ate !== null && entrada.ate !== '') {
    if (typeof entrada.ate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada.ate) || Number.isNaN(Date.parse(`${entrada.ate}T12:00:00Z`))) {
      erros.push({ campo: 'ate', mensagem: 'O último dia do aviso é uma data (dia, mês e ano).' });
    } else if (entrada.ate < ctx.hoje) erros.push({ campo: 'ate', mensagem: 'O último dia do aviso não pode ser antes de hoje.' });
    else ate = entrada.ate;
  }
  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { texto, importancia: importancia as ImportanciaDoAviso, ate } };
}

export type SituacaoDoAviso = 'ativo' | 'venceu' | 'encerrado';

export const situacaoDoAviso = (a: Pick<AvisoDaEquipe, 'ate' | 'encerradoEm'>, hoje: string): SituacaoDoAviso =>
  a.encerradoEm ? 'encerrado' : a.ate && a.ate < hoje ? 'venceu' : 'ativo';

/** Os avisos que aparecem hoje para a pessoa: ativos e que ela ainda não fechou, os de atenção primeiro. */
export function avisosParaMostrar(avisos: readonly AvisoDaEquipe[], hoje: string, vistos: ReadonlySet<string>): AvisoDaEquipe[] {
  return avisos
    .filter((a) => situacaoDoAviso(a, hoje) === 'ativo' && !vistos.has(a.id))
    .sort((a, b) => Number(b.importancia === 'atencao') - Number(a.importancia === 'atencao') || b.criadoEm.localeCompare(a.criadoEm));
}

/** As novidades que a pessoa ainda não viu: só as da versão mais nova (as antigas não voltam). */
export function novidadesParaMostrar(atualizacoes: readonly Atualizacao[], vistos: ReadonlySet<string>): Atualizacao | null {
  const atual = versaoAtual(atualizacoes);
  const ultima = atualizacoes.find((a) => a.versao === atual);
  return ultima && !vistos.has(ultima.id) ? ultima : null;
}
