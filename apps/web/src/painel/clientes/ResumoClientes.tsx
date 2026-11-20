// apps/web/src/painel/clientes/ResumoClientes.tsx
// O alto da aba Clientes (Fase 2, módulo 7), como no DaniPets V9.3.3 (cliResumoHtml e cliDetalheHtml):
//   - CASHBACK EM ABERTO: quanto os clientes ainda podem usar; clicando, "de onde vem": gerado + devolvido −
//     usado − retirado − vencido = em aberto, por cliente, e o que vence nos próximos dias;
//   - clientes cadastrados, fiado a receber (Dono e Administrador) e "para lembrar hoje" (abre a aba Retorno).
import { dataBr, diasEntre, emDias, formatarCentavos, pctTexto } from '@saas/core';
import { useState } from 'react';
import type { PainelRetorno, ResumoCashback } from '../../api';
import { plural } from '../formato';
import type { EstadoCarga } from '../usarCarga';

type Aba = 'clientes' | 'retorno' | 'fiado' | 'regras';

export function ResumoClientes({
  cashback,
  retorno,
  totalClientes,
  fiado,
  aoIrPara,
}: {
  cashback: EstadoCarga<ResumoCashback>;
  retorno: EstadoCarga<PainelRetorno>;
  totalClientes: number | null;
  /** null = quem não vê o fiado de todos (Vendedor). */
  fiado: { devendoCentavos: number; vencidoCentavos: number } | null;
  aoIrPara: (aba: Aba) => void;
}) {
  const [detalhe, setDetalhe] = useState(false);
  const cb = cashback.tipo === 'pronto' ? cashback.dados : null;
  const r = retorno.tipo === 'pronto' ? retorno.dados : null;
  const lembrar = r ? r.retorno.length + r.cashback.length : null;

  return (
    <>
      <div className="cli-resumo" aria-label="Resumo dos clientes">
        <button type="button" className={`cli-visor${detalhe ? ' cli-visor-on' : ''}`} aria-expanded={detalhe} onClick={() => setDetalhe((d) => !d)} title="Ver de onde vem este número">
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

      {detalhe && cb && (
        <section className="card card-plano cli-detalhe" aria-labelledby="cli-detalhe-titulo">
          <div className="card-cabeca">
            <h2 id="cli-detalhe-titulo">Cashback em aberto</h2>
            <button type="button" className="botao" onClick={() => setDetalhe(false)}>
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
