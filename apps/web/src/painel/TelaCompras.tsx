// apps/web/src/painel/TelaCompras.tsx
// Aba Compras (Dono e Administrador, como no DaniPets V9.3.3):
//   - módulo 4: registrar compra por nota fiscal (vários itens, à vista ou a prazo), histórico das compras
//     com o estorno de cada item, contas a pagar (pagar escolhendo a conta) e os lotes vencidos ou vencendo
//     nos próximos 30 dias ("Dar baixa no lote");
//   - módulo 3: o cadastro simples de fornecedores (decisão P9), usado nas compras e nos produtos.
import {
  type Compra,
  type ContaPagar,
  dataBr,
  diaNoFuso,
  type ErroCampo,
  formatarCentavos,
  formatarDocumento,
  formatarQuantidade,
  formatarTelefone,
  type Fornecedor,
  FUSO_PADRAO,
  itemValendo,
  LIMITES_FORNECEDOR,
  type LoteVencendo,
  NOME_CONTA,
  type NovoFornecedor,
  resumirContasAPagar,
  totalValendo,
  validarFornecedor,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiCompras, type ApiFornecedores, type ApiProdutos, ErroApi } from '../api';
import { Modal } from './caixa/Modal';
import { ModalCompra } from './compras/ModalCompra';
import { ModalBaixaLote, ModalEstornoItem, ModalPagarConta } from './compras/ModaisCompra';
import { plural } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiFornecedores & ApiCompras & Pick<ApiProdutos, 'listarProdutos'>;
  fuso?: string;
  agora?: () => Date;
  /** Para testes: as perguntas "mesmo assim?". */
  confirmar?: (texto: string) => boolean;
}

/** Compras na tela (as mais recentes). */
const COMPRAS_NA_TELA = 30;

type Janela =
  | { tipo: 'fornecedor'; fornecedor: Fornecedor | null }
  | { tipo: 'compra' }
  | { tipo: 'estorno'; compra: Compra; linha: number }
  | { tipo: 'pagar'; conta: ContaPagar }
  | { tipo: 'lote'; lote: LoteVencendo };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível salvar. Tente de novo.');
