// apps/web/src/painel/relatorios/AbasRelatorios.tsx
// As abas dos Relatórios além de Vendas (Fase 2, módulo 10): Produtos (mais vendidos e lucro estimado), Estoque
// (posição no período e movimentos), Clientes (compras, fiado e vales-troca), Financeiro (lançamentos, despesas por
// categoria, a receber e a pagar), Caixa (cada dia), Compras (e itens) e Histórico (quem fez o quê). Cada aba tem os
// filtros dela e "Exportar esta aba (Excel)", que leva exatamente o que a tabela mostra (com os filtros).
import { formatarCentavos, type NomesDasContas, resumirVendasAntigas, semAcento } from '@saas/core';
import { useMemo, useState } from 'react';
import {
  type DadosDosRelatorios,
  indicadoresDeProdutos,
  linhasDeClientes,
  linhasDeProdutos,
  noPeriodo,
  type Periodo,
  planilhaAPagar,
  planilhaAReceber,
  planilhaCaixas,
  planilhaClientes,
  planilhaCompras,
  planilhaEstoque,
  planilhaHistorico,
  planilhaItensComprados,
  planilhaLancamentos,
  planilhaMovimentos,
  planilhaProdutos,
  planilhaVales,
  planilhaItensVendasAntigas,
  planilhaVendasAntigas,
  posicaoDeEstoque,
  situacaoDoEstoque,
} from '../../relatorios/planilhas';
import type { Planilha } from '../../relatorios/xlsx';
import { plural } from '../formato';
import { BotaoExportar, Cartao, TabelaDaPlanilha } from './TabelaDaPlanilha';

export interface PropsDaAba {
  dados: DadosDosRelatorios;
  periodo: Periodo;
  fuso: string;
  nomes: NomesDasContas;
  aoExportar: (planilhas: Planilha[], assunto: string) => void;
}

const contem = (texto: string, termo: string) => !termo || semAcento(texto).includes(termo);
const SEM_PARTE = 'Esta parte ainda não está disponível no sistema da loja.';

function SemParte() {
  return (
    <p className="alerta" role="status">
      {SEM_PARTE}
    </p>
  );
}

function Filtros({ rotulo, children, aoExportar }: { rotulo: string; children: React.ReactNode; aoExportar: () => void }) {
  return (
    <section className="card rel-filtros" aria-label={rotulo}>
      <div className="rel-campos">
        {children}
        <div className="campo rel-campo-botao">
          <BotaoExportar aoExportar={aoExportar} />
        </div>
      </div>
    </section>
  );
}

function Busca({ id, valor, aoMudar, dica }: { id: string; valor: string; aoMudar: (v: string) => void; dica: string }) {
  return (
    <div className="campo">
      <label htmlFor={id}>Buscar</label>
      <input id={id} type="search" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={dica} />
    </div>
  );
}

