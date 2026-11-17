// apps/web/src/painel/TelaFrenteCaixa.tsx
// Frente de caixa no formato do DaniPets V9.3.3 (tela cheia, sem a barra lateral):
//   esquerda: CÓDIGO (leitor; "3*código" = 3 unidades), busca por nome (F3), fita de itens
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
// Tirar o cliente da venda tira o fiado do pagamento.
// Estoque: a busca mostra o saldo e o caixa não deixa passar do que há (o servidor confere de novo).
// O carrinho de cada pessoa fica guardado no navegador e sobrevive a recarregar a página.
// A tela manda só produto, quantidade, desconto pedido, pagamento e o id do cliente: quem vendeu é
// quem está logado, o preço de tabela vem do cadastro e as autorizações são conferidas pelo servidor.
// Cada venda alimenta o estoque, o histórico do cliente, o financeiro, a Visão geral e os Relatórios.
import {
  descreverPagamentos,
  type FormaPagamento,
  FORMAS_PAGAMENTO,
  formatarCentavos,
  formatarNumeroVenda,
  formaPrecisaDeCliente,
  LIMITES_VENDA,
  MENSAGEM_FIADO_SEM_CLIENTE,
  NOME_FORMA_PAGAMENTO,
  type PapelDeLoja,
  semAcento,
} from '@saas/core';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto } from '../api';
import {
  acharPorCodigo,
  autorizacaoNecessaria,
  centavosParaTexto,
  type ClienteNaVenda,
  contaDoPagamento,
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
  semFiado,
  sugestoesDeDinheiro,
  usaFiado,
  totaisDoCarrinho,
} from './caixa/carrinho';
import { ModalCliente } from './caixa/ModalCliente';
import { ModalDesconto } from './caixa/ModalDesconto';
import { ModalDevolucao } from './caixa/ModalDevolucao';
import { dataNoFuso } from './formato';
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
}

/** De quanto em quanto tempo o saldo de estoque é buscado de novo (outra pessoa pode ter vendido). */
const ATUALIZAR_ESTOQUE_MS = 20_000;

/** Teclas de forma de pagamento (iguais às do DaniPets). */
const TECLA_FORMA: Record<FormaPagamento, string> = { dinheiro: 'F4', pix: 'F8', debito: 'F9', credito: 'F10', fiado: 'F7' };
const FORMA_DA_TECLA: Record<string, FormaPagamento> = { F4: 'dinheiro', F7: 'fiado', F8: 'pix', F9: 'debito', F10: 'credito' };
/** Depois de uma venda, a forma usada fica marcada para a próxima (como no DaniPets), menos o fiado. */
const proximaVenda = (forma: FormaPagamento): FormaPagamento => (forma === 'fiado' ? 'pix' : forma);

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;
type Janela = { tipo: 'desconto'; produtoId: string } | { tipo: 'devolucao' } | { tipo: 'cliente' } | null;

