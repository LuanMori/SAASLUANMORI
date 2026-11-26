// packages/core/test/recursosDaLoja.test.ts — ajustes da loja (Adm. Sup, módulo 13f): recursos ligados e desligados e
// limites de usuários e de produtos ativos.
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_PADRAO,
  conferirLimiteDaLoja,
  LISTA_RECURSOS_DA_LOJA,
  mensagemRecursoDesligado,
  mudancasDosAjustes,
  recursoLigado,
  resumirAuditoria,
  validarAjustes,
} from '../src';

const mensagens = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (r.ok ? [] : r.erros!.map((e) => e.mensagem));

describe('recursos da loja', () => {
  it('sem ajustes, tudo está ligado; desligado tem a mensagem para a tela', () => {
    expect(LISTA_RECURSOS_DA_LOJA).toEqual(['compras', 'financeiro', 'relatorios', 'fiado', 'fidelidade', 'vales']);
    expect(LISTA_RECURSOS_DA_LOJA.every((r) => recursoLigado(AJUSTES_PADRAO, r) && recursoLigado(null, r))).toBe(true);
    expect(recursoLigado({ desligados: ['fiado'] }, 'fiado')).toBe(false);
    expect(recursoLigado({ desligados: ['fiado'] }, 'vales')).toBe(true);
    expect(mensagemRecursoDesligado('vales')).toBe('Vale-troca: este recurso está desligado nesta loja. Fale com o suporte.');
  });

  it('valida: recursos conhecidos (sem repetir, na ordem da tela) e limites inteiros; vazio = sem limite', () => {
    expect(validarAjustes({ desligados: ['vales', 'fiado', 'vales'], limites: { usuariosAtivos: '5', produtosAtivos: '' } })).toEqual({
      ok: true,
      valor: { desligados: ['fiado', 'vales'], limites: { usuariosAtivos: 5, produtosAtivos: null } },
    });
    expect(validarAjustes({})).toEqual({ ok: true, valor: { desligados: [], limites: { usuariosAtivos: null, produtosAtivos: null } } });
    expect(mensagens(validarAjustes({ desligados: ['caixa'] }))).toEqual(['Recurso desconhecido: caixa.']);
    expect(mensagens(validarAjustes({ limites: { usuariosAtivos: 0 } }))).toEqual([
      'Usuários ativos: use um número inteiro de 1 a 1.000, ou deixe em branco para não ter limite.',
    ]);
    expect(mensagens(validarAjustes({ limites: { produtosAtivos: 2.5, outro: 1 } }))).toEqual([
      'Limite desconhecido.',
      'Produtos ativos: use um número inteiro de 1 a 100.000, ou deixe em branco para não ter limite.',
    ]);
    expect(mensagens(validarAjustes({ desligados: 'fiado', extra: true }))).toEqual(['Campo não permitido.', 'Envie a lista dos recursos desligados.']);
    expect(mensagens(validarAjustes(null))).toEqual(['Envie os recursos desligados e os limites da loja.']);
  });

  it('o limite: cabe até o número; acima dele (o suporte baixou depois), só não entra nenhum novo', () => {
    const ajustes = { limites: { usuariosAtivos: 3, produtosAtivos: 1000 } };
    expect(conferirLimiteDaLoja('usuariosAtivos', ajustes, 2)).toBeNull();
    expect(conferirLimiteDaLoja('usuariosAtivos', ajustes, 3)).toBe(
      'Esta loja pode ter até 3 usuários ativos (hoje: 3). Desative um usuário ou fale com o suporte para aumentar o limite.',
    );
    expect(conferirLimiteDaLoja('usuariosAtivos', ajustes, 5)).toMatch(/hoje: 5/);
    expect(conferirLimiteDaLoja('produtosAtivos', ajustes, 999)).toBeNull();
    expect(conferirLimiteDaLoja('produtosAtivos', ajustes, 1000)).toBe(
      'Esta loja pode ter até 1.000 produtos ativos (hoje: 1.000). Inative um produto ou fale com o suporte para aumentar o limite.',
    );
    expect(conferirLimiteDaLoja('produtosAtivos', ajustes, 990, 30)).toBe(
      'A planilha traz 30 produtos novos, e esta loja pode ter até 1.000 produtos ativos (hoje: 990). Fale com o suporte para aumentar o limite.',
    );
    expect(conferirLimiteDaLoja('produtosAtivos', ajustes, 990, 10)).toBeNull();
    expect(conferirLimiteDaLoja('produtosAtivos', AJUSTES_PADRAO, 50_000, 1)).toBeNull();
    expect(conferirLimiteDaLoja('usuariosAtivos', { limites: { usuariosAtivos: 1, produtosAtivos: null } }, 1)).toMatch(/^Esta loja pode ter até 1 usuário ativo /);
  });

  it('no histórico: o que ligou, desligou e os limites novos', () => {
    const antes = { desligados: ['compras' as const], limites: { usuariosAtivos: null, produtosAtivos: 500 } };
    const depois = { desligados: ['fiado' as const, 'vales' as const], limites: { usuariosAtivos: 5, produtosAtivos: null } };
    const d = mudancasDosAjustes(antes, depois);
    expect(d).toEqual({ desligou: ['fiado', 'vales'], ligou: ['compras'], usuariosAtivos: 5, produtosAtivos: null });
    expect(resumirAuditoria('suporte.ajustes_alterados', d)).toBe('desligou Fiado e Vale-troca • ligou Compras • usuários: até 5 • produtos: sem limite');
    expect(resumirAuditoria('suporte.ajustes_alterados', mudancasDosAjustes(depois, depois))).toBe('');
    expect(resumirAuditoria('suporte.ajustes_alterados', { desligou: ['fiado', 'fidelidade', 'vales'] })).toBe('desligou Fiado, Fidelidade e Vale-troca');
  });
});