// ------------------------------------------------------------------ produtos
export function AbaProdutos({ dados, aoExportar }: PropsDaAba) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'vendas' | 'quantidade' | 'lucro'>('vendas');
  const linhas = useMemo(() => linhasDeProdutos(dados.vendas ?? []), [dados.vendas]);
  const ind = useMemo(() => indicadoresDeProdutos(linhas, dados.vendas ?? [], dados.recebiveis), [linhas, dados]);
  if (!dados.vendas) return <SemParte />;
  const termo = semAcento(busca.trim());
  const lucro = (l: (typeof linhas)[number]) => (l.custoCentavos === null ? Number.NEGATIVE_INFINITY : l.vendasCentavos - l.custoCentavos);
  const vistas = linhas
    .filter((l) => contem(`${l.codigo} ${l.nome}`, termo))
    .sort((a, b) => (ordem === 'quantidade' ? b.quantidade - a.quantidade : ordem === 'lucro' ? lucro(b) - lucro(a) : b.vendasCentavos - a.vendasCentavos));
  const planilha = planilhaProdutos(vistas);
  const margem = ind.vendasCentavos - ind.semCustoCentavos > 0 ? Math.round((ind.lucroCentavos / (ind.vendasCentavos - ind.semCustoCentavos)) * 1000) / 10 : null;
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros dos produtos" aoExportar={() => aoExportar([planilha], 'Produtos')}>
        <Busca id="rp-busca" valor={busca} aoMudar={setBusca} dica="Nome ou código" />
        <div className="campo">
          <label htmlFor="rp-ordem">Ordenar por</label>
          <select id="rp-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
            <option value="vendas">Mais vendidos (R$)</option>
            <option value="quantidade">Mais vendidos (quantidade)</option>
            <option value="lucro">Maior lucro</option>
          </select>
        </div>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo dos produtos">
        <Cartao rotulo="Vendas (sem devoluções)" valor={formatarCentavos(ind.vendasCentavos)} nota={plural(linhas.length, 'produto', 'produtos')} />
        <Cartao rotulo="Custo das mercadorias" valor={formatarCentavos(ind.custoCentavos)} nota="custo médio da hora da venda" />
        {ind.comCusto === 0 ? (
          <Cartao rotulo="Lucro estimado" valor="—" nota="sem custo registrado" />
        ) : (
          <Cartao rotulo="Lucro estimado" valor={formatarCentavos(ind.lucroCentavos)} nota={margem === null ? null : `margem de ${String(margem).replace('.', ',')}%`} />
        )}
        <Cartao rotulo="Taxas e cashback" valor={formatarCentavos(ind.taxasCentavos + ind.cashbackUsadoCentavos)} nota={`cartão ${formatarCentavos(ind.taxasCentavos)} • cashback ${formatarCentavos(ind.cashbackUsadoCentavos)}`} />
      </section>
      <p className="rel-extra suave">
        Lucro estimado = vendas dos produtos com custo − custo das mercadorias − taxas de cartão − cashback usado.
        {ind.semCusto > 0 && ` ${plural(ind.semCusto, 'produto vendido sem custo fica', 'produtos vendidos sem custo ficam')} de fora (${formatarCentavos(ind.semCustoCentavos)} em vendas): registre uma compra deles para ter o custo.`}
      </p>
      <TabelaDaPlanilha planilha={planilha} titulo="Produtos vendidos" id="rp-titulo" vazio="Nenhum produto vendido no período." />
    </div>
  );
}

// ------------------------------------------------------------------ estoque
export function AbaEstoque({ dados, periodo, fuso, aoExportar }: PropsDaAba) {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<'todas' | 'Baixo' | 'Zerado' | 'Negativo'>('todas');
  const [inativos, setInativos] = useState(false);
  const pos = useMemo(
    () => (dados.produtos && dados.movimentos ? posicaoDeEstoque(dados.produtos, dados.estoque, dados.movimentos, periodo, fuso) : null),
    [dados, periodo, fuso],
  );
  if (!pos || !dados.produtos || !dados.movimentos) return <SemParte />;
  const termo = semAcento(busca.trim());
  const vistas = pos.filter((x) => (inativos || x.produto.ativo) && (situacao === 'todas' || situacaoDoEstoque(x) === situacao) && contem(`${x.produto.codigoInterno} ${x.produto.nome}`, termo));
  const ids = new Set(vistas.map((x) => x.produto.id));
  const posicao = planilhaEstoque(vistas);
  const movimentos = planilhaMovimentos(
    dados.movimentos.filter((m) => ids.has(m.produtoId)),
    dados.produtos,
    periodo,
    fuso,
  );
  const ativos = pos.filter((x) => x.produto.ativo);
  const valor = posicao.linhas.reduce((s, l) => s + (typeof l[13] === 'number' ? l[13] : 0), 0);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros do estoque" aoExportar={() => aoExportar([posicao, movimentos], 'Estoque')}>
        <Busca id="re-busca" valor={busca} aoMudar={setBusca} dica="Nome ou código" />
        <div className="campo">
          <label htmlFor="re-situacao">Situação no fim do período</label>
          <select id="re-situacao" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
            <option value="todas">Todas</option>
            <option value="Baixo">Abaixo do mínimo</option>
            <option value="Zerado">Zerado</option>
            <option value="Negativo">Negativo</option>
          </select>
        </div>
        <label className="fin-check rel-check">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar produtos inativos
        </label>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo do estoque">
        <Cartao rotulo="Produtos ativos" valor={String(ativos.length)} />
        <Cartao rotulo="Abaixo do mínimo" valor={String(ativos.filter((x) => situacaoDoEstoque(x) === 'Baixo').length)} />
        <Cartao rotulo="Zerados ou negativos" valor={String(ativos.filter((x) => x.fim <= 0).length)} />
        <Cartao rotulo="Valor em estoque" valor={formatarCentavos(valor)} nota="pelo custo médio atual" />
      </section>
      <TabelaDaPlanilha planilha={posicao} titulo="Posição de estoque" id="re-titulo" vazio="Nenhum produto com esses filtros." />
      <TabelaDaPlanilha planilha={movimentos} titulo="Movimentos no período" id="re-mov-titulo" vazio="Nenhum movimento de estoque no período." limite={200} />
    </div>
  );
}

