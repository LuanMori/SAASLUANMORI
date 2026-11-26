// apps/web/src/painel/nomesDasContas.ts
// Os nomes que a loja deu às contas do Financeiro ("Banco Itaú" no lugar de "Conta bancária"; pedido do Luan,
// 23/11/2026). O painel lê das regras da loja (regras.financeiro.nomesContas) e passa para todas as telas; fora
// do painel (testes de uma tela só), valem os nomes padrão.
import { NOME_CONTA, type NomesDasContas } from '@saas/core';
import { createContext, useContext } from 'react';

export const ContextoNomesDasContas = createContext<NomesDasContas>(NOME_CONTA);

/** Os nomes das contas da loja (padrão: Caixa físico e Conta bancária). */
export const usarNomesDasContas = (): NomesDasContas => useContext(ContextoNomesDasContas);
