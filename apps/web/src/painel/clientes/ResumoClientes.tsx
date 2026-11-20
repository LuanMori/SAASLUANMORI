// apps/web/src/painel/clientes/ResumoClientes.tsx
// O alto da aba Clientes (Fase 2, módulo 7), como no DaniPets V9.3.3 (cliResumoHtml e cliDetalheHtml):
//   - CASHBACK EM ABERTO: quanto os clientes ainda podem usar; clicando, "de onde vem": gerado + devolvido −
//     usado − retirado − vencido = em aberto, por cliente, e o que vence nos próximos dias;
//   - clientes cadastrados, vale-troca em aberto (módulo 8; clicando, a lista dos vales com saldo), fiado a
//     receber (Dono e Administrador) e "para lembrar hoje" (abre a aba Retorno).
import { dataBr, diasEntre, emDias, formatarCentavos, pctTexto, type ValeTroca, valesEmAberto } from '@saas/core';
import { useState } from 'react';
import type { PainelRetorno, ResumoCashback } from '../../api';
import { plural } from '../formato';
import type { EstadoCarga } from '../usarCarga';

type Aba = 'clientes' | 'retorno' | 'fiado' | 'regras';

export function ResumoClientes({
  cashback,
  retorno,
  vales,
  totalClientes,
  fiado,
  aoIrPara,
}: {
  cashback: EstadoCarga<ResumoCashback>;
  retorno: EstadoCarga<PainelRetorno>;
  /** Todos os vales-troca da loja (módulo 8). */
  vales: EstadoCarga<ValeTroca[]>;
  totalClientes: number | null;
  /** null = quem não vê o fiado de todos (Vendedor). */
  fiado: { devendoCentavos: number; vencidoCentavos: number } | null;
  aoIrPara: (aba: Aba) => void;
}) {
  const [aberto, setAberto] = useState<'cashback' | 'vale' | null>(null);
  const detalhe = aberto === 'cashback';
  const alternarCashback = () => setAberto((a) => (a === 'cashback' ? null : 'cashback'));
  const cb = cashback.tipo === 'pronto' ? cashback.dados : null;
  const r = retorno.tipo === 'pronto' ? retorno.dados : null;
  const lembrar = r ? r.retorno.length + r.cashback.length : null;
  const todosVales = vales.tipo === 'pronto' ? vales.dados : null;
  // do mais antigo para o mais novo, como a lista do DaniPets (vouchersCard)
  const valesAbertos = todosVales ? [...valesEmAberto(todosVales)].reverse() : [];
  const valeAberto = valesAbertos.reduce((t, v) => t + v.saldoCentavos, 0);
  const valesUsados = todosVales ? todosVales.length - valesAbertos.length : 0;

  return (
    <>
      <div className="cli-resumo" aria-label="Resumo dos clientes">
        <button type="button" className={`cli-visor${detalhe ? ' cli-visor-on' : ''}`} aria-expanded={detalhe} onClick={alternarCashback} title="Ver de onde vem este número">
          <span className="cli-visor-rotulo">CASHBACK EM ABERTO</span>
          <span className="cli-visor-valor" data-testid="cli-cashback-aberto">
            {cb ? formatarCentavos(cb.abertoCentavos) : '—'}
          </span>
          <span className="cli-visor-nota">
            {cb ? `${plural(cb.clientesComSaldo, 'cliente com saldo', 'clientes com saldo')}${cb.vencendoCentavos > 0 ? ` · ${formatarCentavos(cb.vencendoCentavos)} vence em até ${plural(cb.regras.avisoDias, 'dia', 'dias')}` : ''}` : 'Carregando…'}
          </span>
          <span className="cli-visor-mais">{detalhe ? 'Fechar' : 'Ver de onde vem'}</span>
        </button>
        <div className="cli-resumo-lado">
          <button type="button" className="cli-resumo-linha" onClick={() => aoIrPara('clientes')}>
            <span>Clientes cadastrados</span>
            <b>{totalClientes ?? '—'}</b>
          </button>
          <button
            type="button"
            className={`cli-resumo-linha${aberto === 'vale' ? ' cli-resumo-linha-on' : ''}`}
            aria-expanded={aberto === 'vale'}
            onClick={() => setAberto((a) => (a === 'vale' ? null : 'vale'))}
            title="Ver os vales com saldo"
          >
            <span>Vale-troca em aberto</span>
            <b>{todosVales ? formatarCentavos(valeAberto) : '—'}</b>
            {todosVales && <small className="suave">{valesAbertos.length ? plural(valesAbertos.length, 'vale com saldo', 'vales com saldo') : 'Nenhum vale em aberto'}</small>}
          </button>
          {fiado && (
            <button type="button" className="cli-resumo-linha" onClick={() => aoIrPara('fiado')}>
              <span>Fiado a receber</span>
              <b>{formatarCentavos(fiado.devendoCentavos)}</b>
              <small className={fiado.vencidoCentavos > 0 ? 'caixa-dif' : 'suave'}>{fiado.vencidoCentavos > 0 ? `${formatarCentavos(fiado.vencidoCentavos)} vencido` : 'Nada vencido'}</small>
            </button>
          )}
          <button type="button" className="cli-resumo-linha" onClick={() => aoIrPara('retorno')}>
            <span>Para lembrar hoje</span>
            <b>{lembrar ?? '—'}</b>
            {r && (
              <small className="suave">
                {r.retorno.length} sem comprar · {plural(r.cashback.length, 'cashback vencendo', 'cashbacks vencendo')}
              </small>
            )}
          </button>
        </div>
      </div>

      {aberto === 'vale' && todosVales && (
        <section className="card card-plano cli-detalhe" aria-labelledby="cli-vales-titulo">
          <div className="card-cabeca">
            <h2 id="cli-vales-titulo">Vale-troca em aberto</h2>
            <button type="button" className="botao" onClick={() => setAberto(null)}>
              Fechar
            </button>
          </div>
          <p className="suave">
            Vales-troca emitidos em devoluções e trocas. O saldo é o valor do vale menos o que já foi usado como pagamento na Frente de caixa. O vale vale para quem estiver com o código, com ou sem
            cliente identificado.
          </p>
          {valesAbertos.length === 0 ? (
            <p className="vazio">Nenhum vale com saldo.</p>
          ) : (
            <div className="tabela-caixa">
              <table className="tabela tabela-vendas">
                <thead>
                  <tr>
                    <th>Vale</th>
                    <th>Cliente</th>
                    <th>Emitido em</th>
                    <th>Origem</th>
                    <th className="numero">Valor</th>
                    <th className="numero">Usado</th>
                    <th className="numero">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {valesAbertos.map((v) => (
                    <tr key={v.id}>
                      <td data-rotulo="Vale">
                        <b>{v.codigo}</b>
                      </td>
                      <td data-rotulo="Cliente">{v.cliente?.nome ?? 'sem cliente'}</td>
                      <td data-rotulo="Emitido em">{dataBr(v.dia)}</td>
                      <td data-rotulo="Origem">
                        Devolução nº {v.origem.devolucaoNumero} · compra #{String(v.origem.vendaNumero).padStart(5, '0')}
                      </td>
                      <td data-rotulo="Valor" className="numero">
                        {formatarCentavos(v.valorCentavos)}
                      </td>
                      <td data-rotulo="Usado" className="numero">
                        {v.valorCentavos - v.saldoCentavos > 0 ? formatarCentavos(v.valorCentavos - v.saldoCentavos) : '—'}
                      </td>
                      <td data-rotulo="Saldo" className="numero">
                        <b className="caixa-sem-dif-texto">{formatarCentavos(v.saldoCentavos)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="card-rodape">
            Total em vales: <b>{formatarCentavos(valeAberto)}</b> · crédito dos clientes na loja
            {valesUsados > 0 && ` · ${plural(valesUsados, 'vale já foi usado por inteiro e não aparece', 'vales já foram usados por inteiro e não aparecem')} na lista`}
          </p>
        </section>
      )}

      {detalhe && cb && (
        <section className="card card-plano cli-detalhe" aria-labelledby="cli-detalhe-titulo">
          <div className="card-cabeca">
            <h2 id="cli-detalhe-titulo">Cashback em aberto</h2>
            <button type="button" className="botao" onClick={() => setAberto(null)}>
              Fechar
            </button>
          </div>
          <p className="suave">
            Quanto os clientes ainda podem usar. Cada compra paga em dinheiro, Pix ou cartão gera {pctTexto(cb.regras.percentual)} do valor pago em cashback, que vale por{' '}
            {plural(cb.regras.validadeDias, 'dia', 'dias')}. Do que foi gerado, sai o que os clientes já usaram, o que foi retirado em devoluções e o que venceu sem uso.
          </p>
          <p className="cli-formula">
            Gerado {formatarCentavos(cb.geradoCentavos)}
            {cb.devolvidoCentavos > 0 && <> + devolvido {formatarCentavos(cb.devolvidoCentavos)}</>} − usado {formatarCentavos(cb.usadoCentavos)}
            {cb.retiradoCentavos > 0 && <> − retirado em devoluções {formatarCentavos(cb.retiradoCentavos)}</>} − vencido {formatarCentavos(cb.vencidoCentavos)} ={' '}
            <b>em aberto {formatarCentavos(cb.abertoCentavos)}</b>
          </p>
          {cb.linhas.length === 0 ? (
            <p className="vazio">Nenhum cliente ganhou cashback ainda.</p>
          ) : (
            <div className="tabela-caixa">
              <table className="tabela tabela-vendas">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="numero">Gerado</th>
                    <th className="numero">Usado</th>
                    <th className="numero">Venceu</th>
                    <th className="numero">Em aberto</th>
                    <th>Próximo vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {cb.linhas.map((x) => (
                    <tr key={x.clienteId}>
                      <td data-rotulo="Cliente">
                        <b>{x.nome}</b>
                      </td>
                      <td data-rotulo="Gerado" className="numero">
                        {formatarCentavos(x.geradoCentavos)}
                      </td>
                      <td data-rotulo="Usado" className="numero">
                        {x.usadoCentavos ? formatarCentavos(x.usadoCentavos) : '—'}
                      </td>
                      <td data-rotulo="Venceu" className="numero">
                        {x.vencidoCentavos ? <span className="caixa-dif">{formatarCentavos(x.vencidoCentavos)}</span> : '—'}
                      </td>
                      <td data-rotulo="Em aberto" className="numero">
                        <b>{formatarCentavos(x.abertoCentavos)}</b>
                      </td>
                      <td data-rotulo="Próximo vencimento">{x.proximoVencimento ? `${formatarCentavos(x.proximoVencimento.valorCentavos)} em ${dataBr(x.proximoVencimento.venceEm)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="card-rodape">
            Total em aberto: <b>{formatarCentavos(cb.abertoCentavos)}</b> em {plural(cb.linhas.filter((x) => x.abertoCentavos > 0).length, 'cliente', 'clientes')}
            {cb.geradoCentavos + cb.devolvidoCentavos > 0 &&
              ` · ${Math.round((cb.usadoCentavos / (cb.geradoCentavos + cb.devolvidoCentavos)) * 100)}% do cashback gerado já foi usado em compras`}
          </p>
          <h3 className="cli-detalhe-sub">Vence nos próximos {plural(cb.regras.avisoDias, 'dia', 'dias')}</h3>
          {cb.vencendo.length === 0 ? (
            <p className="vazio">Nada vence nesse prazo.</p>
          ) : (
            <>
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Ganho em</th>
                      <th>Origem</th>
                      <th className="numero">Valor</th>
                      <th>Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cb.vencendo.map((v, i) => (
                      <tr key={`${v.clienteId}-${i}`}>
                        <td data-rotulo="Cliente">{v.nome}</td>
                        <td data-rotulo="Ganho em">{dataBr(v.dia)}</td>
                        <td data-rotulo="Origem">{v.origem}</td>
                        <td data-rotulo="Valor" className="numero">
                          {formatarCentavos(v.valorCentavos)}
                        </td>
                        <td data-rotulo="Vence">
                          {dataBr(v.venceEm)} <span className="pe-situacao pe-baixo">{emDias(diasEntre(cb.hoje, v.venceEm))}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="suave">
                Esses clientes aparecem na aba Retorno para receber o aviso.{' '}
                <button type="button" className="link" onClick={() => aoIrPara('retorno')}>
                  Abrir retorno
                </button>
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
