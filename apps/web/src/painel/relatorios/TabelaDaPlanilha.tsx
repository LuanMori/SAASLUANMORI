// apps/web/src/painel/relatorios/TabelaDaPlanilha.tsx
// A tabela de cada aba dos Relatórios desenhada a partir da mesma `Planilha` que vai para o Excel: o que a pessoa vê
// é o que ela exporta. Dinheiro em R$, datas em dd/mm/aaaa, quantidade com vírgula. Listas longas mostram as
// primeiras linhas e avisam que o Excel leva tudo. No celular, cada linha vira um cartão com o nome de cada coluna.
import { dataBr, formatarCentavos } from '@saas/core';
import type { ReactNode } from 'react';
import { plural } from '../formato';
import type { Celula, Coluna, Planilha } from '../../relatorios/xlsx';

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Como a célula aparece na tela. */
export function textoDaCelula(valor: Celula, tipo: Coluna['tipo']): string {
  if (valor === null || valor === '') return '—';
  if (typeof valor === 'string') return tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? dataBr(valor) : valor;
  switch (tipo) {
    case 'dinheiro':
      return formatarCentavos(valor);
    case 'pct':
      return `${PCT.format(valor)}%`;
    case 'numero':
    case 'inteiro':
      return NUMERO.format(valor);
    default:
      return String(valor);
  }
}

const numerica = (t: Coluna['tipo']) => t === 'dinheiro' || t === 'numero' || t === 'inteiro' || t === 'pct';

export function TabelaDaPlanilha({
  planilha,
  titulo,
  id,
  vazio,
  limite = 300,
  acoes,
  classe = '',
}: {
  planilha: Planilha;
  titulo: string;
  id: string;
  vazio: string;
  /** Quantas linhas aparecem na tela (o Excel leva todas). */
  limite?: number;
  acoes?: ReactNode;
  classe?: string;
}) {
  const linhas = planilha.linhas.slice(0, limite);
  return (
    <section className={`card card-plano rel-tabela ${classe}`.trim()} aria-labelledby={id}>
      <div className="card-cabeca">
        <h2 id={id}>{titulo}</h2>
        <span className="rel-cabeca-acoes">
          <span className="suave">{plural(planilha.linhas.length, 'linha', 'linhas')}</span>
          {acoes}
        </span>
      </div>
      {planilha.linhas.length === 0 ? (
        <p className="vazio">{vazio}</p>
      ) : (
        <>
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  {planilha.colunas.map((c) => (
                    <th key={c.titulo} className={numerica(c.tipo) ? 'numero' : undefined}>
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    {planilha.colunas.map((c, j) => (
                      <td key={c.titulo} data-rotulo={c.titulo} className={numerica(c.tipo) ? `numero${typeof l[j] === 'number' && (l[j] as number) < 0 ? ' fin-sai' : ''}` : undefined}>
                        {textoDaCelula(l[j] ?? null, c.tipo)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {planilha.linhas.length > limite && (
            <p className="rel-nota">
              Mostrando as {limite} primeiras de {planilha.linhas.length} linhas. O Excel leva todas.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Um número em destaque (os cartões do topo de cada aba). */
export function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string | null }) {
  return (
    <div className="card rel-cartao">
      <span className="vg-metrica-rotulo">{rotulo}</span>
      <strong className="rel-cartao-valor">{valor}</strong>
      {nota && <small className="suave">{nota}</small>}
    </div>
  );
}

/** "Exportar esta aba (Excel)". */
export function BotaoExportar({ aoExportar, rotulo = 'Exportar esta aba (Excel)', ocupado = false }: { aoExportar: () => void; rotulo?: string; ocupado?: boolean }) {
  return (
    <button type="button" className="botao rel-exportar" onClick={aoExportar} disabled={ocupado}>
      {ocupado ? 'Gerando…' : rotulo}
    </button>
  );
}
