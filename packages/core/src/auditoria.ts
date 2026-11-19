// packages/core/src/auditoria.ts
// HISTÓRICO (auditoria) de quem fez o quê na loja — revisão de 18/11/2026, item 4.1, e Fase 2, módulo 1
// (DaniPets ACE-17: "auditoria de tudo: quem, quando, ação e detalhe").
//   - só acrescenta (nada é alterado nem apagado), gravado junto com a operação (tudo ou nada);
//   - SEM DADO PESSOAL nos detalhes: só números, valores e ids. O nome de quem fez, do cliente ou do produto
//     é buscado na hora de mostrar (assim a exclusão de dados da LGPD vale também para o histórico);
//   - o texto de cada ação e o resumo dos detalhes saem daqui, iguais no servidor e na demonstração.
import { formatarCentavos } from './dinheiro';
import { ehObjeto } from './interno';
import { ehPapelDeLoja, NOME_PAPEL } from './papeis';
import { formatarQuantidade, unidadeDe } from './quantidade';

/** Ações registradas no histórico, com o texto que aparece na tela (nomes do DaniPets V9.3.3). */
export const ACOES_AUDITORIA = {
  // acesso
  'sessao.entrou': 'Entrou no sistema',
  'sessao.saiu': 'Saiu do sistema',
  'sessao.senha_errada': 'Senha errada',
  'sessao.bloqueado': 'Bloqueado por senhas erradas',
  // usuários
  'usuario.criado': 'Usuário criado',
  'usuario.alterado': 'Usuário alterado',
  'usuario.desativado': 'Usuário desativado',
  'usuario.reativado': 'Usuário reativado',
  'usuario.senha_redefinida': 'Senha redefinida pelo Dono ou Administrador',
  'usuario.senha_trocada': 'Trocou a própria senha',
  'usuario.dados_excluidos': 'Dados do usuário excluídos (LGPD)',
  // loja
  'loja.dados_alterados': 'Dados da loja alterados',
  'loja.regras_alteradas': 'Regras da loja alteradas',
  // vendas (a venda em si já guarda quem vendeu; o histórico registra o que precisa de atenção)
  'venda.desconto': 'Desconto na venda',
  'venda.cancelada': 'Venda cancelada',
  'venda.devolucao': 'Devolução de venda',
  // produtos e estoque
  'produto.criado': 'Produto cadastrado',
  'produto.alterado': 'Produto alterado',
  'produto.preco_alterado': 'Preço alterado',
  'produto.inativado': 'Produto inativado',
  'produto.reativado': 'Produto reativado',
  'produto.excluido': 'Produto excluído',
  'estoque.entrada': 'Entrada de estoque',
  'estoque.ajuste': 'Ajuste de estoque',
  'estoque.minimo': 'Estoque mínimo alterado',
  // compras e contas a pagar
  'compra.registrada': 'Compra registrada',
  'compra.estornada': 'Compra estornada',
  'compra.lote_baixado': 'Baixa de lote (validade)',
  'conta_pagar.paga': 'Conta paga',
  // fornecedores
  'fornecedor.cadastrado': 'Fornecedor cadastrado',
  'fornecedor.alterado': 'Fornecedor alterado',
  'fornecedor.desativado': 'Fornecedor desativado',
  'fornecedor.reativado': 'Fornecedor reativado',
  // clientes
  'cliente.cadastrado': 'Cliente cadastrado',
  'cliente.alterado': 'Cadastro do cliente alterado',
  'cliente.desativado': 'Cliente desativado',
  'cliente.reativado': 'Cliente reativado',
  'cliente.dados_excluidos': 'Dados do cliente excluídos (LGPD)',
  // financeiro
  'financeiro.entrada': 'Entrada lançada',
  'financeiro.despesa': 'Despesa lançada',
  'financeiro.retirada': 'Retirada do dono',
  'financeiro.transferencia': 'Transferência entre contas',
  'financeiro.saldo_inicial': 'Saldo inicial',
  'financeiro.recebimento': 'Recebimento confirmado',
  'financeiro.taxas': 'Taxas de cartão alteradas',
} as const;

export type AcaoAuditoria = keyof typeof ACOES_AUDITORIA;

export const ehAcaoAuditoria = (valor: unknown): valor is AcaoAuditoria => typeof valor === 'string' && Object.hasOwn(ACOES_AUDITORIA, valor);

/** Nomes das partes das regras da loja (para o resumo "Regras da loja alteradas: fiado, cashback"). */
const NOME_SECAO_REGRAS: Record<string, string> = {
  venda: 'desconto sem senha',
  caixa: 'caixa',
  fiado: 'fiado',
  cashback: 'cashback',
  retorno: 'cupom de retorno',
  mensagens: 'mensagens',
  estoque: 'motivos de ajuste',
  financeiro: 'categorias de despesa',
  produtos: 'unidades de venda',
  clientes: 'campo extra do cliente',
};

const NOME_CAMPO_LOJA: Record<string, string> = { nome: 'nome', descricao: 'descrição', logo: 'logo' };

const NOME_CONTA_CURTO: Record<string, string> = { caixa: 'Caixa físico', banco: 'Conta bancária' };

const NOME_CAMPO_PRODUTO: Record<string, string> = {
  nome: 'nome',
  codigoBarras: 'código de barras',
  precoCentavos: 'preço',
  marca: 'marca',
  pesoGramas: 'peso',
  unidade: 'unidade',
  fornecedorId: 'fornecedor',
};

const NOME_CAMPO_FORNECEDOR: Record<string, string> = { nome: 'nome', documento: 'documento', telefone: 'telefone', contato: 'contato', observacao: 'observação' };

