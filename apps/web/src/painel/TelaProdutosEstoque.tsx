// apps/web/src/painel/TelaProdutosEstoque.tsx
// Aba Produtos e estoque (DaniPets V9.3.3, Fase 2 módulo 2):
//   - cadastro completo (nome, código de barras, marca, peso, vendido por unidade ou kg, preço, estoque
//     inicial e o custo dele) — todos cadastram; o custo, só Dono e Administrador;
//   - lista com busca (nome, marca ou código), saldo na unidade do produto e situação (baixo, zerado);
//   - Dono e Administrador: alterar, inativar/reativar, excluir (só sem história), entrada, ajuste com os
//     motivos da loja e estoque mínimo; "Como o saldo é calculado"; Regras do estoque (un/kg e motivos);
//   - últimos movimentos, com a venda de origem, o motivo e quem lançou.
// O Vendedor cadastra produto novo e consulta, como no DaniPets.
import { diaNoFuso, type ConfiguracaoDaLoja, type Fornecedor, formatarCentavos, formatarNumeroVenda, formatarQuantidade, NOME_MOVIMENTO_ESTOQUE, pode, regrasPadrao, type SituacaoEstoque, unidadeDe, type QuemAcessa } from '@saas/core';
import { useMemo, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto, type SaldoEstoque } from '../api';
import { dataNoFuso, horaNoFuso, plural } from './formato';
import { type AcaoEstoque, ModalEstoque, ModalRegrasEstoque, ModalSaldo } from './produtos/ModaisEstoque';
import { ModalProduto } from './produtos/ModalProduto';
import { usarCarga } from './usarCarga';

type ApiDaTela = Pick<
  ApiPainel,
  | 'listarProdutos'
  | 'criarProduto'
  | 'alterarProduto'
  | 'definirProdutoAtivo'
  | 'excluirProduto'
  | 'listarEstoque'
  | 'listarMovimentosEstoque'
  | 'lancarMovimentoEstoque'
  | 'definirEstoqueMinimo'
  | 'lerConfiguracao'
  | 'salvarRegrasDaLoja'
  | 'listarFornecedores'
  | 'listarAutorizadores'
  | 'autorizar'
>;

interface Props {
  api: ApiDaTela;
  papel: QuemAcessa;
  fuso: string;
  /** Atualização automática (ms): o saldo muda quando alguém vende. */
  intervaloMs?: number;
  /** Para testes: as perguntas "tem certeza?". */
  confirmar?: (texto: string) => boolean;
}

type Janela =
  | { tipo: 'produto'; produto: Produto | null }
  | { tipo: 'estoque'; acao: AcaoEstoque; produto: Produto }
  | { tipo: 'saldo'; produto: Produto }
  | { tipo: 'regras' };

const MOVIMENTOS_NA_TELA = 20;
const ROTULO_SITUACAO: Record<Exclude<SituacaoEstoque, 'ok'>, string> = { baixo: 'baixo', zerado: 'zerado', negativo: 'negativo' };

