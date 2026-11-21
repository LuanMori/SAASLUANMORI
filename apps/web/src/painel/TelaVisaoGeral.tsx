// apps/web/src/painel/TelaVisaoGeral.tsx
// Visão geral no formato do DaniPets V9.3.3, só com o essencial:
//   [ VENDAS DE HOJE (card grande) ] [ Produtos ativos  ]
//                                    [ Saldo das contas ]
// Embaixo, o card Pendências (o que entra nele ainda está A DEFINIR: docs/PENDENCIAS.md). Já ligada: a #16,
// caixa fechado sozinho à meia-noite ("Deseja verificar?"), para o Dono e o Administrador.
// Nada mais aparece na tela. Mais informação só ao clicar:
//   - card grande: abre logo abaixo o relatório das vendas de hoje (de onde vem
//     o número, por forma de pagamento, por quem vendeu e venda por venda);
//   - Produtos ativos: vai para a aba Produtos e estoque;
//   - Saldo das contas: vai para a aba Financeiro (só Dono e Administrador). Mostra o saldo do
//     Caixa físico + Conta bancária, alimentado pelas vendas, e quanto ainda cai de cartão.
// "Hoje" é o dia no fuso da loja: à meia-noite tudo volta a zero sozinho, sem
// apagar nada (as vendas continuam nos Relatórios).
import {
  descreverPagamentos,
  type DevolucaoComVenda,
  diaNoFuso,
  formatarCentavos,
  formatarNumeroVenda,
  NOME_FORMA_PAGAMENTO,
  resumirDevolucoes,
  resumirVendas,
  type Venda,
  unidadeDe,
  valorDaQuantidade,
} from '@saas/core';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import type { ApiPainel } from '../api';
import { usarIntervalo } from '../usarIntervalo';
import { CardPendencias } from './CardPendencias';
import { comoVoltou, dataNoFuso, dataPorExtenso, horaNoFuso, pagamentosComValores, plural, produtosVendidos, quantidadeDoItem, saudacao } from './formato';
import type { IdSecao } from './menu';
import { NOTA_PENDENCIAS_A_DEFINIR, type Pendencia } from './pendencias';
import { pendenciasDoCaixa } from './regrasPendencias';
import { usarCarga } from './usarCarga';

interface Props {
  /** resumoFinanceiro só é chamado para quem vê o Financeiro (aoVerFinanceiro). */
  api: Pick<ApiPainel, 'listarVendas' | 'listarProdutos' | 'listarDevolucoes'> & Partial<Pick<ApiPainel, 'resumoFinanceiro' | 'lerSituacaoDoCaixa'>>;
  nome: string;
  fuso: string;
  agora?: () => Date;
  /** Card "Produtos ativos" leva para Produtos e estoque. Sem isto, o card não aparece. */
  aoVerProdutos?: () => void;
  /** Card "Saldo das contas" leva para o Financeiro. Sem isto (sem permissão), o card não aparece. */
  aoVerFinanceiro?: () => void;
  /** Link para Relatórios no rodapé do relatório. Sem isto (sem permissão), fica só o texto. */
  aoVerRelatorios?: () => void;
  /** A situação do caixa no cabeçalho leva para o Caixa do dia (DaniPets ACE-16). */
  aoVerCaixa?: () => void;
  /** Pendências do card. null = ainda não definidas (o card diz isso). */
  pendencias?: readonly Pendencia[] | null;
  /** Botão de uma pendência leva para a aba onde se resolve. */
  aoIrPara?: (secao: IdSecao) => void;
  /** Atualização automática (ms). */
  intervaloMs?: number;
}

const ID_DETALHE = 'vg-detalhe';

