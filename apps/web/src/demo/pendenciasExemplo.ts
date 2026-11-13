// apps/web/src/demo/pendenciasExemplo.ts
// SÓ PARA A DEMONSTRAÇÃO: pendências de EXEMPLO para ver como o card fica com
// itens. Não são regras de verdade — as pendências ainda não foram definidas
// (docs/PENDENCIAS.md). Aparecem só ao marcar "Mostrar pendências de exemplo".
import type { Pendencia } from '../painel/pendencias';

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const diasAtras = (hoje: Date, n: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n);

export function pendenciasExemplo(hoje: Date = new Date()): Pendencia[] {
  return [
    {
      id: 'exemplo-caixa',
      gravidade: 'media',
      texto: 'Exemplo: o caixa de hoje não foi aberto: vendas ficam bloqueadas.',
      acao: { rotulo: 'Abrir caixa', secao: 'caixa-do-dia' },
    },
    {
      id: 'exemplo-validade',
      gravidade: 'alta',
      texto: `Exemplo: Ração Premium Cães Adultos 15 kg — lote com validade VENCIDA em ${dataBr(diasAtras(hoje, 3))} (compra de ${dataBr(diasAtras(hoje, 40))}) • cerca de 3 un ainda no estoque.`,
      acao: { rotulo: 'Ver produto', secao: 'produtos-e-estoque' },
    },
    {
      id: 'exemplo-estoque',
      gravidade: 'media',
      texto: 'Exemplo: Areia Sanitária 4 kg com estoque baixo (2 un; mínimo 5 un).',
      acao: { rotulo: 'Fazer pedido', secao: 'compras' },
    },
    {
      id: 'exemplo-conta',
      gravidade: 'alta',
      texto: `Exemplo: conta de energia vencida em ${dataBr(diasAtras(hoje, 1))}: R$ 380,00.`,
      acao: { rotulo: 'Ver contas', secao: 'financeiro' },
      soGestor: true,
    },
  ];
}
