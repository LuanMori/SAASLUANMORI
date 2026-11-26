// packages/core/test/perfil.test.ts — "Meu usuário": a foto do perfil e as entradas e saídas (pedido do Luan, 25/11/2026).
import { describe, expect, it } from 'vitest';
import { acessosDaPessoa, formatarDuracao, lerFotoDoPerfil, LIMITES_FOTO, MENSAGENS_FOTO, minutosDoAcesso, resumirAuditoria } from '../src';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('lerFotoDoPerfil', () => {
  it('aceita PNG, JPEG e WebP em data URL; vazio tira a foto', () => {
    expect(lerFotoDoPerfil(PNG)).toEqual({ ok: true, valor: PNG });
    expect(lerFotoDoPerfil('data:image/jpeg;base64,/9j/4AAQ')).toMatchObject({ ok: true });
    expect(lerFotoDoPerfil('data:image/webp;base64,UklGRg==')).toMatchObject({ ok: true });
    for (const vazio of [null, undefined, '']) expect(lerFotoDoPerfil(vazio)).toEqual({ ok: true, valor: null });
  });

  it('recusa outro formato (SVG, endereço da internet, texto) e foto grande demais', () => {
    for (const v of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://exemplo.com/foto.png', 'data:image/png;base64,<script>', 42]) {
      expect(lerFotoDoPerfil(v)).toEqual({ ok: false, erros: [{ campo: 'foto', mensagem: MENSAGENS_FOTO.formato }] });
    }
    const grande = `data:image/jpeg;base64,${'A'.repeat(LIMITES_FOTO.maxCaracteres)}`;
    expect(lerFotoDoPerfil(grande)).toEqual({ ok: false, erros: [{ campo: 'foto', mensagem: MENSAGENS_FOTO.grande }] });
  });
});

const entrou = (criadoEm: string) => ({ acao: 'sessao.entrou', criadoEm });
const saiu = (criadoEm: string, motivo?: string) => ({ acao: 'sessao.saiu', criadoEm, detalhes: motivo ? { motivo } : {} });

describe('acessosDaPessoa', () => {
  it('cada entrada com a saída seguinte, da mais recente para a mais antiga; a última sem saída é a de agora', () => {
    const r = acessosDaPessoa([
      entrou('2026-11-24T11:00:00.000Z'),
      saiu('2026-11-24T15:30:00.000Z'),
      entrou('2026-11-25T11:02:00.000Z'),
      saiu('2026-11-25T13:10:00.000Z', 'inatividade'),
      { acao: 'venda.desconto', criadoEm: '2026-11-25T13:20:00.000Z' }, // outras ações não entram
      entrou('2026-11-25T17:00:00.000Z'),
    ]);
    expect(r).toEqual([
      { entrada: '2026-11-25T17:00:00.000Z', saida: null, como: null, atual: true },
      { entrada: '2026-11-25T11:02:00.000Z', saida: '2026-11-25T13:10:00.000Z', como: 'inatividade', atual: false },
      { entrada: '2026-11-24T11:00:00.000Z', saida: '2026-11-24T15:30:00.000Z', como: 'sair', atual: false },
    ]);
  });

  it('duas entradas seguidas: a primeira ficou sem saída; saída sem entrada (a entrada saiu do histórico) também aparece', () => {
    const r = acessosDaPessoa([
      saiu('2026-11-20T12:00:00.000Z'),
      entrou('2026-11-21T11:00:00.000Z'),
      entrou('2026-11-22T11:00:00.000Z'),
      saiu('2026-11-22T12:00:00.000Z'),
    ]);
    expect(r).toEqual([
      { entrada: '2026-11-22T11:00:00.000Z', saida: '2026-11-22T12:00:00.000Z', como: 'sair', atual: false },
      { entrada: '2026-11-21T11:00:00.000Z', saida: null, como: null, atual: false },
      { entrada: null, saida: '2026-11-20T12:00:00.000Z', como: 'sair', atual: false },
    ]);
  });

  it('fora de ordem no histórico: organiza pelo horário; mostra só as mais recentes', () => {
    const registros = Array.from({ length: 40 }, (_, i) => [entrou(`2026-11-${String(i % 28 + 1).padStart(2, '0')}T10:${String(i).padStart(2, '0')}:00.000Z`)]).flat();
    const r = acessosDaPessoa([...registros].reverse(), 5);
    expect(r).toHaveLength(5);
    expect(r[0]!.atual).toBe(true);
    expect(r.map((a) => a.entrada)).toEqual([...r.map((a) => a.entrada)].sort().reverse());
    expect(acessosDaPessoa([])).toEqual([]);
  });

  it('tempo de cada acesso: até a saída, ou até agora na sessão de agora', () => {
    const agora = new Date('2026-11-25T18:30:00.000Z');
    expect(minutosDoAcesso({ entrada: '2026-11-25T11:02:00.000Z', saida: '2026-11-25T13:10:00.000Z', como: 'sair', atual: false }, agora)).toBe(128);
    expect(minutosDoAcesso({ entrada: '2026-11-25T17:00:00.000Z', saida: null, como: null, atual: true }, agora)).toBe(90);
    expect(minutosDoAcesso({ entrada: '2026-11-21T11:00:00.000Z', saida: null, como: null, atual: false }, agora)).toBeNull();
    expect(minutosDoAcesso({ entrada: null, saida: '2026-11-20T12:00:00.000Z', como: 'sair', atual: false }, agora)).toBeNull();
    expect([0, 45, 60, 128, 600].map(formatarDuracao)).toEqual(['menos de 1 min', '45 min', '1 h', '2 h 08 min', '10 h']);
  });
});

describe('histórico', () => {
  it('saída por falta de uso e a foto do perfil têm resumo', () => {
    expect(resumirAuditoria('sessao.saiu', { motivo: 'inatividade' })).toBe('por falta de uso');
    expect(resumirAuditoria('sessao.saiu', {})).toBe('');
    expect(resumirAuditoria('usuario.foto_alterada', { tirou: true })).toBe('tirou a foto');
    expect(resumirAuditoria('usuario.foto_alterada', {})).toBe('');
  });
});
