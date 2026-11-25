// apps/web/src/painel/relatorios/AbaTudo.tsx
// Aba "Tudo" dos Relatórios (pedido do Luan, 25/11/2026): o resumo de cada assunto no período escolhido, num lugar
// só. Os números saem das mesmas contas de cada aba, sem os filtros da aba (só o período); "Ver detalhes" abre a aba
// do assunto. Para levar tudo para o Excel há o "Exportar tudo (Excel)" do topo.
import { dataBr, formatarCentavos, resumirDevolucoes, resumirVendas } from '@saas/core';
import { useMemo } from 'react';
import {
  type DadosDosRelatorios,
  indicadoresDeProdutos,
  linhasDeClientes,
  linhasDeProdutos,
  naUnidade,
  noPeriodo,
  type Periodo,
  planilhaEstoque,
  planilhaHistorico,
  posicaoDeEstoque,
  situacaoDoEstoque,
} from '../../relatorios/planilhas';
import { itensVendidos, plural } from '../formato';

export type AssuntoDoTudo = 'vendas' | 'produtos' | 'estoque' | 'clientes' | 'financeiro' | 'caixa' | 'compras' | 'historico';

export interface NumeroDoTudo {
  rotulo: string;
  valor: string;
  nota?: string | null;
}

export interface ResumoDoAssunto {
  id: AssuntoDoTudo;
  titulo: string;
  /** null = parte que o sistema da loja ainda não tem. */
  numeros: NumeroDoTudo[] | null;
}

const QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** O resumo de cada assunto, na ordem das abas. */
export function resumosDoTudo(d: DadosDosRelatorios, p: Periodo, fuso: string): ResumoDoAssunto[] {
  const vendas = d.vendas ?? [];
  return [
    { id: 'vendas', titulo: 'Vendas', numeros: d.vendas ? numerosDasVendas(d) : null },
    { id: 'produtos', titulo: 'Produtos', numeros: d.vendas ? numerosDosProdutos(d) : null },
    { id: 'estoque', titulo: 'Estoque', numeros: d.produtos && d.movimentos ? numerosDoEstoque(d, p, fuso) : null },
    { id: 'clientes', titulo: 'Clientes', numeros: d.clientes ? numerosDosClientes(d.clientes, vendas, d, fuso) : null },
    { id: 'financeiro', titulo: 'Financeiro', numeros: d.lancamentos ? numerosDoFinanceiro(d.lancamentos) : null },
    { id: 'caixa', titulo: 'Caixa', numeros: d.caixas ? numerosDoCaixa(d.caixas, p) : null },
    { id: 'compras', titulo: 'Compras', numeros: d.compras ? numerosDasCompras(d.compras) : null },
    { id: 'historico', titulo: 'Histórico', numeros: d.auditoria ? numerosDoHistorico(d.auditoria, p, fuso) : null },
  ];
}

function numerosDasVendas(d: DadosDosRelatorios): NumeroDoTudo[] {
  const r = resumirVendas(d.vendas ?? []);
  const dev = resumirDevolucoes(d.devolucoes ?? []);
  return [
    {
      rotulo: 'Total vendido',
      valor: formatarCentavos(r.totalCentavos),
      nota: dev.quantidade > 0 ? `líquido ${formatarCentavos(r.totalCentavos - dev.totalCentavos)} (${plural(dev.quantidade, 'devolução', 'devoluções')})` : null,
    },
    { rotulo: 'Vendas', valor: String(r.quantidadeVendas), nota: r.canceladas > 0 ? plural(r.canceladas, 'cancelada fora dos totais', 'canceladas fora dos totais') : null },
    { rotulo: 'Ticket médio', valor: formatarCentavos(r.ticketMedioCentavos) },
    { rotulo: 'Itens vendidos', valor: itensVendidos(r.itensVendidos, r.gramasVendidas) },
  ];
}

