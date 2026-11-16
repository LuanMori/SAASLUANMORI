// apps/web/src/painel/TelaProdutosEstoque.tsx
// Aba Produtos e estoque:
//   - cadastro rápido de produto (o mesmo formulário e as mesmas regras do @saas/core);
//   - lista com o saldo de cada produto (o saldo muda sozinho a cada venda, cancelamento e devolução);
//   - entrada (compra, reposição), ajuste com motivo (perda, avaria, contagem) e estoque mínimo:
//     só Dono e Administrador, como no DaniPets. O Vendedor cadastra produto novo e consulta;
//   - últimos movimentos, com a venda de origem e quem lançou.
// Produto novo começa com estoque 0: só vende depois de uma entrada.
import {
  ehGestor,
  formatarCentavos,
  formatarNumeroVenda,
  LIMITES_ESTOQUE,
  NOME_MOVIMENTO_ESTOQUE,
  type PapelDeLoja,
  type SituacaoEstoque,
  validarMovimentoManual,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto, type SaldoEstoque } from '../api';
import { FormNovoProduto } from '../telas/TelaProdutos';
import { Modal } from './caixa/Modal';
import { dataNoFuso, horaNoFuso, plural } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: Pick<ApiPainel, 'listarProdutos' | 'criarProduto' | 'listarEstoque' | 'listarMovimentosEstoque' | 'lancarMovimentoEstoque' | 'definirEstoqueMinimo'>;
  papel: PapelDeLoja;
  fuso: string;
  /** Atualização automática (ms): o saldo muda quando alguém vende. */
  intervaloMs?: number;
}

type Acao = 'entrada' | 'ajuste' | 'minimo';
const MOVIMENTOS_NA_TELA = 20;
const ROTULO_SITUACAO: Record<Exclude<SituacaoEstoque, 'ok'>, string> = { baixo: 'baixo', zerado: 'zerado', negativo: 'negativo' };