export function TelaVisaoGeral({
  api,
  nome,
  fuso,
  agora = () => new Date(),
  aoVerProdutos,
  aoVerFinanceiro,
  aoVerRelatorios,
  aoVerCaixa,
  pendencias = null,
  aoIrPara,
  intervaloMs = 5000,
}: Props) {
  const [instante, setInstante] = useState(() => agora());
  usarIntervalo(() => setInstante(agora()), intervaloMs);
  const hoje = diaNoFuso(instante, fuso);

  const { estado } = usarCarga(() => api.listarVendas({ de: hoje, ate: hoje }), [api, hoje], intervaloMs);
  const { estado: estadoProdutos } = usarCarga(() => api.listarProdutos(), [api], aoVerProdutos ? intervaloMs : 0);
  // Filtra de novo pelo dia: à meia-noite zera na hora, mesmo antes da nova busca chegar (ou sem rede).
  const vendas = estado.tipo === 'pronto' ? estado.dados.filter((v) => diaNoFuso(v.criadaEm, fuso) === hoje) : [];
  const r = resumirVendas(vendas); // canceladas ficam fora
  // Devoluções feitas hoje (mesmo de vendas de outros dias), como no DaniPets.
  const { estado: estadoDev } = usarCarga(() => api.listarDevolucoes({ de: hoje, ate: hoje }), [api, hoje], intervaloMs);
  const devolucoes = estadoDev.tipo === 'pronto' ? estadoDev.dados.filter((d) => diaNoFuso(d.criadaEm, fuso) === hoje) : [];
  const dev = resumirDevolucoes(devolucoes);
  const [aberto, setAberto] = useState(false);

  // Saldo das contas: só para quem vê o Financeiro (Dono e Administrador)
  const comFinanceiro = Boolean(aoVerFinanceiro && api.resumoFinanceiro);
  const { estado: estadoFin } = usarCarga(
    () => (comFinanceiro && api.resumoFinanceiro ? api.resumoFinanceiro() : Promise.resolve(null)),
    [api, comFinanceiro],
    comFinanceiro ? intervaloMs : 0,
  );
  const financeiro = estadoFin.tipo === 'pronto' ? estadoFin.dados : null;
  // situação do caixa de hoje no cabeçalho ("Caixa aberto às 08:10"), como no DaniPets
  const { estado: estadoCaixa } = usarCarga(() => (api.lerSituacaoDoCaixa ? api.lerSituacaoDoCaixa() : Promise.resolve(null)), [api, hoje], intervaloMs);
  const caixa = estadoCaixa.tipo === 'pronto' ? estadoCaixa.dados : null;
  const textoCaixa = !caixa
    ? null
    : caixa.estado === 'aberto' && caixa.abertoEm
      ? `Caixa aberto às ${horaNoFuso(caixa.abertoEm, fuso)}`
      : caixa.estado === 'fechado'
        ? 'Caixa de hoje fechado'
        : 'Caixa de hoje não aberto';
  const classeCaixa = `caixa-situacao vg-caixa${caixa?.estado === 'aberto' ? ' caixa-aberto' : caixa?.estado === 'nao_aberto' ? ' caixa-nao-aberto' : ''}`;
  // #16: fechamento automático a verificar. A lista só vem para quem confere o caixa (Dono e Administrador);
  // sem ela (Vendedor, ou servidor sem o caixa), ficam só as pendências recebidas (null = nada definido).
  const doCaixa = caixa?.aVerificar ? pendenciasDoCaixa(caixa.aVerificar).map((p) => (aoVerCaixa ? p : { ...p, acao: undefined })) : null;
  const todasPendencias = doCaixa === null ? pendencias : [...doCaixa, ...(pendencias ?? [])];
  const lendoCaixa = Boolean(api.lerSituacaoDoCaixa) && estadoCaixa.tipo === 'carregando';

  const produtos = estadoProdutos.tipo === 'pronto' ? estadoProdutos.dados : null;
  const ativos = produtos ? produtos.filter((p) => p.ativo).length : 0;
  const inativos = produtos ? produtos.length - ativos : 0;
  const temLado = Boolean(aoVerProdutos || aoVerFinanceiro);

  return (
    <div className="vg">
      <header className="vg-topo">
        <div>
          <h1>Visão geral</h1>
          <p className="suave">
            {saudacao(instante, fuso)}, {nome} · <span className="painel-data">{dataPorExtenso(instante, fuso)}</span>
          </p>
        </div>
        {textoCaixa &&
          (aoVerCaixa ? (
            <button type="button" className={classeCaixa} onClick={aoVerCaixa} title="Abrir o Caixa do dia">
              {textoCaixa}
            </button>
          ) : (
            <span className={classeCaixa}>{textoCaixa}</span>
          ))}
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

          <section className={`vg-hero${temLado ? '' : ' vg-hero-so'}`} aria-label="Resumo de hoje">
            <button
              type="button"
              className={`vg-visor${aberto ? ' vg-on' : ''}`}
              aria-expanded={aberto}
              aria-controls={ID_DETALHE}
              title={aberto ? 'Fechar o relatório' : 'Ver de onde vem este número'}
              onClick={() => setAberto((v) => !v)}
            >
              <span className="vg-visor-texto">
                <span className="vg-visor-rotulo">VENDAS DE HOJE</span>
                <strong className="vg-visor-valor" data-testid="vendido-hoje">
                  {estado.tipo === 'carregando' ? '…' : formatarCentavos(r.totalCentavos)}
                </strong>
                <span className="vg-visor-nota" data-testid="vendido-hoje-nota">
                  {r.quantidadeVendas === 0 ? (
                    'Nenhuma venda ainda hoje'
                  ) : (
                    <>
                      <span>{produtosVendidos(r.itensVendidos, r.gramasVendidas)}</span>
                      <span className="vg-ponto" aria-hidden="true">
                        ·
                      </span>
                      <span>{plural(r.quantidadeVendas, 'venda', 'vendas')}</span>
                      {dev.totalCentavos > 0 && (
                        <>
                          <span className="vg-ponto" aria-hidden="true">
                            ·
                          </span>
                          <span>devoluções {formatarCentavos(dev.totalCentavos)}</span>
                        </>
                      )}
                    </>
                  )}
                </span>
              </span>
              <Seta className="vg-visor-seta" />
            </button>

            {temLado && (
              <div className="vg-lado">
                {aoVerProdutos && (
                  <Atalho
                    rotulo="Produtos ativos"
                    destino="Produtos e estoque"
                    onClick={aoVerProdutos}
                    valor={
                      produtos === null ? (
                        '…'
                      ) : (
                        <>
                          {ativos}
                          {inativos > 0 && <small> · {plural(inativos, 'inativo', 'inativos')}</small>}
                        </>
                      )
                    }
                  />
                )}
                {aoVerFinanceiro && (
                  <Atalho
                    rotulo="Saldo das contas"
                    destino="Financeiro"
                    onClick={aoVerFinanceiro}
                    valor={financeiro ? formatarCentavos(financeiro.totalCentavos) : estadoFin.tipo === 'carregando' ? '…' : '—'}
                    nota={financeiro ? notaAReceber(financeiro.aReceber.totalCentavos, financeiro.fiado?.totalCentavos ?? 0) : estadoFin.tipo === 'carregando' ? undefined : 'Não foi possível carregar o saldo'}
                  />
                )}
              </div>
            )}
          </section>

          {aberto && (
            <RelatorioVendasHoje
              vendas={vendas}
              devolucoes={devolucoes}
              fuso={fuso}
              hoje={dataNoFuso(instante, fuso)}
              aoFechar={() => setAberto(false)}
              aoVerRelatorios={aoVerRelatorios}
            />
          )}

          <CardPendencias pendencias={todasPendencias} aoIrPara={aoIrPara} nota={doCaixa !== null ? NOTA_PENDENCIAS_A_DEFINIR : null} carregando={lendoCaixa} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ cards
function Seta({ className = 'vg-seta' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Card do lado do card grande: leva para outra aba. */
function Atalho({
  rotulo,
  valor,
  nota,
  destino,
  ...botao
}: { rotulo: string; valor: ReactNode; nota?: string; destino: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="vg-atalho" title={`Abrir ${destino}`} {...botao}>
      <span className="vg-atalho-texto">
        <span className="vg-atalho-rotulo">{rotulo}</span>
        <strong className="vg-atalho-valor">{valor}</strong>
        {nota && <span className="vg-atalho-nota">{nota}</span>}
      </span>
      <Seta />
    </button>
  );
}

// ------------------------------------------------------------------ relatório do card grande
function RelatorioVendasHoje({
  vendas,
  devolucoes,
  fuso,
  hoje,
  aoFechar,
  aoVerRelatorios,
}: {
  vendas: Venda[];
  devolucoes: DevolucaoComVenda[];
  fuso: string;
  hoje: string;
  aoFechar: () => void;
  aoVerRelatorios?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // Ao abrir, traz o relatório para a tela — importante no celular.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const r = resumirVendas(vendas);
  const finalizadas = vendas.filter((v) => v.status === 'finalizada');
  const canceladas = vendas.filter((v) => v.status === 'cancelada');

  return (
    <section ref={ref} id={ID_DETALHE} className="card vg-detalhe" aria-labelledby="vg-detalhe-titulo" aria-live="polite">
      <div className="vg-detalhe-cabeca">
        <h2 id="vg-detalhe-titulo">Vendas de hoje</h2>
        <button type="button" className="botao vg-fechar" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <p className="vg-intro">
        Soma de todas as vendas finalizadas hoje ({hoje}) na Frente de caixa: o total por forma de pagamento, por quem vendeu e venda por
        venda, com os produtos e o cliente.
      </p>

      {finalizadas.length === 0 ? (
        <p className="vazio">Nenhuma venda hoje ainda. Cada venda feita na Frente de caixa aparece aqui na hora.</p>
      ) : (
        <>
          <p className="vg-formula">
            {finalizadas.length <= 6 ? (
              [...finalizadas].reverse().map((v, i) => (
                <span key={v.id}>
                  {i > 0 && <span className="vg-op"> + </span>}
                  venda {formatarNumeroVenda(v.numero)} {formatarCentavos(v.totalCentavos)}
                </span>
              ))
            ) : (
              <span>{plural(finalizadas.length, 'venda', 'vendas')} somadas</span>
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

          <h3 className="vg-sub">Venda por venda</h3>
          <TabelaDetalhada vendas={finalizadas} fuso={fuso} />
          <p className="vg-soma">
            Total: <b>{formatarCentavos(r.totalCentavos)}</b> em {plural(finalizadas.length, 'venda', 'vendas')} ·{' '}
            {produtosVendidos(r.itensVendidos, r.gramasVendidas)}
            {r.descontoCentavos > 0 && <> · descontos {formatarCentavos(r.descontoCentavos)}</>}
          </p>
        </>
      )}

      {(canceladas.length > 0 || devolucoes.length > 0) && (
        <>
          <h3 className="vg-sub">Devoluções e cancelamentos de hoje</h3>
          <TabelaSimples
            colunas={['Registro', 'Venda', 'Valor', 'Como voltou', 'Motivo', 'Feito por']}
            alinharDireita={[2]}
            linhas={[
              ...canceladas.map((v) => [
                'Cancelamento',
                formatarNumeroVenda(v.numero),
                formatarCentavos(v.totalCentavos),
                pagamentosComValores(v.cancelamento?.estornos ?? []),
                v.cancelamento?.motivo ?? '—',
                quemFez(v.cancelamento?.por.nome, v.cancelamento?.autorizadoPor?.nome),
              ]),
              ...devolucoes.map((d) => [
                `Devolução nº ${d.numero}`,
                formatarNumeroVenda(d.vendaNumero),
                formatarCentavos(d.totalCentavos),
                comoVoltou(d),
                d.motivo,
                quemFez(d.feitaPor.nome, d.autorizadaPor?.nome),
              ]),
            ]}
          />
        </>
      )}

      <p className="vg-detalhe-rodape">
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
  );
}

/** "+ R$ 341,60 a receber no cartão · R$ 50,00 no fiado" (só o que tiver valor). */
function notaAReceber(cartao: number, fiado: number): string | undefined {
  if (cartao > 0 && fiado > 0) return `+ ${formatarCentavos(cartao)} a receber no cartão · ${formatarCentavos(fiado)} no fiado`;
  if (cartao > 0) return `+ ${formatarCentavos(cartao)} a receber no cartão`;
  if (fiado > 0) return `+ ${formatarCentavos(fiado)} a receber no fiado`;
  return undefined;
}

const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—');
const quemFez = (por: string | undefined, autorizou: string | undefined) => `${por ?? '—'}${autorizou ? ` (autorizado por ${autorizou})` : ''}`;

function TabelaSimples({ colunas, linhas, alinharDireita }: { colunas: string[]; linhas: string[][]; alinharDireita?: number[] }) {
  const direita = (i: number) => (alinharDireita ? alinharDireita.includes(i) : i > 0);
  return (
    <div className="tabela-caixa tabela-caixa-borda">
      <table className="tabela tabela-detalhe">
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={c} className={direita(i) ? 'numero' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.join('|')}>
              {l.map((celula, i) => (
                <td key={i} data-rotulo={colunas[i]} className={direita(i) ? 'numero' : undefined}>
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
            <th>Cliente</th>
            <th>Vendido por</th>
            <th>Pagamento</th>
            <th className="numero">Total</th>
          </tr>
        </thead>
        <tbody>
          {vendas.map((v) => (
            <tr key={v.id}>
              <td data-rotulo="Venda" className="mono">
                {formatarNumeroVenda(v.numero)}
                {v.devolucoes.length > 0 && <small className="vg-tag-desc"> com devolução</small>}
              </td>
              <td data-rotulo="Hora" className="mono">
                {horaNoFuso(v.criadaEm, fuso)}
              </td>
              <td data-rotulo="Produtos vendidos" className="itens-venda">
                {v.itens.map((i) => (
                  <div key={i.produtoId} className="vg-item">
                    <b>{quantidadeDoItem(i)}</b> {i.nome}{' '}
                    <span className="suave">
                      {i.unidade === 'kg' ? `${formatarCentavos(i.precoCentavos)}/kg · ` : i.quantidade > 1 ? `${formatarCentavos(i.precoCentavos)} cada · ` : ''}
                      {formatarCentavos(i.subtotalCentavos)}
                    </span>
                    {i.desconto && (
                      <span className="vg-tag-desc" title={`Motivo: ${i.desconto.motivo}`}>
                        {' '}
                        desconto {formatarCentavos(valorDaQuantidade(i.precoListaCentavos, i.quantidade, unidadeDe(i.unidade)) - i.subtotalCentavos)} · {i.desconto.motivo} · {i.desconto.responsavel.nome}
                        {i.desconto.autorizadoComSenha ? ' (autorizou com senha)' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </td>
              <td data-rotulo="Cliente">{v.cliente?.nome ?? '—'}</td>
              <td data-rotulo="Vendido por">{v.vendedor.nome}</td>
              <td data-rotulo="Pagamento">{descreverPagamentos(v.pagamentos)}</td>
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