// ------------------------------------------------------------------ clientes
export function AbaClientes({ dados, periodo, fuso, aoExportar }: PropsDaAba) {
  const [busca, setBusca] = useState('');
  const [quais, setQuais] = useState<'todos' | 'compraram' | 'fiado'>('todos');
  const [inativos, setInativos] = useState(false);
  const linhas = useMemo(() => (dados.clientes ? linhasDeClientes(dados.clientes, dados.vendas ?? [], dados.fiado, fuso) : null), [dados, fuso]);
  if (!linhas) return <SemParte />;
  const termo = semAcento(busca.trim());
  const soDigitos = busca.replace(/\D/g, '');
  const vistas = linhas.filter(
    (l) =>
      (inativos || l.cliente.ativo) &&
      (quais === 'todos' || (quais === 'compraram' ? l.compras > 0 : (l.fiado?.devendoCentavos ?? 0) > 0)) &&
      (contem(l.cliente.nome, termo) || (soDigitos.length >= 3 && l.cliente.telefone.includes(soDigitos))),
  );
  const planilha = planilhaClientes(vistas);
  const vales = dados.vales ? planilhaVales(dados.vales, periodo) : null;
  const ativos = linhas.filter((l) => l.cliente.ativo);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros dos clientes" aoExportar={() => aoExportar(vales ? [planilha, vales] : [planilha], 'Clientes')}>
        <Busca id="rc-busca" valor={busca} aoMudar={setBusca} dica="Nome ou telefone" />
        <div className="campo">
          <label htmlFor="rc-quais">Quais clientes</label>
          <select id="rc-quais" value={quais} onChange={(e) => setQuais(e.target.value as typeof quais)}>
            <option value="todos">Todos</option>
            <option value="compraram">Compraram no período</option>
            <option value="fiado">Com fiado em aberto</option>
          </select>
        </div>
        <label className="fin-check rel-check">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar clientes inativos
        </label>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo dos clientes">
        <Cartao rotulo="Clientes ativos" valor={String(ativos.length)} />
        <Cartao rotulo="Compraram no período" valor={String(ativos.filter((l) => l.compras > 0).length)} />
        <Cartao rotulo="Comprado por clientes" valor={formatarCentavos(linhas.reduce((s, l) => s + l.totalCentavos, 0))} nota="vendas com cliente identificado" />
        <Cartao rotulo="Fiado em aberto" valor={formatarCentavos(linhas.reduce((s, l) => s + (l.fiado?.devendoCentavos ?? 0), 0))} />
      </section>
      <TabelaDaPlanilha planilha={planilha} titulo="Clientes" id="rc-titulo" vazio="Nenhum cliente com esses filtros." />
      {vales && <TabelaDaPlanilha planilha={vales} titulo="Vales-troca emitidos no período" id="rc-vales-titulo" vazio="Nenhum vale-troca emitido no período." />}
    </div>
  );
}

