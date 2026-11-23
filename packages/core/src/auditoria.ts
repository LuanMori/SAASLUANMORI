// packages/core/src/auditoria.ts
// HISTÓRICO (auditoria) de quem fez o quê na loja — revisão de 18/11/2026, item 4.1, e Fase 2, módulo 1
// (DaniPets ACE-17: "auditoria de tudo: quem, quando, ação e detalhe").
//   - só acrescenta (nada é alterado nem apagado), gravado junto com a operação (tudo ou nada);
//   - SEM DADO PESSOAL nos detalhes: só números, valores e ids. O nome de quem fez, do cliente ou do produto
//     é buscado na hora de mostrar (assim a exclusão de dados da LGPD vale também para o histórico);
//   - o texto de cada ação e o resumo dos detalhes saem daqui, iguais no servidor e na demonstração.
import { formatarCentavos } from './dinheiro';
import { contaNaFrase, ehConta, nomeDaConta, type NomesDasContas } from './financeiro';
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
  'conta_pagar.criada': 'Conta a pagar lançada',
  // relatórios
  'relatorios.exportado': 'Relatório exportado para Excel',
  // caixa do dia
  'caixa.aberto': 'Abertura de caixa',
  'caixa.sangria': 'Sangria',
  'caixa.retirada': 'Retirada do dono (gaveta)',
  'caixa.suprimento': 'Suprimento',
  'caixa.fechado': 'Fechamento de caixa',
  'caixa.fechamento_automatico': 'Fechamento automático',
  'caixa.fechamento_verificado': 'Fechamento automático verificado',
  'caixa.diferenca_ciente': 'Ciência de diferença no fechamento',
  'caixa.fechamento_desfeito': 'Fechamento desfeito',
  'dia_fechado.liberado': 'Lançamento retroativo liberado',
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
  'cliente.excluido': 'Cliente excluído',
  'cliente.aviso_conferido': 'Exclusão de cliente conferida',
  'cliente.limite': 'Limite de fiado alterado',
  'cliente.mensagens': 'Autorização de mensagens',
  'cliente.nao_incomodar': 'Não incomodar',
  'cliente.cpf_visto': 'CPF completo visto',
  'cliente.fiado_recebido': 'Fiado recebido',
  'venda.fiado_liberado': 'Fiado liberado pelo Dono',
  // fidelidade (módulo 7)
  'cliente.lembrete_retorno': 'Lembrete de retorno',
  'cliente.aviso_cashback': 'Aviso de cashback',
  'cliente.lembrete_pagamento': 'Lembrete de pagamento',
  'cliente.lembrete_adiado': 'Lembrete adiado',
  'cliente.cupom_usado': 'Cupom de retorno usado',
  'cliente.cashback_nao_recuperado': 'Cashback não recuperado',
  // vale-troca (módulo 8)
  'vale.emitido': 'Vale-troca emitido',
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
  financeiro: 'categorias de despesa e nomes das contas',
  produtos: 'unidades de venda',
  clientes: 'campo extra do cliente',
};

const NOME_CAMPO_LOJA: Record<string, string> = { nome: 'nome', descricao: 'descrição', logo: 'logo' };


const NOME_CAMPO_PRODUTO: Record<string, string> = {
  nome: 'nome',
  codigoBarras: 'código de barras',
  precoCentavos: 'preço',
  marca: 'marca',
  pesoGramas: 'peso',
  unidade: 'unidade',
  fornecedorId: 'fornecedor',
};

const NOME_CAMPO_CLIENTE: Record<string, string> = {
  nome: 'nome',
  telefone: 'telefone',
  cpf: 'CPF',
  extra: 'campo extra',
  nascimento: 'nascimento',
  endereco: 'endereço',
  observacoes: 'observações',
  whatsapp: 'WhatsApp',
};

const NOME_FORMA: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito' };

const NOME_CAMPO_FORNECEDOR: Record<string, string> = { nome: 'nome', documento: 'documento', telefone: 'telefone', contato: 'contato', observacao: 'observação' };

/** O que foi lançado num dia com o caixa já fechado (liberação do Dono). */
const NOME_LANCAMENTO_RETROATIVO: Record<string, string> = { compra: 'compra', ajuste: 'ajuste de estoque', entrada: 'entrada de estoque', financeiro: 'lançamento financeiro' };

const diaBr = (dia: unknown) => (typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.split('-').reverse().join('/') : null);

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
/**
 * O resumo de uma linha do histórico. `nomesContas`: os nomes que a loja deu às contas ("Banco Itaú"); o histórico
 * guarda só o id da conta, e o nome sai na hora de mostrar (como o nome de quem fez).
 */
