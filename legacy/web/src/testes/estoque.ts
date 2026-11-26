// apps/web/src/testes/estoque.ts — SÓ PARA OS TESTES.
// Produto novo começa sem estoque: dá entrada (como o Dono) em todos os produtos da loja.
import { criarApiLocal } from '../demo/apiLocal';

export async function darEstoque(lojaId: string, quantidade: number): Promise<void> {
  const dono = criarApiLocal({ lojaId, operador: { id: 'ana', nome: 'Ana', papel: 'dono' }, exemplos: false, atrasoMs: 0 });
  for (const p of await dono.listarProdutos()) await dono.lancarMovimentoEstoque({ produtoId: p.id, tipo: 'entrada', quantidade, motivo: '' });
}
