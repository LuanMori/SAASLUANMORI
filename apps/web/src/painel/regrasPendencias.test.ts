// apps/web/src/painel/regrasPendencias.test.ts
// Regras prontas, mas DESLIGADAS (pendências "A DEFINIR"): aqui só se confere o que elas calculam. As do caixa
// (#1, #2, #3 e #16) já estão LIGADAS (pedido do Luan em 21 e 22/11/2026).
import type { Recebivel } from '@saas/core';
import { describe, expect, it } from 'vitest';
import type { Produto, SaldoEstoque } from '../api';
import { pendenciasDeCartao, pendenciasDeEstoque, pendenciasDeFiado, pendenciasDeRetorno, pendenciasDoCaixa } from './regrasPendencias';

const produto = (id: string, nome: string, ativo = true): Produto => ({
  id,
  codigoInterno: id,
  codigoBarras: null,
  nome,
  precoCentavos: 100,
  ativo,
  criadoEm: '2026-11-01T00:00:00Z',
  atualizadoEm: '2026-11-01T00:00:00Z',
});
const saldo = (produtoId: string, s: number, minimo: number | null): SaldoEstoque => ({ produtoId, saldo: s, minimo, situacao: 'ok' });
const txt = (t: string) => t.replace(/ /g, ' ');

describe('pendências de estoque (#6 e #7)', () => {
  it('negativo (urgente, só gestor) vem antes do estoque baixo; sem mínimo ou inativo não avisa baixo', () => {
    const produtos = [produto('a', 'Areia'), produto('b', 'Bola'), produto('c', 'Coleira'), produto('d', 'Desativado', false), produto('e', 'Sem mínimo')];
    const lista = pendenciasDeEstoque(produtos, [saldo('a', 2, 5), saldo('b', -1, null), saldo('c', 6, 5), saldo('d', 0, 5), saldo('e', 0, null), saldo('x', -3, null)]);
    expect(lista).toEqual([
      {
        id: 'estoque-negativo:b',
        gravidade: 'alta',
        texto: 'Bola: saldo negativo (-1 un). Faça um ajuste de estoque ou confira as compras.',
        acao: { rotulo: 'Ajustar', secao: 'produtos-e-estoque' },
        soGestor: true,
      },
      { id: 'estoque-baixo:a', gravidade: 'media', texto: 'Areia: estoque baixo (2 un; mínimo 5 un).', acao: { rotulo: 'Fazer pedido', secao: 'compras' } },
    ]);
  });
});

describe('pendência de cartão (#10)', () => {
  const recebivel = (venceEm: string, situacao: Recebivel['situacao'] = 'pendente'): Recebivel => ({
    id: venceEm,
    forma: 'debito',
    cliente: null,
    vendaId: 'v',
    vendaNumero: 1,
    criadoEm: '2026-11-10T12:00:00Z',
    venceEm,
    brutoCentavos: 10000,
    taxaCentavos: 150,
    estornadoBrutoCentavos: 0,
    estornadoTaxaCentavos: 0,
    situacao,
    recebimento: null,
  });

  it('soma os vencidos ainda pendentes; recebido, cancelado e a vencer não entram', () => {
    const [p] = pendenciasDeCartao([recebivel('2026-11-14'), recebivel('2026-11-15'), recebivel('2026-11-15', 'recebido'), recebivel('2026-12-01')], '2026-11-16');
    expect(p).toMatchObject({ gravidade: 'media', soGestor: true, acao: { rotulo: 'Confirmar', secao: 'financeiro' } });
    expect(txt(p!.texto)).toBe('2 recebimentos de cartão vencidos aguardando confirmação (R$ 197,00).');
    expect(pendenciasDeCartao([recebivel('2026-12-01')], '2026-11-16')).toEqual([]);
  });
});

describe('pendência de fiado (#11)', () => {
  const fiado = (id: string, cliente: string, venceEm: string, situacao: Recebivel['situacao'] = 'pendente'): Recebivel => ({
    id,
    forma: 'fiado',
    cliente: { id: cliente, nome: cliente },
    vendaId: id,
    vendaNumero: 1,
    criadoEm: '2026-10-10T12:00:00Z',
    venceEm,
    brutoCentavos: 5000,
    taxaCentavos: 0,
    estornadoBrutoCentavos: 0,
    estornadoTaxaCentavos: 0,
    situacao,
    recebimento: null,
  });

  it('conta os clientes com fiado vencido (no dia do vencimento ainda não); pago não entra; fiado não vira pendência de cartão', () => {
    const lista = [fiado('a', 'maria', '2026-11-10'), fiado('b', 'maria', '2026-11-12'), fiado('c', 'joao', '2026-11-15'), fiado('d', 'ana', '2026-11-16'), fiado('e', 'rui', '2026-11-01', 'recebido')];
    const [p] = pendenciasDeFiado(lista, '2026-11-16');
    expect(p).toMatchObject({ gravidade: 'media', soGestor: true, acao: { rotulo: 'Ver clientes', secao: 'clientes' } });
    expect(txt(p!.texto)).toBe('2 clientes com fiado vencido (R$ 150,00).');
    expect(pendenciasDeFiado([fiado('d', 'ana', '2026-11-16')], '2026-11-16')).toEqual([]);
    expect(pendenciasDeCartao(lista, '2026-11-16')).toEqual([]);
  });
});

