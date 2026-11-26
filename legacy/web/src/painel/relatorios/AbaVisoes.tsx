// apps/web/src/painel/relatorios/AbaVisoes.tsx
// Relatórios → Visões (Adm. Sup, módulo 13g): as tabelas que o suporte montou para esta loja, no período escolhido
// acima. Cada uma tem "Exportar esta aba (Excel)"; "Exportar as visões (Excel)" leva todas, uma aba do Excel para cada.
import { descreverVisao, type VisaoSobMedida } from '@saas/core';
import { planilhaDaVisao } from '../../relatorios/visoes';
import type { PropsDaAba } from './AbasRelatorios';
import { BotaoExportar, TabelaDaPlanilha } from './TabelaDaPlanilha';

export function AbaVisoes({ dados, periodo, fuso, nomes, aoExportar, visoes }: PropsDaAba & { visoes: readonly VisaoSobMedida[] }) {
  const montadas = visoes.map((v) => ({ v, r: planilhaDaVisao(v, dados, periodo, nomes, fuso) }));
  const planilhas = montadas.flatMap((m) => (m.r ? [m.r.planilha] : []));
  return (
    <div className="rel-aba">
      <div className="rel-visoes-topo">
        <p className="alerta" role="note">
          Visões montadas pelo suporte para esta loja. Seguem o período escolhido acima.
        </p>
        {planilhas.length > 0 && <BotaoExportar rotulo="Exportar as visões (Excel)" aoExportar={() => aoExportar(planilhas, 'Visões')} />}
      </div>
      {montadas.map(({ v, r }) =>
        r ? (
          <TabelaDaPlanilha
            key={v.id}
            planilha={r.planilha}
            titulo={v.nome}
            id={`rv-${v.id}`}
            vazio="Nenhuma linha no período."
            acoes={<BotaoExportar aoExportar={() => aoExportar([r.planilha], v.nome)} />}
            sub={
              <div className="rel-visao-sub">
                <p className="suave">{descreverVisao(v)}</p>
                {r.avisos.map((a) => (
                  <p key={a} className="rel-visao-aviso">
                    {a}
                  </p>
                ))}
              </div>
            }
          />
        ) : (
          <section key={v.id} className="card card-plano rel-tabela" aria-labelledby={`rv-${v.id}`}>
            <div className="card-cabeca">
              <h2 id={`rv-${v.id}`}>{v.nome}</h2>
            </div>
            <p className="vazio">A base desta visão ainda não está disponível no sistema da loja.</p>
          </section>
        ),
      )}
    </div>
  );
}