export function TelaFrenteCaixa({ api, operador, loja, fuso, agora = () => new Date(), chaveCarrinho = null, aoSair }: Props) {
  const { estado: carga, recarregar } = usarCarga(async () => {
    const [lista, estoque] = await Promise.all([api.listarProdutos(), api.listarEstoque()]);
    return { produtos: lista, saldos: new Map(estoque.map((e) => [e.produtoId, e.saldo])) };
  }, [api], ATUALIZAR_ESTOQUE_MS);
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
  const [busca, setBusca] = useState('');
  const refCodigo = useRef<HTMLInputElement>(null);
  const refBusca = useRef<HTMLInputElement>(null);
  const refRecebido = useRef<HTMLInputElement>(null);
  const refDinheiro = useRef<HTMLDivElement>(null);

  // Produto que saiu do cadastro (ou foi desativado) sai do carrinho guardado.
  useEffect(() => {
    if (carga.tipo === 'pronto') setLinhas((ls) => ls.filter((l) => porId.has(l.produtoId)));
  }, [carga.tipo, porId]);
  useEffect(() => {
    if (chaveCarrinho) salvarCarrinho(chaveCarrinho, linhas, pag, cliente);
  }, [chaveCarrinho, linhas, pag, cliente]);

  const totais = totaisDoCarrinho(linhas, porId);
  const conta = contaDoPagamento(pag, totais.totalCentavos);
  const temDinheiro = conta.dinheiroCentavos > 0;
  const troco = conta.recebidoCentavos === null ? null : conta.recebidoCentavos - conta.dinheiroCentavos;
  const ultimaLinha = linhas.find((l) => l.produtoId === ultimo) ?? linhas[linhas.length - 1];
  const ultimoProduto = ultimaLinha ? porId.get(ultimaLinha.produtoId) : undefined;

  const focarCodigo = () => refCodigo.current?.focus();
  const erro = (texto: string) => setAviso({ tipo: 'erro', texto });

  // ------------------------------------------------------------------ itens
  function adicionar(p: Produto, quantidade: number) {
    const atual = linhas.find((l) => l.produtoId === p.id);
    if ((atual?.quantidade ?? 0) + quantidade > LIMITES_VENDA.quantidadeMax) {
      erro(`No máximo ${LIMITES_VENDA.quantidadeMax} unidades de ${p.nome} numa venda.`);
      return;
    }
    // como no DaniPets: não passa do estoque (descontando o que já está no carrinho)
    const disponivel = disponivelParaVenda(saldos, linhas, p.id);
    if (quantidade > disponivel) {
      erro(`Estoque insuficiente para ${p.nome}. Disponível: ${disponivel} un.`);
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

  function lerCodigo(ev: FormEvent) {
    ev.preventDefault();
    const bruto = codigo;
    setCodigo(''); // sempre limpa, mesmo com erro (leitura encadeada do leitor)
    focarCodigo();
    if (!bruto.trim()) return;
    const e = lerEntrada(bruto);
    if ('erro' in e) return erro(e.erro);
    const p = acharPorCodigo(produtos, e.codigo);
    if (!p) return erro(`Código "${e.codigo}" não encontrado (ou produto inativo).`);
    adicionar(p, e.quantidade);
  }

  const termo = semAcento(busca);
  const sugestoes = termo
    ? produtos.filter((p) => semAcento(p.nome).includes(termo) || p.codigoInterno.startsWith(termo) || (p.codigoBarras ?? '').startsWith(termo)).slice(0, 8)
    : [];

  function escolher(p: Produto) {
    adicionar(p, 1);
    setBusca('');
    focarCodigo();
  }

  function buscar(ev: FormEvent) {
    ev.preventDefault();
    if (!termo) return;
    const exato = acharPorCodigo(produtos, busca);
    if (exato) return escolher(exato);
    if (sugestoes.length === 1) return escolher(sugestoes[0]!);
    erro(sugestoes.length === 0 ? `Nenhum produto encontrado para “${busca.trim()}”.` : 'Mais de um produto encontrado: escolha na lista.');
  }

  function mudarQuantidade(produtoId: string, quantidade: number) {
    const atual = linhas.find((l) => l.produtoId === produtoId)?.quantidade ?? 0;
    const saldo = saldos.get(produtoId) ?? 0;
    if (quantidade > atual && quantidade > saldo) {
      erro(`Estoque insuficiente para ${porId.get(produtoId)?.nome ?? 'o produto'}. Disponível: ${Math.max(0, saldo)} un.`);
      return;
    }
    setLinhas((ls) =>
      quantidade <= 0
        ? ls.filter((l) => l.produtoId !== produtoId) // quantidade 0 tira o item (como no DaniPets)
        : ls.map((l) => (l.produtoId === produtoId ? { ...l, quantidade: Math.min(LIMITES_VENDA.quantidadeMax, quantidade) } : l)),
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
      erro(MENSAGEM_FIADO_SEM_CLIENTE);
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
            { forma: p.forma, valorTexto: totais.totalCentavos ? centavosParaTexto(totais.totalCentavos) : '' },
            { forma: proximaForma([p.forma]), valorTexto: '' },
          ],
        };
      }
      if (p.partes.length >= LIMITES_VENDA.pagamentosMax) return p;
      return { ...p, partes: [...p.partes, { forma: proximaForma(p.partes.map((x) => x.forma)), valorTexto: '' }] };
    });

  const mudarParte = (i: number, mudanca: Partial<{ forma: FormaPagamento; valorTexto: string }>) => {
    if (mudanca.forma && formaPrecisaDeCliente(mudanca.forma) && !cliente) {
      erro(MENSAGEM_FIADO_SEM_CLIENTE);
      return;
    }
    setPag((p) => ({ ...p, partes: p.partes.map((x, j) => (j === i ? { ...x, ...mudanca } : x)) }));
  };

  /** Venda sem cliente não pode ficar no fiado: tirar o cliente tira o fiado do pagamento. */
  function tirarCliente() {
    setCliente(null);
    if (usaFiado(pag)) {
      setPag(semFiado(pag));
      erro('Sem cliente identificado não dá para vender no fiado: o fiado saiu do pagamento. Escolha outra forma ou identifique o cliente (F6).');
    }
  }

  const removerParte = (i: number) =>
    setPag((p) => {
      const partes = p.partes.filter((_, j) => j !== i);
      // ficou uma parte só: volta para uma forma de pagamento (que paga o total)
      return partes.length <= 1 ? { ...p, dividido: false, forma: partes[0]?.forma ?? p.forma, partes: [] } : { ...p, partes };
    });

  // ------------------------------------------------------------------ finalizar e limpar
  async function finalizar() {
    if (usaFiado(pag) && !cliente) return erro(MENSAGEM_FIADO_SEM_CLIENTE);
    if (enviando || linhas.length === 0) return;
    if (pag.dividido && conta.invalido) return erro('Há um valor inválido no pagamento dividido (ex.: 12,50).');
    if (conta.faltaCentavos !== 0 && totais.totalCentavos > 0) {
      const pago = totais.totalCentavos - conta.faltaCentavos;
      return erro(`Os pagamentos somam ${formatarCentavos(pago)}, e a venda é ${formatarCentavos(totais.totalCentavos)}.`);
    }
    if (temDinheiro && (conta.recebidoCentavos === null || conta.recebidoCentavos < conta.dinheiroCentavos)) {
      refRecebido.current?.focus();
      return erro(`Informe o valor recebido em dinheiro (igual ou maior que ${formatarCentavos(conta.dinheiroCentavos)}).`);
    }
    setEnviando(true);
    setAviso(null);
    try {
      const venda = await api.criarVenda(montarPedido(linhas, conta, cliente));
      setLinhas([]);
      setUltimo(null);
      setCliente(null);
      // a forma usada fica marcada para a próxima venda (como no DaniPets)
      setPag((p) => pagamentoInicial(proximaVenda(p.dividido ? (p.partes[0]?.forma ?? p.forma) : p.forma)));
      setAviso({
        tipo: 'ok',
        texto: `Venda ${formatarNumeroVenda(venda.numero)} finalizada: ${
          venda.pagamentos.length ? `${formatarCentavos(venda.totalCentavos)} em ${descreverPagamentos(venda.pagamentos)}` : 'brinde, sem pagamento'
        }.${venda.trocoCentavos > 0 ? ` Troco: ${formatarCentavos(venda.trocoCentavos)}.` : ''}${venda.cliente ? ` Cliente: ${venda.cliente.nome}.` : ''}`,
      });
      void recarregar(); // estoque novo
      focarCodigo();
    } catch (e) {
      erro(e instanceof ErroApi ? e.message : 'Não foi possível registrar a venda. Tente de novo.');
      void recarregar(); // a recusa pode ser falta de estoque: mostra o saldo de agora
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
        refBusca.current?.focus();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setJanela({ tipo: 'cliente' });
      } else if (FORMA_DA_TECLA[e.key]) {
        e.preventDefault();
        acoes.current.definirForma(FORMA_DA_TECLA[e.key]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setBusca('');
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
          <span className="pdv-pilula">{dataNoFuso(agora(), fuso)}</span>
        </div>
        <button type="button" className="pdv-sair" onClick={aoSair}>
          ← Painel
        </button>
      </header>

      <div className="pdv-corpo">
        <section className="pdv-esquerda" aria-label="Itens da venda">
          <form className="pdv-leitor" onSubmit={lerCodigo} autoComplete="off">
            <label htmlFor="pdv-codigo">CÓDIGO</label>
            <input
              id="pdv-codigo"
              ref={refCodigo}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              placeholder={carga.tipo === 'carregando' ? 'Carregando produtos…' : 'Bipe o código (3*código = 3 unidades)'}
              aria-label="Leitor de código de barras"
              autoFocus
            />
            <button type="submit" className="pdv-ok">
              OK
            </button>
          </form>

          <form className="pdv-busca" onSubmit={buscar} role="search" autoComplete="off">
            <input
              ref={refBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto por nome ou código (F3)"
              aria-label="Buscar produto"
              aria-controls="pdv-sugestoes"
            />
            {sugestoes.length > 0 && (
              <ul id="pdv-sugestoes" className="pdv-sugestoes" aria-label="Produtos encontrados">
                {sugestoes.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => escolher(p)}>
                      <span className="mono suave">{p.codigoInterno}</span>
                      <span className="pdv-sug-nome">
                        {p.nome}
                        <small className={(saldos.get(p.id) ?? 0) > 0 ? 'pdv-saldo' : 'pdv-saldo pdv-saldo-zero'}>saldo {Math.max(0, saldos.get(p.id) ?? 0)}</small>
                      </span>
                      <span className="numero">{formatarCentavos(p.precoCentavos)}</span>
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
                {(cliente.fiadoEmAbertoCentavos ?? 0) > 0 && (
                  <span className="pdv-chip" title="Compras no fiado ainda não pagas">
                    Fiado em aberto {formatarCentavos(cliente.fiadoEmAbertoCentavos!)}
                  </span>
                )}
                <button type="button" className="pdv-remover" onClick={tirarCliente} aria-label="Tirar o cliente da venda" title="Tirar o cliente da venda">
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="pdv-cliente-nenhum">Não identificado</span>
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
                    const preco = precoDaLinha(l, p);
                    const semAutorizacao = autorizacaoNecessaria(l, p, operador.papel) !== null && !l.desconto?.autorizacao;
                    return (
                      <tr key={l.produtoId} className={ultimaLinha?.produtoId === l.produtoId ? 'pdv-ultima' : undefined}>
                        <td className="pdv-n">{i + 1}</td>
                        <td className="pdv-nome">
                          <b>{p.nome}</b>
                          <small>
                            {p.codigoBarras ?? `cód. ${p.codigoInterno}`}
                            {l.desconto && <span className="pdv-tag"> · com desconto</span>}
                            {semAutorizacao && <span className="pdv-tag pdv-tag-erro"> · autorize o desconto de novo</span>}
                            {l.quantidade > (saldos.get(p.id) ?? 0) && (
                              <span className="pdv-tag pdv-tag-erro"> · estoque: {Math.max(0, saldos.get(p.id) ?? 0)} un.</span>
                            )}
                          </small>
                        </td>
                        <td className="numero">
                          <span className="pdv-qtd" role="group" aria-label={`Quantidade de ${p.nome}`}>
                            <button type="button" onClick={() => mudarQuantidade(p.id, l.quantidade - 1)} aria-label={`Diminuir ${p.nome}`}>
                              −
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={LIMITES_VENDA.quantidadeMax}
                              value={l.quantidade}
                              aria-label={`Quantidade de ${p.nome}`}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (Number.isFinite(n)) mudarQuantidade(p.id, n);
                              }}
                            />
                            <button type="button" onClick={() => mudarQuantidade(p.id, l.quantidade + 1)} aria-label={`Aumentar ${p.nome}`}>
                              +
                            </button>
                            <small>un</small>
                          </span>
                        </td>
                        <td className="numero pdv-preco">
                          <b>{formatarCentavos(preco)}</b>
                          {l.desconto && (
                            <small className="pdv-tag">
                              de {formatarCentavos(p.precoCentavos)} · {l.desconto.responsavelNome}
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
                        <td className="numero pdv-sub">{formatarCentavos(preco * l.quantidade)}</td>
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
                ? `${ultimaLinha.quantidade} × ${formatarCentavos(precoDaLinha(ultimaLinha, ultimoProduto))} = ${formatarCentavos(
                    precoDaLinha(ultimaLinha, ultimoProduto) * ultimaLinha.quantidade,
                  )}`
                : 'Aguardando leitura'}
            </div>
          </div>

          <div className="pdv-total">
            <div className="pdv-rotulo">TOTAL A PAGAR</div>
            <div className="pdv-total-valor" data-testid="pdv-total">
              {formatarCentavos(totais.totalCentavos)}
            </div>
          </div>

          <div className="pdv-pagamento">
            <div className="pdv-formas" role="group" aria-label="Forma de pagamento">
              {FORMAS_PAGAMENTO.map((f) => {
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
                  title={bloqueada ? 'Fiado só para cliente identificado (F6)' : undefined}
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
                      {FORMAS_PAGAMENTO.filter((f) => !formaPrecisaDeCliente(f) || cliente || parte.forma === f).map((f) => (
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

            <button type="button" className="botao pdv-dividir" onClick={dividir} disabled={pag.dividido && pag.partes.length >= LIMITES_VENDA.pagamentosMax}>
              {pag.dividido ? '+ Outra forma' : 'Dividir pagamento'}
            </button>
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
          ['Esc', 'leitor'],
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
          carregarAutorizadores={carregarAutorizadores}
          autorizar={(usuarioId, senha, precoFinalCentavos) =>
            api.autorizar({ usuarioId, senha, acao: { tipo: 'desconto', produtoId: produtoDaJanela.id, precoFinalCentavos } })
          }
          aoAplicar={(desconto) => {
            setLinhas((ls) => ls.map((l) => (l.produtoId === produtoDaJanela.id ? { ...l, desconto } : l)));
            setAviso({
              tipo: 'ok',
              texto: `Desconto aplicado: ${formatarCentavos(produtoDaJanela.precoCentavos - desconto.precoFinalCentavos)} por unidade${
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
          aoConcluir={(texto) => {
            setAviso({ tipo: 'ok', texto });
            void recarregar(); // o que voltou para a prateleira já pode ser vendido
            fecharJanela();
          }}
          aoFechar={fecharJanela}
        />
      )}
      {janela?.tipo === 'cliente' && (
        <ModalCliente
          api={api}
          aoEscolher={(c, cadastradoAgora) => {
            setCliente({ id: c.id, nome: c.nome, cpfMascarado: c.cpfMascarado, fiadoEmAbertoCentavos: c.fiadoEmAbertoCentavos });
            setAviso({ tipo: 'ok', texto: `${cadastradoAgora ? 'Cliente cadastrado' : 'Cliente'}: ${c.nome}.` });
            fecharJanela();
          }}
          aoFechar={fecharJanela}
        />
      )}
    </div>
  );
}