// ------------------------------------------------------------------ financeiro
export function AbaFinanceiro({ dados, fuso, nomes, aoExportar }: PropsDaAba) {
  const [conta, setConta] = useState<'todas' | 'caixa' | 'banco'>('todas');
  const [mostrar, setMostrar] = useState<'tudo' | 'entradas' | 'saidas'>('tudo');
  const [categoria, setCategoria] = useState('');
  if (!dados.lancamentos) return <SemParte />;
  const categorias = [...new Set(dados.lancamentos.map((l) => l.categoria).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const vistos = dados.lancamentos.filter(
    (l) =>
      (conta === 'todas' || l.conta === conta) &&
      (mostrar === 'tudo' || (mostrar === 'entradas' ? l.valorCentavos >= 0 : l.valorCentavos < 0)) &&
      (!categoria || l.categoria === categoria),
  );
  const lancamentos = planilhaLancamentos(vistos, nomes, fuso);
  const entradas = vistos.filter((l) => l.valorCentavos > 0).reduce((s, l) => s + l.valorCentavos, 0);
  const saidas = vistos.filter((l) => l.valorCentavos < 0).reduce((s, l) => s - l.valorCentavos, 0);
  const porCategoria = new Map<string, number>();
  for (const l of vistos) if (l.valorCentavos < 0 && (l.tipo === 'despesa' || l.tipo === 'pagamento_conta')) porCategoria.set(l.categoria ?? 'Sem categoria', (porCategoria.get(l.categoria ?? 'Sem categoria') ?? 0) - l.valorCentavos);
  const despesas: Planilha = {
    nome: 'Despesas por categoria',
    colunas: [{ titulo: 'Categoria' }, { titulo: 'Total', tipo: 'dinheiro' }],
    linhas: [...porCategoria].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, v]),
  };
  const aReceber = dados.recebiveis ? planilhaAReceber(dados.recebiveis.filter((r) => r.situacao === 'pendente'), nomes, fuso) : null;
  const aPagar = dados.contasPagar ? planilhaAPagar(dados.contasPagar.filter((c) => c.situacao === 'aberta'), nomes, fuso) : null;
  const extras = [aReceber, aPagar].filter((x): x is Planilha => x !== null);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros do financeiro" aoExportar={() => aoExportar([lancamentos, despesas, ...extras], 'Financeiro')}>
        <div className="campo">
          <label htmlFor="rf-conta">Conta</label>
          <select id="rf-conta" value={conta} onChange={(e) => setConta(e.target.value as typeof conta)}>
            <option value="todas">Todas</option>
            <option value="caixa">{nomes.caixa}</option>
            <option value="banco">{nomes.banco}</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="rf-mostrar">Mostrar</label>
          <select id="rf-mostrar" value={mostrar} onChange={(e) => setMostrar(e.target.value as typeof mostrar)}>
            <option value="tudo">Tudo</option>
            <option value="entradas">Só entradas</option>
            <option value="saidas">Só saídas</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="rf-categoria">Categoria</label>
          <select id="rf-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo do financeiro">
        <Cartao rotulo="Entradas" valor={formatarCentavos(entradas)} />
        <Cartao rotulo="Saídas" valor={formatarCentavos(saidas)} />
        <Cartao rotulo="Resultado" valor={formatarCentavos(entradas - saidas)} nota="entradas − saídas no período" />
        <Cartao rotulo="Despesas" valor={formatarCentavos([...porCategoria.values()].reduce((s, v) => s + v, 0))} nota={plural(porCategoria.size, 'categoria', 'categorias')} />
      </section>
      <TabelaDaPlanilha planilha={lancamentos} titulo="Lançamentos" id="rf-titulo" vazio="Nenhum lançamento com esses filtros no período." />
      <TabelaDaPlanilha planilha={despesas} titulo="Despesas por categoria" id="rf-desp-titulo" vazio="Nenhuma despesa no período." />
      {aReceber && <TabelaDaPlanilha planilha={aReceber} titulo="A receber hoje" id="rf-rec-titulo" vazio="Nada a receber." />}
      {aPagar && <TabelaDaPlanilha planilha={aPagar} titulo="A pagar (em aberto)" id="rf-pag-titulo" vazio="Nenhuma conta a pagar em aberto." />}
    </div>
  );
}

