// apps/web/src/painel/TelaVisaoGeral.tsx
// Visão geral: as vendas de HOJE (dia no fuso da loja), em cards.
// À meia-noite o dia muda e tudo volta a zero sozinho (nada é apagado): as
// vendas continuam nos Relatórios. As vendas vêm da Frente de caixa e mostram
// quem vendeu (a pessoa que estava logada).
//
// Como no DaniPets, cada card é clicável: abre logo abaixo o relatório "de onde
// vem este número". Clicar de novo no mesmo card (ou em Fechar) recolhe.
import {
  diaNoFuso,
  type FormaPagamento,
  formatarCentavos,
  NOME_FORMA_PAGAMENTO,
  resumirVendas,
  type Venda,
} from '@saas/core';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import type { ApiVendas } from '../api';
import { usarIntervalo } from '../usarIntervalo';
import { dataNoFuso, dataPorExtenso, horaNoFuso, plural, resumoItens, saudacao, totalItens } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiVendas;
  nome: string;
  fuso: string;
  agora?: () => Date;
  aoVerRelatorios?: () => void;
  /** Atualização automática (ms). */
  intervaloMs?: number;
}

type Detalhe =
  | { tipo: 'vendido' }
  | { tipo: 'vendas' }
  | { tipo: 'itens' }
  | { tipo: 'vendedor'; id: string; nome: string }
  | { tipo: 'forma'; forma: FormaPagamento };

const igual = (a: Detalhe | null, b: Detalhe) =>
  !!a &&
  a.tipo === b.tipo &&
  (a.tipo !== 'vendedor' || (b.tipo === 'vendedor' && a.id === b.id)) &&
  (a.tipo !== 'forma' || (b.tipo === 'forma' && a.forma === b.forma));

const ID_DETALHE = 'vg-detalhe';

