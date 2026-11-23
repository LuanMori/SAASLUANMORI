// apps/web/src/painel/clientes/ModalWhatsapp.tsx
// Janela do WhatsApp (Fase 2, módulo 7), como no DaniPets V9.3.3 (cliWhatsModal, CLI-14):
//   - a mensagem pronta, com o nome da loja e os dados do cliente (dá para ajustar antes de mandar);
//   - "Abrir no WhatsApp" abre o wa.me em outra janela com a mensagem; a pessoa confere e envia por lá;
//   - "Marcar como enviado" registra o lembrete. A mensagem de retorno dá o cupom (ou repete o que ainda vale);
//   - só para quem autorizou mensagens da loja (o lembrete de pagamento do fiado só pede o WhatsApp);
//   - com a `referencia` de um vencimento ("fiado:AAAA-MM-DD", lista "Fiado a vencer"), o lembrete fala do valor e
//     da data daquele vencimento e vale uma vez por vencimento.
import { dataBr, formatarTelefone, LIMITES_LOJA, linkWhatsapp, NOME_CONTATO, pctTexto, primeiroNome, type TipoContato } from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiPainel, ErroApi } from '../../api';
import { Modal } from '../caixa/Modal';
import { usarCarga } from '../usarCarga';

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível registrar. Tente de novo.');

export function ModalWhatsapp({
  api,
  clienteId,
  tipo,
  referencia = null,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'mensagemParaCliente' | 'registrarContato'>;
  clienteId: string;
  tipo: TipoContato;
  /** Lembrete de um vencimento: "fiado:AAAA-MM-DD". */
  referencia?: string | null;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const { estado } = usarCarga(() => api.mensagemParaCliente(clienteId, tipo, referencia), [api, clienteId, tipo, referencia]);
  const [texto, setTexto] = useState<string | null>(null);
  const [abriu, setAbriu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const titulo = NOME_CONTATO[tipo];

  if (estado.tipo !== 'pronto') {
    return (
      <Modal titulo={titulo} aoFechar={aoFechar}>
        {estado.tipo === 'carregando' ? (
          <p className="vazio">Preparando a mensagem…</p>
        ) : (
          <p className="alerta alerta-erro" role="alert">
            {estado.mensagem}
          </p>
        )}
        <div className="modal-acoes">
          <button type="button" className="botao" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </Modal>
    );
  }
  const m = estado.dados;
  const mensagem = texto ?? m.texto;

  async function marcar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.registrarContato(clienteId, { tipo, canal: 'whatsapp', referencia });
      aoConcluir(`${titulo} registrado para ${primeiroNome(m.nome)}.${r.cupom ? ` Cupom de ${pctTexto(r.cupom.pct)} válido até ${dataBr(r.cupom.venceEm)}.` : ''}`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <p className="suave">
        Para {m.nome} · {formatarTelefone(m.telefone)}
      </p>
      {m.bloqueio ? (
        <>
          <p className="alerta alerta-aviso" role="alert">
            {m.bloqueio}
          </p>
          <div className="modal-acoes">
            <button type="button" className="botao" onClick={aoFechar}>
              Fechar
            </button>
          </div>
        </>
      ) : (
        <form className="modal-form" onSubmit={marcar} noValidate autoComplete="off">
          {m.cupom && (
            <p className="alerta" role="status">
              Ao marcar como enviado, o cliente ganha um cupom de {pctTexto(m.cupom.pct)} válido até {dataBr(m.cupom.venceEm)}. O desconto entra sozinho quando ele for identificado na Frente de caixa.
            </p>
          )}
          <div className="campo">
            <label htmlFor="wa-msg">Mensagem</label>
            <textarea id="wa-msg" rows={6} maxLength={LIMITES_LOJA.mensagemMax} value={mensagem} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <p className="suave">O WhatsApp abre em outra janela com a mensagem pronta. Confira e envie por lá; depois volte aqui e marque como enviado.</p>
          {abriu && (
            <p className="alerta" role="status">
              O WhatsApp foi aberto. Depois de enviar a mensagem, clique em “Marcar como enviado”.
            </p>
          )}
          {erro && (
            <p className="alerta alerta-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="modal-acoes">
            <a className="botao" href={linkWhatsapp(m.telefone, mensagem)} target="_blank" rel="noopener noreferrer" onClick={() => setAbriu(true)}>
              Abrir no WhatsApp
            </a>
            <button type="submit" className="botao botao-primario" disabled={enviando}>
              {enviando ? 'Gravando…' : 'Marcar como enviado'}
            </button>
            <button type="button" className="botao" onClick={aoFechar}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
