// apps/web/src/painel/compras/ModalCompra.tsx
// Registrar compra por nota fiscal (DaniPets CMP-01 a 05): fornecedor, número da nota, data e vários itens
// (produto, quantidade na unidade dele, custo unitário ou do kg, validade); à vista (conta) ou a prazo
// (vencimento → conta a pagar).
//   - ao escolher o produto, sugere o último custo e o fornecedor principal (CMP-05);
//   - custo diferente da última compra: mostra custo, preço e margem e oferece mudar o preço de venda na
//     mesma gravação, com o preço que mantém a margem (CMP-04);
//   - nota repetida do mesmo fornecedor: pergunta antes (CMP-03);
//   - data de um dia com o caixa já fechado: pede a liberação de um Dono, com motivo (CX-08, módulo 5).
// Bonificação (sem custo) não é compra: é entrada de estoque, em Produtos e estoque (CMP-07).
import {
  type Compra,
  type ContaId,
  dataBr,
  formatarCentavos,
  type Fornecedor,
  lerQuantidade,
  margemPct,
  NOME_CONTA,
  type NovaCompra,
  type PedidoLiberacao,
  precoSugerido,
  reaisParaCentavos,
  somarDias,
  ultimoCusto,
  unidadeDe,
  validarNovaCompra,
  valorDaQuantidade,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiCompras, type ApiVendas, ErroApi, type Produto } from '../../api';
import { Modal } from '../caixa/Modal';
import { ModalSenha } from '../caixa/ModalSenha';

interface Props {
  /** listarAutorizadores e autorizar: a liberação do Dono para a data de um dia já fechado. */
  api: Pick<ApiCompras, 'registrarCompra'> & Pick<ApiVendas, 'listarAutorizadores' | 'autorizar'>;
  /** Produtos ativos da loja. */
  produtos: readonly Produto[];
  /** Fornecedores ativos. */
  fornecedores: readonly Fornecedor[];
  /** Compras já registradas (para o último custo). */
  compras: readonly Compra[];
  /** AAAA-MM-DD no fuso da loja. */
  hoje: string;
  aoSalvar: (compra: Compra) => void;
  aoFechar: () => void;
  confirmar?: (texto: string) => boolean;
}

interface Linha {
  produtoId: string;
  quantidade: string;
  custo: string;
  validade: string;
}

type Opcoes = { mesmoAssim?: boolean; liberacao?: PedidoLiberacao | null };

const linhaVazia = (): Linha => ({ produtoId: '', quantidade: '', custo: '', validade: '' });
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : `${n.toFixed(1).replace('.', ',')}%`);

interface Mudanca {
  produto: Produto;
  antes: number;
  depois: number;
  sugerido: number;
}

