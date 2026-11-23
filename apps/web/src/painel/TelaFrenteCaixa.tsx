// apps/web/src/painel/TelaFrenteCaixa.tsx
// Frente de caixa no formato do DaniPets V9.3.3 (tela cheia, sem a barra lateral):
//   esquerda: uma barra só para o produto (pedido do Luan, 23/11/2026): bipe o código ("3*código" = 3 unidades)
//             ou digite o nome e escolha na lista (F3 volta para ela; as setas andam na lista); fita de itens
//             (quantidade, desconto, remover) e resumo (itens, produtos, descontos, total);
//   direita:  ÚLTIMO ITEM, TOTAL A PAGAR, formas de pagamento com atalho (F4 Dinheiro, F8 Pix,
//             F9 Débito, F10 Crédito), dinheiro com valor recebido e TROCO (calculado na hora; atalhos
//             "Exato" e quantias redondas; Enter no valor recebido finaliza), dividir pagamento,
//             FINALIZAR (F2);
// A tela se ajusta ao tamanho da janela (estilos.css, "caixa na altura da tela"): tudo fica visível
// sem rolar a página, e quem rola é só a lista de itens.
//   rodapé:   teclas, Devolução / cancelamento e Limpar venda.
// Cliente (F6): identificar ou cadastrar na hora; venda sem cliente continua normal.
// Fiado (F7): só com cliente identificado; sem cliente a tela não deixa escolher e o servidor recusa.
// Tirar o cliente da venda tira o fiado e o cashback do pagamento.
// Cashback (módulo 7): "Usar cashback" abate o saldo do cliente do total e a forma escolhida paga o resto (DaniPets
// V9.3.1); se o cashback cobre tudo, é só finalizar. O cupom de retorno do cliente entra sozinho nos itens sem
// desconto manual. Ao finalizar, o aviso diz quanto de cashback o cliente ganhou.
// Vale-troca (módulo 8): "Usar vale-troca" escolhe um vale com saldo (ou pelo código), com ou sem cliente; cada
// vale abate o que cobre (depois do cashback) e a sobra fica no vale. A devolução pode virar vale e, aqui, ele pode
// ser usado na hora ("troca").
// Estoque: a lista da barra mostra o saldo e o caixa não deixa passar do que há (o servidor confere de novo).
// O carrinho de cada pessoa fica guardado no navegador e sobrevive a recarregar a página.
// A tela manda só produto, quantidade, desconto pedido, pagamento e o id do cliente: quem vendeu é
// quem está logado, o preço de tabela vem do cadastro e as autorizações são conferidas pelo servidor.
// Cada venda alimenta o estoque, o histórico do cliente, o financeiro, a Visão geral e os Relatórios.
import {
  dataBr,
  descreverPagamentos,
  type FormaPagamento,
  FORMAS_DA_TELA,
  MENSAGEM_CASHBACK_SEM_CLIENTE,
  mensagemFormaSemCliente,
  pctTexto,
  primeiroNome,
  formatarCentavos,
  formatarNumeroVenda,
  formaPrecisaDeCliente,
  formatarQuantidade,
  lerQuantidade,
  LIMITES_VENDA,
  PASSO_QUANTIDADE,
  QUANTIDADE_MAX,
  quantidadeParaTexto,
  unidadeDe,
  valorDaQuantidade,
  NOME_FORMA_PAGAMENTO,
  type PapelDeLoja,
  semAcento,
  type ValeTroca,
} from '@saas/core';
import { type FormEvent, type KeyboardEvent as TeclaNoCampo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto } from '../api';
import {
  acharPorCodigo,
  autorizacaoNecessaria,
  quantidadeDaEntrada,
  centavosParaTexto,
  type ClienteNaVenda,
  contaDoPagamento,
  cupomNaLinha,
  disponivelParaVenda,
  type EstadoPagamento,
  lerCarrinhoSalvo,
  lerEntrada,
  type LinhaCarrinho,
  montarPedido,
  pagamentoInicial,
  precoDaLinha,
  proximaForma,
  salvarCarrinho,
  semCreditoDoCliente,
  sugestoesDeDinheiro,
  usaFiado,
  totaisDoCarrinho,
} from './caixa/carrinho';
import { AvisoComIcone } from './AvisoComIcone';
import { ModalCliente } from './caixa/ModalCliente';
import { ModalDesconto } from './caixa/ModalDesconto';
import { ModalDevolucao, type ValeDaDevolucao } from './caixa/ModalDevolucao';
import { ModalUsarVale, ModalValeEmitido } from './caixa/ModalVale';
import { ModalSenha } from './caixa/ModalSenha';
import { dataNoFuso, horaNoFuso } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiPainel;
  /** Quem está operando (para mostrar e para as regras de desconto; quem registra é a API). */
  operador: { nome: string; papel: PapelDeLoja };
  loja: { nome: string };
  fuso: string;
  agora?: () => Date;
  /** Onde guardar o carrinho desta pessoa no navegador. null = não guarda. */
  chaveCarrinho?: string | null;
  /** "← Painel": sai da Frente de caixa. */
  aoSair: () => void;
  /** Desconto que o Vendedor dá sem senha (regra da loja; padrão 10%, como o DaniPets). */
  limiteDescontoPct?: number;
  /** "Abrir caixa": vai para a aba Caixa do dia (sem caixa aberto não há vendas). */
  aoAbrirCaixa?: () => void;
  /** Aviso do painel quando o caixa fechou sozinho na virada da meia-noite (aparece com o caixa não aberto). */
  avisoDaVirada?: string | null;
}

/** De quanto em quanto tempo o saldo de estoque é buscado de novo (outra pessoa pode ter vendido). */
const ATUALIZAR_ESTOQUE_MS = 20_000;

/** Teclas de forma de pagamento (iguais às do DaniPets). */
const TECLA_FORMA: Partial<Record<FormaPagamento, string>> = { dinheiro: 'F4', pix: 'F8', debito: 'F9', credito: 'F10', fiado: 'F7' };
const FORMA_DA_TECLA: Record<string, FormaPagamento> = { F4: 'dinheiro', F7: 'fiado', F8: 'pix', F9: 'debito', F10: 'credito' };
/** Depois de uma venda, a forma usada fica marcada para a próxima (como no DaniPets), menos o fiado. */
const proximaVenda = (forma: FormaPagamento): FormaPagamento => (forma === 'fiado' ? 'pix' : forma);

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;
type Janela =
  | { tipo: 'desconto'; produtoId: string }
  | { tipo: 'devolucao' }
  | { tipo: 'cliente' }
  /** Fiado acima do limite ou com fiado vencido: a liberação de um Dono (módulo 6). */
  | { tipo: 'liberarFiado'; texto: string; valorCentavos: number }
  /** Vale-troca (módulo 8): escolher um vale e o vale emitido numa devolução. */
  | { tipo: 'vale' }
  | { tipo: 'valeEmitido'; dados: ValeDaDevolucao }
  | null;