function numerosDosProdutos(d: DadosDosRelatorios): NumeroDoTudo[] {
  const vendas = d.vendas ?? [];
  const linhas = linhasDeProdutos(vendas);
  const ind = indicadoresDeProdutos(linhas, vendas, d.recebiveis);
  const topo = [...linhas].sort((a, b) => b.vendasCentavos - a.vendasCentavos)[0];
  const margem = ind.vendasCentavos - ind.semCustoCentavos > 0 ? Math.round((ind.lucroCentavos / (ind.vendasCentavos - ind.semCustoCentavos)) * 1000) / 10 : null;
  return [
    topo
      ? {
          rotulo: 'Mais vendido',
          valor: topo.nome,
          nota: `${formatarCentavos(topo.vendasCentavos)} • ${QUANTIDADE.format(naUnidade(topo.quantidade, topo.unidade))} ${topo.unidade === 'kg' ? 'kg' : 'un'}`,
        }
      : { rotulo: 'Mais vendido', valor: '—', nota: 'nenhum produto vendido' },
    { rotulo: 'Custo das mercadorias', valor: formatarCentavos(ind.custoCentavos), nota: 'custo médio da hora da venda' },
    ind.comCusto === 0
      ? { rotulo: 'Lucro estimado', valor: '—', nota: 'sem custo registrado' }
      : { rotulo: 'Lucro estimado', valor: formatarCentavos(ind.lucroCentavos), nota: margem === null ? null : `margem de ${String(margem).replace('.', ',')}%` },
    { rotulo: 'Taxas e cashback', valor: formatarCentavos(ind.taxasCentavos + ind.cashbackUsadoCentavos) },
  ];
}

function numerosDoEstoque(d: DadosDosRelatorios, p: Periodo, fuso: string): NumeroDoTudo[] {
  const ativos = posicaoDeEstoque(d.produtos ?? [], d.estoque, d.movimentos ?? [], p, fuso).filter((x) => x.produto.ativo);
  const valor = planilhaEstoque(ativos).linhas.reduce((s, l) => s + (typeof l[13] === 'number' ? l[13] : 0), 0);
  return [
    { rotulo: 'Produtos ativos', valor: String(ativos.length) },
    { rotulo: 'Abaixo do mínimo', valor: String(ativos.filter((x) => situacaoDoEstoque(x) === 'Baixo').length) },
    { rotulo: 'Zerados ou negativos', valor: String(ativos.filter((x) => x.fim <= 0).length) },
    { rotulo: 'Valor em estoque', valor: formatarCentavos(valor), nota: 'pelo custo médio atual' },
  ];
}

function numerosDosClientes(clientes: NonNullable<DadosDosRelatorios['clientes']>, vendas: NonNullable<DadosDosRelatorios['vendas']>, d: DadosDosRelatorios, fuso: string): NumeroDoTudo[] {
  const linhas = linhasDeClientes(clientes, vendas, d.fiado, fuso);
  const ativos = linhas.filter((l) => l.cliente.ativo);
  return [
    { rotulo: 'Clientes ativos', valor: String(ativos.length) },
    { rotulo: 'Compraram no período', valor: String(ativos.filter((l) => l.compras > 0).length) },
    { rotulo: 'Comprado por clientes', valor: formatarCentavos(linhas.reduce((s, l) => s + l.totalCentavos, 0)), nota: 'vendas com cliente identificado' },
    { rotulo: 'Fiado em aberto', valor: formatarCentavos(linhas.reduce((s, l) => s + (l.fiado?.devendoCentavos ?? 0), 0)) },
  ];
}

function numerosDoFinanceiro(lancamentos: NonNullable<DadosDosRelatorios['lancamentos']>): NumeroDoTudo[] {
  const entradas = lancamentos.filter((l) => l.valorCentavos > 0).reduce((s, l) => s + l.valorCentavos, 0);
  const saidas = lancamentos.filter((l) => l.valorCentavos < 0).reduce((s, l) => s - l.valorCentavos, 0);
  const despesas = lancamentos.filter((l) => l.valorCentavos < 0 && (l.tipo === 'despesa' || l.tipo === 'pagamento_conta'));
  const categorias = new Set(despesas.map((l) => l.categoria ?? 'Sem categoria'));
  return [
    { rotulo: 'Entradas', valor: formatarCentavos(entradas) },
    { rotulo: 'Saídas', valor: formatarCentavos(saidas) },
    { rotulo: 'Resultado', valor: formatarCentavos(entradas - saidas), nota: 'entradas − saídas no período' },
    { rotulo: 'Despesas', valor: formatarCentavos(despesas.reduce((s, l) => s - l.valorCentavos, 0)), nota: plural(categorias.size, 'categoria', 'categorias') },
  ];
}

