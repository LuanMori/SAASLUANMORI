// apps/web/src/painel/caixa/ModalSenha.tsx
// Senha de quem autoriza (DaniPets askAuth e askDono), usada no Caixa do dia, nas compras e no estoque:
//   - "Autorização necessária": o Dono ou o Administrador digita a senha (retirada do dono feita pelo
//     Vendedor, fechamento com diferença acima da tolerância);
//   - "Liberação do Dono": só um Dono, com motivo (lançar num dia com o caixa já fechado).
// A senha é conferida pela API (5 erradas seguidas bloqueiam quem autoriza por 5 minutos, como no login);
// a autorização vale uma vez só, para aquela ação.
import { type AcaoAutorizada, LIMITES_CAIXA, NOME_PAPEL, pode } from '@saas/core';
import { type FormEvent, useEffect, useState } from 'react';
import { type ApiVendas, type Autorizador, ErroApi } from '../../api';
import { Modal } from './Modal';

export interface Autorizado {
  autorizacao: string;
  autorizador: Autorizador;
  /** Motivo digitado (só na liberação do Dono). */
  motivo: string;
}

interface Props {
  api: Pick<ApiVendas, 'listarAutorizadores' | 'autorizar'>;
  /** O que fica autorizado (uma vez só). */
  acao: AcaoAutorizada;
  /** Por que a senha é pedida (aparece no alto da janela). */
  texto: string;
  /** Liberação do Dono: só Dono, com motivo. */
  liberacao?: boolean;
  /** Recebe a autorização; se recusar (erro), a janela mostra a mensagem e continua aberta. */
  aoAutorizar: (r: Autorizado) => Promise<void> | void;
  aoFechar: () => void;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');

export function ModalSenha({ api, acao, texto, liberacao = false, aoAutorizar, aoFechar }: Props) {
  const [lista, setLista] = useState<Autorizador[] | null>(null);
  const [quem, setQuem] = useState('');
  const [senha, setSenha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .listarAutorizadores()
      .then((todos) => {
        const podem = liberacao ? todos.filter((a) => pode(a.papel, 'dia_fechado.liberar')) : todos;
        setLista(podem);
        if (podem[0]) setQuem(podem[0].id);
      })
      .catch(() => setLista([]));
    // só ao abrir a janela
  }, []);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!quem) return setErro(liberacao ? 'Não há usuário Dono ativo para liberar.' : 'Não há Dono ou Administrador cadastrado para autorizar.');
    if (!senha) return setErro(liberacao ? 'Digite a senha do Dono.' : 'Digite a senha de quem autoriza.');
    if (liberacao && !motivo.trim()) return setErro('Informe o motivo.');
    setEnviando(true);
    try {
      const r = await api.autorizar({ usuarioId: quem, senha, acao });
      await aoAutorizar({ autorizacao: r.autorizacao, autorizador: r.autorizador, motivo: motivo.trim() });
    } catch (e) {
      setErro(mensagemDe(e));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={liberacao ? 'Liberação do Dono' : 'Autorização necessária'} aoFechar={aoFechar}>
      <p className="modal-sub">{texto}</p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="senha-quem">{liberacao ? 'Dono' : 'Quem autoriza'}</label>
          <select id="senha-quem" value={quem} onChange={(e) => setQuem(e.target.value)} disabled={!lista || lista.length === 0}>
            {lista === null && <option value="">Carregando…</option>}
            {lista?.length === 0 && <option value="">{liberacao ? 'Nenhum Dono ativo' : 'Ninguém para autorizar'}</option>}
            {lista?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} · {NOME_PAPEL[a.papel]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="senha-senha">{liberacao ? 'Senha do Dono' : 'Senha'}</label>
          <input id="senha-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
        </div>
        {liberacao && (
          <div className="campo">
            <label htmlFor="senha-motivo">Motivo</label>
            <input id="senha-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={LIMITES_CAIXA.motivoMax} placeholder="Ex.: nota fiscal que chegou atrasada" />
          </div>
        )}
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando || lista === null}>
            {enviando ? 'Conferindo…' : liberacao ? 'Liberar' : 'Autorizar'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
