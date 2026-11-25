// apps/web/src/painel/TelaRelatorios.tsx
// Relatórios (Fase 2, módulo 10; pedido do Luan de 23/11/2026): TODAS as informações da loja, organizadas por abas,
// com filtros e exportação para o Excel.
//   - o período (atalhos + datas) fica no topo e vale para todas as abas;
//   - abas: Vendas (a de sempre: quem vendeu, cliente, pagamento, devoluções), Produtos (mais vendidos e lucro
//     estimado), Estoque (posição no período e movimentos), Clientes (compras, fiado, vales-troca), Financeiro
//     (lançamentos, despesas por categoria, a receber e a pagar), Caixa (cada dia), Compras e Histórico (quem fez o quê);
//   - cada aba tem os filtros dela e "Exportar esta aba (Excel)", que leva o que a tabela mostra;
//   - "Exportar tudo (Excel)" gera um arquivo com um resumo e uma aba do Excel para cada assunto, no período escolhido.
// O arquivo é feito no navegador (relatorios/xlsx.ts) e o histórico registra quem exportou, o assunto e o período.
import { diaNoFuso, somarDias } from '@saas/core';
import { useState } from 'react';
import type { ApiFinanceiro, ApiRelatorios as ApiRegistro, ApiVendas } from '../api';
import { type Baixar, baixarArquivo } from '../relatorios/baixar';
import { type ApiRelatorios, carregarRelatorios, nomeDoArquivo, type Periodo, planilhasDeTudo } from '../relatorios/planilhas';
import { gerarXlsx, type Planilha } from '../relatorios/xlsx';
import { AvisoComIcone } from './AvisoComIcone';
import { plural } from './formato';
import { usarNomesDasContas } from './nomesDasContas';
import { AbaVendas } from './relatorios/AbaVendas';
import { AbaCaixa, AbaClientes, AbaCompras, AbaEstoque, AbaFinanceiro, AbaHistorico, AbaProdutos } from './relatorios/AbasRelatorios';
import { AbaTudo, type AssuntoDoTudo } from './relatorios/AbaTudo';
import { BotaoExportar } from './relatorios/TabelaDaPlanilha';
import { usarCarga } from './usarCarga';

interface Props {
  /** Sem alguma parte (servidor que ainda não a tem), a aba dela avisa e o resto continua. */
  api: ApiVendas & Partial<Pick<ApiFinanceiro, 'listarRecebiveis'>> & Partial<ApiRelatorios> & Partial<ApiRegistro>;
  fuso: string;
  agora?: () => Date;
  /** Como o arquivo chega à pessoa (nos testes, uma função que guarda o arquivo). */
  baixar?: Baixar;
}

type Atalho = 'tudo' | 'hoje' | 'ontem' | '7dias' | 'mes';

function periodoDo(atalho: Atalho, hoje: string): { de: string; ate: string } {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'ontem':
      return { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) };
    case '7dias':
      return { de: somarDias(hoje, -6), ate: hoje };
    case 'mes':
      return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
    default:
      return { de: '', ate: '' };
  }
}

const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Todas' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
];

type IdAba = 'tudo' | AssuntoDoTudo;
// "Tudo" (pedido do Luan, 25/11/2026): o resumo de todos os assuntos; é a primeira e a que abre
const ABAS: { id: IdAba; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'vendas', rotulo: 'Vendas' },
  { id: 'produtos', rotulo: 'Produtos' },
  { id: 'estoque', rotulo: 'Estoque' },
  { id: 'clientes', rotulo: 'Clientes' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'caixa', rotulo: 'Caixa' },
  { id: 'compras', rotulo: 'Compras' },
  { id: 'historico', rotulo: 'Histórico' },
];

/** Os relatórios precisam de todas estas partes para as outras abas e o "Exportar tudo". */
const temTudo = (api: Props['api']): api is Props['api'] & ApiRelatorios =>
  ['listarProdutos', 'listarEstoque', 'listarMovimentosEstoque', 'listarClientes', 'listarFiado', 'listarVales', 'listarLancamentos', 'listarContasAPagar', 'lerCaixa', 'listarCompras', 'listarAuditoria'].every(
    (k) => typeof (api as unknown as Record<string, unknown>)[k] === 'function',
  );