export function TelaVisaoGeral({ api, nome, fuso, agora = () => new Date(), aoVerRelatorios, intervaloMs = 5000 }: Props) {
  const [instante, setInstante] = useState(() => agora());
  usarIntervalo(() => setInstante(agora()), intervaloMs);
  const hoje = diaNoFuso(instante, fuso);

  const { estado } = usarCarga(() => api.listarVendas({ de: hoje, ate: hoje }), [api, hoje], intervaloMs);
  // Filtra de novo pelo dia: à meia-noite zera na hora, mesmo antes da nova busca chegar (ou sem rede).
  const vendas = estado.tipo === 'pronto' ? estado.dados.filter((v) => diaNoFuso(v.criadaEm, fuso) === hoje) : [];
  const r = resumirVendas(vendas);

  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const alternar = (d: Detalhe) => setDetalhe((atual) => (igual(atual, d) ? null : d));
  const ativo = (d: Detalhe) => igual(detalhe, d);
  const props = (d: Detalhe) => ({
    'aria-expanded': ativo(d),
    'aria-controls': ID_DETALHE,
    onClick: () => alternar(d),
  });

  return (
    <div className="vg">
      <header className="vg-topo">
        <div>
          <h1>Visão geral</h1>
          <p className="suave">
            {saudacao(instante, fuso)}, {nome} · <span className="painel-data">{dataPorExtenso(instante, fuso)}</span>
          </p>
        </div>
      </header>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          {estado.tipo === 'pronto' && estado.avisoRede && (
            <p className="alerta alerta-aviso" role="status">
              Sem conexão com o servidor. Mostrando o último dado recebido…
            </p>
          )}

          <section className="vg-hero" aria-label="Vendas de hoje em números">
            <button type="button" className={`vg-visor${ativo({ tipo: 'vendido' }) ? ' vg-on' : ''}`} {...props({ tipo: 'vendido' })}>
              <span className="vg-visor-rotulo">VENDIDO HOJE</span>
              <strong className="vg-visor-valor" data-testid="vendido-hoje">
                {estado.tipo === 'carregando' ? '…' : formatarCentavos(r.totalCentavos)}
              </strong>
              <span className="vg-visor-nota">
                {r.quantidadeVendas === 0 ? 'Nenhuma venda ainda hoje' : `${plural(r.quantidadeVendas, 'venda', 'vendas')} até agora`}
              </span>
              <span className="vg-visor-mais">{ativo({ tipo: 'vendido' }) ? 'Fechar relatório' : 'Ver de onde vem'}</span>
            </button>
            <div className="vg-lado">
              <Metrica
                rotulo="Vendas hoje"
                valor={String(r.quantidadeVendas)}
                nota={r.quantidadeVendas ? `a última às ${horaNoFuso(vendas[0]!.criadaEm, fuso)}` : 'nenhuma ainda'}
                ativo={ativo({ tipo: 'vendas' })}
                {...props({ tipo: 'vendas' })}
              />
              <Metrica
                rotulo="Itens vendidos"
                valor={String(r.itensVendidos)}
                nota={plural(r.itensVendidos, 'unidade', 'unidades')}
                ativo={ativo({ tipo: 'itens' })}
                {...props({ tipo: 'itens' })}
              />
            </div>
          </section>

          {detalhe && (
            <PainelDetalhe
              detalhe={detalhe}
              vendas={vendas}
              fuso={fuso}
              hoje={dataNoFuso(instante, fuso)}
              aoFechar={() => setDetalhe(null)}
              aoVerRelatorios={aoVerRelatorios}
            />
          )}

          <div className="vg-pares">
            <section className="card" aria-labelledby="vg-vendedor-titulo">
              <h2 id="vg-vendedor-titulo">Por quem vendeu</h2>
              {r.porVendedor.length === 0 ? (
                <p className="suave">Ninguém vendeu hoje ainda.</p>
              ) : (
                <ul className="lista-valores lista-clicavel">
                  {r.porVendedor.map((p) => {
                    const d: Detalhe = { tipo: 'vendedor', id: p.id, nome: p.nome };
                    return (
                      <li key={p.id}>
                        <button type="button" className={ativo(d) ? 'vg-on' : undefined} {...props(d)}>
                          <span>
                            <b>{p.nome}</b>
                            <small className="suave">{plural(p.quantidade, 'venda', 'vendas')}</small>
                          </span>
                          <span className="numero">{formatarCentavos(p.totalCentavos)}</span>
                          <Seta />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="vg-forma-titulo">
              <h2 id="vg-forma-titulo">Por forma de pagamento</h2>
              {r.porForma.length === 0 ? (
                <p className="suave">Sem pagamentos hoje ainda.</p>
              ) : (
                <ul className="lista-valores lista-clicavel">
                  {r.porForma.map((f) => {
                    const d: Detalhe = { tipo: 'forma', forma: f.forma };
                    return (
                      <li key={f.forma}>
                        <button type="button" className={ativo(d) ? 'vg-on' : undefined} {...props(d)}>
                          <span>
                            <b>{NOME_FORMA_PAGAMENTO[f.forma]}</b>
                            <small className="suave">{plural(f.quantidade, 'venda', 'vendas')}</small>
                          </span>
                          <span className="numero">{formatarCentavos(f.totalCentavos)}</span>
                          <Seta />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="card card-plano" aria-labelledby="vg-vendas-titulo">
            <div className="card-cabeca">
              <h2 id="vg-vendas-titulo">Vendas de hoje</h2>
              <span className="suave">{plural(r.quantidadeVendas, 'venda', 'vendas')}</span>
            </div>
            {vendas.length === 0 ? (
              <p className="vazio">
                {estado.tipo === 'carregando' ? 'Carregando…' : 'Nenhuma venda hoje ainda. Cada venda feita na Frente de caixa aparece aqui na hora.'}
              </p>
            ) : (
              <TabelaVendasHoje vendas={vendas} fuso={fuso} />
            )}
            <p className="card-rodape">
              À meia-noite esta tela volta a zero. Todas as vendas ficam guardadas em{' '}
              {aoVerRelatorios ? (
                <button type="button" className="link" onClick={aoVerRelatorios}>
                  Relatórios
                </button>
              ) : (
                'Relatórios'
              )}
              .
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ cards
function Seta() {
  return (
    <svg className="vg-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function Metrica({
  rotulo,
  valor,
  nota,
  ativo,
  ...botao
}: { rotulo: string; valor: string; nota: string; ativo: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`vg-metrica${ativo ? ' vg-on' : ''}`} {...botao}>
      <span className="vg-metrica-texto">
        <span className="vg-metrica-rotulo">{rotulo}</span>
        <strong className="vg-metrica-valor">{valor}</strong>
        <span className="vg-metrica-nota">{nota}</span>
      </span>
      <Seta />
    </button>
  );
}

// ------------------------------------------------------------------ relatório do card
function PainelDetalhe({
  detalhe,
  vendas,
  fuso,
  hoje,
  aoFechar,
  aoVerRelatorios,
}: {
  detalhe: Detalhe;
  vendas: Venda[];
  fuso: string;
  hoje: string;
  aoFechar: () => void;
  aoVerRelatorios?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // Ao abrir (ou trocar de card), traz o relatório para a tela — importante no celular.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [detalhe.tipo, detalhe.tipo === 'vendedor' ? detalhe.id : detalhe.tipo === 'forma' ? detalhe.forma : '']);

  let titulo: string;
  let intro: string;
  let corpo: ReactNode;
  const vazio = <p className="vazio">Nenhuma venda hoje ainda.</p>;

  if (detalhe.tipo === 'vendido') {
    const r = resumirVendas(vendas);
    titulo = 'Vendido hoje';
    intro = `Soma de todas as vendas finalizadas hoje (${hoje}) na Frente de caixa. Abaixo, o mesmo total separado por forma de pagamento e por quem vendeu.`;
    corpo =
      vendas.length === 0 ? (
        vazio
      ) : (
        <>
          <p className="vg-formula">
            {vendas.length <= 6 ? (
              [...vendas].reverse().map((v, i) => (
                <span key={v.id}>
                  {i > 0 && <span className="vg-op"> + </span>}
                  venda nº {v.numero} {formatarCentavos(v.totalCentavos)}
                </span>
              ))
            ) : (
              <span>{plural(vendas.length, 'venda', 'vendas')} somadas</span>
            )}
            <span className="vg-op"> = </span>
            <b>{formatarCentavos(r.totalCentavos)}</b>
          </p>
          <h3 className="vg-sub">Por forma de pagamento</h3>
          <TabelaSimples
            colunas={['Forma de pagamento', 'Vendas', 'Valor', '% do total']}
            linhas={r.porForma.map((f) => [
              NOME_FORMA_PAGAMENTO[f.forma],
              String(f.quantidade),
              formatarCentavos(f.totalCentavos),
              pct(f.totalCentavos, r.totalCentavos),
            ])}
          />
          <h3 className="vg-sub">Por quem vendeu</h3>
          <TabelaSimples
            colunas={['Vendido por', 'Vendas', 'Valor', '% do total']}
            linhas={r.porVendedor.map((p) => [p.nome, String(p.quantidade), formatarCentavos(p.totalCentavos), pct(p.totalCentavos, r.totalCentavos)])}
          />
        </>
      );
  } else if (detalhe.tipo === 'itens') {
    titulo = 'Itens vendidos hoje';
    intro = 'Quantidade de cada produto vendido hoje, somando todas as vendas. O produto que mais vendeu (em valor) aparece primeiro.';
    const porProduto = new Map<string, { nome: string; codigo: string; quantidade: number; valor: number }>();
    vendas.forEach((v) =>
      v.itens.forEach((i) => {
        const e = porProduto.get(i.produtoId) ?? { nome: i.nome, codigo: i.codigoInterno, quantidade: 0, valor: 0 };
        e.quantidade += i.quantidade;
        e.valor += i.subtotalCentavos;
        porProduto.set(i.produtoId, e);
      }),
    );
    const linhas = [...porProduto.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
    const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);
    corpo =
      linhas.length === 0 ? (
        vazio
      ) : (
        <>
          <TabelaSimples
            colunas={['Produto', 'Código', 'Quantidade', 'Valor']}
            linhas={linhas.map((l) => [l.nome, l.codigo, plural(l.quantidade, 'un', 'un'), formatarCentavos(l.valor)])}
          />
          <p className="vg-soma">
            Total: <b>{plural(unidades, 'unidade', 'unidades')}</b> de {plural(linhas.length, 'produto', 'produtos')} diferentes
          </p>
        </>
      );
  } else {
    const filtradas =
      detalhe.tipo === 'vendedor'
        ? vendas.filter((v) => v.vendedor.id === detalhe.id)
        : detalhe.tipo === 'forma'
          ? vendas.filter((v) => v.formaPagamento === detalhe.forma)
          : vendas;
    if (detalhe.tipo === 'vendedor') {
      titulo = `Vendas de ${detalhe.nome} hoje`;
      intro = `Cada venda que ${detalhe.nome} fez hoje, entrando no sistema com o próprio usuário.`;
    } else if (detalhe.tipo === 'forma') {
      titulo = `Pago em ${NOME_FORMA_PAGAMENTO[detalhe.forma]} hoje`;
      intro = `Cada venda de hoje paga em ${NOME_FORMA_PAGAMENTO[detalhe.forma]}, com os produtos e quem vendeu.`;
    } else {
      titulo = 'Vendas de hoje';
      intro = 'Cada venda finalizada hoje, com os produtos, quem vendeu e como foi paga.';
    }
    const total = filtradas.reduce((s, v) => s + v.totalCentavos, 0);
    const itens = filtradas.reduce((s, v) => s + totalItens(v), 0);
    corpo =
      filtradas.length === 0 ? (
        vazio
      ) : (
        <>
          <TabelaDetalhada vendas={filtradas} fuso={fuso} />
          <p className="vg-soma">
            Total: <b>{formatarCentavos(total)}</b> em {plural(filtradas.length, 'venda', 'vendas')} · {plural(itens, 'item', 'itens')}
          </p>
        </>
      );
  }

  return (
    <section ref={ref} id={ID_DETALHE} className="card vg-detalhe" aria-labelledby="vg-detalhe-titulo" aria-live="polite">
      <div className="vg-detalhe-cabeca">
        <h2 id="vg-detalhe-titulo">{titulo}</h2>
        <button type="button" className="botao vg-fechar" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <p className="vg-intro">{intro}</p>
      {corpo}
      {aoVerRelatorios && (
        <p className="vg-detalhe-rodape">
          <button type="button" className="link" onClick={aoVerRelatorios}>
            Ver todas as vendas, de todos os dias, em Relatórios
          </button>
        </p>
      )}
    </section>
  );
}

const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—');

function TabelaSimples({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  return (
    <div className="tabela-caixa tabela-caixa-borda">
      <table className="tabela tabela-detalhe">
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={c} className={i > 0 ? 'numero' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.join('|')}>
              {l.map((celula, i) => (
                <td key={i} data-rotulo={colunas[i]} className={i > 0 ? 'numero' : undefined}>
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cada venda com os produtos linha a linha (quantidade, preço e subtotal). */
function TabelaDetalhada({ vendas, fuso }: { vendas: Venda[]; fuso: string }) {
  return (
    <div className="tabela-caixa tabela-caixa-borda">
      <table className="tabela tabela-vendas tabela-detalhe">
        <thead>
          <tr>
            <th>Venda</th>
            <th>Hora</th>
            <th>Produtos vendidos</th>
            <th>Vendido por</th>
            <th>Pagamento</th>
            <th className="numero">Total</th>
          </tr>
        </thead>
        <tbody>
          {vendas.map((v) => (
            <tr key={v.id}>
              <td data-rotulo="Venda" className="mono">
                nº {v.numero}
              </td>
              <td data-rotulo="Hora" className="mono">
                {horaNoFuso(v.criadaEm, fuso)}
              </td>
              <td data-rotulo="Produtos vendidos" className="itens-venda">
                {v.itens.map((i) => (
                  <div key={i.produtoId} className="vg-item">
                    <b>{i.quantidade}×</b> {i.nome}{' '}
                    <span className="suave">
                      {i.quantidade > 1 ? `${formatarCentavos(i.precoCentavos)} cada · ` : ''}
                      {formatarCentavos(i.subtotalCentavos)}
                    </span>
                  </div>
                ))}
              </td>
              <td data-rotulo="Vendido por">{v.vendedor.nome}</td>
              <td data-rotulo="Pagamento">{NOME_FORMA_PAGAMENTO[v.formaPagamento]}</td>
              <td data-rotulo="Total" className="numero">
                <b>{formatarCentavos(v.totalCentavos)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ lista do dia
function TabelaVendasHoje({ vendas, fuso }: { vendas: Venda[]; fuso: string }) {
  return (
    <div className="tabela-caixa">
      <table className="tabela tabela-vendas">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Venda</th>
            <th>Vendido por</th>
            <th>Itens</th>
            <th>Pagamento</th>
            <th className="numero">Total</th>
          </tr>
        </thead>
        <tbody>
          {vendas.map((v) => (
            <tr key={v.id}>
              <td data-rotulo="Hora" className="mono">
                {horaNoFuso(v.criadaEm, fuso)}
              </td>
              <td data-rotulo="Venda" className="mono">
                nº {v.numero}
              </td>
              <td data-rotulo="Vendido por">{v.vendedor.nome}</td>
              <td data-rotulo="Itens" className="itens-venda" title={resumoItens(v)}>
                <span className="suave">{plural(totalItens(v), 'item', 'itens')}:</span> {resumoItens(v)}
              </td>
              <td data-rotulo="Pagamento">{NOME_FORMA_PAGAMENTO[v.formaPagamento]}</td>
              <td data-rotulo="Total" className="numero">
                {formatarCentavos(v.totalCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
