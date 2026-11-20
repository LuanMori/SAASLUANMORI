// apps/web/src/painel/regrasPendencias.ts
// Regras de pendência que JÁ DÁ para calcular com os dados que a Frente de caixa alimenta
// (estoque e cartão a receber). Iguais aos avisos do DaniPets V9.3.3.
//
// ⚠ PRONTAS, MAS DESLIGADAS: as pendências da Visão geral ainda estão "A DEFINIR"
// (docs/PENDENCIAS.md). Nada aqui é passado para o card até o Luan escolher o que entra.
// Para ligar: chamar estas funções com os dados da loja e passar o resultado para
// `TelaPainel` em `pendencias`.
//   - #6 estoque baixo (no mínimo ou abaixo) ........ média · todos · "Fazer pedido" (Compras)
//   - #7 estoque negativo ............................ alta  · gestor · "Ajustar" (Produtos e estoque)
//   - #10 recebimento de cartão vencido sem confirmar  média · gestor · "Confirmar" (Financeiro)
//   - #11 fiado vencido (passou do prazo de 30 dias) ... média · gestor · "Ver clientes" (Clientes)
//   - #12 clientes para lembrar hoje (módulo 7) ........ média · todos  · "Ver lista" (Clientes → Retorno)
import { formatarCentavos, liquidoAReceber, type Recebivel, recebiveisDeCartao, recebiveisDeFiado, recebiveisVencidos } from '@saas/core';
import type { PainelRetorno, Produto, SaldoEstoque } from '../api';
import { plural } from './formato';
import type { Pendencia } from './pendencias';

/** #6 e #7: estoque baixo (só produto ativo com mínimo definido) e estoque negativo. */
export function pendenciasDeEstoque(produtos: readonly Produto[], saldos: readonly SaldoEstoque[]): Pendencia[] {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const baixos: Pendencia[] = [];
  const negativos: Pendencia[] = [];
  for (const s of saldos) {
    const p = porId.get(s.produtoId);
    if (!p) continue;
    if (s.saldo < 0) {
      negativos.push({
        id: `estoque-negativo:${p.id}`,
        gravidade: 'alta',
        texto: `${p.nome}: saldo negativo (${s.saldo} un). Faça um ajuste de estoque ou confira as compras.`,
        acao: { rotulo: 'Ajustar', secao: 'produtos-e-estoque' },
        soGestor: true,
      });
    } else if (p.ativo && s.minimo && s.saldo <= s.minimo) {
      baixos.push({
        id: `estoque-baixo:${p.id}`,
        gravidade: 'media',
        texto: `${p.nome}: estoque baixo (${s.saldo} un; mínimo ${s.minimo} un).`,
        acao: { rotulo: 'Fazer pedido', secao: 'compras' },
      });
    }
  }
  return [...negativos, ...baixos];
}

/** #10: recebimentos de cartão que já deviam ter caído e ninguém confirmou. */
export function pendenciasDeCartao(recebiveis: readonly Recebivel[], hoje: string): Pendencia[] {
  const vencidos = recebiveisVencidos(recebiveisDeCartao(recebiveis), hoje);
  if (vencidos.length === 0) return [];
  const total = vencidos.reduce((s, r) => s + liquidoAReceber(r), 0);
  return [
    {
      id: `cartao-vencido:${hoje}`,
      gravidade: 'media',
      texto: `${plural(vencidos.length, 'recebimento de cartão vencido', 'recebimentos de cartão vencidos')} aguardando confirmação (${formatarCentavos(total)}).`,
      acao: { rotulo: 'Confirmar', secao: 'financeiro' },
      soGestor: true,
    },
  ];
}

/** #11: compras no fiado que passaram do prazo e o cliente ainda não pagou (no dia do vencimento ainda não). */
export function pendenciasDeFiado(recebiveis: readonly Recebivel[], hoje: string): Pendencia[] {
  const vencidos = recebiveisDeFiado(recebiveis).filter((r) => liquidoAReceber(r) > 0 && r.venceEm < hoje);
  if (vencidos.length === 0) return [];
  const clientes = new Set(vencidos.map((r) => r.cliente?.id ?? ''));
  const total = vencidos.reduce((s, r) => s + liquidoAReceber(r), 0);
  return [
    {
      id: `fiado-vencido:${hoje}`,
      gravidade: 'media',
      texto: `${plural(clientes.size, 'cliente', 'clientes')} com fiado vencido (${formatarCentavos(total)}).`,
      acao: { rotulo: 'Ver clientes', secao: 'clientes' },
      soGestor: true,
    },
  ];
}

/**
 * #12: clientes para lembrar hoje (DaniPets cliAlertas): sem comprar há N dias e cashback vencendo, da lista
 * de retorno (api.listarRetorno). Quem já foi lembrado no ciclo, foi adiado ou pediu "não incomodar" não entra.
 */
export function pendenciasDeRetorno(painel: Pick<PainelRetorno, 'hoje' | 'retorno' | 'cashback'>): Pendencia[] {
  const n = painel.retorno.length + painel.cashback.length;
  if (n === 0) return [];
  return [
    {
      id: `clientes-lembrar:${painel.hoje}`,
      gravidade: 'media',
      texto: `${plural(n, 'cliente para lembrar hoje', 'clientes para lembrar hoje')} (${painel.retorno.length} sem comprar, ${plural(painel.cashback.length, 'cashback vencendo', 'cashbacks vencendo')}).`,
      acao: { rotulo: 'Ver lista', secao: 'clientes' },
    },
  ];
}
