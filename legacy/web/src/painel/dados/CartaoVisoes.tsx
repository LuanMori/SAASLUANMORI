// apps/web/src/painel/dados/CartaoVisoes.tsx
// Dados e backup → Adm. Sup → VISÕES SOB MEDIDA (módulo 13g): o suporte monta tabelas dos Relatórios para esta loja.
//   - a lista das visões da loja, com o que cada uma mostra, "Editar" e "Excluir" (com confirmação);
//   - o formulário: nome, base (uma das tabelas dos Relatórios), colunas, até 3 filtros, agrupar e somar, e a ordem;
//   - a prévia com os dados da loja (todo o período), igual ao que a equipe vê em Relatórios → Visões.
// As regras ficam no @saas/core (visoes.ts); as bases, em relatorios/visoes.ts.
import {
  type BaseDaVisao,
  BASES_DAS_VISOES,
  COLUNA_QUANTIDADE,
  type DefinicaoDaVisao,
  descreverVisao,
  type FiltroDaVisao,
  LIMITES_VISOES,
  LISTA_BASES_DAS_VISOES,
  OPERADORES_DO_FILTRO,
  OPERADORES_SEM_VALOR,
  operadoresDoTipo,
  type VisaoSobMedida,
} from '@saas/core';
import { type FormEvent, useMemo, useState } from 'react';
import { type ApiVisoes, ErroApi } from '../../api';
import { type ApiRelatorios, carregarRelatorios, type DadosDosRelatorios } from '../../relatorios/planilhas';
import { colunasDaBase, planilhaDaVisao } from '../../relatorios/visoes';
import { usarNomesDasContas } from '../nomesDasContas';
import { TabelaDaPlanilha } from '../relatorios/TabelaDaPlanilha';
import { usarCarga } from '../usarCarga';

export type ApiDasVisoes = ApiVisoes & ApiRelatorios;

const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.');
const TODO_O_PERIODO = { de: null, ate: null };

