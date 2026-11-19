// apps/web/src/painel/TelaCompras.tsx
// Aba Compras (Dono e Administrador, como no DaniPets). Fase 2, módulo 3: o cadastro simples de
// fornecedores da loja (decisão P9) — nome, CNPJ ou CPF, telefone, contato e observação —, usado no
// cadastro dos produtos ("Fornecedor principal"). No DaniPets o fornecedor era um texto solto.
import { type ErroCampo, formatarDocumento, formatarTelefone, type Fornecedor, LIMITES_FORNECEDOR, type NovoFornecedor, validarFornecedor } from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiFornecedores, ErroApi } from '../api';
import { Modal } from './caixa/Modal';
import { plural } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiFornecedores;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível salvar. Tente de novo.');

export function TelaCompras({ api }: Props) {
  const { estado, recarregar } = usarCarga(() => api.listarFornecedores(), [api]);
  const [janela, setJanela] = useState<{ fornecedor: Fornecedor | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const lista = estado.tipo === 'pronto' ? estado.dados : null;

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

  return (
    <div className="rel compras">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Compras</h1>
          <p className="suave">Os fornecedores da loja, usados no cadastro dos produtos.</p>
        </div>
        {lista && (
          <button type="button" className="botao botao-primario" onClick={() => setJanela({ fornecedor: null })}>
            + Cadastrar fornecedor
          </button>
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
                          <button type="button" className="botao" onClick={() => setJanela({ fornecedor: f })} aria-label={`Alterar ${f.nome}`}>
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
            <p className="card-rodape">Desativar tira o fornecedor da lista de escolha; os produtos que já apontam para ele continuam com ele.</p>
          </section>
        </>
      )}

      {janela && (
        <ModalFornecedor api={api} fornecedor={janela.fornecedor} aoSalvar={(f, novo) => concluir(novo ? `${f.nome} cadastrado.` : `${f.nome}: alterações salvas.`)} aoFechar={() => setJanela(null)} />
      )}
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