function numerosDoCaixa(caixas: NonNullable<DadosDosRelatorios['caixas']>, p: Periodo): NumeroDoTudo[] {
  const doPeriodo = caixas.filter((c) => noPeriodo(c.dia, p));
  const difs = doPeriodo.map((c) => c.fechamento?.diferencaCentavos ?? 0);
  return [
    { rotulo: 'Dias com caixa', valor: String(doPeriodo.length) },
    { rotulo: 'Fechados com diferença', valor: String(difs.filter((x) => x !== 0).length) },
    { rotulo: 'Faltas', valor: formatarCentavos(-difs.filter((x) => x < 0).reduce((s, x) => s + x, 0)) },
    {
      rotulo: 'Sobras',
      valor: formatarCentavos(difs.filter((x) => x > 0).reduce((s, x) => s + x, 0)),
      nota: plural(doPeriodo.filter((c) => c.fechamento?.automatico).length, 'fechou sozinho', 'fecharam sozinhos'),
    },
  ];
}

function numerosDasCompras(compras: NonNullable<DadosDosRelatorios['compras']>): NumeroDoTudo[] {
  return [
    { rotulo: 'Compras', valor: String(compras.length) },
    { rotulo: 'Total comprado', valor: formatarCentavos(compras.reduce((s, c) => s + c.totalCentavos, 0)) },
    { rotulo: 'A prazo', valor: formatarCentavos(compras.filter((c) => c.pagamento.tipo === 'aprazo').reduce((s, c) => s + c.totalCentavos, 0)) },
    { rotulo: 'Itens estornados', valor: String(compras.reduce((s, c) => s + c.itens.filter((i) => i.estorno).length, 0)) },
  ];
}

function numerosDoHistorico(auditoria: NonNullable<DadosDosRelatorios['auditoria']>, p: Periodo, fuso: string): NumeroDoTudo[] {
  const linhas = planilhaHistorico(auditoria, p, fuso).linhas;
  const ultima = linhas.at(-1);
  return [
    { rotulo: 'Registros no período', valor: String(linhas.length) },
    { rotulo: 'Pessoas', valor: String(new Set(linhas.map((l) => l[2])).size) },
    ultima
      ? { rotulo: 'Último registro', valor: String(ultima[3]), nota: `${String(ultima[2])}, ${dataBr(String(ultima[0]))} às ${String(ultima[1])}` }
      : { rotulo: 'Último registro', valor: '—', nota: 'nada registrado no período' },
  ];
}

export function AbaTudo({ dados, periodo, fuso, aoVer }: { dados: DadosDosRelatorios; periodo: Periodo; fuso: string; aoVer: (assunto: AssuntoDoTudo) => void }) {
  const resumos = useMemo(() => resumosDoTudo(dados, periodo, fuso), [dados, periodo, fuso]);
  return (
    <div className="rel-aba">
      <p className="rel-extra suave rel-tudo-dica">
        O resumo de cada assunto no período escolhido. Para ver a lista completa, use “Ver detalhes”. Para levar tudo para o
        Excel, use “Exportar tudo (Excel)”.
      </p>
      <div className="rel-tudo">
        {resumos.map((r) => (
          <section key={r.id} className="card rel-tudo-assunto" aria-labelledby={`rt-${r.id}`}>
            <div className="rel-tudo-cabeca">
              <h2 id={`rt-${r.id}`}>{r.titulo}</h2>
              <button type="button" className="link" onClick={() => aoVer(r.id)} aria-label={`Ver detalhes de ${r.titulo}`}>
                Ver detalhes
              </button>
            </div>
            {r.numeros ? (
              <div className="rel-tudo-numeros">
                {r.numeros.map((n) => (
                  <div key={n.rotulo} className="rel-tudo-numero">
                    <span className="vg-metrica-rotulo">{n.rotulo}</span>
                    <strong>{n.valor}</strong>
                    {n.nota && <small className="suave">{n.nota}</small>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="alerta" role="status">
                Esta parte ainda não está disponível no sistema da loja.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