/** Para a busca: sem acento e sem diferença de maiúscula. */
const simples = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function TelaProdutosEstoque({ api, papel, fuso, intervaloMs = 5000, confirmar = (t) => window.confirm(t) }: Props) {
  const gestor = pode(papel, 'produtos.alterar');
  const lanca = pode(papel, 'estoque.lancar');
  const { estado, recarregar } = usarCarga(
    async () => {
      const [produtos, estoque, movimentos, config, fornecedores] = await Promise.all([
        api.listarProdutos(),
        api.listarEstoque(),
        api.listarMovimentosEstoque(),
        api.lerConfiguracao().catch((): ConfiguracaoDaLoja | null => null),
        // fornecedores: só Dono e Administrador (como a aba Compras); sem essa parte no servidor, nenhum
        pode(papel, 'compras') ? api.listarFornecedores().catch((): Fornecedor[] => []) : Promise.resolve(null),
      ]);
      return {
        produtos,
        estoque: new Map(estoque.map((e) => [e.produtoId, e])),
        movimentos: movimentos.slice(0, MOVIMENTOS_NA_TELA),
        regras: config?.regras ?? regrasPadrao(),
        fornecedores,
      };
    },
    [api],
    intervaloMs,
  );
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const porId = useMemo(() => new Map((dados?.produtos ?? []).map((p) => [p.id, p])), [dados]);
  const nomeDe = (produtoId: string) => porId.get(produtoId)?.nome ?? 'Produto excluído';
  const saldoDe = (p: Produto): SaldoEstoque => dados?.estoque.get(p.id) ?? { produtoId: p.id, saldo: 0, minimo: null, situacao: 'zerado' };
  const termo = simples(busca.trim());
  const visiveis = (dados?.produtos ?? [])
    .filter((p) => !termo || [p.nome, p.marca ?? '', p.codigoInterno, p.codigoBarras ?? ''].some((t) => simples(t).includes(termo)))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo));

  const concluir = (texto: string) => {
    setErro(null);
    setAviso(texto);
    setJanela(null);
    void recarregar();
  };
  const falhou = (e: unknown) => {
    setAviso(null);
    setErro(e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');
  };

  async function alternarAtivo(p: Produto) {
    try {
      await api.definirProdutoAtivo(p.id, !p.ativo);
      concluir(p.ativo ? `${p.nome} foi inativado: não aparece mais na Frente de caixa.` : `${p.nome} foi reativado.`);
    } catch (e) {
      falhou(e);
    }
  }

  async function excluir(p: Produto) {
    if (!confirmar(`Excluir o produto "${p.nome}"? Ele ainda não tem vendas nem movimentos de estoque.`)) return;
    try {
      await api.excluirProduto(p.id);
      concluir(`${p.nome} foi excluído.`);
    } catch (e) {
      falhou(e);
    }
  }

  return (
    <div className="rel pe">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Produtos e estoque</h1>
          <p className="suave">Cadastro dos produtos e o saldo de cada um. O saldo muda sozinho a cada venda, cancelamento e devolução.</p>
        </div>
        {dados && (
          <div className="pe-topo-acoes">
            {pode(papel, 'loja.configurar') && (
              <button type="button" className="botao" onClick={() => setJanela({ tipo: 'regras' })}>
                Regras do estoque
              </button>
            )}
            <button type="button" className="botao botao-primario" onClick={() => setJanela({ tipo: 'produto', produto: null })}>
              + Cadastrar produto
            </button>
          </div>
        )}
      </header>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          {aviso && (
            <p className="alerta" role="status">
              {aviso}
            </p>
          )}
          {erro && (
            <p className="alerta alerta-erro" role="alert">
              {erro}
            </p>
          )}

          <section className="card card-plano" aria-labelledby="pe-lista-titulo">
            <div className="card-cabeca pe-cabeca">
              <h2 id="pe-lista-titulo">Produtos</h2>
              <input
                type="search"
                className="pe-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome, marca ou código"
                aria-label="Buscar produto"
              />
              {dados && <span className="suave">{plural(dados.produtos.length, 'cadastrado', 'cadastrados')}</span>}
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : dados.produtos.length === 0 ? (
              <p className="vazio">Nenhum produto cadastrado ainda. Use “+ Cadastrar produto”.</p>
            ) : visiveis.length === 0 ? (
              <p className="vazio">Nenhum produto com “{busca.trim()}”.</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas pe-tabela">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Produto</th>
                      <th className="numero">Preço</th>
                      <th className="numero">Estoque</th>
                      <th className="numero">Mínimo</th>
                      {(gestor || lanca) && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((p) => {
                      const e = saldoDe(p);
                      const u = unidadeDe(p.unidade);
                      const fornecedor = p.fornecedorId ? dados.fornecedores?.find((f) => f.id === p.fornecedorId)?.nome : null;
                      const custo = gestor && typeof e.custoMedioCentavos === 'number' ? `custo médio ${formatarCentavos(e.custoMedioCentavos)}${u === 'kg' ? '/kg' : ''}` : null;
                      const detalhe = [p.marca, p.pesoGramas ? formatarQuantidade(p.pesoGramas, 'kg') : null, fornecedor ? `fornecedor: ${fornecedor}` : null, custo].filter(Boolean).join(' · ');
                      return (
                        <tr key={p.id} className={p.ativo ? undefined : 'pe-inativo'}>
                          <td data-rotulo="Código" className="codigos">
                            <span className="mono">{p.codigoInterno}</span>
                            <small className={p.codigoBarras ? 'mono suave' : 'suave'}>{p.codigoBarras ?? 'sem código de barras'}</small>
                          </td>
                          <td data-rotulo="Produto" className="pe-nome">
                            {p.nome}
                            {u === 'kg' && <span className="pe-tag">a granel (kg)</span>}
                            {!p.ativo && <span className="tag-cancelada">inativo</span>}
                            {detalhe && <small className="suave pe-detalhe">{detalhe}</small>}
                          </td>
                          <td data-rotulo="Preço" className="numero">
                            {formatarCentavos(p.precoCentavos)}
                            {u === 'kg' && <small className="suave"> /kg</small>}
                          </td>
                          <td data-rotulo="Estoque" className="numero">
                            <button type="button" className="link pe-saldo" onClick={() => setJanela({ tipo: 'saldo', produto: p })} aria-label={`Como o saldo de ${p.nome} é calculado`}>
                              {formatarQuantidade(e.saldo, u)}
                            </button>
                            {e.situacao !== 'ok' && <span className={`pe-situacao pe-${e.situacao}`}>{ROTULO_SITUACAO[e.situacao]}</span>}
                          </td>
                          <td data-rotulo="Mínimo" className="numero">
                            {e.minimo ? formatarQuantidade(e.minimo, u) : '—'}
                          </td>
                          {(gestor || lanca) && (
                            <td data-rotulo="Ações" className="pe-acoes">
                              {lanca && p.ativo && (
                                <>
                                  <button type="button" className="botao" onClick={() => setJanela({ tipo: 'estoque', acao: 'entrada', produto: p })} aria-label={`Entrada de ${p.nome}`}>
                                    Entrada
                                  </button>
                                  <button type="button" className="botao" onClick={() => setJanela({ tipo: 'estoque', acao: 'ajuste', produto: p })} aria-label={`Ajuste de ${p.nome}`}>
                                    Ajuste
                                  </button>
                                  <button type="button" className="botao" onClick={() => setJanela({ tipo: 'estoque', acao: 'minimo', produto: p })} aria-label={`Estoque mínimo de ${p.nome}`}>
                                    Mínimo
                                  </button>
                                </>
                              )}
                              {gestor && (
                                <>
                                  <button type="button" className="botao" onClick={() => setJanela({ tipo: 'produto', produto: p })} aria-label={`Alterar ${p.nome}`}>
                                    Alterar
                                  </button>
                                  <button type="button" className="botao" onClick={() => void alternarAtivo(p)} aria-label={`${p.ativo ? 'Inativar' : 'Reativar'} ${p.nome}`}>
                                    {p.ativo ? 'Inativar' : 'Reativar'}
                                  </button>
                                  {!p.temHistorico && (
                                    <button type="button" className="botao pe-excluir" onClick={() => void excluir(p)} aria-label={`Excluir ${p.nome}`}>
                                      Excluir
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-rodape">
              Saldo = estoque inicial + entradas − vendas + cancelamentos + devoluções que voltaram para a prateleira ± ajustes (clique no saldo para ver a conta).
              {!gestor && ' Alterar, inativar, entrada, ajuste e estoque mínimo: Dono ou Administrador.'}
              {gestor && ' Produto com vendas ou movimentos não é excluído: inative.'}
            </p>
          </section>

          <section className="card card-plano" aria-labelledby="pe-mov-titulo">
            <div className="card-cabeca">
              <h2 id="pe-mov-titulo">Últimos movimentos do estoque</h2>
              {dados && dados.movimentos.length > 0 && <span className="suave">os {dados.movimentos.length} mais recentes</span>}
            </div>
            {!dados || dados.movimentos.length === 0 ? (
              <p className="vazio">{dados ? 'Nenhum movimento ainda.' : 'Carregando…'}</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Produto</th>
                      <th>Movimento</th>
                      <th className="numero">Quantidade</th>
                      <th>Motivo</th>
                      <th>Lançado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.movimentos.map((m) => {
                      const u = unidadeDe(porId.get(m.produtoId)?.unidade);
                      return (
                        <tr key={m.id}>
                          <td data-rotulo="Data" className="mono">
                            {dataNoFuso(m.criadoEm, fuso)}
                          </td>
                          <td data-rotulo="Hora" className="mono">
                            {horaNoFuso(m.criadoEm, fuso)}
                          </td>
                          <td data-rotulo="Produto">{nomeDe(m.produtoId)}</td>
                          <td data-rotulo="Movimento">
                            {NOME_MOVIMENTO_ESTOQUE[m.tipo]}
                            {m.vendaNumero !== null && <span className="suave"> {formatarNumeroVenda(m.vendaNumero)}</span>}
                          </td>
                          <td data-rotulo="Quantidade" className={`numero ${m.quantidade < 0 ? 'pe-sai' : 'pe-entra'}`}>
                            {m.quantidade > 0 ? '+' : ''}
                            {formatarQuantidade(m.quantidade, u)}
                          </td>
                          <td data-rotulo="Motivo">{[m.motivo, m.observacao].filter(Boolean).join(' — ') || '—'}</td>
                          <td data-rotulo="Lançado por">{m.por.nome}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {janela?.tipo === 'produto' && dados && (
        <ModalProduto
          api={api}
          produto={janela.produto}
          unidades={dados.regras.produtos.unidades}
          podeCusto={gestor}
          fornecedores={dados.fornecedores?.filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome })) ?? null}
          confirmar={confirmar}
          aoSalvar={(_p, mensagem) => concluir(mensagem)}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'estoque' && dados && (
        <ModalEstoque
          acao={janela.acao}
          produto={janela.produto}
          atual={saldoDe(janela.produto)}
          motivos={dados.regras.estoque.motivosAjuste}
          hoje={diaNoFuso(new Date(), fuso)}
          api={api}
          aoConcluir={concluir}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'saldo' && <ModalSaldo produto={janela.produto} api={api} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === 'regras' && dados && <ModalRegrasEstoque regras={dados.regras} api={api} aoSalvar={concluir} aoFechar={() => setJanela(null)} />}
    </div>
  );
}
