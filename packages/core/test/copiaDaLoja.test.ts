// packages/core/test/copiaDaLoja.test.ts — cópia de segurança da loja (módulo 13; DaniPets DAT-01 e DAT-05).
import { describe, expect, it } from 'vitest';
import {
  ASSUNTOS_DA_COPIA,
  COPIA_MAX_BYTES,
  type CopiaDaLoja,
  FORMATO_DA_COPIA,
  jsonCanonico,
  lerCopiaDaLoja,
  LISTA_ASSUNTOS_DA_COPIA,
  MENSAGENS_DA_COPIA,
  montarCopiaDaLoja,
  podeBaixarCopia,
  resumirAuditoria,
  resumoDaCopia,
  textoParaConferencia,
  totalDeRegistros,
  VERSAO_DA_COPIA,
} from '../src';

const CONFERENCIA = 'a'.repeat(64);

function copia(dados: Record<string, unknown> = {}): CopiaDaLoja {
  const corpo = montarCopiaDaLoja({
    loja: { id: 'loja-a', nome: 'Loja A' },
    geradaEm: '2026-11-25T17:32:10.123Z',
    geradaPor: { id: 'ana', nome: 'Ana' },
    dados: {
      produtos: [{ id: 'p1', nome: 'Ração' }, { id: 'p2', nome: 'Areia' }],
      minimos: { p1: 4, p2: 6 },
      configuracao: { dados: { nome: 'Loja A' }, regras: {} },
      ...dados,
    },
    equipe: [{ id: 'ana', nome: 'Ana', papel: 'dono' }],
    historico: [{ id: 'h1', acao: 'produto.criado' }],
  });
  return { ...corpo, conferencia: CONFERENCIA };
}

const ler = (c: unknown, lojaId = 'loja-a') => lerCopiaDaLoja(JSON.stringify(c), lojaId);
const mensagem = (r: ReturnType<typeof lerCopiaDaLoja>) => (r.ok ? '' : r.erros[0]!.mensagem);