const diasAte = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function TelaCompras({ api, fuso = FUSO_PADRAO, agora = () => new Date(), confirmar = (t) => window.confirm(t) }: Props) {
  const { estado, recarregar } = usarCarga(async () => {
    const [fornecedores, compras, contas, lotes, produtos] = await Promise.all([
      api.listarFornecedores(),
      api.listarCompras(),
      api.listarContasAPagar(),
      api.listarLotesVencendo(),
      api.listarProdutos(),
    ]);
    return { fornecedores, compras, contas, lotes, produtos };
  }, [api]);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const lista = dados?.fornecedores ?? null;
  const hoje = diaNoFuso(agora(), fuso);

  const concluir = (texto: string) => {
    setErro(null);
    setAviso(texto);
    setJanela(null);
    void recarregar();
  };

  async function alternarAtivo(f: Fornecedor) {
    try {
      await api.definirFornecedorAtivo(f.id, !f.ativo);
      concluir(f.ativo ? `${f.nome} foi desativado: não aparece mais na lista de escolha.` : `${f.nome} foi reativado.`);
    } catch (e) {
      setAviso(null);
      setErro(mensagemDe(e));
    }
  }

  const abertas = dados?.contas.filter((c) => c.situacao === 'aberta') ?? [];
  const resumo = dados ? resumirContasAPagar(dados.contas, hoje) : null;

  return (
    <div className="rel compras">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Compras</h1>
          <p className="suave">Compras por nota fiscal, contas a pagar, validade dos lotes e os fornecedores da loja.</p>
        </div>
        {dados && (
          <div className="pe-topo-acoes">
            <button type="button" className="botao" onClick={() => setJanela({ tipo: 'fornecedor', fornecedor: null })}>
              + Cadastrar fornecedor
            </button>
            <button type="button" className="botao botao-primario" onClick={() => setJanela({ tipo: 'compra' })}>
              + Registrar compra
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

          {dados && dados.lotes.length > 0 && (
            <section className="card card-plano" aria-labelledby="lotes-titulo">
              <div className="card-cabeca">
                <h2 id="lotes-titulo">Validade: lotes vencidos ou vencendo em 30 dias</h2>
                <span className="suave">{plural(dados.lotes.length, 'lote', 'lotes')}</span>
              </div>
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Compra</th>
                      <th>Validade</th>
                      <th className="numero">Ainda no estoque</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.lotes.map((l) => {
                      const dias = diasAte(hoje, l.item.validade!);
                      return (
                        <tr key={`${l.compra.id}:${l.linha}`}>
                          <td data-rotulo="Produto">{l.item.nome}</td>
                          <td data-rotulo="Compra">
                            nº {l.compra.numero} de {dataBr(l.compra.data)}
                            {l.compra.notaFiscal ? ` • NF ${l.compra.notaFiscal}` : ''}
                          </td>
                          <td data-rotulo="Validade">
                            {dataBr(l.item.validade!)}{' '}
                            <span className={`pe-situacao ${l.vencido ? 'pe-zerado' : 'pe-baixo'}`}>{l.vencido ? 'vencido' : dias === 0 ? 'vence hoje' : `vence em ${plural(dias, 'dia', 'dias')}`}</span>
                          </td>
                          <td data-rotulo="Ainda no estoque" className="numero">
                            {formatarQuantidade(l.restante, l.item.unidade)}
                          </td>
                          <td data-rotulo="Ação">
                            <button type="button" className="botao" onClick={() => setJanela({ tipo: 'lote', lote: l })} aria-label={`Dar baixa no lote de ${l.item.nome}`}>
                              Dar baixa
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="card-rodape">Pela regra do mais antigo sai primeiro, o estoque de hoje pertence às compras mais novas. Confira a prateleira e dê baixa no que venceu.</p>
            </section>
          )}

          <section className="card card-plano" aria-labelledby="pagar-titulo">
            <div className="card-cabeca">
              <h2 id="pagar-titulo">Contas a pagar</h2>
              {resumo && (
                <span className="suave">
                  {resumo.quantidade === 0 ? 'nenhuma em aberto' : `${formatarCentavos(resumo.totalCentavos)} em ${plural(resumo.quantidade, 'conta', 'contas')}`}
                  {resumo.vencidas > 0 && ` • ${plural(resumo.vencidas, 'vencida', 'vencidas')}`}
                </span>
              )}
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : abertas.length === 0 ? (
              <p className="vazio">Nenhuma conta a pagar em aberto. As compras a prazo aparecem aqui.</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas">
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Vencimento</th>
                      <th className="numero">Valor</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abertas.map((c) => (
                      <tr key={c.id}>
                        <td data-rotulo="Conta">{c.descricao}</td>
                        <td data-rotulo="Vencimento">
                          {dataBr(c.vencimento)} {c.vencimento < hoje && <span className="pe-situacao pe-zerado">vencida</span>}
                        </td>
                        <td data-rotulo="Valor" className="numero">
                          {formatarCentavos(c.valorCentavos)}
                        </td>
                        <td data-rotulo="Ação">
                          <button type="button" className="botao" onClick={() => setJanela({ tipo: 'pagar', conta: c })} aria-label={`Pagar ${c.descricao}`}>
                            Pagar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card card-plano" aria-labelledby="compras-titulo">
            <div className="card-cabeca">
              <h2 id="compras-titulo">Histórico de compras</h2>
              {dados && dados.compras.length > 0 && <span className="suave">{dados.compras.length > COMPRAS_NA_TELA ? `as ${COMPRAS_NA_TELA} mais recentes` : plural(dados.compras.length, 'compra', 'compras')}</span>}
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : dados.compras.length === 0 ? (
              <p className="vazio">Nenhuma compra registrada ainda. Use “+ Registrar compra”.</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas compras-tabela">
                  <thead>
                    <tr>
                      <th>Compra</th>
                      <th>Fornecedor</th>
                      <th>Itens</th>
                      <th className="numero">Total</th>
                      <th>Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.compras.slice(0, COMPRAS_NA_TELA).map((c) => {
                      const valendo = c.itens.filter(itemValendo).length;
                      const cp = dados.contas.find((x) => x.compraId === c.id) ?? null;
                      return (
                        <tr key={c.id} className={valendo === 0 ? 'pe-inativo' : undefined}>
                          <td data-rotulo="Compra">
                            nº {c.numero} • {dataBr(c.data)}
                            {c.notaFiscal && <small className="suave pe-detalhe">NF {c.notaFiscal}</small>}
                            {valendo === 0 && <span className="tag-cancelada">estornada</span>}
                          </td>
                          <td data-rotulo="Fornecedor">{c.fornecedor?.nome ?? '—'}</td>
                          <td data-rotulo="Itens" className="itens-venda">
                            <details>
                              <summary>{plural(c.itens.length, 'item', 'itens')}</summary>
                              <ul>
                                {c.itens.map((i, linha) => (
                                  <li key={linha}>
                                    {formatarQuantidade(i.quantidade, i.unidade)} {i.nome} × {formatarCentavos(i.custoCentavos)}
                                    {i.unidade === 'kg' ? '/kg' : ''} = {formatarCentavos(i.totalCentavos)}
                                    {i.validade && <span className="suave"> • validade {dataBr(i.validade)}</span>}
                                    {i.estorno ? (
                                      <span className="tag-cancelada" title={`Motivo: ${i.estorno.motivo}`}>
                                        estornado
                                      </span>
                                    ) : (
                                      <button type="button" className="link compra-estornar" onClick={() => setJanela({ tipo: 'estorno', compra: c, linha })} aria-label={`Estornar ${i.nome} da compra ${c.numero}`}>
                                        Estornar
                                      </button>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </td>
                          <td data-rotulo="Total" className="numero">
                            {formatarCentavos(totalValendo(c))}
                            {totalValendo(c) !== c.totalCentavos && <small className="suave pe-detalhe">de {formatarCentavos(c.totalCentavos)}</small>}
                          </td>
                          <td data-rotulo="Pagamento">
                            {c.pagamento.tipo === 'avista'
                              ? `À vista • ${NOME_CONTA[c.pagamento.conta]}`
                              : `A prazo • ${cp?.situacao === 'paga' ? 'paga' : cp?.situacao === 'cancelada' ? 'cancelada' : `vence ${dataBr(c.pagamento.vencimento)}`}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-rodape">Compra lançada errada: abra os itens e use “Estornar”; depois lance a compra certa. Bonificação (sem custo): entrada em Produtos e estoque.</p>
          </section>

          <section className="card card-plano" aria-labelledby="forn-titulo">
            <div className="card-cabeca">
              <h2 id="forn-titulo">Fornecedores</h2>
              {lista && <span className="suave">{plural(lista.filter((f) => f.ativo).length, 'ativo', 'ativos')}</span>}
            </div>
            {!lista ? (
              <p className="vazio">Carregando…</p>
            ) : lista.length === 0 ? (
              <p className="vazio">Nenhum fornecedor cadastrado ainda. Use “+ Cadastrar fornecedor”.</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela tabela-vendas forn-tabela">
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>CNPJ / CPF</th>
                      <th>Telefone</th>
                      <th>Contato</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f) => (
                      <tr key={f.id} className={f.ativo ? undefined : 'pe-inativo'}>
                        <td data-rotulo="Fornecedor" className="pe-nome">
                          {f.nome}
                          {!f.ativo && <span className="tag-cancelada">desativado</span>}
                          {f.observacao && <small className="suave pe-detalhe">{f.observacao}</small>}
                        </td>
                        <td data-rotulo="CNPJ / CPF" className="mono">
                          {f.documento ? formatarDocumento(f.documento) : '—'}
                        </td>
                        <td data-rotulo="Telefone">{f.telefone ? formatarTelefone(f.telefone) : '—'}</td>
                        <td data-rotulo="Contato">{f.contato ?? '—'}</td>
                        <td data-rotulo="Ações" className="pe-acoes">
                          <button type="button" className="botao" onClick={() => setJanela({ tipo: 'fornecedor', fornecedor: f })} aria-label={`Alterar ${f.nome}`}>
                            Alterar
                          </button>
                          <button type="button" className="botao" onClick={() => void alternarAtivo(f)} aria-label={`${f.ativo ? 'Desativar' : 'Reativar'} ${f.nome}`}>
                            {f.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-rodape">Desativar tira o fornecedor da lista de escolha; os produtos e as compras que já apontam para ele continuam com ele.</p>
          </section>
        </>
      )}

      {janela?.tipo === 'fornecedor' && (
        <ModalFornecedor
          api={api}
          fornecedor={janela.fornecedor}
          aoSalvar={(f, novo) => concluir(novo ? `${f.nome} cadastrado.` : `${f.nome}: alterações salvas.`)}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'compra' && dados && (
        <ModalCompra
          api={api}
          produtos={dados.produtos.filter((p) => p.ativo)}
          fornecedores={dados.fornecedores.filter((f) => f.ativo)}
          compras={dados.compras}
          hoje={hoje}
          confirmar={confirmar}
          aoSalvar={(c) => concluir(`Compra nº ${c.numero} registrada: ${formatarCentavos(c.totalCentavos)}${c.pagamento.tipo === 'aprazo' ? `, a pagar até ${dataBr(c.pagamento.vencimento)}` : ''}. Estoque atualizado.`)}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'estorno' && dados && (
        <ModalEstornoItem
          api={api}
          compra={janela.compra}
          linha={janela.linha}
          contaPagar={dados.contas.find((x) => x.compraId === janela.compra.id) ?? null}
          aoConcluir={concluir}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'pagar' && <ModalPagarConta api={api} conta={janela.conta} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === 'lote' && <ModalBaixaLote api={api} lote={janela.lote} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
    </div>
  );
}

function ModalFornecedor({
  api,
  fornecedor,
  aoSalvar,
  aoFechar,
}: {
  api: Pick<ApiFornecedores, 'cadastrarFornecedor' | 'alterarFornecedor'>;
  fornecedor: Fornecedor | null;
  aoSalvar: (f: Fornecedor, novo: boolean) => void;
  aoFechar: () => void;
}) {
  const [dados, setDados] = useState<Record<keyof NovoFornecedor, string>>({
    nome: fornecedor?.nome ?? '',
    documento: fornecedor?.documento ? formatarDocumento(fornecedor.documento) : '',
    telefone: fornecedor?.telefone ? formatarTelefone(fornecedor.telefone) : '',
    contato: fornecedor?.contato ?? '',
    observacao: fornecedor?.observacao ?? '',
  });
  const [erros, setErros] = useState<ErroCampo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const erroDe = (c: string) => erros.find((e) => e.campo === c)?.mensagem;
  const mudar = (c: keyof NovoFornecedor) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [c]: e.target.value }));

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const v = validarFornecedor(dados);
    if (!v.ok) return setErros(v.erros);
    setErros([]);
    setEnviando(true);
    try {
      const salvo = fornecedor ? await api.alterarFornecedor(fornecedor.id, v.valor) : await api.cadastrarFornecedor(v.valor);
      aoSalvar(salvo, !fornecedor);
    } catch (e) {
      setErros(e instanceof ErroApi && e.erros.length ? e.erros : [{ campo: '_', mensagem: mensagemDe(e) }]);
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id: keyof NovoFornecedor, rotulo: string, extra: { inputMode?: 'numeric' | 'tel'; maxLength?: number; placeholder?: string } = {}) => (
    <div className={`campo${erroDe(id) ? ' campo-com-erro' : ''}`}>
      <label htmlFor={`forn-${id}`}>{rotulo}</label>
      <input id={`forn-${id}`} value={dados[id]} onChange={mudar(id)} aria-invalid={Boolean(erroDe(id))} {...extra} />
      {erroDe(id) && <span className="campo-erro">{erroDe(id)}</span>}
    </div>
  );
  const erroGeral = erros.find((e) => !['nome', 'documento', 'telefone', 'contato', 'observacao'].includes(e.campo));

  return (
    <Modal titulo={fornecedor ? `Alterar fornecedor: ${fornecedor.nome}` : 'Cadastrar fornecedor'} aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
        {campo('nome', 'Nome do fornecedor', { maxLength: LIMITES_FORNECEDOR.nomeMax, placeholder: 'Ex.: Distribuidora Pet Sul' })}
        <div className="modal-grade">
          {campo('documento', 'CNPJ ou CPF (opcional)', { inputMode: 'numeric', maxLength: 18 })}
          {campo('telefone', 'Telefone com DDD (opcional)', { inputMode: 'tel', maxLength: 16 })}
        </div>
        {campo('contato', 'Contato (opcional)', { maxLength: LIMITES_FORNECEDOR.contatoMax, placeholder: 'Ex.: Marcos, representante' })}
        {campo('observacao', 'Observação (opcional)', { maxLength: LIMITES_FORNECEDOR.observacaoMax, placeholder: 'Ex.: entrega às terças' })}
        {erroGeral && (
          <p className="alerta alerta-erro" role="alert">
            {erroGeral.mensagem}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