// ------------------------------------------------------------------ caixa do dia
export function AbaCaixa({ dados, periodo, fuso, aoExportar }: PropsDaAba) {
  const [soDiferenca, setSoDiferenca] = useState(false);
  if (!dados.caixas) return <SemParte />;
  const doPeriodo = dados.caixas.filter((c) => noPeriodo(c.dia, periodo));
  const vistos = soDiferenca ? doPeriodo.filter((c) => (c.fechamento?.diferencaCentavos ?? 0) !== 0) : doPeriodo;
  const planilha = planilhaCaixas(vistos, periodo, fuso);
  const difs = doPeriodo.map((c) => c.fechamento?.diferencaCentavos ?? 0);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros do caixa" aoExportar={() => aoExportar([planilha], 'Caixa do dia')}>
        <label className="fin-check rel-check">
          <input type="checkbox" checked={soDiferenca} onChange={(e) => setSoDiferenca(e.target.checked)} /> Só os dias com diferença
        </label>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo do caixa">
        <Cartao rotulo="Dias com caixa" valor={String(doPeriodo.length)} />
        <Cartao rotulo="Fechados com diferença" valor={String(difs.filter((d) => d !== 0).length)} />
        <Cartao rotulo="Faltas" valor={formatarCentavos(-difs.filter((d) => d < 0).reduce((s, d) => s + d, 0))} />
        <Cartao rotulo="Sobras" valor={formatarCentavos(difs.filter((d) => d > 0).reduce((s, d) => s + d, 0))} nota={plural(doPeriodo.filter((c) => c.fechamento?.automatico).length, 'fechou sozinho', 'fecharam sozinhos')} />
      </section>
      <TabelaDaPlanilha planilha={planilha} titulo="Caixa de cada dia" id="rx-titulo" vazio="Nenhum caixa no período." />
    </div>
  );
}

// ------------------------------------------------------------------ compras
export function AbaCompras({ dados, nomes, aoExportar }: PropsDaAba) {
  const [fornecedor, setFornecedor] = useState('');
  const [pagamento, setPagamento] = useState<'todos' | 'avista' | 'aprazo'>('todos');
  if (!dados.compras) return <SemParte />;
  const fornecedores = [...new Map(dados.compras.filter((c) => c.fornecedor).map((c) => [c.fornecedor!.id, c.fornecedor!.nome]))].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const vistas = dados.compras.filter((c) => (!fornecedor || c.fornecedor?.id === fornecedor) && (pagamento === 'todos' || c.pagamento.tipo === pagamento));
  const compras = planilhaCompras(vistas, nomes);
  const itens = planilhaItensComprados(vistas);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros das compras" aoExportar={() => aoExportar([compras, itens], 'Compras')}>
        <div className="campo">
          <label htmlFor="rm-fornecedor">Fornecedor</label>
          <select id="rm-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">Todos</option>
            {fornecedores.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="rm-pagamento">Pagamento</label>
          <select id="rm-pagamento" value={pagamento} onChange={(e) => setPagamento(e.target.value as typeof pagamento)}>
            <option value="todos">Todos</option>
            <option value="avista">À vista</option>
            <option value="aprazo">A prazo</option>
          </select>
        </div>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo das compras">
        <Cartao rotulo="Compras" valor={String(vistas.length)} />
        <Cartao rotulo="Total comprado" valor={formatarCentavos(vistas.reduce((s, c) => s + c.totalCentavos, 0))} />
        <Cartao rotulo="A prazo" valor={formatarCentavos(vistas.filter((c) => c.pagamento.tipo === 'aprazo').reduce((s, c) => s + c.totalCentavos, 0))} />
        <Cartao rotulo="Itens estornados" valor={String(vistas.reduce((s, c) => s + c.itens.filter((i) => i.estorno).length, 0))} />
      </section>
      <TabelaDaPlanilha planilha={compras} titulo="Compras" id="rm-titulo" vazio="Nenhuma compra no período." />
      <TabelaDaPlanilha planilha={itens} titulo="Itens comprados" id="rm-itens-titulo" vazio="Nenhum item comprado no período." />
    </div>
  );
}

