// packages/core/test/comunicados.test.ts — atualizações do sistema e avisos para a equipe (Adm. Sup, módulo 13).
import { describe, expect, it } from 'vitest';
import {
  type AvisoDaEquipe,
  avisosParaMostrar,
  compararVersoes,
  normalizarVersao,
  novidadesParaMostrar,
  resumirAuditoria,
  situacaoDoAviso,
  validarAtualizacao,
  validarAviso,
  VERSAO_INICIAL,
  versaoAtual,
} from '../src';

const POR = { id: 'adm-sup', nome: 'Suporte' };
const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (r.ok ? '' : r.erros![0]!.mensagem);

describe('versões', () => {
  it('normaliza, compara (V0.10 depois de V0.9) e acha a de agora', () => {
    expect(['v1.2', '0.2', 'V1.0.3', ' 2.0 '].map(normalizarVersao)).toEqual(['V1.2', 'V0.2', 'V1.0.3', 'V2.0']);
    expect(['1', 'V', 'beta', '1..2', 7].map(normalizarVersao)).toEqual([null, null, null, null, null]);
    expect(compararVersoes('V0.10', 'V0.9')).toBeGreaterThan(0);
    expect(compararVersoes('V1.0', 'V1.0.0')).toBe(0);
    expect(versaoAtual([])).toBe(VERSAO_INICIAL);
    expect(versaoAtual([{ versao: 'V0.9' }, { versao: 'V0.10' }, { versao: 'V0.2' }])).toBe('V0.10');
  });

  it('a atualização: versão maior que a de agora e as novidades, uma por linha (com ou sem marcador)', () => {
    expect(validarAtualizacao({ versao: '0.2', novidades: '- Aba Meu usuário\n\n• Importar planilhas\n  Vendas antigas  ' }, { publicadas: [] })).toEqual({
      ok: true,
      valor: { versao: 'V0.2', novidades: ['Aba Meu usuário', 'Importar planilhas', 'Vendas antigas'] },
    });
    expect(mensagem(validarAtualizacao({ versao: 'V0.1', novidades: 'x' }, { publicadas: [] }))).toBe('A versão nova precisa ser maior que a de agora (V0.1).');
    expect(mensagem(validarAtualizacao({ versao: 'V0.3', novidades: 'x' }, { publicadas: [{ versao: 'V0.4' }] }))).toBe('A versão nova precisa ser maior que a de agora (V0.4).');
    expect(mensagem(validarAtualizacao({ versao: 'nova', novidades: 'x' }, { publicadas: [] }))).toMatch(/^Versão: use números/);
    expect(mensagem(validarAtualizacao({ versao: 'V0.2', novidades: ' \n ' }, { publicadas: [] }))).toBe('Escreva pelo menos uma novidade (uma por linha).');
    expect(mensagem(validarAtualizacao({ versao: 'V0.2', novidades: 'a'.repeat(201) }, { publicadas: [] }))).toMatch(/até 200 caracteres/);
  });
});

describe('avisos para a equipe', () => {
  const aviso = (a: Partial<AvisoDaEquipe> & Pick<AvisoDaEquipe, 'id'>): AvisoDaEquipe => ({
    texto: 'Manutenção amanhã às 22h',
    importancia: 'info',
    ate: null,
    criadoEm: '2026-11-25T12:00:00.000Z',
    criadoPor: POR,
    encerradoEm: null,
    ...a,
  });

  it('valida o texto, a importância e o último dia (de hoje em diante)', () => {
    expect(validarAviso({ texto: '  Manutenção   amanhã ', importancia: 'atencao', ate: '2026-11-26' }, { hoje: '2026-11-25' })).toEqual({
      ok: true,
      valor: { texto: 'Manutenção amanhã', importancia: 'atencao', ate: '2026-11-26' },
    });
    expect(validarAviso({ texto: 'Olá a todos' }, { hoje: '2026-11-25' })).toMatchObject({ ok: true, valor: { importancia: 'info', ate: null } });
    expect(mensagem(validarAviso({ texto: 'oi' }, { hoje: '2026-11-25' }))).toBe('Escreva o aviso para a equipe.');
    expect(mensagem(validarAviso({ texto: 'a'.repeat(301) }, { hoje: '2026-11-25' }))).toMatch(/até 300/);
    expect(mensagem(validarAviso({ texto: 'Aviso', ate: '2026-11-24' }, { hoje: '2026-11-25' }))).toBe('O último dia do aviso não pode ser antes de hoje.');
    expect(mensagem(validarAviso({ texto: 'Aviso', importancia: 'urgente' }, { hoje: '2026-11-25' }))).toMatch(/importância/);
  });

  it('aparece enquanto ativo e até a pessoa fechar; os de atenção primeiro', () => {
    const avisos = [
      aviso({ id: 'a1' }),
      aviso({ id: 'a2', importancia: 'atencao', criadoEm: '2026-11-24T12:00:00.000Z' }),
      aviso({ id: 'a3', ate: '2026-11-24' }),
      aviso({ id: 'a4', encerradoEm: '2026-11-25T13:00:00.000Z' }),
    ];
    expect(avisosParaMostrar(avisos, '2026-11-25', new Set()).map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(avisosParaMostrar(avisos, '2026-11-25', new Set(['a2'])).map((a) => a.id)).toEqual(['a1']);
    expect(avisos.map((a) => situacaoDoAviso(a, '2026-11-25'))).toEqual(['ativo', 'ativo', 'venceu', 'encerrado']);
  });

  it('as novidades: só as da versão mais nova, até a pessoa ver', () => {
    const atualizacoes = [
      { id: 'u2', versao: 'V0.3', novidades: ['b'], publicadaEm: '2026-11-25T12:00:00.000Z', publicadaPor: POR },
      { id: 'u1', versao: 'V0.2', novidades: ['a'], publicadaEm: '2026-11-20T12:00:00.000Z', publicadaPor: POR },
    ];
    expect(novidadesParaMostrar(atualizacoes, new Set())?.id).toBe('u2');
    expect(novidadesParaMostrar(atualizacoes, new Set(['u2']))).toBeNull();
    expect(novidadesParaMostrar([], new Set())).toBeNull();
  });

  it('resumo no histórico', () => {
    expect(resumirAuditoria('suporte.atualizacao_publicada', { versao: 'V0.2', novidades: 3 })).toBe('V0.2 • 3 novidades');
    expect(resumirAuditoria('suporte.aviso_publicado', { importancia: 'atencao', ate: '2026-11-30' })).toBe('atenção • até 30/11/2026');
  });
});
