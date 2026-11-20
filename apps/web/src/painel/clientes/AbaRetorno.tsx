// apps/web/src/painel/clientes/AbaRetorno.tsx
// Aba Retorno (Fase 2, módulo 7), como no DaniPets V9.3.3 (cliTabRetorno, CLI-13):
//   - clientes com cadastro completo sem comprar há N dias ou mais e clientes com cashback vencendo;
//   - em cada um: WhatsApp (só quem autorizou), "Já falei" (contato sem mensagem), "Adiar 7 dias",
//     "Não incomodar" e "Abrir conta";
//   - quem ficou de fora hoje (já lembrado neste ciclo, adiado ou "não incomodar") e por quê;
//   - o resultado dos lembretes de retorno: o cliente voltou em até 15 dias?
import { dataBr, diasEntre, DIAS_PARA_VOLTAR, emDias, formatarCentavos, pctTexto } from '@saas/core';
import type { ReactNode } from 'react';
import type { PainelRetorno } from '../../api';
import type { EstadoCarga } from '../usarCarga';
import { plural } from '../formato';

export interface AcoesDoRetorno {
  aoWhatsapp: (clienteId: string, tipo: 'retorno' | 'cashback') => void;
  aoFalei: (clienteId: string, tipo: 'retorno' | 'cashback', nome: string) => void;
  aoAdiar: (clienteId: string, nome: string) => void;
  aoNaoIncomodar: (clienteId: string, nome: string) => void;
  aoAbrir: (clienteId: string) => void;
  /** Uma ação em andamento (o segundo clique de um duplo clique é ignorado). */
  ocupado: boolean;
}