export function ModalCompra({ api, produtos, fornecedores, compras, hoje, aoSalvar, aoFechar, confirmar = (t) => window.confirm(t) }: Props) {
  const [fornecedorId, setFornecedorId] = useState('');
  const [nota, setNota] = useState('');
  const [data, setData] = useState(hoje);
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [tipo, setTipo] = useState<'avista' | 'aprazo'>('avista');
  const [conta, setConta] = useState<ContaId>('banco');
  const [vencimento, setVencimento] = useState(somarDias(hoje, 30));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mudancas, setMudancas] = useState<Mudanca[] | null>(null);
  const [precos, setPrecos] = useState<Record<string, { marcado: boolean; texto: string }>>({});
  /** Data de um dia já fechado: a compra espera a liberação do Dono. */
  const [liberar, setLiberar] = useState<{ pedido: NovaCompra; texto: string; opcoes: Opcoes } | null>(null);

  const porId = new Map(produtos.map((p) => [p.id, p]));
  const mudarLinha = (i: number, campo: keyof Linha, valor: string) => {
    const atual = linhas[i]!;
    const nova = { ...atual, [campo]: valor };
    if (campo === 'produtoId' && valor) {
      // sugere o último custo e o fornecedor principal (DaniPets CMP-05)
      const ultimo = ultimoCusto(compras, valor);
      if (!atual.custo.trim() && ultimo !== null) nova.custo = reais(ultimo);
      const p = porId.get(valor);
      if (!fornecedorId && p?.fornecedorId && fornecedores.some((f) => f.id === p.fornecedorId)) setFornecedorId(p.fornecedorId);
    }
    setLinhas((ls) => ls.map((l, j) => (j === i ? nova : l)));
  };

  const lidas = linhas.map((l) => {
    const p = porId.get(l.produtoId);
    const u = unidadeDe(p?.unidade);
    const quantidade = l.quantidade.trim() ? lerQuantidade(l.quantidade, u) : null;
    const custo = l.custo.trim() ? reaisParaCentavos(l.custo) : null;
    return { l, p, u, quantidade, custo, total: quantidade !== null && custo !== null ? valorDaQuantidade(custo, quantidade, u) : null };
  });
  const totalNota = lidas.reduce((s, x) => s + (x.total ?? 0), 0);

  function montarPedido(): NovaCompra | null {
    const usadas = lidas.filter((x) => x.l.produtoId || x.l.quantidade.trim() || x.l.custo.trim());
    for (const [n, x] of usadas.entries()) {
      if (!x.p) return setErro(`Item ${n + 1}: escolha o produto.`), null;
      if (x.quantidade === null || x.quantidade <= 0) return setErro(`${x.p.nome}: informe a quantidade ${x.u === 'kg' ? 'em kg (até 3 casas)' : 'em unidades inteiras'}.`), null;
      if (x.custo === null || x.custo <= 0) {
        return setErro(`${x.p.nome}: informe o custo unitário (maior que zero). Mercadoria de bonificação: lance como entrada em Produtos e estoque.`), null;
      }
    }
    const pedido = {
      fornecedorId: fornecedorId || null,
      notaFiscal: nota.trim() || null,
      data,
      itens: usadas.map((x) => ({ produtoId: x.p!.id, quantidade: x.quantidade!, custoCentavos: x.custo!, validade: x.l.validade || null })),
      pagamento: tipo === 'avista' ? { tipo: 'avista' as const, conta } : { tipo: 'aprazo' as const, vencimento },
    };
    const v = validarNovaCompra(pedido, { hoje });
    if (!v.ok) return setErro(v.erros[0]!.mensagem), null;
    return v.valor;
  }

  /** Grava; NF repetida pergunta "mesmo assim?"; dia já fechado pede a liberação do Dono (e grava depois dela). */
  async function gravar(pedido: NovaCompra, opcoes: Opcoes = {}): Promise<void> {
    try {
      aoSalvar(await api.registrarCompra(pedido, opcoes));
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'nf_repetida' && !opcoes.mesmoAssim) {
        if (!confirmar(`${e.message} Registrar mesmo assim?`)) return;
        return gravar(pedido, { ...opcoes, mesmoAssim: true });
      }
      if (e instanceof ErroApi && e.codigo === 'dia_fechado' && !opcoes.liberacao) return setLiberar({ pedido, texto: e.message, opcoes });
      throw e;
    }
  }

  async function enviar(pedido: NovaCompra) {
    setEnviando(true);
    try {
      await gravar(pedido);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível registrar a compra. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  function continuar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const pedido = montarPedido();
    if (!pedido) return;
    // custo diferente da última compra (vale o último item de cada produto): pergunta do preço (DaniPets CMP-04)
    const ultimoItem = new Map(pedido.itens.map((i) => [i.produtoId, i]));
    const lista: Mudanca[] = [];
    for (const [pid, i] of ultimoItem) {
      const antes = ultimoCusto(compras, pid);
      const p = porId.get(pid)!;
      if (antes !== null && antes !== i.custoCentavos) lista.push({ produto: p, antes, depois: i.custoCentavos, sugerido: precoSugerido(p.precoCentavos, antes, i.custoCentavos) });
    }
    if (lista.length === 0) return void enviar(pedido);
    setPrecos(Object.fromEntries(lista.map((m) => [m.produto.id, { marcado: false, texto: reais(m.sugerido) }])));
    setMudancas(lista);
  }

  function registrarComPrecos(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const pedido = montarPedido();
    if (!pedido || !mudancas) return;
    const novos: Record<string, number> = {};
    for (const m of mudancas) {
      const escolha = precos[m.produto.id];
      if (!escolha?.marcado) continue;
      const v = reaisParaCentavos(escolha.texto);
      if (v === null || v <= 0) return setErro(`Informe o novo preço de venda de ${m.produto.nome}.`);
      novos[m.produto.id] = v;
    }
    void enviar(Object.keys(novos).length ? { ...pedido, precos: novos } : pedido);
  }

  if (liberar) {
    return (
      <ModalSenha
        api={api}
        liberacao
        acao={{ tipo: 'dia_fechado', dia: liberar.pedido.data }}
        texto={liberar.texto}
        aoAutorizar={async (a) => {
          await gravar(liberar.pedido, { ...liberar.opcoes, liberacao: { autorizacao: a.autorizacao, motivo: a.motivo } });
        }}
        aoFechar={() => {
          setLiberar(null);
          setErro('Compra não registrada: falta a liberação de um Dono.');
        }}
      />
    );
  }

  if (mudancas) {
    return (
      <Modal titulo={mudancas.length === 1 ? `O custo de compra ${mudancas[0]!.depois > mudancas[0]!.antes ? 'subiu' : 'baixou'}` : `${mudancas.length} produtos mudaram de custo nesta nota`} aoFechar={aoFechar} larga>
        <form className="modal-form" onSubmit={registrarComPrecos} noValidate>
          <p className="modal-sub">O preço sugerido mantém a mesma margem sobre o custo novo. Sem marcar, o preço de venda continua o mesmo.</p>
          <div className="tabela-caixa">
            <table className="tabela tabela-detalhe compra-custos">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Custo (última compra → esta)</th>
                  <th>Preço de venda e margem</th>
                  <th>Novo preço de venda</th>
                </tr>
              </thead>
              <tbody>
                {mudancas.map((m) => {
                  const varia = m.antes > 0 ? ((m.depois - m.antes) / m.antes) * 100 : null;
                  const escolha = precos[m.produto.id]!;
                  return (
                    <tr key={m.produto.id}>
                      <td data-rotulo="Produto">
                        <b>{m.produto.nome}</b>
                      </td>
                      <td data-rotulo="Custo">
                        {formatarCentavos(m.antes)} → <b>{formatarCentavos(m.depois)}</b> <small className="suave">({varia !== null && varia > 0 ? '+' : ''}{pct(varia)})</small>
                      </td>
                      <td data-rotulo="Preço e margem">
                        {formatarCentavos(m.produto.precoCentavos)}{' '}
                        <small className="suave">
                          margem {pct(margemPct(m.produto.precoCentavos, m.antes))} → {pct(margemPct(m.produto.precoCentavos, m.depois))}
                        </small>
                      </td>
                      <td data-rotulo="Novo preço">
                        <label className="compra-novo-preco">
                          <input
                            type="checkbox"
                            checked={escolha.marcado}
                            onChange={(e) => setPrecos((pr) => ({ ...pr, [m.produto.id]: { ...escolha, marcado: e.target.checked } }))}
                            aria-label={`Mudar o preço de venda de ${m.produto.nome}`}
                          />
                          Mudar para R$
                          <input
                            value={escolha.texto}
                            inputMode="decimal"
                            onChange={(e) => setPrecos((pr) => ({ ...pr, [m.produto.id]: { marcado: true, texto: e.target.value } }))}
                            aria-label={`Novo preço de venda de ${m.produto.nome}`}
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {erro && (
            <p className="alerta alerta-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="modal-acoes">
            <button type="submit" className="botao botao-primario" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar compra'}
            </button>
            <button type="button" className="botao" onClick={() => setMudancas(null)}>
              Voltar
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal titulo="Registrar compra" aoFechar={aoFechar} larga>
      <form className="modal-form" onSubmit={continuar} noValidate autoComplete="off">
        <div className="modal-grade compra-cabeca">
          <div className="campo">
            <label htmlFor="compra-fornecedor">Fornecedor</label>
            <select id="compra-fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="compra-nota">Número da nota fiscal (opcional)</label>
            <input id="compra-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} />
          </div>
          <div className="campo">
            <label htmlFor="compra-data">Data da compra</label>
            <input id="compra-data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        <div className="tabela-caixa">
          <table className="tabela tabela-detalhe compra-itens">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Custo unitário (R$)</th>
                <th>Validade</th>
                <th className="numero">Total</th>
                <th>
                  <span className="sr-only">Tirar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lidas.map((x, i) => (
                <tr key={i}>
                  <td data-rotulo="Produto">
                    <select value={x.l.produtoId} onChange={(e) => mudarLinha(i, 'produtoId', e.target.value)} aria-label={`Produto do item ${i + 1}`}>
                      <option value="">Escolha…</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} ({p.codigoBarras ?? p.codigoInterno})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-rotulo="Quantidade">
                    <span className="compra-qtd">
                      <input
                        value={x.l.quantidade}
                        onChange={(e) => mudarLinha(i, 'quantidade', e.target.value)}
                        inputMode={x.u === 'kg' ? 'decimal' : 'numeric'}
                        aria-label={`Quantidade do item ${i + 1}`}
                        placeholder="0"
                      />
                      <small>{x.u}</small>
                    </span>
                  </td>
                  <td data-rotulo="Custo unitário">
                    <input value={x.l.custo} onChange={(e) => mudarLinha(i, 'custo', e.target.value)} inputMode="decimal" aria-label={`Custo do item ${i + 1}${x.u === 'kg' ? ' (do kg)' : ''}`} placeholder="0,00" />
                  </td>
                  <td data-rotulo="Validade">
                    <input type="date" value={x.l.validade} onChange={(e) => mudarLinha(i, 'validade', e.target.value)} aria-label={`Validade do item ${i + 1}`} />
                  </td>
                  <td data-rotulo="Total" className="numero">
                    {x.total === null ? '—' : formatarCentavos(x.total)}
                  </td>
                  <td>
                    {linhas.length > 1 && (
                      <button type="button" className="pdv-remover" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label={`Tirar o item ${i + 1}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="compra-linha-acoes">
          <button type="button" className="botao" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>
            + Adicionar item
          </button>
          <span>
            Total da nota: <b data-testid="compra-total">{formatarCentavos(totalNota)}</b>
          </span>
        </div>
        <p className="modal-dica">Mercadoria de bonificação (sem custo) não é compra: lance como entrada em Produtos e estoque.</p>

        <fieldset className="dev-acao">
          <legend>Pagamento</legend>
          <label>
            <input type="radio" name="compra-tipo" checked={tipo === 'avista'} onChange={() => setTipo('avista')} /> À vista, saindo de{' '}
            <select value={conta} onChange={(e) => setConta(e.target.value as ContaId)} disabled={tipo !== 'avista'} aria-label="Conta de pagamento">
              <option value="banco">{NOME_CONTA.banco}</option>
              <option value="caixa">{NOME_CONTA.caixa}</option>
            </select>
          </label>
          <label>
            <input type="radio" name="compra-tipo" checked={tipo === 'aprazo'} onChange={() => setTipo('aprazo')} /> A prazo, vencendo em{' '}
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} disabled={tipo !== 'aprazo'} aria-label="Vencimento" />
            {tipo === 'aprazo' && <small className="suave"> ({dataBr(vencimento)}: vira conta a pagar)</small>}
          </label>
        </fieldset>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar compra'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