export function TelaRelatorios({ api, fuso, agora = () => new Date(), baixar = baixarArquivo }: Props) {
  const hoje = diaNoFuso(agora(), fuso);
  const nomes = usarNomesDasContas();
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  // sem todas as partes (servidor que ainda não as tem) não há abas: fica só Vendas
  const [aba, setAba] = useState<IdAba>(() => (temTudo(api) ? 'tudo' : 'vendas'));
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [exportando, setExportando] = useState(false);
  const periodo: Periodo = { de: de || null, ate: ate || null };
  const completa = temTudo(api);
  // as outras abas e o "Exportar tudo" leem tudo de uma vez (na aba Vendas, só quando exportar)
  const { estado } = usarCarga(
    () => (completa && aba !== 'vendas' ? carregarRelatorios(api, periodo) : Promise.resolve(null)),
    [api, de, ate, aba === 'vendas', completa],
  );
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const atalhoAtivo = ATALHOS.find((a) => {
    const p = periodoDo(a.id, hoje);
    return p.de === de && p.ate === ate;
  })?.id;

  async function exportar(planilhas: Planilha[], assunto: string) {
    setAviso(null);
    if (planilhas.length === 0) return;
    const nome = nomeDoArquivo(assunto, periodo, hoje);
    try {
      baixar(nome, gerarXlsx(planilhas, agora()));
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível gerar o arquivo do Excel. Tente de novo.' });
      return;
    }
    setAviso({ tipo: 'ok', texto: `Arquivo do Excel pronto: ${nome} (${plural(planilhas.length, 'aba', 'abas')}).` });
    // o histórico guarda quem exportou, o assunto e o período (sem o servidor dessa parte, segue sem registrar)
    if (api.registrarExportacao) await api.registrarExportacao({ assunto, de: periodo.de, ate: periodo.ate, abas: planilhas.length }).catch(() => undefined);
  }

  async function exportarTudo() {
    if (!completa) return;
    setExportando(true);
    try {
      const tudo = dados ?? (await carregarRelatorios(api, periodo));
      await exportar(planilhasDeTudo(tudo, periodo, nomes, fuso, agora()), 'Tudo');
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível ler os dados para exportar. Tente de novo.' });
    } finally {
      setExportando(false);
    }
  }

  const props = dados ? { dados, periodo, fuso, nomes, aoExportar: (p: Planilha[], a: string) => void exportar(p, a) } : null;
  return (
    <div className="rel">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="suave">Tudo o que acontece na loja, por assunto, com filtros e exportação para o Excel.</p>
        </div>
        {completa && (
          <div className="pe-topo-acoes">
            <BotaoExportar aoExportar={() => void exportarTudo()} rotulo="Exportar tudo (Excel)" ocupado={exportando} />
          </div>
        )}
      </header>

      <section className="card rel-filtros" aria-label="Período">
        <div className="rel-atalhos" role="group" aria-label="Período">
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip${atalhoAtivo === a.id ? ' chip-on' : ''}`}
              aria-pressed={atalhoAtivo === a.id}
              onClick={() => {
                const p = periodoDo(a.id, hoje);
                setDe(p.de);
                setAte(p.ate);
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="rel-campos">
          <div className="campo">
            <label htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
      </section>

      {completa && (
        <nav className="cli-abas rel-abas" aria-label="Assuntos dos relatórios">
          {ABAS.map((a) => (
            <button key={a.id} type="button" className={aba === a.id ? 'cli-aba-on' : ''} aria-current={aba === a.id ? 'page' : undefined} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </nav>
      )}

      {aviso && (
        <AvisoComIcone tipo={aviso.tipo === 'ok' ? 'ok' : 'erro'} papel={aviso.tipo === 'ok' ? 'status' : 'alert'}>
          {aviso.texto}
        </AvisoComIcone>
      )}

      {aba === 'vendas' ? (
        <AbaVendas api={api} fuso={fuso} de={de} ate={ate} aoExportar={(p, a) => void exportar(p, a)} />
      ) : estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : !props ? (
        <p className="vazio">Carregando…</p>
      ) : aba === 'tudo' ? (
        <AbaTudo dados={props.dados} periodo={periodo} fuso={fuso} aoVer={setAba} />
      ) : aba === 'produtos' ? (
        <AbaProdutos {...props} />
      ) : aba === 'estoque' ? (
        <AbaEstoque {...props} />
      ) : aba === 'clientes' ? (
        <AbaClientes {...props} />
      ) : aba === 'financeiro' ? (
        <AbaFinanceiro {...props} />
      ) : aba === 'caixa' ? (
        <AbaCaixa {...props} />
      ) : aba === 'compras' ? (
        <AbaCompras {...props} />
      ) : (
        <AbaHistorico {...props} />
      )}
    </div>
  );
}