describe('pendência de clientes para lembrar (#12)', () => {
  const cliente = { clienteId: 'm', nome: 'Maria', telefone: '41999998888', bloqueio: null };
  it('soma os sumidos e o cashback vencendo; lista vazia não vira pendência', () => {
    expect(pendenciasDeRetorno({ hoje: '2026-11-20', retorno: [], cashback: [] })).toEqual([]);
    const lista = pendenciasDeRetorno({
      hoje: '2026-11-20',
      retorno: [{ ...cliente, diasSemComprar: 41, ultimaCompraDia: '2026-10-10', ultimaCompraItens: 'Ração', cashbackCentavos: 0 }],
      cashback: [{ ...cliente, venceEm: '2026-11-25', valorCentavos: 350 }],
    });
    expect(lista).toEqual([
      {
        id: 'clientes-lembrar:2026-11-20',
        gravidade: 'media',
        texto: '2 clientes para lembrar hoje (1 sem comprar, 1 cashback vencendo).',
        acao: { rotulo: 'Ver lista', secao: 'clientes' },
      },
    ]);
  });
});


describe('pendências do caixa, ligadas (#1, #2, #3 e #16)', () => {
  const base = { hoje: '2026-11-22', estado: 'nao_aberto' as const, atrasado: null, aVerificar: null, diferencasAConferir: null };

  it('#1 caixa de hoje não aberto, para todos; aberto ou fechado, nada', () => {
    expect(pendenciasDoCaixa(base)).toEqual([
      { id: 'caixa-nao-aberto:2026-11-22', gravidade: 'media', texto: 'O caixa de hoje não foi aberto: vendas ficam bloqueadas.', acao: { rotulo: 'Abrir caixa', secao: 'caixa-do-dia' } },
    ]);
    expect(pendenciasDoCaixa({ ...base, estado: 'aberto' })).toEqual([]);
    expect(pendenciasDoCaixa({ ...base, estado: 'fechado' })).toEqual([]);
  });

  it('#2 dia anterior com o caixa aberto vem no lugar da #1 (é ele que precisa fechar antes)', () => {
    expect(pendenciasDoCaixa({ ...base, atrasado: '2026-11-21' })).toEqual([
      {
        id: 'caixa-dia-aberto:2026-11-21',
        gravidade: 'media',
        texto: 'Dia com caixa aberto e sem fechamento: 21/11/2026. Feche esse dia para abrir o caixa de hoje.',
        acao: { rotulo: 'Ir ao caixa', secao: 'caixa-do-dia' },
      },
    ]);
  });

  it('#3 diferença acima da tolerância (urgente, só o Dono) e #16 caixa fechado sozinho (gestor)', () => {
    const lista = pendenciasDoCaixa({
      ...base,
      estado: 'aberto',
      aVerificar: [{ caixaId: 'c2', dia: '2026-11-21', esperadoCentavos: 10000 }],
      diferencasAConferir: [
        { caixaId: 'c1', dia: '2026-11-20', diferencaCentavos: -2500, toleranciaCentavos: 1000, fechouPor: 'Bruno', autorizadoPor: 'Caio' },
        { caixaId: 'c0', dia: '2026-11-19', diferencaCentavos: 3000, toleranciaCentavos: 1000, fechouPor: 'Caio', autorizadoPor: null },
      ],
    });
    expect(lista.map((p) => [p.id, p.gravidade, txt(p.texto), p.acao?.rotulo, p.soDono ?? false, p.soGestor ?? false])).toEqual([
      ['caixa-diferenca:c1', 'alta', 'Fechamento de 20/11/2026 com falta de R$ 25,00, acima da tolerância de R$ 10,00 (fechou: Bruno • autorizou: Caio).', 'Conferir', true, false],
      ['caixa-diferenca:c0', 'alta', 'Fechamento de 19/11/2026 com sobra de R$ 30,00, acima da tolerância de R$ 10,00 (fechou: Caio).', 'Conferir', true, false],
      ['caixa-automatico:2026-11-21', 'media', 'O caixa de 21/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta (esperado R$ 100,00). Deseja verificar?', 'Verificar', false, true],
    ]);
  });
});