export function TelaFrenteCaixa({ api, operador, loja, fuso, agora = () => new Date(), chaveCarrinho = null, aoSair, limiteDescontoPct, aoAbrirCaixa, avisoDaVirada = null }: Props) {
  const { estado: carga, recarregar } = usarCarga(async () => {
    const [lista, estoque] = await Promise.all([api.listarProdutos(), api.listarEstoque()]);
    return { produtos: lista, saldos: new Map(estoque.map((e) => [e.produtoId, e.saldo])) };
  }, [api], ATUALIZAR_ESTOQUE_MS);
  // situação do caixa de hoje (DaniPets: "Caixa aberto às 08:10" / "CAIXA DE HOJE NÃO ABERTO")
  const { estado: cargaCaixa, recarregar: recarregarCaixa } = usarCarga(() => api.lerSituacaoDoCaixa(), [api], ATUALIZAR_ESTOQUE_MS);
  // vales-troca com saldo (módulo 8): o botão "Usar vale-troca" só aparece se houver algum fora do pagamento
  const { estado: cargaVales, recarregar: recarregarVales } = usarCarga(() => api.listarVales(), [api], ATUALIZAR_ESTOQUE_MS);
  const caixa = cargaCaixa.tipo === 'pronto' ? cargaCaixa.dados : null;
  const produtos = useMemo(() => (carga.tipo === 'pronto' ? carga.dados.produtos.filter((p) => p.ativo) : []), [carga]);
  const saldos = useMemo(() => (carga.tipo === 'pronto' ? carga.dados.saldos : new Map<string, number>()), [carga]);
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const salvo = useMemo(() => (chaveCarrinho ? lerCarrinhoSalvo(chaveCarrinho) : null), [chaveCarrinho]);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>(salvo?.linhas ?? []);
  const [pag, setPag] = useState<EstadoPagamento>(salvo?.pagamento ?? pagamentoInicial());
  const [cliente, setCliente] = useState<ClienteNaVenda | null>(salvo?.cliente ?? null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enviando, setEnviando] = useState(false);
  const [janela, setJanela] = useState<Janela>(null);
  const [codigo, setCodigo] = useState('');
  const refCodigo = useRef<HTMLInputElement>(null);
  const refSugestoes = useRef<HTMLUListElement>(null);
  const refRecebido = useRef<HTMLInputElement>(null);
  const refDinheiro = useRef<HTMLDivElement>(null);

  // Produto que saiu do cadastro (ou foi desativado) sai do carrinho guardado.
  useEffect(() => {
    if (carga.tipo === 'pronto') setLinhas((ls) => ls.filter((l) => porId.has(l.produtoId)));
  }, [carga.tipo, porId]);
  useEffect(() => {
    if (chaveCarrinho) salvarCarrinho(chaveCarrinho, linhas, pag, cliente);
  }, [chaveCarrinho, linhas, pag, cliente]);

  const cupom = cliente?.cupom ?? null;
  const totais = totaisDoCarrinho(linhas, porId, cupom);
  const conta = contaDoPagamento(pag, totais.totalCentavos, cliente ? (cliente.cashbackCentavos ?? 0) : 0);
  // o crédito do cliente (cashback e vales) paga a compra toda: não precisa receber nada (DaniPets V9.3.1)
  const cobreTudo = conta.creditosCentavos > 0 && linhas.length > 0 && conta.aPagarCentavos === 0;
  const valesDisponiveis = cargaVales.tipo === 'pronto' ? cargaVales.dados.filter((v) => !(pag.vales ?? []).some((x) => x.id === v.id)) : [];
  /** O que o cliente pagaria com outro estado do pagamento (para os avisos de crédito). */
  const aPagarCom = (estado: EstadoPagamento) => contaDoPagamento(estado, totais.totalCentavos, cliente ? (cliente.cashbackCentavos ?? 0) : 0).aPagarCentavos;
  // o que sobra de crédito para a próxima compra (DaniPets: "Fica de saldo para a próxima compra")
  const sobraDeCredito = [
    ...(cliente && (cliente.cashbackCentavos ?? 0) - conta.cashbackCentavos > 0 && pag.usarCashback ? [`cashback ${formatarCentavos((cliente.cashbackCentavos ?? 0) - conta.cashbackCentavos)}`] : []),
    ...(pag.vales ?? []).flatMap((v) => {
      const usado = conta.valesAplicados.find((x) => x.id === v.id)?.valorCentavos ?? 0;
      return v.saldoCentavos - usado > 0 ? [`vale ${v.codigo} ${formatarCentavos(v.saldoCentavos - usado)}`] : [];
    }),
  ];
  const temDinheiro = conta.dinheiroCentavos > 0;
  const troco = conta.recebidoCentavos === null ? null : conta.recebidoCentavos - conta.dinheiroCentavos;
  const ultimaLinha = linhas.find((l) => l.produtoId === ultimo) ?? linhas[linhas.length - 1];
  const ultimoProduto = ultimaLinha ? porId.get(ultimaLinha.produtoId) : undefined;

  const focarCodigo = () => refCodigo.current?.focus();
  const erro = (texto: string) => setAviso({ tipo: 'erro', texto });

  // ------------------------------------------------------------------ itens
  function adicionar(p: Produto, quantidade: number) {
    const u = unidadeDe(p.unidade);
    const atual = linhas.find((l) => l.produtoId === p.id);
    if ((atual?.quantidade ?? 0) + quantidade > QUANTIDADE_MAX[u]) {
      erro(`No máximo ${formatarQuantidade(QUANTIDADE_MAX[u], u)} de ${p.nome} numa venda.`);
      return;
    }
    // como no DaniPets: não passa do estoque (descontando o que já está no carrinho)
    const disponivel = disponivelParaVenda(saldos, linhas, p.id);
    if (quantidade > disponivel) {
      erro(`Estoque insuficiente para ${p.nome}. Disponível: ${formatarQuantidade(Math.max(0, disponivel), u)}.`);
      return;
    }
    setLinhas((ls) =>
      ls.some((l) => l.produtoId === p.id)
        ? ls.map((l) => (l.produtoId === p.id ? { ...l, quantidade: l.quantidade + quantidade } : l))
        : [...ls, { produtoId: p.id, quantidade, desconto: null }],
    );
    setUltimo(p.id);
    setAviso(null);
  }

  // ------------------------------------------------------------------ a barra do produto (código ou nome)
  /**
   * O que a barra acha enquanto se digita: nome sem acento ou começo do código. "3*nome" também vale (3 unidades
   * do escolhido); se o texto inteiro já acha produto (um nome como "10x15"), ele vale sem multiplicador.
   */
  function procurar(texto: string): { lista: Produto[]; multiplicador: string | null } {
    const achar = (t: string) => {
      const termo = semAcento(t);
      return termo
        ? produtos.filter((p) => semAcento(p.nome).includes(termo) || p.codigoInterno.startsWith(termo) || (p.codigoBarras ?? '').startsWith(termo)).slice(0, 8)
        : [];
    };
    const cheio = achar(texto);
    if (cheio.length > 0) return { lista: cheio, multiplicador: null };
    const e = lerEntrada(texto);
    return e.multiplicador ? { lista: achar(e.codigo), multiplicador: e.multiplicador } : { lista: [], multiplicador: null };
  }

  const achados = procurar(codigo);
  const sugestoes = achados.lista;

  /** Põe o produto na venda com a quantidade da barra ("3*" = 3; sem nada = 1 unidade ou 1 kg) e limpa a barra. */
  function adicionarDaBarra(p: Produto, multiplicador: string | null) {
    setCodigo(''); // sempre limpa, mesmo com erro na quantidade (leitura encadeada do leitor)
    focarCodigo();
    const q = quantidadeDaEntrada(multiplicador, unidadeDe(p.unidade));
    if (typeof q !== 'number') return erro(q.erro);
    adicionar(p, q);
  }

  /** Enter na barra: código exato primeiro (leitor); senão, o único produto achado pelo nome ou pelo começo do código. */
  function lerOuBuscar(ev: FormEvent) {
    ev.preventDefault();
    const texto = codigo.trim();
    if (!texto) return focarCodigo();
    const e = lerEntrada(texto);
    const exato = acharPorCodigo(produtos, e.codigo);
    if (exato) return adicionarDaBarra(exato, e.multiplicador);
    if (sugestoes.length === 1) return adicionarDaBarra(sugestoes[0]!, achados.multiplicador);
    if (sugestoes.length > 1) return erro('Mais de um produto encontrado: escolha na lista.');
    if (/^\d+$/.test(e.codigo)) {
      setCodigo(''); // parece leitura do leitor: limpa para a próxima, como antes
      return erro(`Código "${e.codigo}" não encontrado (ou produto inativo).`);
    }
    erro(`Nenhum produto encontrado para “${texto}”.`); // digitado à mão: o texto fica para corrigir
  }

  const botoesDaLista = () => Array.from(refSugestoes.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  /** Seta para baixo na barra entra na lista; na lista, as setas andam e a de cima, no primeiro, volta à barra. */
  function setasDaBarra(e: TeclaNoCampo<HTMLInputElement>) {
    if (e.key !== 'ArrowDown' || sugestoes.length === 0) return;
    e.preventDefault();
    botoesDaLista()[0]?.focus();
  }
  function setasDaLista(e: TeclaNoCampo<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const botoes = botoesDaLista();
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowUp' && i <= 0) return focarCodigo();
    botoes[e.key === 'ArrowDown' ? Math.min(i + 1, botoes.length - 1) : i - 1]?.focus();
  }

  function mudarQuantidade(produtoId: string, quantidade: number) {
    const u = unidadeDe(porId.get(produtoId)?.unidade);
    const atual = linhas.find((l) => l.produtoId === produtoId)?.quantidade ?? 0;
    const saldo = saldos.get(produtoId) ?? 0;
    if (quantidade > atual && quantidade > saldo) {
      erro(`Estoque insuficiente para ${porId.get(produtoId)?.nome ?? 'o produto'}. Disponível: ${formatarQuantidade(Math.max(0, saldo), u)}.`);
      return;
    }
    setLinhas((ls) =>
      quantidade <= 0
        ? ls.filter((l) => l.produtoId !== produtoId) // quantidade 0 tira o item (como no DaniPets)
        : ls.map((l) => (l.produtoId === produtoId ? { ...l, quantidade: Math.min(QUANTIDADE_MAX[u], quantidade) } : l)),
    );
  }
  const remover = (produtoId: string) => setLinhas((ls) => ls.filter((l) => l.produtoId !== produtoId));

  function removerDesconto(p: Produto) {
    if (!window.confirm(`Remover o desconto de ${p.nome} e voltar ao preço de tabela de ${formatarCentavos(p.precoCentavos)}?`)) return;
    setLinhas((ls) => ls.map((l) => (l.produtoId === p.id ? { ...l, desconto: null } : l)));
    setAviso({ tipo: 'ok', texto: `Desconto removido: ${p.nome} voltou ao preço de tabela.` });
  }

  // ------------------------------------------------------------------ pagamento
  // No pagamento dividido o painel pode rolar (janela baixa): o recebido e o troco ficam à vista,
  // como no DaniPets.
  const partesDivididas = pag.dividido ? pag.partes.length : 0;
  useEffect(() => {
    if (partesDivididas > 0 && temDinheiro) refDinheiro.current?.scrollIntoView?.({ block: 'nearest' });
  }, [partesDivididas, temDinheiro]);

  const definirForma = (forma: FormaPagamento) => {
    if (formaPrecisaDeCliente(forma) && !cliente) {
      erro(mensagemFormaSemCliente(forma));
      return;
    }
    setPag((p) => ({ ...p, dividido: false, forma, partes: [] }));
    if (forma === 'dinheiro') setTimeout(() => refRecebido.current?.focus(), 0);
  };

  const dividir = () =>
    setPag((p) => {
      if (!p.dividido) {
        return {
          ...p,
          dividido: true,
          partes: [
            // o que falta pagar depois do cashback
            { forma: p.forma, valorTexto: conta.aPagarCentavos ? centavosParaTexto(conta.aPagarCentavos) : '' },
            { forma: proximaForma([p.forma]), valorTexto: '' },
          ],
        };
      }
      if (p.partes.length >= LIMITES_VENDA.pagamentosMax) return p;
      return { ...p, partes: [...p.partes, { forma: proximaForma(p.partes.map((x) => x.forma)), valorTexto: '' }] };
    });

  const mudarParte = (i: number, mudanca: Partial<{ forma: FormaPagamento; valorTexto: string }>) => {
    if (mudanca.forma && formaPrecisaDeCliente(mudanca.forma) && !cliente) {
      erro(mensagemFormaSemCliente(mudanca.forma));
      return;
    }
    setPag((p) => ({ ...p, partes: p.partes.map((x, j) => (j === i ? { ...x, ...mudanca } : x)) }));
  };

  /** Venda sem cliente não pode ficar no fiado nem usar cashback: tirar o cliente tira os dois do pagamento. */
  function tirarCliente() {
    setCliente(null);
    setPag(semCreditoDoCliente(pag));
    if (usaFiado(pag)) erro('Sem cliente identificado não dá para vender no fiado: o fiado saiu do pagamento. Escolha outra forma ou identifique o cliente (F6).');
    else if (pag.usarCashback) setAviso({ tipo: 'ok', texto: 'O cashback saiu do pagamento: ele é do cliente.' });
  }

  /** "Usar cashback": o saldo do cliente abate do total; a forma escolhida paga o resto (DaniPets posAddCashback). */
  function usarCashback() {
    if (!cliente) return erro(MENSAGEM_CASHBACK_SEM_CLIENTE);
    if (cliente.completo === false) return erro('Cadastro incompleto: complete o CPF para usar o cashback.');
    const saldo = cliente.cashbackCentavos ?? 0;
    if (saldo <= 0) return erro('O cliente não tem cashback disponível.');
    const novo = { ...pag, usarCashback: true };
    setPag(novo);
    const abate = Math.min(saldo, totais.totalCentavos);
    setAviso({
      tipo: 'ok',
      texto: linhas.length ? `Cashback de ${formatarCentavos(abate)} abatido. O cliente paga ${formatarCentavos(aPagarCom(novo))}.` : `Cashback no pagamento: abate até ${formatarCentavos(saldo)} da compra.`,
    });
  }
  function naoUsarCashback() {
    const novo = { ...pag, usarCashback: false };
    setPag(novo);
    setAviso({ tipo: 'ok', texto: `Cashback fora desta venda. O cliente paga ${formatarCentavos(aPagarCom(novo))}.` });
  }

  /** "Usar vale-troca": o vale abate o que cobre (depois do cashback); a forma escolhida paga o resto (DaniPets addVoucherPayment). */
  function usarVale(v: ValeTroca) {
    if (v.situacao !== 'aberto' || v.saldoCentavos <= 0) return erro('Vale-troca sem saldo.');
    if ((pag.vales ?? []).some((x) => x.id === v.id)) return erro('Este vale já está no pagamento.');
    const novo = { ...pag, vales: [...(pag.vales ?? []), { id: v.id, codigo: v.codigo, saldoCentavos: v.saldoCentavos }] };
    setPag(novo);
    const usado = contaDoPagamento(novo, totais.totalCentavos, cliente ? (cliente.cashbackCentavos ?? 0) : 0).valesAplicados.find((x) => x.id === v.id)?.valorCentavos ?? 0;
    setAviso({
      tipo: 'ok',
      texto: linhas.length ? `Vale ${v.codigo}: ${formatarCentavos(usado)} abatido. O cliente paga ${formatarCentavos(aPagarCom(novo))}.` : `Vale ${v.codigo} no pagamento (saldo ${formatarCentavos(v.saldoCentavos)}).`,
    });
  }
  function naoUsarVale(id: string) {
    const novo = { ...pag, vales: (pag.vales ?? []).filter((x) => x.id !== id) };
    setPag(novo);
    setAviso({ tipo: 'ok', texto: `Vale-troca fora desta venda. O cliente paga ${formatarCentavos(aPagarCom(novo))}.` });
  }

  const removerParte = (i: number) =>
    setPag((p) => {
      const partes = p.partes.filter((_, j) => j !== i);
      // ficou uma parte só: volta para uma forma de pagamento (que paga o total)
      return partes.length <= 1 ? { ...p, dividido: false, forma: partes[0]?.forma ?? p.forma, partes: [] } : { ...p, partes };
    });

  // ------------------------------------------------------------------ finalizar e limpar
  async function finalizar(liberacaoFiado?: { autorizacao: string; motivo: string }) {
    if (usaFiado(pag) && !cliente) return erro(mensagemFormaSemCliente('fiado'));
    if (enviando || linhas.length === 0) return;
    // sem o caixa de hoje aberto não há venda (a API também recusa; aqui o aviso vem na hora, sem gravar nada)
    if (caixa && caixa.estado !== 'aberto') {
      return erro(
        caixa.estado === 'fechado'
          ? 'O caixa de hoje já foi fechado. Para vender hoje, o Dono ou o Administrador pode desfazer o fechamento em Caixa do dia.'
          : 'Abra o caixa de hoje (Caixa do dia) antes de vender.',
      );
    }
    if (pag.dividido && conta.invalido) return erro('Há um valor inválido no pagamento dividido (ex.: 12,50).');
    if (conta.faltaCentavos !== 0 && conta.aPagarCentavos > 0) {
      const pago = conta.aPagarCentavos - conta.faltaCentavos;
      return erro(
        conta.cashbackCentavos > 0
          ? `Os pagamentos somam ${formatarCentavos(pago)}, e falta pagar ${formatarCentavos(conta.aPagarCentavos)} depois do cashback.`
          : `Os pagamentos somam ${formatarCentavos(pago)}, e a venda é ${formatarCentavos(totais.totalCentavos)}.`,
      );
    }
    if (temDinheiro && (conta.recebidoCentavos === null || conta.recebidoCentavos < conta.dinheiroCentavos)) {
      refRecebido.current?.focus();
      return erro(`Informe o valor recebido em dinheiro (igual ou maior que ${formatarCentavos(conta.dinheiroCentavos)}).`);
    }
    setEnviando(true);
    setAviso(null);
    try {
      const pedido = montarPedido(linhas, conta, cliente, porId);
      const venda = await api.criarVenda(liberacaoFiado ? { ...pedido, liberacaoFiado } : pedido);
      setLinhas([]);
      setUltimo(null);
      setCliente(null);
      // a forma usada fica marcada para a próxima venda (como no DaniPets)
      setPag((p) => pagamentoInicial(proximaVenda(p.dividido ? (p.partes[0]?.forma ?? p.forma) : p.forma)));
      setAviso({
        tipo: 'ok',
        texto: `Venda ${formatarNumeroVenda(venda.numero)} finalizada: ${
          venda.pagamentos.length ? `${formatarCentavos(venda.totalCentavos)} em ${descreverPagamentos(venda.pagamentos)}` : 'brinde, sem pagamento'
        }.${venda.trocoCentavos > 0 ? ` Troco: ${formatarCentavos(venda.trocoCentavos)}.` : ''}${venda.cliente ? ` Cliente: ${venda.cliente.nome}.` : ''}${
          // DaniPets PDV-18: o aviso final diz o cashback que o cliente ganhou
          venda.cliente && (venda.cashbackGeradoCentavos ?? 0) > 0 ? ` ${primeiroNome(venda.cliente.nome)} ganhou ${formatarCentavos(venda.cashbackGeradoCentavos!)} de cashback.` : ''
        }`,
      });
      void recarregar(); // estoque novo
      void recarregarVales(); // o vale usado pode ter zerado
      focarCodigo();
    } catch (e) {
      // fiado acima do limite ou com fiado vencido: pede a liberação de um Dono e finaliza depois dela
      if (e instanceof ErroApi && e.codigo === 'fiado_liberacao' && cliente && !liberacaoFiado) {
        const noFiado = conta.pagamentos.filter((p) => p.forma === 'fiado').reduce((t, p) => t + p.valorCentavos, 0);
        setJanela({ tipo: 'liberarFiado', texto: e.message, valorCentavos: noFiado });
        return;
      }
      erro(e instanceof ErroApi ? e.message : 'Não foi possível registrar a venda. Tente de novo.');
      void recarregar(); // a recusa pode ser falta de estoque: mostra o saldo de agora
      if (e instanceof ErroApi && e.codigo === 'caixa') void recarregarCaixa(); // o caixa fechou em outra aba
    } finally {
      setEnviando(false);
    }
  }

  function limpar() {
    if ((linhas.length || cliente) && !window.confirm('Limpar a venda atual?')) return;
    setLinhas([]);
    setUltimo(null);
    setCliente(null);
    setPag((p) => pagamentoInicial(proximaVenda(p.forma)));
    setAviso(null);
    focarCodigo();
  }

  // ------------------------------------------------------------------ teclas (como no DaniPets)
  const acoes = useRef({ finalizar, definirForma });
  acoes.current = { finalizar, definirForma };
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (janela) return; // janela aberta: as teclas são dela
      if (e.key === 'F2') {
        e.preventDefault();
        void acoes.current.finalizar();
      } else if (e.key === 'F3') {
        e.preventDefault();
        refCodigo.current?.focus();
        refCodigo.current?.select();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setJanela({ tipo: 'cliente' });
      } else if (FORMA_DA_TECLA[e.key]) {
        e.preventDefault();
        acoes.current.definirForma(FORMA_DA_TECLA[e.key]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCodigo('');
        focarCodigo();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [janela]);

  // ------------------------------------------------------------------ autorizações (para as janelas)
  const carregarAutorizadores = useCallback(() => api.listarAutorizadores(), [api]);
  const produtoDaJanela = janela?.tipo === 'desconto' ? porId.get(janela.produtoId) : undefined;
  const linhaDaJanela = janela?.tipo === 'desconto' ? linhas.find((l) => l.produtoId === janela.produtoId) : undefined;
  const fecharJanela = () => {
    setJanela(null);
    setTimeout(focarCodigo, 0);
  };

  if (carga.tipo === 'bloqueado' || carga.tipo === 'falhou') {
    return (
      <div className="pdv pdv-erro">
        <p className="alerta alerta-erro" role="alert">
          {carga.mensagem}
        </p>
        <button type="button" className="botao" onClick={aoSair}>
          ← Painel
        </button>
      </div>
    );
  }

  return (
    <div className="pdv">
      <h1 className="sr-only">Frente de caixa</h1>
      <header className="pdv-topo">
        <div className="pdv-marca">
          <span className="pdv-marca-nome">{loja.nome}</span>
          <small>CAIXA</small>
        </div>
        <div className="pdv-info">
          <span className="pdv-pilula">
            Operador: <b>{operador.nome}</b>
          </span>
          {caixa?.estado === 'aberto' && caixa.abertoEm && <span className="pdv-pilula pdv-caixa-ok">Caixa aberto às {horaNoFuso(caixa.abertoEm, fuso)}</span>}
          {caixa?.estado === 'fechado' && (
            <span className="pdv-pilula pdv-caixa-ruim">CAIXA DE HOJE FECHADO{caixa.fechadoEm ? ` às ${horaNoFuso(caixa.fechadoEm, fuso)}` : ''}</span>
          )}
          {caixa?.estado === 'nao_aberto' && <span className="pdv-pilula pdv-caixa-ruim">CAIXA DE HOJE NÃO ABERTO</span>}
          <span className="pdv-pilula">{dataNoFuso(agora(), fuso)}</span>
        </div>
        <button type="button" className="pdv-sair" onClick={aoSair}>
          ← Painel
        </button>
      </header>
      {caixa && caixa.estado !== 'aberto' && (
        // aviso com ícone, como no Caixa do dia (pedido do Luan, 23/11/2026): o título diz o que houve e o resto, o que fazer
        <AvisoComIcone
          tipo="atencao"
          papel="status"
          className="pdv-caixa-aviso"
          acao={
            aoAbrirCaixa && (
              <button type="button" className="botao botao-primario" onClick={aoAbrirCaixa}>
                {caixa.estado === 'fechado' ? 'Ir para Caixa do dia' : 'Abrir caixa'}
              </button>
            )
          }
        >
          {caixa.estado === 'fechado' ? (
            <>
              <b className="pdv-caixa-titulo">Caixa de hoje fechado{caixa.fechadoEm ? ` às ${horaNoFuso(caixa.fechadoEm, fuso)}` : ''}.</b> As vendas de hoje
              estão encerradas. Para vender, o Dono ou o Administrador pode desfazer o fechamento em Caixa do dia.
            </>
          ) : (
            <>
              <b className="pdv-caixa-titulo">Caixa de hoje não aberto.</b> {avisoDaVirada && <span className="pdv-virada">{avisoDaVirada} </span>}
              Sem caixa aberto não há vendas: abra o caixa para começar.
            </>
          )}
        </AvisoComIcone>
      )}

      <div className="pdv-corpo">
        <section className="pdv-esquerda" aria-label="Itens da venda">
          <form className="pdv-leitor" onSubmit={lerOuBuscar} role="search" autoComplete="off">
            <label htmlFor="pdv-codigo">PRODUTO</label>
            <input
              id="pdv-codigo"
              ref={refCodigo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={setasDaBarra}
              placeholder={carga.tipo === 'carregando' ? 'Carregando produtos…' : 'Bipe o código ou digite o nome (3*código = 3 un.)'}
              aria-label="Código ou nome do produto"
              aria-controls="pdv-sugestoes"
              aria-describedby="pdv-dica-barra"
              enterKeyHint="enter"
              autoFocus
            />
            <button type="submit" className="pdv-ok">
              OK
            </button>
            <span id="pdv-dica-barra" className="sr-only">
              Enter põe o produto na venda. Com mais de um produto achado, use a seta para baixo e escolha na lista.
            </span>
            {sugestoes.length > 0 && (
              <ul id="pdv-sugestoes" ref={refSugestoes} className="pdv-sugestoes" aria-label="Produtos encontrados" onKeyDown={setasDaLista}>
                {sugestoes.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => adicionarDaBarra(p, achados.multiplicador)}>
                      <span className="mono suave">{p.codigoInterno}</span>
                      <span className="pdv-sug-nome">
                        {p.nome}
                        {/* saldo na unidade do produto: "25 kg" a granel (o estoque guarda gramas), "3 un" por unidade */}
                        <small className={(saldos.get(p.id) ?? 0) > 0 ? 'pdv-saldo' : 'pdv-saldo pdv-saldo-zero'}>
                          saldo {formatarQuantidade(Math.max(0, saldos.get(p.id) ?? 0), unidadeDe(p.unidade))}
                        </small>
                      </span>
                      <span className="numero">
                        {formatarCentavos(p.precoCentavos)}
                        {unidadeDe(p.unidade) === 'kg' && <small className="pdv-por-kg">/kg</small>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div className={cliente ? 'pdv-cliente pdv-cliente-on' : 'pdv-cliente'} aria-label="Cliente da venda" role="group">
            <span className="pdv-rotulo">CLIENTE</span>
            {cliente ? (
              <>
                <span className="pdv-cliente-id">
                  <b>{cliente.nome}</b>
                  <small>CPF {cliente.cpfMascarado}</small>
                </span>
                {cliente.completo === false ? (
                  <span className="pdv-chip pdv-chip-ruim">Cadastro incompleto: sem cashback, cupom e fiado</span>
                ) : (
                  cliente.cashbackCentavos !== undefined && (
                    <span
                      className={cliente.cashbackCentavos > 0 ? 'pdv-chip pdv-chip-ok' : 'pdv-chip'}
                      title={cliente.cashbackVencimento ? `${formatarCentavos(cliente.cashbackVencimento.valorCentavos)} vence em ${dataBr(cliente.cashbackVencimento.venceEm)}` : 'Cashback para usar'}
                    >
                      Cashback {formatarCentavos(cliente.cashbackCentavos)}
                    </span>
                  )
                )}
                {(cliente.valeCentavos ?? 0) > 0 && (
                  <span className="pdv-chip pdv-chip-ok" title="Vale-troca do cliente: use em “Usar vale-troca”">
                    Vale {formatarCentavos(cliente.valeCentavos!)}
                  </span>
                )}
                {cupom && (
                  <span className="pdv-chip pdv-chip-ok" title={`Cupom de retorno válido até ${dataBr(cupom.venceEm)}: entra sozinho nos itens sem desconto manual`}>
                    Cupom {pctTexto(cupom.pct)} aplicado
                  </span>
                )}
                {(cliente.fiadoEmAbertoCentavos ?? 0) > 0 && (
                  <span className="pdv-chip" title="Compras no fiado ainda não pagas">
                    Fiado em aberto {formatarCentavos(cliente.fiadoEmAbertoCentavos!)}
                  </span>
                )}
                {(cliente.fiadoVencidoCentavos ?? 0) > 0 && (
                  <span className="pdv-chip pdv-chip-ruim" title="Fiado que já passou do vencimento">
                    {formatarCentavos(cliente.fiadoVencidoCentavos!)} vencido{cliente.diasVencido ? ` há ${cliente.diasVencido} ${cliente.diasVencido === 1 ? 'dia' : 'dias'}` : ''}
                  </span>
                )}
                {cliente.limiteFiadoCentavos !== undefined && (
                  <span className="pdv-chip" title="Limite de fiado do cadastro">
                    {cliente.limiteFiadoCentavos > 0
                      ? `Limite ${formatarCentavos(cliente.limiteFiadoCentavos)} • disponível ${formatarCentavos(Math.max(0, cliente.limiteFiadoCentavos - (cliente.fiadoEmAbertoCentavos ?? 0)))}`
                      : 'Sem limite de fiado'}
                  </span>
                )}
                <button type="button" className="pdv-remover" onClick={tirarCliente} aria-label="Tirar o cliente da venda" title="Tirar o cliente da venda">
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="pdv-cliente-nenhum">
                  Não identificado<small> · venda sem cashback</small>
                </span>
                <button type="button" className="pdv-link pdv-cliente-botao" onClick={() => setJanela({ tipo: 'cliente' })}>
                  Identificar cliente · F6
                </button>
              </>
            )}
          </div>

          <div className="pdv-fita">
            {linhas.length === 0 ? (
              <div className="pdv-vazio">
                <span aria-hidden="true">▤</span>Bipe o primeiro produto
              </div>
            ) : (
              <table className="pdv-tabela">
                <thead>
                  <tr>
                    <th className="pdv-n">#</th>
                    <th>Produto</th>
                    <th className="numero">Quantidade</th>
                    <th className="numero">Preço</th>
                    <th className="numero">Total</th>
                    <th>
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const p = porId.get(l.produtoId);
                    if (!p) return null;
                    const preco = precoDaLinha(l, p, cupom);
                    const comCupom = cupomNaLinha(l, p, cupom);
                    const u = unidadeDe(p.unidade);
                    const passo = PASSO_QUANTIDADE[u];
                    const semAutorizacao = autorizacaoNecessaria(l, p, operador.papel, limiteDescontoPct) !== null && !l.desconto?.autorizacao;
                    return (
                      <tr key={l.produtoId} className={ultimaLinha?.produtoId === l.produtoId ? 'pdv-ultima' : undefined}>
                        <td className="pdv-n">{i + 1}</td>
                        <td className="pdv-nome">
                          <b>{p.nome}</b>
                          <small>
                            {p.codigoBarras ?? `cód. ${p.codigoInterno}`}
                            {comCupom && <span className="pdv-tag pdv-tag-ok"> · cupom de retorno</span>}
                            {l.desconto && <span className="pdv-tag"> · com desconto</span>}
                            {semAutorizacao && <span className="pdv-tag pdv-tag-erro"> · autorize o desconto de novo</span>}
                            {l.quantidade > (saldos.get(p.id) ?? 0) && (
                              <span className="pdv-tag pdv-tag-erro"> · estoque: {formatarQuantidade(Math.max(0, saldos.get(p.id) ?? 0), u)}</span>
                            )}
                          </small>
                        </td>
                        <td className="numero">
                          <span className="pdv-qtd" role="group" aria-label={`Quantidade de ${p.nome}`}>
                            <button type="button" onClick={() => mudarQuantidade(p.id, l.quantidade - passo)} aria-label={`Diminuir ${p.nome}`}>
                              −
                            </button>
                            {u === 'kg' ? (
                              <QuantidadeKg gramas={l.quantidade} nome={p.nome} aoMudar={(q) => mudarQuantidade(p.id, q)} />
                            ) : (
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={QUANTIDADE_MAX.un}
                                value={l.quantidade}
                                aria-label={`Quantidade de ${p.nome}`}
                                onChange={(e) => {
                                  const n = Number.parseInt(e.target.value, 10);
                                  if (Number.isFinite(n)) mudarQuantidade(p.id, n);
                                }}
                              />
                            )}
                            <button type="button" onClick={() => mudarQuantidade(p.id, l.quantidade + passo)} aria-label={`Aumentar ${p.nome}`}>
                              +
                            </button>
                            <small>{u}</small>
                          </span>
                        </td>
                        <td className="numero pdv-preco">
                          <b>{formatarCentavos(preco)}</b>
                          {u === 'kg' && <small className="pdv-por-kg">/kg</small>}
                          {l.desconto && (
                            <small className="pdv-tag">
                              de {formatarCentavos(p.precoCentavos)} · {l.desconto.responsavelNome}
                            </small>
                          )}
                          {comCupom && (
                            <small className="pdv-tag pdv-tag-ok">
                              de {formatarCentavos(p.precoCentavos)} · Cupom de retorno {pctTexto(cupom.pct)}
                            </small>
                          )}
                          <span className="pdv-desc-botoes">
                            <button type="button" className="pdv-link" onClick={() => setJanela({ tipo: 'desconto', produtoId: p.id })}>
                              {l.desconto ? 'Alterar desconto' : 'Aplicar desconto'}
                            </button>
                            {l.desconto && (
                              <button type="button" className="pdv-link" onClick={() => removerDesconto(p)}>
                                Remover desconto
                              </button>
                            )}
                          </span>
                        </td>
                        <td className="numero pdv-sub">{formatarCentavos(valorDaQuantidade(preco, l.quantidade, u))}</td>
                        <td>
                          <button type="button" className="pdv-remover" onClick={() => remover(p.id)} aria-label={`Remover ${p.nome}`}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="pdv-soma" aria-label="Resumo da venda">
            <span>
              Itens <b>{totais.itens}</b> · Produtos <b>{totais.produtos}</b>
            </span>
            <span>
              Descontos <b>{formatarCentavos(totais.descontoCentavos)}</b>
            </span>
            <span>
              Total <b>{formatarCentavos(totais.totalCentavos)}</b>
            </span>
          </div>
        </section>

        <aside className="pdv-direita" aria-label="Pagamento">
          <div className="pdv-visor">
            <div className="pdv-rotulo">ÚLTIMO ITEM</div>
            <div className="pdv-visor-nome" data-testid="pdv-ultimo">
              {ultimoProduto?.nome ?? '—'}
            </div>
            <div className="pdv-visor-conta">
              {ultimaLinha && ultimoProduto
                ? unidadeDe(ultimoProduto.unidade) === 'kg'
                  ? `${formatarQuantidade(ultimaLinha.quantidade, 'kg')} × ${formatarCentavos(precoDaLinha(ultimaLinha, ultimoProduto, cupom))}/kg = ${formatarCentavos(
                      valorDaQuantidade(precoDaLinha(ultimaLinha, ultimoProduto, cupom), ultimaLinha.quantidade, 'kg'),
                    )}`
                  : `${ultimaLinha.quantidade} × ${formatarCentavos(precoDaLinha(ultimaLinha, ultimoProduto, cupom))} = ${formatarCentavos(
                      precoDaLinha(ultimaLinha, ultimoProduto, cupom) * ultimaLinha.quantidade,
                    )}`
                : 'Aguardando leitura'}
            </div>
          </div>

          <div className={conta.creditosCentavos > 0 || (pag.vales ?? []).length > 0 ? 'pdv-total pdv-total-credito' : 'pdv-total'}>
            {(conta.cashbackCentavos > 0 || (pag.vales ?? []).length > 0) && (
              // o visor mostra a conta (compra − créditos) e, grande, o que o cliente paga (DaniPets V9.3.1)
              <div className="pdv-conta" aria-label="Conta do pagamento">
                <div className="pdv-conta-linha">
                  <span>Compra</span>
                  <b>{formatarCentavos(totais.totalCentavos)}</b>
                  <i />
                </div>
                {conta.cashbackCentavos > 0 && (
                  <div className="pdv-conta-linha pdv-conta-credito">
                    <span>Cashback</span>
                    <b>− {formatarCentavos(conta.cashbackCentavos)}</b>
                    <button type="button" className="pdv-remover" onClick={naoUsarCashback} title="Não usar o cashback nesta venda" aria-label="Não usar o cashback nesta venda">
                      ×
                    </button>
                  </div>
                )}
                {(pag.vales ?? []).map((v) => (
                  <div key={v.id} className="pdv-conta-linha pdv-conta-credito">
                    <span>Vale-troca {v.codigo}</span>
                    <b>− {formatarCentavos(conta.valesAplicados.find((x) => x.id === v.id)?.valorCentavos ?? 0)}</b>
                    <button type="button" className="pdv-remover" onClick={() => naoUsarVale(v.id)} title={`Não usar o vale ${v.codigo} nesta venda`} aria-label={`Não usar o vale ${v.codigo} nesta venda`}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="pdv-rotulo">TOTAL A PAGAR</div>
            <div className="pdv-total-valor" data-testid="pdv-total">
              {formatarCentavos(conta.aPagarCentavos)}
            </div>
          </div>

          <div className="pdv-pagamento">
            {cobreTudo ? (
              <p className="alerta pdv-aviso-ok pdv-cobre-tudo" role="status">
                <b>O crédito do cliente paga a compra toda.</b> Não precisa receber nada: é só finalizar.
                {sobraDeCredito.length > 0 && <> Fica de saldo para a próxima compra: {sobraDeCredito.join(' • ')}.</>}
              </p>
            ) : (
            <>
            <div className="pdv-formas" role="group" aria-label="Forma de pagamento">
              {FORMAS_DA_TELA.map((f) => {
                const bloqueada = formaPrecisaDeCliente(f) && !cliente;
                return (
                <button
                  key={f}
                  type="button"
                  className={['pdv-forma', !pag.dividido && pag.forma === f ? 'pdv-forma-on' : '', f === 'fiado' ? 'pdv-forma-fiado' : '', bloqueada ? 'pdv-forma-bloqueada' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={!pag.dividido && pag.forma === f}
                  aria-disabled={bloqueada || undefined}
                  title={bloqueada ? mensagemFormaSemCliente(f) : undefined}
                  onClick={() => definirForma(f)}
                >
                  <span className="pdv-forma-nome">
                    {NOME_FORMA_PAGAMENTO[f]}
                    {bloqueada && <span className="pdv-forma-dica"> · só com cliente identificado</span>}
                  </span>
                  {!pag.dividido && pag.forma === f && (
                    <span className="pdv-forma-ok" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  <small>{TECLA_FORMA[f]}</small>
                </button>
                );
              })}
            </div>

            {pag.dividido && (
              <div className="pdv-dividido" role="group" aria-label="Pagamento dividido">
                {pag.partes.map((parte, i) => (
                  <div key={i} className="pdv-parte">
                    <select value={parte.forma} onChange={(e) => mudarParte(i, { forma: e.target.value as FormaPagamento })} aria-label={`Forma da parte ${i + 1}`}>
                      {FORMAS_DA_TELA.filter((f) => !formaPrecisaDeCliente(f) || cliente || parte.forma === f).map((f) => (
                        <option key={f} value={f}>
                          {NOME_FORMA_PAGAMENTO[f]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={parte.valorTexto}
                      onChange={(e) => mudarParte(i, { valorTexto: e.target.value })}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Valor da parte ${i + 1}`}
                    />
                    <button type="button" className="pdv-remover" onClick={() => removerParte(i)} aria-label={`Tirar a parte ${i + 1}`}>
                      ×
                    </button>
                  </div>
                ))}
                <div className="pdv-falta" role="status">
                  {conta.faltaCentavos >= 0 ? 'Falta pagar' : 'Passou do total'}: <b>{formatarCentavos(Math.abs(conta.faltaCentavos))}</b>
                </div>
              </div>
            )}

            {temDinheiro && (
              <div className="pdv-dinheiro" ref={refDinheiro}>
                <div>
                  <label className="pdv-rotulo" htmlFor="pdv-recebido">
                    RECEBIDO EM DINHEIRO{pag.dividido ? ` · PARTE DE ${formatarCentavos(conta.dinheiroCentavos)}` : ''}
                  </label>
                  <input
                    id="pdv-recebido"
                    ref={refRecebido}
                    value={pag.recebidoTexto}
                    onChange={(e) => setPag((p) => ({ ...p, recebidoTexto: e.target.value }))}
                    onKeyDown={(e) => {
                      // digitou o valor e deu Enter: finaliza (como o F2)
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void finalizar();
                      }
                    }}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className={troco !== null && troco < 0 ? 'pdv-troco pdv-troco-falta' : 'pdv-troco'} role="status">
                  <div className="pdv-rotulo">{troco !== null && troco < 0 ? 'VALOR INSUFICIENTE' : 'TROCO'}</div>
                  <div className={troco !== null && troco < 0 ? 'pdv-troco-valor pdv-falta-dinheiro' : 'pdv-troco-valor'} data-testid="pdv-troco">
                    {troco === null ? '—' : troco < 0 ? `Faltam ${formatarCentavos(-troco)}` : formatarCentavos(troco)}
                  </div>
                </div>
                <div className="pdv-notas" role="group" aria-label="Atalhos do valor recebido">
                  {[conta.dinheiroCentavos, ...sugestoesDeDinheiro(conta.dinheiroCentavos)].map((v, i) => (
                    <button
                      key={v}
                      type="button"
                      className="pdv-nota"
                      onClick={() => {
                        setPag((p) => ({ ...p, recebidoTexto: centavosParaTexto(v) }));
                        refRecebido.current?.focus();
                      }}
                    >
                      {i === 0 ? 'Exato' : formatarCentavos(v)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            </>
            )}

            <div className="pdv-botoes-pagamento">
              {!cobreTudo && (
                <button type="button" className="botao pdv-dividir" onClick={dividir} disabled={pag.dividido && pag.partes.length >= LIMITES_VENDA.pagamentosMax}>
                  {pag.dividido ? '+ Outra forma' : 'Dividir pagamento'}
                </button>
              )}
              {valesDisponiveis.length > 0 && (
                <button type="button" className="botao pdv-dividir" onClick={() => setJanela({ tipo: 'vale' })}>
                  Usar vale-troca
                </button>
              )}
              {cliente && cliente.completo !== false && (cliente.cashbackCentavos ?? 0) > 0 && !pag.usarCashback && (
                <button type="button" className="botao pdv-dividir pdv-usar-cashback" onClick={usarCashback}>
                  Usar cashback ({formatarCentavos(cliente.cashbackCentavos!)})
                </button>
              )}
            </div>
          </div>

          {aviso && (
            <p className={aviso.tipo === 'erro' ? 'alerta alerta-erro pdv-aviso' : 'alerta pdv-aviso pdv-aviso-ok'} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
              {aviso.texto}
            </p>
          )}

          <button type="button" className="pdv-finalizar" onClick={() => void finalizar()} disabled={enviando || linhas.length === 0}>
            {enviando ? 'GRAVANDO…' : 'FINALIZAR · F2'}
          </button>
        </aside>
      </div>

      <footer className="pdv-rodape">
        {[
          ['F2', 'finalizar'],
          ['F3', 'buscar'],
          ['F4', 'dinheiro'],
          ['F6', 'cliente'],
          ['F7', 'fiado'],
          ['F8', 'pix'],
          ['F9', 'débito'],
          ['F10', 'crédito'],
          ['Esc', 'limpar a barra'],
        ].map(([k, t]) => (
          // as teclas das formas de pagamento já aparecem nos botões: em tela estreita, somem daqui
          <span key={k} className={FORMA_DA_TECLA[k!] ? 'pdv-tecla pdv-tecla-forma' : 'pdv-tecla'}>
            <kbd>{k}</kbd>
            {t}
          </span>
        ))}
        <span className="pdv-espaco" />
        <button type="button" className="pdv-rodape-botao" onClick={() => setJanela({ tipo: 'devolucao' })}>
          Devolução / cancelamento
        </button>
        <button type="button" className="pdv-rodape-botao pdv-perigo" onClick={limpar}>
          Limpar venda
        </button>
      </footer>

      {janela?.tipo === 'desconto' && produtoDaJanela && (
        <ModalDesconto
          produto={produtoDaJanela}
          atual={linhaDaJanela?.desconto ?? null}
          operador={operador}
          limitePct={limiteDescontoPct}
          carregarAutorizadores={carregarAutorizadores}
          autorizar={(usuarioId, senha, precoFinalCentavos) =>
            api.autorizar({ usuarioId, senha, acao: { tipo: 'desconto', produtoId: produtoDaJanela.id, precoFinalCentavos } })
          }
          aoAplicar={(desconto) => {
            setLinhas((ls) => ls.map((l) => (l.produtoId === produtoDaJanela.id ? { ...l, desconto } : l)));
            setAviso({
              tipo: 'ok',
              texto: `Desconto aplicado: ${formatarCentavos(produtoDaJanela.precoCentavos - desconto.precoFinalCentavos)} ${produtoDaJanela.unidade === 'kg' ? 'por kg' : 'por unidade'}${
                desconto.autorizacao ? ` (autorizado por ${desconto.responsavelNome})` : ''
              }.`,
            });
            fecharJanela();
          }}
          aoFechar={fecharJanela}
        />
      )}
      {janela?.tipo === 'devolucao' && (
        <ModalDevolucao
          api={api}
          operador={operador}
          fuso={fuso}
          agora={agora}
          aoConcluir={(texto, vale) => {
            setAviso({ tipo: 'ok', texto });
            void recarregar(); // o que voltou para a prateleira já pode ser vendido
            void recarregarVales(); // vale novo, ou o saldo que voltou para um vale
            // devolução como vale-troca: mostra o código e oferece usar o vale nesta venda (a troca)
            if (vale) setJanela({ tipo: 'valeEmitido', dados: vale });
            else fecharJanela();
          }}
          aoFechar={fecharJanela}
        />
      )}
      {janela?.tipo === 'vale' && (
        <ModalUsarVale
          api={api}
          vales={valesDisponiveis}
          aoEscolher={(v) => {
            fecharJanela();
            usarVale(v);
          }}
          aoFechar={fecharJanela}
        />
      )}
      {janela?.tipo === 'valeEmitido' && (
        <ModalValeEmitido
          vale={janela.dados.vale}
          devolucaoNumero={janela.dados.devolucaoNumero}
          abatidoDoFiadoCentavos={janela.dados.abatidoCentavos}
          aoUsarAgora={() => {
            const v = janela.dados.vale;
            fecharJanela();
            usarVale(v);
          }}
          aoFechar={fecharJanela}
        />
      )}
      {janela?.tipo === 'liberarFiado' && cliente && (
        <ModalSenha
          api={api}
          liberacao
          acao={{ tipo: 'fiado', clienteId: cliente.id, valorCentavos: janela.valorCentavos }}
          texto={janela.texto}
          aoAutorizar={async (a) => {
            fecharJanela();
            await finalizar({ autorizacao: a.autorizacao, motivo: a.motivo });
          }}
          aoFechar={() => {
            fecharJanela();
            erro('Venda não finalizada: o fiado precisa da liberação de um Dono.');
          }}
        />
      )}
      {janela?.tipo === 'cliente' && (
        <ModalCliente
          api={api}
          aoEscolher={(c, cadastradoAgora) => {
            setCliente({
              id: c.id,
              nome: c.nome,
              cpfMascarado: c.cpfMascarado,
              fiadoEmAbertoCentavos: c.fiadoEmAbertoCentavos,
              ...(c.limiteFiadoCentavos !== undefined ? { limiteFiadoCentavos: c.limiteFiadoCentavos } : {}),
              ...(c.fiadoVencidoCentavos !== undefined ? { fiadoVencidoCentavos: c.fiadoVencidoCentavos, diasVencido: c.diasVencido ?? 0 } : {}),
              ...(c.cashbackCentavos !== undefined ? { cashbackCentavos: c.cashbackCentavos, cashbackVencimento: c.cashbackVencimento ?? null } : {}),
              ...(c.cupom !== undefined ? { cupom: c.cupom } : {}),
              ...(c.completo !== undefined ? { completo: c.completo } : {}),
              ...(c.valeCentavos !== undefined ? { valeCentavos: c.valeCentavos } : {}),
            });
            // trocar de cliente tira o cashback do outro do pagamento (DaniPets posSetCustomer)
            setPag((p) => ({ ...p, usarCashback: false }));
            setAviso({
              tipo: 'ok',
              texto: `${cadastradoAgora ? 'Cliente cadastrado' : 'Cliente'}: ${c.nome}.${c.cupom ? ` Cupom de ${pctTexto(c.cupom.pct)} aplicado.` : ''}${(c.cashbackCentavos ?? 0) > 0 ? ` Cashback disponível: ${formatarCentavos(c.cashbackCentavos!)}.` : ''}`,
            });
            fecharJanela();
          }}
          aoFechar={fecharJanela}
        />
      )}
    </div>
  );
}

/** Quantidade em kg no carrinho: aceita "1,25"; vale ao sair do campo ou com Enter (o texto pela metade não some). */
function QuantidadeKg({ gramas, nome, aoMudar }: { gramas: number; nome: string; aoMudar: (gramas: number) => void }) {
  const [texto, setTexto] = useState(quantidadeParaTexto(gramas, 'kg'));
  // a quantidade mudou por fora (botões + e −): o campo mostra a nova; ao abrir, não mexe
  const anterior = useRef(gramas);
  useEffect(() => {
    if (anterior.current === gramas) return;
    anterior.current = gramas;
    setTexto(quantidadeParaTexto(gramas, 'kg'));
  }, [gramas]);
  const confirmar = () => {
    const q = lerQuantidade(texto, 'kg');
    if (q === null) setTexto(quantidadeParaTexto(gramas, 'kg'));
    else if (q !== gramas) aoMudar(q);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className="pdv-qtd-kg"
      value={texto}
      aria-label={`Quantidade de ${nome} em kg`}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmar();
        }
      }}
    />
  );
}
