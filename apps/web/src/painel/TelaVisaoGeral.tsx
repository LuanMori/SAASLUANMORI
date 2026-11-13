// apps/web/src/painel/TelaVisaoGeral.tsx
// Visão geral no formato do DaniPets V9.3.3, só com o essencial:
//   [ VENDAS DE HOJE (card grande) ] [ Produtos ativos  ]
//                                    [ Saldo das contas ]
// Embaixo, o card Pendências (o que entra nele AINDA NÃO FOI DEFINIDO: docs/PENDENCIAS.md).
// Nada mais aparece na tela. Mais informação só ao clicar:
//   - card grande: abre logo abaixo o relatório das vendas de hoje (de onde vem
//     o número, por forma de pagamento, por quem vendeu e venda por venda);
//   - Produtos ativos: vai para a aba Produtos e estoque;
//   - Saldo das contas: vai para a aba Financeiro (só Dono e Administrador).
// "Hoje" é o dia no fuso da loja: à meia-noite tudo volta a zero sozinho, sem
// apagar nada (as vendas continuam nos Relatórios).
import { diaNoFuso, formatarCentavos, NOME_FORMA_PAGAMENTO, resumirVendas, type Venda } from '@saas/core';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import type { ApiPainel } from '../api';
import { usarIntervalo } from '../usarIntervalo';
import { CardPendencias } from './CardPendencias';
import { dataNoFuso, dataPorExtenso, horaNoFuso, plural, saudacao } from './formato';
import type { IdSecao } from './menu';
import type { Pendencia } from './pendencias';
import { usarCarga } from './usarCarga';

interface Props {
  api: Pick<ApiPainel, 'listarVendas' | 'listarProdutos'>;
  nome: string;
  fuso: string;
  agora?: () => Date;
  /** Card "Produtos ativos" leva para Produtos e estoque. Sem isto, o card não aparece. */
  aoVerProdutos?: () => void;
  /** Card "Saldo das contas" leva para o Financeiro. Sem isto (sem permissão), o card não aparece. */
  aoVerFinanceiro?: () => void;
  /** Link para Relatórios no rodapé do relatório. Sem isto (sem permissão), fica só o texto. */
  aoVerRelatorios?: () => void;
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
  const r = resumirVendas(vendas);
  const [aberto, setAberto] = useState(false);

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
                      <span>{plural(r.itensVendidos, 'produto vendido', 'produtos vendidos')}</span>
                      <span className="vg-ponto" aria-hidden="true">
                        ·
                      </span>
                      <span>{plural(r.quantidadeVendas, 'venda', 'vendas')}</span>
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
                  // O Financeiro (contas, recebimentos, despesas) ainda não existe: sem saldo para mostrar.
                  <Atalho rotulo="Saldo das contas" destino="Financeiro" onClick={aoVerFinanceiro} valor="—" nota="Financeiro ainda não configurado" />
                )}
              </div>
            )}
          </section>

          {aberto && (
            <RelatorioVendasHoje
              vendas={vendas}
              fuso={fuso}
              hoje={dataNoFuso(instante, fuso)}
              aoFechar={() => setAberto(false)}
              aoVerRelatorios={aoVerRelatorios}
            />
          )}

          <CardPendencias pendencias={pendencias} aoIrPara={aoIrPara} />
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
  fuso,
  hoje,
  aoFechar,
  aoVerRelatorios,
}: {
  vendas: Venda[];
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
        venda, com os produtos.
      </p>

      {vendas.length === 0 ? (
        <p className="vazio">Nenhuma venda hoje ainda. Cada venda feita na Frente de caixa aparece aqui na hora.</p>
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

          <h3 className="vg-sub">Venda por venda</h3>
          <TabelaDetalhada vendas={vendas} fuso={fuso} />
          <p className="vg-soma">
            Total: <b>{formatarCentavos(r.totalCentavos)}</b> em {plural(vendas.length, 'venda', 'vendas')} ·{' '}
            {plural(r.itensVendidos, 'produto vendido', 'produtos vendidos')}
          </p>
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
