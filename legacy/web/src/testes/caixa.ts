// apps/web/src/testes/caixa.ts — SÓ PARA OS TESTES.
// Desde o módulo 5 (Caixa do dia), a Frente de caixa só vende com o caixa de hoje aberto, como no DaniPets.
// Os testes que tratam de outra coisa (estoque, clientes, relatórios...) usam esta API, que abre o caixa do
// dia sozinha antes de vender, devolver ou receber em dinheiro — como a pessoa faria na aba Caixa do dia. Os
// testes do próprio caixa usam a API sem este atalho.
import type { ApiPainel } from '../api';

type ApiQueVende = Pick<ApiPainel, 'abrirCaixa' | 'criarVenda' | 'devolverItens' | 'lerSituacaoDoCaixa' | 'receberRecebivel'>;

export function comCaixaAberto<T extends ApiQueVende>(api: T, fundoCentavos = 0): T {
  const garantirCaixa = async () => {
    const s = await api.lerSituacaoDoCaixa();
    if (s.estado === 'nao_aberto') await api.abrirCaixa({ fundoCentavos });
  };
  return {
    ...api,
    criarVenda: async (dados: Parameters<ApiQueVende['criarVenda']>[0]) => {
      await garantirCaixa();
      return api.criarVenda(dados);
    },
    devolverItens: async (vendaId: string, pedido: Parameters<ApiQueVende['devolverItens']>[1]) => {
      await garantirCaixa();
      return api.devolverItens(vendaId, pedido);
    },
    receberRecebivel: async (id: string, conta: Parameters<ApiQueVende['receberRecebivel']>[1]) => {
      if (conta === 'caixa') await garantirCaixa();
      return api.receberRecebivel(id, conta);
    },
  };
}
