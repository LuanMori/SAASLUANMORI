// apps/web/src/painel/TelaVisaoGeral.tsx
// Visão geral: as vendas de HOJE (dia no fuso da loja), em cards.
// À meia-noite o dia muda e tudo volta a zero sozinho (nada é apagado): as
// vendas continuam nos Relatórios. As vendas vêm da Frente de caixa e mostram
// quem vendeu (a pessoa que estava logada).
import { diaNoFuso, formatarCentavos, NOME_FORMA_PAGAMENTO, resumirVendas, type Venda } from '@saas/core';
import { useState } from 'react';
import type { ApiVendas } from '../api';
import { usarIntervalo } from '../usarIntervalo';
import { dataPorExtenso, horaNoFuso, plural, resumoItens, saudacao, totalItens } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiVendas;
  nome: string;
  fuso: string;
  agora?: () => Date;
  aoAbrirCaixa?: () => void;
  aoVerRelatorios?: () => void;
  /** Atualização automática (ms). */
  intervaloMs?: number;
}

export function TelaVisaoGeral({ api, nome, fuso, agora = () => new Date(), aoAbrirCaixa, aoVerRelatorios, intervaloMs = 5000 }: Props) {
  const [instante, setInstante] = useState(() => agora());
  usarIntervalo(() => setInstante(agora()), intervaloMs);
  const hoje = diaNoFuso(instante, fuso);

  const { estado } = usarCarga(() => api.listarVendas({ de: hoje, ate: hoje }), [api, hoje], intervaloMs);
  // Filtra de novo pelo dia: à meia-noite zera na hora, mesmo antes da nova busca chegar (ou sem rede).
  const vendas = estado.tipo === 'pronto' ? estado.dados.filter((v) => diaNoFuso(v.criadaEm, fuso) === hoje) : [];
  const r = resumirVendas(vendas);

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
            <div className="vg-visor">
              <span className="vg-visor-rotulo">VENDIDO HOJE</span>
              <strong className="vg-visor-valor" data-testid="vendido-hoje">
                {estado.tipo === 'carregando' ? '…' : formatarCentavos(r.totalCentavos)}
              </strong>
              <span className="vg-visor-nota">
                {r.quantidadeVendas === 0 ? 'Nenhuma venda ainda hoje' : `${plural(r.quantidadeVendas, 'venda', 'vendas')} até agora`}
              </span>
              {aoAbrirCaixa && (
                <button type="button" className="vg-visor-botao" onClick={aoAbrirCaixa}>
                  Abrir a Frente de caixa
                </button>
              )}
            </div>
            <div className="vg-lado">
              <Metrica rotulo="Vendas hoje" valor={String(r.quantidadeVendas)} nota={r.quantidadeVendas ? `a última às ${horaNoFuso(vendas[0]!.criadaEm, fuso)}` : '—'} />
              <Metrica rotulo="Ticket médio" valor={formatarCentavos(r.ticketMedioCentavos)} nota="valor médio por venda" />
              <Metrica rotulo="Itens vendidos" valor={String(r.itensVendidos)} nota={plural(r.itensVendidos, 'unidade', 'unidades')} />
            </div>
          </section>

          <div className="vg-pares">
            <section className="card" aria-labelledby="vg-vendedor-titulo">
              <h2 id="vg-vendedor-titulo">Por quem vendeu</h2>
              {r.porVendedor.length === 0 ? (
                <p className="suave">Ninguém vendeu hoje ainda.</p>
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
            <section className="card" aria-labelledby="vg-forma-titulo">
              <h2 id="vg-forma-titulo">Por forma de pagamento</h2>
              {r.porForma.length === 0 ? (
                <p className="suave">Sem pagamentos hoje ainda.</p>
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

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="vg-metrica">
      <span className="vg-metrica-rotulo">{rotulo}</span>
      <strong className="vg-metrica-valor">{valor}</strong>
      <span className="vg-metrica-nota">{nota}</span>
    </div>
  );
}

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