export function resumirAuditoria(
  acao: string,
  detalhes: unknown,
  nomeDoUsuario: (id: string) => string | null = () => null,
  nomesContas?: Partial<NomesDasContas> | null,
): string {
  const d = ehObjeto(detalhes) ? detalhes : {};
  const conta = (v: unknown): string | null => (ehConta(v) ? nomeDaConta(v, nomesContas) : null);
  const autorizou = typeof d.autorizadoPor === 'string' ? nomeDoUsuario(d.autorizadoPor) : null;
  const partes: (string | null)[] = [];
  switch (acao) {
    case 'usuario.criado': {
      const n = Array.isArray(d.permissoes) ? d.permissoes.length : 0;
      partes.push(papel(d.papel), d.papel === 'personalizado' && n > 0 ? `${n} ${n === 1 ? 'função' : 'funções'}` : null);
      break;
    }
    case 'usuario.alterado':
      if (papel(d.papelAntes) && papel(d.papelDepois)) partes.push(`papel: ${papel(d.papelAntes)} → ${papel(d.papelDepois)}`);
      if (Array.isArray(d.campos) && d.campos.includes('permissoes')) {
        const n = Array.isArray(d.permissoes) ? d.permissoes.length : null;
        partes.push(n === null ? 'funções do Personalizado' : `funções do Personalizado: ${n}`);
      }
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
      partes.push(dinheiro(d.valorCentavos), conta(d.conta));
      break;
    case 'relatorios.exportado': {
      const periodo = diaBr(d.de) || diaBr(d.ate) ? `${diaBr(d.de) ?? 'início'} a ${diaBr(d.ate) ?? 'hoje'}` : 'todo o período';
      const abas = typeof d.abas === 'number' && Number.isInteger(d.abas) && d.abas > 0 ? `${d.abas} ${d.abas === 1 ? 'aba' : 'abas'}` : null;
      partes.push(typeof d.assunto === 'string' && d.assunto ? d.assunto : null, periodo, abas);
      break;
    }
    case 'conta_pagar.criada':
      partes.push(dinheiro(d.valorCentavos), diaBr(d.vencimento) && `vence ${diaBr(d.vencimento)}`, typeof d.categoria === 'string' && d.categoria ? d.categoria : null);
      break;
    case 'fornecedor.alterado':
      partes.push(lista(d.campos, NOME_CAMPO_FORNECEDOR));
      break;
    case 'cliente.alterado':
      partes.push(lista(d.campos, NOME_CAMPO_CLIENTE));
      break;
    case 'cliente.limite':
      partes.push(dinheiro(d.de) && dinheiro(d.para) ? `${dinheiro(d.de)} → ${dinheiro(d.para)}` : null);
      break;
    case 'cliente.mensagens':
      partes.push(d.autorizou === true ? 'autorizou mensagens da loja' : d.autorizou === false ? 'cancelou a autorização de mensagens' : null);
      break;
    case 'cliente.nao_incomodar':
      partes.push(d.ativo === true ? 'saiu das listas de lembrete' : d.ativo === false ? 'voltou para as listas de lembrete' : null);
      break;
    case 'cliente.fiado_recebido': {
      const taxa = typeof d.taxaCentavos === 'number' && d.taxaCentavos > 0 ? dinheiro(d.taxaCentavos) : null;
      const troco = typeof d.trocoCentavos === 'number' && d.trocoCentavos > 0 ? dinheiro(d.trocoCentavos) : null;
      partes.push(
        dinheiro(d.valorCentavos),
        typeof d.forma === 'string' ? (NOME_FORMA[d.forma] ?? null) && `em ${NOME_FORMA[d.forma]}` : null,
        taxa && dinheiro(d.brutoCentavos) ? `cobrado ${dinheiro(d.brutoCentavos)} (taxa ${taxa})` : null,
        troco && `troco ${troco}`,
        diaBr(d.vencimento) && `vencimento ${diaBr(d.vencimento)}`,
      );
      break;
    }
    case 'financeiro.taxas': {
      const pct = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? `${String(Math.round(v * 100) / 100).replace('.', ',')}%` : null);
      partes.push(
        pct(d.debitoPct) && `débito ${pct(d.debitoPct)}`,
        pct(d.creditoPct) && `crédito ${pct(d.creditoPct)}`,
        typeof d.baixaAutomatica === 'boolean' ? (d.baixaAutomatica ? 'baixa automática' : 'baixa manual') : null,
      );
      break;
    }
    case 'cliente.lembrete_retorno':
    case 'cliente.aviso_cashback':
    case 'cliente.lembrete_pagamento': {
      const pct = typeof d.cupomPct === 'number' && Number.isFinite(d.cupomPct) ? `${String(Math.round(d.cupomPct * 100) / 100).replace('.', ',')}%` : null;
      partes.push(
        d.canal === 'whatsapp' ? 'Mensagem pelo WhatsApp' : d.canal === 'outro' ? 'Contato registrado sem mensagem' : null,
        pct && `cupom de ${pct}${diaBr(d.cupomVenceEm) ? ` até ${diaBr(d.cupomVenceEm)}` : ''}`,
      );
      break;
    }
    case 'cliente.lembrete_adiado':
      partes.push(diaBr(d.ate) && `volta para a lista em ${diaBr(d.ate)}`);
      break;
    case 'cliente.cupom_usado':
      partes.push(
        typeof d.pct === 'number' && Number.isFinite(d.pct) ? `${String(Math.round(d.pct * 100) / 100).replace('.', ',')}%` : null,
        numeroVenda(d.numero) && `na ${numeroVenda(d.numero)}`,
      );
      break;
    case 'cliente.cashback_nao_recuperado':
      partes.push(
        d.rotulo === 'cancelamento' ? 'Cancelamento' : d.rotulo === 'devolucao' ? 'Devolução' : null,
        numeroVenda(d.numero),
        dinheiro(d.valorCentavos) && `${dinheiro(d.valorCentavos)} do cashback desta compra já tinham sido usados ou venceram`,
      );
      break;
    case 'vale.emitido':
      partes.push(
        typeof d.codigo === 'string' && /^VT-\d{4,}-[A-Z0-9]{3}$/.test(d.codigo) ? d.codigo : null,
        dinheiro(d.valorCentavos),
        numeroVenda(d.numero) && `devolução da ${numeroVenda(d.numero)}`,
      );
      break;
    case 'venda.fiado_liberado':
      // quem liberou fica em `autorizadoPor`, mas o texto é "liberado por"
      partes.push(numeroVenda(d.numero), dinheiro(d.valorCentavos) && `${dinheiro(d.valorCentavos)} no fiado`, autorizou && `liberado por ${autorizou}`);
      return partes.filter((p): p is string => Boolean(p)).join(' • ');
    case 'caixa.aberto':
      partes.push(diaBr(d.dia), dinheiro(d.fundoCentavos) && `fundo de troco ${dinheiro(d.fundoCentavos)}`);
      break;
    case 'caixa.sangria':
      partes.push(dinheiro(d.valorCentavos) && `${dinheiro(d.valorCentavos)} da gaveta ${contaNaFrase('banco', nomesContas, 'para')}`);
      break;
    case 'caixa.retirada':
      partes.push(dinheiro(d.valorCentavos) && `${dinheiro(d.valorCentavos)} da gaveta`);
      break;
    case 'caixa.suprimento':
      partes.push(dinheiro(d.valorCentavos) && `${dinheiro(d.valorCentavos)} na gaveta`);
      break;
    case 'caixa.fechado': {
      const dif = typeof d.diferencaCentavos === 'number' && Number.isSafeInteger(d.diferencaCentavos) ? d.diferencaCentavos : null;
      partes.push(
        diaBr(d.dia),
        dinheiro(d.esperadoCentavos) && `esperado ${dinheiro(d.esperadoCentavos)}`,
        dinheiro(d.contadoCentavos) && `contado ${dinheiro(d.contadoCentavos)}`,
        dif === null ? null : dif === 0 ? 'sem diferença' : `${dif < 0 ? 'falta' : 'sobra'} de ${formatarCentavos(Math.abs(dif))} (ajuste ${contaNaFrase('caixa', nomesContas, 'em')})`,
      );
      break;
    }
    case 'caixa.fechamento_automatico':
      partes.push(diaBr(d.dia), 'sem contagem e sem ajuste');
      break;
    case 'caixa.diferenca_ciente': {
      const dif = typeof d.diferencaCentavos === 'number' && Number.isSafeInteger(d.diferencaCentavos) && d.diferencaCentavos !== 0 ? d.diferencaCentavos : null;
      partes.push(diaBr(d.dia), dif === null ? null : `${dif < 0 ? 'falta' : 'sobra'} de ${formatarCentavos(Math.abs(dif))}`);
      break;
    }
    case 'caixa.fechamento_verificado':
      partes.push(diaBr(d.dia), dinheiro(d.esperadoCentavos) && `esperado ${dinheiro(d.esperadoCentavos)}`, d.comObservacao === true ? 'com observação' : null);
      break;
    case 'caixa.fechamento_desfeito':
      partes.push(diaBr(d.dia), d.automatico === true ? 'era automático' : null);
      break;
    case 'dia_fechado.liberado':
      // quem liberou fica em `autorizadoPor` (o servidor já busca esse nome), mas o texto é "liberado por"
      partes.push(typeof d.oque === 'string' ? (NOME_LANCAMENTO_RETROATIVO[d.oque] ?? null) : null, diaBr(d.dia) && `data ${diaBr(d.dia)}`, autorizou && `liberado por ${autorizou}`);
      return partes.filter((p): p is string => Boolean(p)).join(' • ');
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
      partes.push(dinheiro(d.valorCentavos), conta(d.conta), typeof d.categoria === 'string' && d.categoria ? d.categoria : null);
      break;
    case 'financeiro.transferencia':
      partes.push(
        dinheiro(d.valorCentavos),
        conta(d.de) && conta(d.para) ? `${conta(d.de)} → ${conta(d.para)}` : null,
      );
      break;
    default:
      break;
  }
  if (autorizou) partes.push(`autorizado por ${autorizou}`);
  return partes.filter((p): p is string => Boolean(p)).join(' • ');
}