describe('jsonCanonico', () => {
  it('a ordem das chaves não muda o texto; a ordem das listas muda', () => {
    expect(jsonCanonico({ b: 1, a: { d: [3, 1], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,1]},"b":1}');
    expect(jsonCanonico({ a: { c: 'x', d: [3, 1] }, b: 1 })).toBe(jsonCanonico({ b: 1, a: { d: [3, 1], c: 'x' } }));
    expect(jsonCanonico([1, 2])).not.toBe(jsonCanonico([2, 1]));
  });

  it('igual ao JSON.stringify no resto: undefined fica de fora, texto com aspas e acentos, número e null', () => {
    expect(jsonCanonico({ a: undefined, b: null, c: 'Ração "premium"\n', d: 1.5, e: -0, f: true })).toBe('{"b":null,"c":"Ração \\"premium\\"\\n","d":1.5,"e":0,"f":true}');
    expect(jsonCanonico([undefined, 1])).toBe('[null,1]');
    expect(jsonCanonico(undefined)).toBe('null');
    // chave que parece número: o JavaScript reordena no objeto, o canônico não depende disso
    expect(jsonCanonico(JSON.parse('{"10":1,"2":2,"a":3}'))).toBe('{"10":1,"2":2,"a":3}');
  });
});

describe('montarCopiaDaLoja', () => {
  it('leva todos os assuntos (o que falta vai vazio) e conta os registros de cada um', () => {
    const c = copia();
    expect(Object.keys(c.dados)).toEqual(LISTA_ASSUNTOS_DA_COPIA);
    expect(c.formato).toBe(FORMATO_DA_COPIA);
    expect(c.versao).toBe(VERSAO_DA_COPIA);
    expect(c.dados.vendas).toEqual([]);
    expect(c.dados.taxas).toBeNull();
    expect(c.contagem).toMatchObject({ produtos: 2, minimos: 2, configuracao: 1, taxas: 0, vendas: 0 });
    expect(totalDeRegistros(c.contagem)).toBe(5);
    expect(resumoDaCopia(c).slice(0, 2)).toEqual([
      { assunto: 'configuracao', nome: 'Dados e regras da loja', quantidade: 1 },
      { assunto: 'produtos', nome: 'Produtos', quantidade: 2 },
    ]);
    expect(resumoDaCopia(c)).toHaveLength(Object.keys(ASSUNTOS_DA_COPIA).length);
  });

  it('a conferência é calculada sobre tudo, menos ela mesma: muda se um dado muda e não muda com a ordem das chaves', () => {
    const c = copia();
    const texto = textoParaConferencia(c);
    expect(texto).not.toContain(CONFERENCIA);
    expect(texto).toContain('"historico":[{"acao":"produto.criado","id":"h1"}]');
    expect(textoParaConferencia({ ...c, conferencia: 'b'.repeat(64) })).toBe(texto);
    const reordenada = JSON.parse(JSON.stringify({ conferencia: c.conferencia, dados: c.dados, loja: c.loja, versao: c.versao, formato: c.formato, contagem: c.contagem, geradaPor: c.geradaPor, geradaEm: c.geradaEm, historico: c.historico, equipe: c.equipe }));
    expect(textoParaConferencia(reordenada)).toBe(texto);
    expect(textoParaConferencia(copia({ produtos: [{ id: 'p1', nome: 'Ração' }, { id: 'p2', nome: 'Areia!' }] }))).not.toBe(texto);
  });
});

describe('lerCopiaDaLoja', () => {
  it('lê a cópia da mesma loja (também com o BOM do Windows no começo)', () => {
    const c = copia();
    const r = ler(c);
    expect(r.ok && r.valor).toEqual(c);
    const comBom = lerCopiaDaLoja(`﻿${JSON.stringify(c, null, 2)}`, 'loja-a');
    expect(comBom.ok).toBe(true);
  });

  it('arquivo que não é cópia: vazio, texto qualquer, JSON de outro formato', () => {
    expect(mensagem(lerCopiaDaLoja('', 'loja-a'))).toBe(MENSAGENS_DA_COPIA.naoE);
    expect(mensagem(lerCopiaDaLoja('Nome;Preço\nRação;10', 'loja-a'))).toBe(MENSAGENS_DA_COPIA.naoE);
    expect(mensagem(ler({ ...copia(), formato: 'outro' }))).toBe(MENSAGENS_DA_COPIA.naoE);
    expect(mensagem(ler([copia()]))).toBe(MENSAGENS_DA_COPIA.naoE);
  });

  it('cópia de outra loja é recusada, com o nome dela', () => {
    expect(mensagem(ler(copia(), 'loja-b'))).toBe('Esta cópia é da loja "Loja A". Só dá para restaurar a cópia na mesma loja.');
  });

  it('versão mais nova do sistema: pede para atualizar', () => {
    expect(mensagem(ler({ ...copia(), versao: VERSAO_DA_COPIA + 1 }))).toBe(MENSAGENS_DA_COPIA.versaoNova);
  });

  it('partes que não batem: recusada como alterada', () => {
    const c = copia();
    const casos: unknown[] = [
      { ...c, versao: 0 },
      { ...c, geradaEm: 'ontem' },
      { ...c, geradaPor: 'Ana' },
      { ...c, conferencia: 'xyz' },
      { ...c, conferencia: undefined },
      { ...c, dados: [] },
      { ...c, equipe: null },
      { ...c, dados: { ...c.dados, produtos: { p1: {} } } },
      { ...c, dados: { ...c.dados, produtos: [{ id: 'p1' }, 'Areia'] } },
      { ...c, dados: { ...c.dados, taxas: [1, 2] } },
      // a contagem tem de bater com o que o arquivo leva
      { ...c, contagem: { ...c.contagem, produtos: 3 } },
      { ...c, dados: { ...c.dados, produtos: [] } },
    ];
    for (const caso of casos) expect(mensagem(ler(caso))).toBe(MENSAGENS_DA_COPIA.alterada);
  });

  it('assunto que falta no arquivo conta como vazio; arquivo grande demais é recusado antes de ler', () => {
    const c = copia();
    const { vales: _fora, ...semVales } = c.dados;
    const { vales: _zero, ...contagem } = c.contagem;
    const r = ler({ ...c, dados: semVales, contagem });
    expect(r.ok && r.valor.dados.vales).toEqual([]);
    expect(mensagem(lerCopiaDaLoja(' '.repeat(COPIA_MAX_BYTES + 1), 'loja-a'))).toBe(MENSAGENS_DA_COPIA.naoE);
    expect(mensagem(lerCopiaDaLoja(`{${' '.repeat(COPIA_MAX_BYTES)}}`, 'loja-a'))).toBe(MENSAGENS_DA_COPIA.grande);
  });
});

describe('quem baixa e o histórico', () => {
  it('baixar a cópia: Dados e backup e ver o CPF completo (ela leva o CPF)', () => {
    expect(podeBaixarCopia('dono')).toBe(true);
    expect(podeBaixarCopia('administrador')).toBe(true);
    expect(podeBaixarCopia('super_admin')).toBe(true);
    expect(podeBaixarCopia('vendedor')).toBe(false);
    expect(podeBaixarCopia({ papel: 'personalizado', permissoes: ['dados'] })).toBe(false);
    expect(podeBaixarCopia({ papel: 'personalizado', permissoes: ['dados', 'clientes', 'clientes.cpf'] })).toBe(true);
  });

  it('resumo no histórico: planilha exportada, cópia baixada e cópia restaurada', () => {
    expect(resumirAuditoria('dados.planilha_exportada', { assunto: 'Produtos', linhas: 7 })).toBe('Produtos • 7 linhas');
    expect(resumirAuditoria('dados.planilha_exportada', { assunto: 'Clientes', linhas: 1 })).toBe('Clientes • 1 linha');
    expect(resumirAuditoria('dados.copia_gerada', { registros: 120 })).toBe('120 registros');
    expect(resumirAuditoria('dados.copia_restaurada', { dia: '2026-11-20', registros: 98 })).toBe('cópia de 20/11/2026 • 98 registros');
    expect(resumirAuditoria('dados.copia_restaurada', { registros: -1 })).toBe('');
  });
});