const numeroVenda = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 0 ? `venda nº ${String(n).padStart(5, '0')}` : null);
const dinheiro = (c: unknown) => (typeof c === 'number' && Number.isSafeInteger(c) ? formatarCentavos(c) : null);
const papel = (p: unknown) => (ehPapelDeLoja(p) ? NOME_PAPEL[p] : null);
const lista = (v: unknown, nomes: Record<string, string>) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => nomes[x] ?? x)
        .join(', ') || null
    : null;

/**
 * Resumo dos detalhes de uma linha do histórico ("venda nº 00012 • R$ 5,00 • autorizado por Ana").
 * `nomeDoUsuario` resolve o id de quem autorizou (null = não achou: não aparece). '' = sem resumo.
 */
export function resumirAuditoria(acao: string, detalhes: unknown, nomeDoUsuario: (id: string) => string | null = () => null): string {
  const d = ehObjeto(detalhes) ? detalhes : {};
  const autorizou = typeof d.autorizadoPor === 'string' ? nomeDoUsuario(d.autorizadoPor) : null;
  const partes: (string | null)[] = [];
  switch (acao) {
    case 'usuario.criado':
      partes.push(papel(d.papel));
      break;
    case 'usuario.alterado':
      if (papel(d.papelAntes) && papel(d.papelDepois)) partes.push(`papel: ${papel(d.papelAntes)} → ${papel(d.papelDepois)}`);
      break;
    case 'loja.dados_alterados':
      partes.push(lista(d.campos, NOME_CAMPO_LOJA));
      break;
    case 'loja.regras_alteradas':
      partes.push(lista(d.secoes, NOME_SECAO_REGRAS));
      break;
    case 'venda.desconto':
      partes.push(numeroVenda(d.numero), dinheiro(d.descontoCentavos) && `${dinheiro(d.descontoCentavos)} de desconto`, d.brinde === true ? 'com brinde' : null);
      break;
    case 'venda.cancelada':
    case 'venda.devolucao':
      partes.push(numeroVenda(d.numero), dinheiro(d.valorCentavos));
      break;
    case 'produto.criado':
      partes.push(typeof d.codigoInterno === 'string' ? `código ${d.codigoInterno}` : null);
      break;
    case 'produto.alterado':
      partes.push(lista(d.campos, NOME_CAMPO_PRODUTO));
      break;
    case 'produto.preco_alterado':
      partes.push(dinheiro(d.de) && dinheiro(d.para) ? `${dinheiro(d.de)} → ${dinheiro(d.para)}` : null);
      break;
    case 'compra.registrada':
      partes.push(
        typeof d.numero === 'number' ? `compra nº ${d.numero}` : null,
        typeof d.notaFiscal === 'string' && d.notaFiscal ? `NF ${d.notaFiscal}` : null,
        dinheiro(d.totalCentavos),
        d.pagamento === 'avista' ? 'à vista' : d.pagamento === 'aprazo' ? 'a prazo' : null,
      );
      break;
    case 'compra.estornada':
      partes.push(typeof d.numero === 'number' ? `compra nº ${d.numero}` : null, dinheiro(d.valorCentavos));
      break;
    case 'compra.lote_baixado': {
      const q = typeof d.quantidade === 'number' && Number.isInteger(d.quantidade) ? d.quantidade : null;
      partes.push(q === null ? null : q === 0 ? 'o lote já tinha acabado' : `-${formatarQuantidade(q, unidadeDe(d.unidade))} vencido`);
      break;
    }
    case 'conta_pagar.paga':
      partes.push(dinheiro(d.valorCentavos), typeof d.conta === 'string' ? (NOME_CONTA_CURTO[d.conta] ?? null) : null);
      break;
    case 'fornecedor.alterado':
      partes.push(lista(d.campos, NOME_CAMPO_FORNECEDOR));
      break;
    case 'produto.excluido':
      partes.push(typeof d.nome === 'string' ? d.nome : null, typeof d.codigo === 'string' ? `código ${d.codigo}` : null);
      break;
    case 'estoque.entrada':
    case 'estoque.ajuste': {
      const q = typeof d.quantidade === 'number' && Number.isInteger(d.quantidade) ? d.quantidade : null;
      const u = unidadeDe(d.unidade);
      partes.push(
        q === null ? null : `${q > 0 ? '+' : ''}${formatarQuantidade(q, u)}`,
        typeof d.motivo === 'string' && d.motivo ? d.motivo : null,
        typeof d.observacao === 'string' && d.observacao ? d.observacao : null,
      );
      break;
    }
    case 'estoque.minimo':
      partes.push(typeof d.minimo === 'number' && Number.isInteger(d.minimo) ? `mínimo ${formatarQuantidade(d.minimo, unidadeDe(d.unidade))}` : 'sem aviso de estoque baixo');
      break;
    case 'financeiro.entrada':
    case 'financeiro.despesa':
    case 'financeiro.retirada':
    case 'financeiro.saldo_inicial':
    case 'financeiro.recebimento':
      partes.push(dinheiro(d.valorCentavos), typeof d.conta === 'string' ? (NOME_CONTA_CURTO[d.conta] ?? null) : null, typeof d.categoria === 'string' && d.categoria ? d.categoria : null);
      break;
    case 'financeiro.transferencia':
      partes.push(
        dinheiro(d.valorCentavos),
        typeof d.de === 'string' && typeof d.para === 'string' && NOME_CONTA_CURTO[d.de] && NOME_CONTA_CURTO[d.para] ? `${NOME_CONTA_CURTO[d.de]} → ${NOME_CONTA_CURTO[d.para]}` : null,
      );
      break;
    default:
      break;
  }
  if (autorizou) partes.push(`autorizado por ${autorizou}`);
  return partes.filter((p): p is string => Boolean(p)).join(' • ');
}