export function TelaProdutosEstoque({ api, papel, fuso, intervaloMs = 5000 }: Props) {
  const gestor = ehGestor(papel);
  const { estado, recarregar } = usarCarga(
    async () => {
      const [produtos, estoque, movimentos] = await Promise.all([api.listarProdutos(), api.listarEstoque(), api.listarMovimentosEstoque()]);
      return { produtos, estoque: new Map(estoque.map((e) => [e.produtoId, e])), movimentos: movimentos.slice(0, MOVIMENTOS_NA_TELA) };
    },
    [api],
    intervaloMs,
  );
  const [janela, setJanela] = useState<{ acao: Acao; produto: Produto } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const nomeDe = (produtoId: string) => dados?.produtos.find((p) => p.id === produtoId)?.nome ?? 'Produto removido';

  return (
    <div className="rel pe">
      <header className="vg-topo">
        <div>
          <h1>Produtos e estoque</h1>
          <p className="suave">Cadastro dos produtos e o saldo de cada um. O saldo muda sozinho a cada venda, cancelamento e devolução.</p>
        </div>
      </header>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          <div>
            <FormNovoProduto
              api={api}
              aoCriar={() => {
                setAviso(null);
                void recarregar();
              }}
            />
            <p className="pe-dica suave">
              Produto novo começa com estoque 0 e só vende depois de uma entrada.{' '}
              {gestor ? 'Use “Entrada” na lista abaixo.' : 'A entrada é lançada pelo Dono ou pelo Administrador.'}
            </p>
          </div>

          {aviso && (
            <p className="alerta" role="status">
              {aviso}
            </p>
          )}

          <section className="card card-plano" aria-labelledby="pe-lista-titulo">
            <div className="card-cabeca">
              <h2 id="pe-lista-titulo">Produtos</h2>
              {dados && <span className="suave">{plural(dados.produtos.length, 'cadastrado', 'cadastrados')}</span>}
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : dados.produtos.length === 0 ? (
              <p className="vazio">Nenhum produto cadastrado ainda. Cadastre o primeiro no formulário acima.</p>
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
                      {gestor && <th>Estoque: lançar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.produtos.map((p) => {
                      const e: SaldoEstoque = dados.estoque.get(p.id) ?? { produtoId: p.id, saldo: 0, minimo: null, situacao: 'zerado' };
                      return (
                        <tr key={p.id}>
                          <td data-rotulo="Código" className="codigos">
                            <span className="mono">{p.codigoInterno}</span>
                            <small className={p.codigoBarras ? 'mono suave' : 'suave'}>{p.codigoBarras ?? 'sem código de barras'}</small>
                          </td>
                          <td data-rotulo="Produto" className="pe-nome">
                            {p.nome}
                            {!p.ativo && <span className="tag-cancelada">inativo</span>}
                          </td>
                          <td data-rotulo="Preço" className="numero">
                            {formatarCentavos(p.precoCentavos)}
                          </td>
                          <td data-rotulo="Estoque" className="numero">
                            <b>{e.saldo} un</b>
                            {e.situacao !== 'ok' && <span className={`pe-situacao pe-${e.situacao}`}>{ROTULO_SITUACAO[e.situacao]}</span>}
                          </td>
                          <td data-rotulo="Mínimo" className="numero">
                            {e.minimo ?? '—'}
                          </td>
                          {gestor && (
                            <td data-rotulo="Estoque: lançar" className="pe-acoes">
                              <button type="button" className="botao" onClick={() => setJanela({ acao: 'entrada', produto: p })} aria-label={`Entrada de ${p.nome}`}>
                                Entrada
                              </button>
                              <button type="button" className="botao" onClick={() => setJanela({ acao: 'ajuste', produto: p })} aria-label={`Ajuste de ${p.nome}`}>
                                Ajuste
                              </button>
                              <button type="button" className="botao" onClick={() => setJanela({ acao: 'minimo', produto: p })} aria-label={`Estoque mínimo de ${p.nome}`}>
                                Mínimo
                              </button>
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
              Saldo = estoque inicial + entradas − vendas + cancelamentos + devoluções que voltaram para a prateleira ± ajustes.
              {!gestor && ' Entrada, ajuste e estoque mínimo: Dono ou Administrador.'}
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
                    {dados.movimentos.map((m) => (
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
                          {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                        </td>
                        <td data-rotulo="Motivo">{m.motivo ?? '—'}</td>
                        <td data-rotulo="Lançado por">{m.por.nome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {janela && dados && (
        <ModalEstoque
          acao={janela.acao}
          produto={janela.produto}
          atual={dados.estoque.get(janela.produto.id) ?? { produtoId: janela.produto.id, saldo: 0, minimo: null, situacao: 'zerado' }}
          api={api}
          aoConcluir={(texto) => {
            setAviso(texto);
            setJanela(null);
            void recarregar();
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
    </div>
  );
}

const inteiro = (texto: string): number | null => (/^\d{1,6}$/.test(texto.trim()) ? Number(texto.trim()) : null);

function ModalEstoque({
  acao,
  produto,
  atual,
  api,
  aoConcluir,
  aoFechar,
}: {
  acao: Acao;
  produto: Produto;
  atual: SaldoEstoque;
  api: Pick<ApiPainel, 'lancarMovimentoEstoque' | 'definirEstoqueMinimo'>;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [quantidade, setQuantidade] = useState(acao === 'minimo' ? String(atual.minimo ?? '') : '');
  const [sentido, setSentido] = useState<'tirar' | 'por'>('tirar');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const n = inteiro(quantidade);
  const variacao = n === null ? null : acao === 'ajuste' && sentido === 'tirar' ? -n : n;

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    try {
      if (acao === 'minimo') {
        const minimo = quantidade.trim() === '' ? 0 : n;
        if (minimo === null) return setErro('Informe um número inteiro (0 = sem aviso de estoque baixo).');
        setEnviando(true);
        const novo = await api.definirEstoqueMinimo(produto.id, minimo);
        return aoConcluir(novo.minimo ? `Estoque mínimo de ${produto.nome}: ${novo.minimo} un.` : `${produto.nome} ficou sem aviso de estoque baixo.`);
      }
      if (variacao === null || variacao === 0) return setErro('Informe uma quantidade inteira maior que zero.');
      const local = validarMovimentoManual({ produtoId: produto.id, tipo: acao, quantidade: variacao, motivo });
      if (!local.ok) return setErro(local.erros[0]!.mensagem);
      setEnviando(true);
      const novo = await api.lancarMovimentoEstoque(local.valor);
      aoConcluir(`${acao === 'entrada' ? 'Entrada lançada' : 'Ajuste lançado'}: ${produto.nome} ${variacao > 0 ? '+' : ''}${variacao} un. Saldo agora: ${novo.saldo} un.`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível gravar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const titulo = acao === 'entrada' ? 'Entrada de estoque' : acao === 'ajuste' ? 'Ajuste de estoque' : 'Estoque mínimo';
  return (
    <Modal titulo={`${titulo}: ${produto.nome}`} aoFechar={aoFechar}>
      <p className="modal-sub">
        Saldo atual: <b>{atual.saldo} un</b>
        {acao !== 'minimo' && variacao !== null && variacao !== 0 && (
          <>
            {' '}
            → depois: <b>{atual.saldo + variacao} un</b>
          </>
        )}
        {acao === 'minimo' && '. Quando o saldo chegar no mínimo ou abaixo, o produto aparece como estoque baixo.'}
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        {acao === 'ajuste' && (
          <fieldset className="dev-acao">
            <legend>O que o ajuste faz</legend>
            <label>
              <input type="radio" name="pe-sentido" checked={sentido === 'tirar'} onChange={() => setSentido('tirar')} /> Tirar do estoque (perda, avaria, vencido)
            </label>
            <label>
              <input type="radio" name="pe-sentido" checked={sentido === 'por'} onChange={() => setSentido('por')} /> Pôr no estoque (sobra na contagem)
            </label>
          </fieldset>
        )}
        <div className="campo">
          <label htmlFor="pe-quantidade">{acao === 'minimo' ? 'Estoque mínimo (0 = sem aviso)' : 'Quantidade (unidades)'}</label>
          <input id="pe-quantidade" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="numeric" maxLength={6} placeholder="0" />
        </div>
        {acao !== 'minimo' && (
          <div className="campo">
            <label htmlFor="pe-motivo">{acao === 'ajuste' ? 'Motivo' : 'Observação (opcional)'}</label>
            <input
              id="pe-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={LIMITES_ESTOQUE.motivoMax}
              placeholder={acao === 'ajuste' ? 'Ex.: embalagem rasgada, contagem do dia 16' : 'Ex.: nota 1234 do fornecedor'}
            />
          </div>
        )}
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Gravando…' : acao === 'entrada' ? 'Lançar entrada' : acao === 'ajuste' ? 'Lançar ajuste' : 'Salvar mínimo'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