export function CartaoVisoes({ api, fuso, aoMudar }: { api: ApiDasVisoes; fuso: string; aoMudar?: () => void }) {
  const { estado, recarregar } = usarCarga(() => api.listarVisoes(), [api]);
  // os dados da loja (todo o período), só para a prévia: lidos quando o formulário abre
  const [editando, setEditando] = useState<VisaoSobMedida | 'nova' | null>(null);
  const { estado: dados } = usarCarga(() => (editando ? carregarRelatorios(api, TODO_O_PERIODO) : Promise.resolve(null)), [api, editando !== null]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<VisaoSobMedida | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const lista = estado.tipo === 'pronto' ? estado.dados : [];

  async function confirmarExclusao(v: VisaoSobMedida) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.excluirVisao(v.id);
      await recarregar();
      setExcluir(null);
      setAviso(`Visão "${v.nome}" excluída: ela sai de Relatórios → Visões.`);
      aoMudar?.();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="as-visoes-titulo">
      <h2 id="as-visoes-titulo">Visões sob medida</h2>
      <p className="suave db-sub">
        Tabelas dos Relatórios montadas para esta loja: a base, as colunas, os filtros, se agrupa e soma, e a ordem. A equipe vê em Relatórios → Visões, no
        período que escolher, e exporta para o Excel.
      </p>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          {lista.length > 0 ? (
            <ul className="as-visoes" aria-label="Visões desta loja">
              {lista.map((v) => (
                <li key={v.id}>
                  <div>
                    <p>
                      <strong>{v.nome}</strong>
                    </p>
                    <p className="suave">{descreverVisao(v)}</p>
                  </div>
                  {excluir?.id === v.id ? (
                    <span className="as-visoes-acoes" role="group" aria-label={`Excluir a visão ${v.nome}?`}>
                      <button type="button" className="botao botao-perigo" onClick={() => void confirmarExclusao(v)} disabled={ocupado}>
                        {ocupado ? 'Excluindo…' : 'Sim, excluir'}
                      </button>
                      <button type="button" className="botao" onClick={() => setExcluir(null)} disabled={ocupado}>
                        Não
                      </button>
                    </span>
                  ) : (
                    <span className="as-visoes-acoes">
                      <button
                        type="button"
                        className="botao"
                        onClick={() => {
                          setAviso(null);
                          setEditando(v);
                        }}
                        aria-label={`Editar a visão ${v.nome}`}
                        disabled={editando !== null}
                      >
                        Editar
                      </button>
                      <button type="button" className="botao" onClick={() => setExcluir(v)} aria-label={`Excluir a visão ${v.nome}`} disabled={editando !== null}>
                        Excluir
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            estado.tipo === 'pronto' && <p className="suave">Nenhuma visão nesta loja ainda.</p>
          )}
          {erro && (
            <p className="alerta alerta-erro" role="alert">
              {erro}
            </p>
          )}
          {aviso && (
            <p className="alerta" role="status">
              {aviso}
            </p>
          )}
          {editando ? (
            <FormVisao
              key={editando === 'nova' ? 'nova' : editando.id}
              api={api}
              fuso={fuso}
              visao={editando === 'nova' ? null : editando}
              dados={dados.tipo === 'pronto' ? dados.dados : null}
              aoCancelar={() => setEditando(null)}
              aoSalvar={async (salva, nova) => {
                await recarregar();
                setEditando(null);
                setAviso(nova ? `Visão "${salva.nome}" criada: aparece em Relatórios → Visões.` : `Visão "${salva.nome}" salva.`);
                aoMudar?.();
              }}
            />
          ) : (
            lista.length < LIMITES_VISOES.porLoja && (
              <div className="modal-acoes">
                <button
                  type="button"
                  className="botao botao-primario"
                  onClick={() => {
                    setAviso(null);
                    setEditando('nova');
                  }}
                  disabled={estado.tipo !== 'pronto'}
                >
                  Nova visão
                </button>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ o formulário da visão

function FormVisao({
  api,
  fuso,
  visao,
  dados,
  aoCancelar,
  aoSalvar,
}: {
  api: ApiDasVisoes;
  fuso: string;
  visao: VisaoSobMedida | null;
  dados: DadosDosRelatorios | null;
  aoCancelar: () => void;
  aoSalvar: (salva: VisaoSobMedida, nova: boolean) => Promise<void>;
}) {
  const nomes = usarNomesDasContas();
  const [nome, setNome] = useState(visao?.nome ?? '');
  const [base, setBase] = useState<BaseDaVisao>(visao?.base ?? 'vendas');
  const colunas = useMemo(() => colunasDaBase(base, fuso), [base, fuso]);
  // vazio = todas (as colunas que a base ganhar depois entram também)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(visao?.colunas.length ? visao.colunas : colunasDaBase(visao?.base ?? 'vendas', fuso).map((c) => c.titulo)));
  const [filtros, setFiltros] = useState<FiltroDaVisao[]>(visao?.filtros ?? []);
  const [agruparPor, setAgruparPor] = useState(visao?.agruparPor ?? '');
  const [ordem, setOrdem] = useState(visao?.ordem?.coluna ?? '');
  const [sentido, setSentido] = useState<'asc' | 'desc'>(visao?.ordem?.sentido ?? 'desc');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const tipoDe = (titulo: string) => colunas.find((c) => c.titulo === titulo)?.tipo;
  const escolhidas = colunas.filter((c) => marcadas.has(c.titulo)).map((c) => c.titulo);
  const definicao: DefinicaoDaVisao = {
    nome,
    base,
    colunas: escolhidas.length === colunas.length ? [] : escolhidas,
    filtros,
    agruparPor: agruparPor || null,
    ordem: ordem ? { coluna: ordem, sentido } : null,
  };
  // agrupada, a visão tem o grupo, a quantidade e as somas: só dá para ordenar por elas
  const opcoesDeOrdem = agruparPor
    ? [agruparPor, COLUNA_QUANTIDADE, ...colunas.filter((c) => c.titulo !== agruparPor && marcadas.has(c.titulo) && (c.tipo === 'dinheiro' || c.tipo === 'numero' || c.tipo === 'inteiro')).map((c) => c.titulo)]
    : colunas.map((c) => c.titulo);
  const previa = dados ? planilhaDaVisao({ ...definicao, nome: nome.trim() || 'Prévia' }, dados, TODO_O_PERIODO, nomes, fuso) : null;

  function trocarBase(nova: BaseDaVisao) {
    setBase(nova);
    setMarcadas(new Set(colunasDaBase(nova, fuso).map((c) => c.titulo)));
    setFiltros([]);
    setAgruparPor('');
    setOrdem('');
  }
  const alternar = (titulo: string) =>
    setMarcadas((m) => {
      const nova = new Set(m);
      if (nova.has(titulo)) nova.delete(titulo);
      else nova.add(titulo);
      return nova;
    });
  const mudarFiltro = (i: number, mudanca: Partial<FiltroDaVisao>) =>
    setFiltros((fs) =>
      fs.map((f, j) => {
        if (j !== i) return f;
        const novo = { ...f, ...mudanca };
        // trocou a coluna: a condição precisa servir para o tipo dela
        if (mudanca.coluna !== undefined && !operadoresDoTipo(tipoDe(novo.coluna)).includes(novo.operador)) novo.operador = operadoresDoTipo(tipoDe(novo.coluna))[0]!;
        return novo;
      }),
    );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (escolhidas.length === 0) return setErro('Marque pelo menos uma coluna.');
    setEnviando(true);
    try {
      const salva = await api.salvarVisao({ ...definicao, id: visao?.id ?? null });
      await aoSalvar(salva, visao === null);
    } catch (falha) {
      setErro(mensagemDe(falha));
      setEnviando(false);
    }
  }

  return (
    <form className="db-form as-visao-form" onSubmit={(e) => void salvar(e)} noValidate aria-label={visao ? `Editar a visão ${visao.nome}` : 'Nova visão'}>
      <h3>{visao ? `Editar: ${visao.nome}` : 'Nova visão'}</h3>
      <div className="as-visao-linha">
        <div className="campo">
          <label htmlFor="as-visao-nome">Nome da visão</label>
          <input id="as-visao-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITES_VISOES.nomeMax} placeholder="Ex.: Vendas por vendedor" />
        </div>
        <div className="campo">
          <label htmlFor="as-visao-base">Base (tabela dos Relatórios)</label>
          <select id="as-visao-base" value={base} onChange={(e) => trocarBase(e.target.value as BaseDaVisao)}>
            {LISTA_BASES_DAS_VISOES.map((b) => (
              <option key={b} value={b}>
                {BASES_DAS_VISOES[b]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="db-escolha as-visao-colunas">
        <legend>Colunas ({escolhidas.length === colunas.length ? 'todas' : `${escolhidas.length} de ${colunas.length}`})</legend>
        {colunas.map((c) => (
          <label key={c.titulo} className={marcadas.has(c.titulo) ? 'db-escolha-on' : undefined}>
            <input type="checkbox" checked={marcadas.has(c.titulo)} onChange={() => alternar(c.titulo)} />
            {c.titulo}
          </label>
        ))}
      </fieldset>

      <fieldset className="as-visao-filtros">
        <legend>Filtros (todos precisam valer)</legend>
        {filtros.map((f, i) => (
          <div key={i} className="as-visao-filtro" role="group" aria-label={`Filtro ${i + 1}`}>
            <select value={f.coluna} onChange={(e) => mudarFiltro(i, { coluna: e.target.value })} aria-label={`Coluna do filtro ${i + 1}`}>
              {colunas.map((c) => (
                <option key={c.titulo} value={c.titulo}>
                  {c.titulo}
                </option>
              ))}
            </select>
            <select value={f.operador} onChange={(e) => mudarFiltro(i, { operador: e.target.value as FiltroDaVisao['operador'] })} aria-label={`Condição do filtro ${i + 1}`}>
              {operadoresDoTipo(tipoDe(f.coluna)).map((o) => (
                <option key={o} value={o}>
                  {OPERADORES_DO_FILTRO[o]}
                </option>
              ))}
            </select>
            {!OPERADORES_SEM_VALOR.includes(f.operador) && (
              <input
                value={f.valor}
                onChange={(e) => mudarFiltro(i, { valor: e.target.value })}
                aria-label={`Valor do filtro ${i + 1}`}
                maxLength={LIMITES_VISOES.valorMax}
                placeholder={tipoDe(f.coluna) === 'data' ? 'dd/mm/aaaa' : tipoDe(f.coluna) === 'dinheiro' ? '0,00' : ''}
              />
            )}
            <button type="button" className="botao" onClick={() => setFiltros((fs) => fs.filter((_, j) => j !== i))} aria-label={`Tirar o filtro ${i + 1}`}>
              Tirar
            </button>
          </div>
        ))}
        {filtros.length < LIMITES_VISOES.filtrosMax && (
          <button
            type="button"
            className="botao"
            onClick={() => setFiltros((fs) => [...fs, { coluna: colunas[0]?.titulo ?? '', operador: operadoresDoTipo(colunas[0]?.tipo)[0]!, valor: '' }])}
            disabled={colunas.length === 0}
          >
            Adicionar filtro
          </button>
        )}
      </fieldset>

      <div className="as-visao-linha">
        <div className="campo">
          <label htmlFor="as-visao-agrupar">Agrupar e somar por</label>
          <select
            id="as-visao-agrupar"
            value={agruparPor}
            onChange={(e) => {
              setAgruparPor(e.target.value);
              setOrdem('');
            }}
          >
            <option value="">Não agrupar</option>
            {colunas.map((c) => (
              <option key={c.titulo} value={c.titulo}>
                {c.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="as-visao-ordem">Ordenar por</label>
          <select id="as-visao-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="">{agruparPor ? 'Ordem do grupo' : 'Ordem da base'}</option>
            {opcoesDeOrdem.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {ordem && (
          <div className="campo">
            <label htmlFor="as-visao-sentido">Sentido</label>
            <select id="as-visao-sentido" value={sentido} onChange={(e) => setSentido(e.target.value as 'asc' | 'desc')}>
              <option value="desc">Do maior para o menor</option>
              <option value="asc">Do menor para o maior</option>
            </select>
          </div>
        )}
      </div>
      {agruparPor && <p className="suave as-visao-dica">Agrupada, cada linha é um valor de “{agruparPor}”, com a quantidade de linhas e a soma das colunas de número marcadas.</p>}

      {previa ? (
        <TabelaDaPlanilha
          planilha={previa.planilha}
          titulo="Prévia (todo o período)"
          id="as-visao-previa"
          vazio="Nenhuma linha com estes filtros."
          limite={8}
          classe="as-visao-previa"
          sub={
            previa.avisos.length > 0 ? (
              <div className="rel-visao-sub">
                {previa.avisos.map((a) => (
                  <p key={a} className="rel-visao-aviso">
                    {a}
                  </p>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <p className="suave">{dados === null ? 'Carregando a prévia…' : 'A base desta visão ainda não está disponível no sistema da loja.'}</p>
      )}

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="modal-acoes">
        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Salvando…' : visao ? 'Salvar a visão' : 'Criar a visão'}
        </button>
        <button type="button" className="botao" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
