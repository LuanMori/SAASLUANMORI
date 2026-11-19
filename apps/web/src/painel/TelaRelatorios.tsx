// apps/web/src/painel/TelaRelatorios.tsx
// Relatórios: TODAS as vendas (de todos os dias), com quem vendeu e o cliente (F6).
// Filtros: período (atalhos + datas), quem vendeu, cliente e forma de pagamento.
// Vendas canceladas aparecem na lista (riscadas), mas ficam fora dos totais.
// "Total vendido" é o bruto; quando há devolução no período aparece também o líquido
// (bruto menos devoluções), como nos relatórios do DaniPets.
// Os filtros de quem vendeu, cliente e pagamento valem também para as devoluções e para as
// taxas de cartão (que vêm do financeiro: o que fica com a operadora).
import {
  descreverPagamentos,
  diaNoFuso,
  type FormaPagamento,
  FORMAS_PAGAMENTO,
  formatarCentavos,
  formatarNumeroVenda,
  NOME_FORMA_PAGAMENTO,
  resumirDevolucoes,
  resumirVendas,
  somarDias,
  taxasDasVendas,
} from '@saas/core';
import { useMemo, useState } from 'react';
import type { ApiFinanceiro, ApiVendas } from '../api';
import { dataNoFuso, horaNoFuso, itensVendidos, plural, quantidadeDoItem, totalItens } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  /** listarRecebiveis (Financeiro) é opcional: sem ele, as taxas de cartão não aparecem. */
  api: ApiVendas & Partial<Pick<ApiFinanceiro, 'listarRecebiveis'>>;
  fuso: string;
  agora?: () => Date;
}

type Atalho = 'tudo' | 'hoje' | 'ontem' | '7dias' | 'mes';

function periodoDo(atalho: Atalho, hoje: string): { de: string; ate: string } {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'ontem':
      return { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) };
    case '7dias':
      return { de: somarDias(hoje, -6), ate: hoje };
    case 'mes':
      return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
    default:
      return { de: '', ate: '' };
  }
}

const SEM_CLIENTE = '__sem-cliente__';

const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Todas' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
];