// ------------------------------------------------------------------ vendas antigas (importadas; módulo 13)
export function AbaVendasAntigas({ dados, periodo, aoExportar }: PropsDaAba) {
  const [busca, setBusca] = useState('');
  const [pagamento, setPagamento] = useState('');
  if (!dados.vendasAntigas) return <SemParte />;
  const doPeriodo = dados.vendasAntigas.filter((v) => noPeriodo(v.dia, periodo));
  const pagamentos = [...new Set(doPeriodo.map((v) => v.pagamento).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const termo = semAcento(busca);
  const vistas = doPeriodo.filter(
    (v) =>
      (!pagamento || v.pagamento === pagamento) &&
      (contem(v.cliente ?? '', termo) || contem(v.numeroAntigo ?? '', termo) || contem(v.vendedor ?? '', termo) || v.itens.some((i) => contem(i.produto ?? '', termo))),
  );
  const r = resumirVendasAntigas(vistas);
  const vendas = planilhaVendasAntigas(vistas);
  const itens = planilhaItensVendasAntigas(vistas);
  return (
    <div className="rel-aba">
      <p className="alerta" role="note">
        Vendas importadas de outro sistema, só como histórico: não entram no estoque, no caixa, no financeiro nem nos números das outras abas.
      </p>
      <Filtros rotulo="Filtros das vendas antigas" aoExportar={() => aoExportar([vendas, itens], 'Vendas antigas')}>
        <Busca id="ra-busca" valor={busca} aoMudar={setBusca} dica="Cliente, produto, número ou vendedor" />
        <div className="campo">
          <label htmlFor="ra-pagamento">Pagamento</label>
          <select id="ra-pagamento" value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
            <option value="">Todos</option>
            {pagamentos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo das vendas antigas">
        <Cartao rotulo="Total vendido" valor={formatarCentavos(r.totalCentavos)} />
        <Cartao rotulo="Vendas" valor={String(r.vendas)} />
        <Cartao rotulo="Ticket médio" valor={formatarCentavos(r.ticketMedioCentavos)} />
        <Cartao rotulo="Itens" valor={String(r.itens)} />
      </section>
      <TabelaDaPlanilha planilha={vendas} titulo="Vendas antigas" id="ra-titulo" vazio="Nenhuma venda antiga no período." />
      <TabelaDaPlanilha planilha={itens} titulo="Itens das vendas antigas" id="ra-itens-titulo" vazio="Nenhum item no período." />
    </div>
  );
}

// ------------------------------------------------------------------ histórico
export function AbaHistorico({ dados, periodo, fuso, aoExportar }: PropsDaAba) {
  const [quem, setQuem] = useState('');
  const [acao, setAcao] = useState('');
  const [busca, setBusca] = useState('');
  if (!dados.auditoria) return <SemParte />;
  const pessoas = [...new Set(dados.auditoria.map((i) => i.quem ?? 'Sistema'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const acoes = [...new Set(dados.auditoria.map((i) => i.texto))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const termo = semAcento(busca.trim());
  const vistos = dados.auditoria.filter((i) => (!quem || (i.quem ?? 'Sistema') === quem) && (!acao || i.texto === acao) && contem(`${i.texto} ${i.resumo ?? ''} ${i.alvo?.nome ?? ''}`, termo));
  const planilha = planilhaHistorico(vistos, periodo, fuso);
  return (
    <div className="rel-aba">
      <Filtros rotulo="Filtros do histórico" aoExportar={() => aoExportar([planilha], 'Histórico')}>
        <div className="campo">
          <label htmlFor="rh-quem">Quem</label>
          <select id="rh-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="rh-acao">O que</label>
          <select id="rh-acao" value={acao} onChange={(e) => setAcao(e.target.value)}>
            <option value="">Tudo</option>
            {acoes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <Busca id="rh-busca" valor={busca} aoMudar={setBusca} dica="Detalhe ou nome" />
      </Filtros>
      <section className="rel-metricas" aria-label="Resumo do histórico">
        <Cartao rotulo="Registros no período" valor={String(planilha.linhas.length)} />
        <Cartao rotulo="Pessoas" valor={String(new Set(planilha.linhas.map((l) => l[2])).size)} />
      </section>
      <TabelaDaPlanilha planilha={planilha} titulo="Quem fez o quê" id="rh-titulo" vazio="Nenhum registro com esses filtros no período." />
    </div>
  );
}