function Item({
  tipo,
  clienteId,
  nome,
  bloqueio,
  children,
  etiquetas,
  acoes,
}: {
  tipo: 'retorno' | 'cashback';
  clienteId: string;
  nome: string;
  bloqueio: string | null;
  children: ReactNode;
  etiquetas: string[];
  acoes: AcoesDoRetorno;
}) {
  const tags = [...etiquetas, ...(bloqueio ? [bloqueio.includes('autorizou') ? 'sem autorização para mensagens' : 'sem WhatsApp'] : [])];
  return (
    <li className={tipo === 'retorno' ? 'ret-item ret-aviso' : 'ret-item ret-info'}>
      <div className="ret-texto">{children}</div>
      {tags.length > 0 && (
        <div className="ret-tags">
          {tags.map((t) => (
            <span key={t} className={t.startsWith('tem ') ? 'pe-situacao caixa-sem-dif' : 'pe-situacao cli-tag'}>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="cli-acoes-linha ret-acoes">
        <button
          type="button"
          className="botao botao-primario"
          disabled={Boolean(bloqueio) || acoes.ocupado}
          title={bloqueio ?? undefined}
          onClick={() => acoes.aoWhatsapp(clienteId, tipo)}
          aria-label={`WhatsApp para ${nome}`}
        >
          WhatsApp
        </button>
        <button type="button" className="botao" disabled={acoes.ocupado} onClick={() => acoes.aoFalei(clienteId, tipo, nome)} aria-label={`Já falei com ${nome}`}>
          Já falei
        </button>
        <button type="button" className="botao" disabled={acoes.ocupado} onClick={() => acoes.aoAdiar(clienteId, nome)} aria-label={`Adiar 7 dias o lembrete de ${nome}`}>
          Adiar 7 dias
        </button>
        <button type="button" className="link suave" disabled={acoes.ocupado} onClick={() => acoes.aoNaoIncomodar(clienteId, nome)} aria-label={`Não incomodar ${nome}`}>
          Não incomodar
        </button>
        <button type="button" className="link" onClick={() => acoes.aoAbrir(clienteId)} aria-label={`Abrir a conta de ${nome}`}>
          Abrir conta
        </button>
      </div>
    </li>
  );
}

export function AbaRetorno({ estado, acoes }: { estado: EstadoCarga<PainelRetorno>; acoes: AcoesDoRetorno }) {
  if (estado.tipo === 'bloqueado' || estado.tipo === 'falhou') {
    return (
      <p className="alerta alerta-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }
  if (estado.tipo !== 'pronto') return <p className="vazio">Carregando…</p>;
  const d = estado.dados;
  const dias = d.regras.retorno.diasSemComprar;
  const aviso = d.regras.cashback.avisoDias;
  const cupomPct = d.regras.retorno.cupomPct;
  const r = d.resultado;

  return (
    <div className="ret">
      <p className="alerta" role="note">
        Clientes com cadastro completo sem comprar há {plural(dias, 'dia', 'dias')} ou mais e clientes com cashback vencendo em até {plural(aviso, 'dia', 'dias')}. Cada cliente recebe um lembrete
        por ciclo, e só quem autorizou recebe mensagem.{' '}
        {cupomPct > 0
          ? `A mensagem de retorno gera um cupom de ${pctTexto(cupomPct)}, aplicado sozinho quando o cliente é identificado na Frente de caixa.`
          : 'O cupom de retorno está desligado nas regras do programa.'}
      </p>

      <div className="ret-grade">
        <section className="card card-plano" aria-labelledby="ret-sumidos">
          <div className="card-cabeca">
            <h2 id="ret-sumidos">
              Sem comprar há {plural(dias, 'dia', 'dias')} ou mais <span className="cli-contagem">{d.retorno.length}</span>
            </h2>
          </div>
          {d.retorno.length === 0 ? (
            <p className="vazio ret-ok">Ninguém para lembrar agora.</p>
          ) : (
            <ul className="ret-lista">
              {d.retorno.map((x) => (
                <Item key={x.clienteId} tipo="retorno" clienteId={x.clienteId} nome={x.nome} bloqueio={x.bloqueio} etiquetas={x.cashbackCentavos > 0 ? [`tem ${formatarCentavos(x.cashbackCentavos)} de cashback`] : []} acoes={acoes}>
                  <span>
                    <b>{x.nome}</b> não compra há {plural(x.diasSemComprar, 'dia', 'dias')}.
                  </span>
                  <small className="suave">
                    Última compra em {dataBr(x.ultimaCompraDia)}
                    {x.ultimaCompraItens ? `: ${x.ultimaCompraItens}` : ''}
                  </small>
                </Item>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-plano" aria-labelledby="ret-cashback">
          <div className="card-cabeca">
            <h2 id="ret-cashback">
              Cashback vencendo <span className="cli-contagem">{d.cashback.length}</span>
            </h2>
          </div>
          {d.cashback.length === 0 ? (
            <p className="vazio ret-ok">Nenhum cashback vencendo nos próximos dias.</p>
          ) : (
            <ul className="ret-lista">
              {d.cashback.map((x) => (
                <Item key={x.clienteId} tipo="cashback" clienteId={x.clienteId} nome={x.nome} bloqueio={x.bloqueio} etiquetas={[]} acoes={acoes}>
                  <span>
                    <b>{x.nome}</b> tem {formatarCentavos(x.valorCentavos)} de cashback que vence {emDias(diasEntre(d.hoje, x.venceEm))} ({dataBr(x.venceEm)}).
                  </span>
                </Item>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card card-plano" aria-labelledby="ret-resultado">
        <div className="card-cabeca">
          <h2 id="ret-resultado">Resultado dos lembretes de retorno</h2>
        </div>
        <div className="caixa-metricas ret-metricas">
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Lembretes registrados</span>
            <b className="caixa-metrica-valor">{r.enviados}</b>
          </div>
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Voltaram em até {DIAS_PARA_VOLTAR} dias</span>
            <b className="caixa-metrica-valor">{r.voltaram}</b>
            <span className="suave">{r.taxaPct}% dos lembretes</span>
          </div>
        </div>
        {r.linhas.length === 0 ? (
          <p className="vazio">Nenhum lembrete de retorno registrado ainda.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {r.linhas.map((l) => (
                  <tr key={l.contatoId}>
                    <td data-rotulo="Data">{dataBr(l.dia)}</td>
                    <td data-rotulo="Cliente">{l.clienteNome}</td>
                    <td data-rotulo="Canal">{l.canal === 'whatsapp' ? 'WhatsApp' : 'Sem mensagem'}</td>
                    <td data-rotulo="Resultado">
                      {l.voltou ? (
                        <b className="caixa-sem-dif-texto">
                          Voltou em {dataBr(l.voltou.dia)} (compra #{String(l.voltou.vendaNumero).padStart(5, '0')})
                        </b>
                      ) : l.situacao === 'nao_voltou' ? (
                        <span className="suave">Não voltou em {DIAS_PARA_VOLTAR} dias</span>
                      ) : (
                        <span className="suave">Aguardando</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.fora.length > 0 && (
          <details className="card-rodape ret-fora">
            <summary>
              {plural(d.fora.length, 'cliente ficou', 'clientes ficaram')} de fora da lista hoje (já lembrados, adiados ou “não incomodar”). Ver quem
            </summary>
            <ul>
              {d.fora.map((f, i) => (
                <li key={`${f.clienteId}-${i}`}>
                  <b>{f.nome}</b>: {f.motivo}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