export function TelaRelatorios({ api, fuso, agora = () => new Date() }: Props) {
  const hoje = diaNoFuso(agora(), fuso);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [forma, setForma] = useState<FormaPagamento | ''>('');
  /** '' = todos; SEM_CLIENTE = vendas sem cliente identificado; ou o id do cliente. */
  const [cliente, setCliente] = useState('');

  const { estado } = usarCarga(() => api.listarVendas({ de: de || null, ate: ate || null }), [api, de, ate]);
  const doPeriodo = useMemo(() => (estado.tipo === 'pronto' ? estado.dados : []), [estado]);

  // Lista de quem vendeu sai das próprias vendas do período (inclui quem já saiu da loja).
  const vendedores = useMemo(() => {
    const m = new Map<string, string>();
    doPeriodo.forEach((v) => m.set(v.vendedor.id, v.vendedor.nome));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [doPeriodo]);

  // Clientes também saem das vendas do período (com o nome da hora da venda).
  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    doPeriodo.forEach((v) => v.cliente && m.set(v.cliente.id, v.cliente.nome));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [doPeriodo]);

  const doCliente = (c: { id: string } | null) => !cliente || (cliente === SEM_CLIENTE ? !c : c?.id === cliente);
  const vendas = doPeriodo.filter(
    (v) => (!vendedor || v.vendedor.id === vendedor) && (!forma || v.pagamentos.some((p) => p.forma === forma)) && doCliente(v.cliente),
  );
  const r = resumirVendas(vendas);
  const { estado: estadoRec } = usarCarga(() => (api.listarRecebiveis ? api.listarRecebiveis() : Promise.resolve([])), [api]);
  const taxas =
    estadoRec.tipo === 'pronto'
      ? taxasDasVendas(
          estadoRec.dados.filter((x) => !forma || x.forma === forma),
          new Set(vendas.filter((v) => v.status === 'finalizada').map((v) => v.id)),
        )
      : 0;
  const { estado: estadoDev } = usarCarga(() => api.listarDevolucoes({ de: de || null, ate: ate || null }), [api, de, ate]);
  // devoluções feitas no período, das vendas que passam nos mesmos filtros
  const dev = resumirDevolucoes(
    (estadoDev.tipo === 'pronto' ? estadoDev.dados : []).filter(
      (d) => (!vendedor || d.vendaVendedor.id === vendedor) && (!forma || d.vendaFormas.includes(forma)) && doCliente(d.vendaCliente),
    ),
  );
  const atalhoAtivo = ATALHOS.find((a) => {
    const p = periodoDo(a.id, hoje);
    return p.de === de && p.ate === ate;
  })?.id;

  return (
    <div className="rel">
      <header className="vg-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="suave">Todas as vendas da loja, de todos os dias, com quem vendeu e o cliente.</p>
        </div>
      </header>

      <section className="card rel-filtros" aria-label="Filtros">
        <div className="rel-atalhos" role="group" aria-label="Período">
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip${atalhoAtivo === a.id ? ' chip-on' : ''}`}
              aria-pressed={atalhoAtivo === a.id}
              onClick={() => {
                const p = periodoDo(a.id, hoje);
                setDe(p.de);
                setAte(p.ate);
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="rel-campos">
          <div className="campo">
            <label htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="rel-vendedor">Vendido por</label>
            <select id="rel-vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="rel-cliente">Cliente</label>
            <select id="rel-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos</option>
              <option value={SEM_CLIENTE}>Sem cliente identificado</option>
              {clientes.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="rel-forma">Pagamento</label>
            <select id="rel-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento | '')}>
              <option value="">Todas</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {NOME_FORMA_PAGAMENTO[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          <section className="rel-metricas" aria-label="Resumo do período">
            <Cartao rotulo="Total vendido" valor={formatarCentavos(r.totalCentavos)} />
            <Cartao rotulo="Vendas" valor={String(r.quantidadeVendas)} />
            <Cartao rotulo="Ticket médio" valor={formatarCentavos(r.ticketMedioCentavos)} />
            <Cartao rotulo="Itens vendidos" valor={itensVendidos(r.itensVendidos, r.gramasVendidas)} />
          </section>
          {(r.descontoCentavos > 0 || dev.quantidade > 0 || r.canceladas > 0 || taxas > 0) && (
            <p className="rel-extra suave" data-testid="rel-extra">
              {[
                r.descontoCentavos > 0 ? `Descontos dados: ${formatarCentavos(r.descontoCentavos)}` : null,
                dev.quantidade > 0 ? `Devoluções no período: ${formatarCentavos(dev.totalCentavos)} (${plural(dev.quantidade, 'devolução', 'devoluções')})` : null,
                dev.quantidade > 0 ? `Vendas líquidas (total vendido menos devoluções): ${formatarCentavos(r.totalCentavos - dev.totalCentavos)}` : null,
                r.canceladas > 0 ? `${plural(r.canceladas, 'venda cancelada', 'vendas canceladas')} (fora dos totais)` : null,
                taxas > 0 ? `Taxas de cartão: ${formatarCentavos(taxas)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="vg-pares">
            <section className="card" aria-labelledby="rel-vendedor-titulo">
              <h2 id="rel-vendedor-titulo">Por quem vendeu</h2>
              {r.porVendedor.length === 0 ? (
                <p className="suave">Sem vendas no período.</p>
              ) : (
                <ul className="lista-valores">
                  {r.porVendedor.map((p) => (
                    <li key={p.id}>
                      <span>
                        <b>{p.nome}</b>
                        <small className="suave">{plural(p.quantidade, 'venda', 'vendas')}</small>
                      </span>
                      <span className="numero">{formatarCentavos(p.totalCentavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="rel-forma-titulo">
              <h2 id="rel-forma-titulo">Por forma de pagamento</h2>
              {r.porForma.length === 0 ? (
                <p className="suave">Sem vendas no período.</p>
              ) : (
                <ul className="lista-valores">
                  {r.porForma.map((f) => (
                    <li key={f.forma}>
                      <span>
                        <b>{NOME_FORMA_PAGAMENTO[f.forma]}</b>
                        <small className="suave">{plural(f.quantidade, 'venda', 'vendas')}</small>
                      </span>
                      <span className="numero">{formatarCentavos(f.totalCentavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card card-plano" aria-labelledby="rel-lista-titulo">
            <div className="card-cabeca">
              <h2 id="rel-lista-titulo">Vendas</h2>
              <span className="suave">{plural(vendas.length, 'venda', 'vendas')}</span>
            </div>
            {vendas.length === 0 ? (
              <p className="vazio">{estado.tipo === 'carregando' ? 'Carregando…' : 'Nenhuma venda encontrada com esses filtros.'}</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Venda</th>
                      <th>Vendido por</th>
                      <th>Cliente</th>
                      <th>Itens</th>
                      <th>Pagamento</th>
                      <th className="numero">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.map((v) => (
                      <tr key={v.id} className={v.status === 'cancelada' ? 'rel-cancelada' : undefined}>
                        <td data-rotulo="Data" className="mono">
                          {dataNoFuso(v.criadaEm, fuso)}
                        </td>
                        <td data-rotulo="Hora" className="mono">
                          {horaNoFuso(v.criadaEm, fuso)}
                        </td>
                        <td data-rotulo="Venda" className="mono">
                          {formatarNumeroVenda(v.numero)}
                          {v.status === 'cancelada' && <span className="tag-cancelada">cancelada</span>}
                          {v.devolucoes.length > 0 && <small className="vg-tag-desc"> com devolução</small>}
                        </td>
                        <td data-rotulo="Vendido por">{v.vendedor.nome}</td>
                        <td data-rotulo="Cliente">{v.cliente?.nome ?? '—'}</td>
                        <td data-rotulo="Itens" className="itens-venda">
                          <details>
                            <summary>{plural(totalItens(v), 'item', 'itens')}</summary>
                            <ul>
                              {v.itens.map((i) => (
                                <li key={i.produtoId}>
                                  {quantidadeDoItem(i)} {i.nome} <span className="suave">({formatarCentavos(i.precoCentavos)}{i.unidade === 'kg' ? ' o kg' : ' cada'})</span>
                                  {i.desconto && (
                                    <span className="vg-tag-desc">
                                      {' '}
                                      · desconto de {formatarCentavos(i.precoListaCentavos)} · {i.desconto.motivo} · {i.desconto.responsavel.nome}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </td>
                        <td data-rotulo="Pagamento">{descreverPagamentos(v.pagamentos)}</td>
                        <td data-rotulo="Total" className={v.status === 'cancelada' ? 'numero vg-riscado' : 'numero'}>
                          {formatarCentavos(v.totalCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="card rel-cartao">
      <span className="vg-metrica-rotulo">{rotulo}</span>
      <strong className="rel-cartao-valor">{valor}</strong>
    </div>
  );
}
