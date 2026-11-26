// apps/web/src/painel/caixa/ModalVale.tsx
// Vale-troca na Frente de caixa (Fase 2, módulo 8), como no DaniPets V9.3.3:
//   - "Usar vale-troca" (pickVoucher): escolhe um vale com saldo na lista ou digita o código que está com o
//     cliente; o vale vale para quem tiver o código, com ou sem cliente identificado;
//   - o vale emitido na devolução: o código em destaque para anotar e "Usar agora nesta venda (troca)".
import { descreverVale, formatarCentavos, normalizarCodigoVale, type ValeTroca } from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiPainel, ErroApi } from '../../api';
import { Modal } from './Modal';

export function ModalUsarVale({
  api,
  vales,
  aoEscolher,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'buscarValePorCodigo'>;
  /** Os vales com saldo que ainda não estão no pagamento. */
  vales: readonly ValeTroca[];
  aoEscolher: (vale: ValeTroca) => void;
  aoFechar: () => void;
}) {
  const [id, setId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function usar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const c = normalizarCodigoVale(codigo);
    if (!c) {
      const v = vales.find((x) => x.id === id);
      return v ? aoEscolher(v) : setErro('Escolha um vale ou digite o código.');
    }
    setBuscando(true);
    try {
      const v = await api.buscarValePorCodigo(c);
      if (v.situacao !== 'aberto' || v.saldoCentavos <= 0) setErro('Este vale já foi usado.');
      else aoEscolher(v);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível buscar o vale. Tente de novo.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Modal titulo="Usar vale-troca" aoFechar={aoFechar}>
      <p className="modal-sub">Escolha o vale ou digite o código que está com o cliente.</p>
      <form className="modal-form" onSubmit={usar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="vale-escolha">Vale</label>
          <select id="vale-escolha" value={id} onChange={(e) => setId(e.target.value)} disabled={vales.length === 0}>
            <option value="">{vales.length ? 'Escolha…' : 'Nenhum vale com saldo na lista'}</option>
            {vales.map((v) => (
              <option key={v.id} value={v.id}>
                {descreverVale(v)}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="vale-codigo">ou código do vale</label>
          <input id="vale-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="VT-0001-ABC" maxLength={20} autoCapitalize="characters" />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={buscando}>
            {buscando ? 'Buscando…' : 'Usar'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** O vale emitido na devolução (DaniPets: "Vale-troca VT-0001-ABC" com o código para anotar). */
export function ModalValeEmitido({
  vale,
  devolucaoNumero,
  abatidoDoFiadoCentavos,
  aoUsarAgora,
  aoFechar,
}: {
  vale: ValeTroca;
  devolucaoNumero: number;
  abatidoDoFiadoCentavos: number;
  /** Na Frente de caixa: o vale entra no pagamento da venda que está na tela (a troca). */
  aoUsarAgora?: () => void;
  aoFechar: () => void;
}) {
  return (
    <Modal titulo={`Vale-troca ${vale.codigo}`} aoFechar={aoFechar}>
      <p className="modal-sub">
        Devolução nº {devolucaoNumero} registrada.
        {abatidoDoFiadoCentavos > 0 && ` ${formatarCentavos(abatidoDoFiadoCentavos)} foram abatidos do fiado desta compra.`} O cliente tem{' '}
        <b>{formatarCentavos(vale.saldoCentavos)}</b> de crédito na loja{vale.cliente ? ` (${vale.cliente.nome})` : ''}.
      </p>
      <p className="vale-codigo" data-testid="vale-codigo">
        {vale.codigo}
      </p>
      <p className="suave">Anote o código para o cliente. Na Frente de caixa, use “Usar vale-troca” para pagar com ele.</p>
      <div className="modal-acoes">
        {aoUsarAgora && (
          <button type="button" className="botao botao-primario" onClick={aoUsarAgora}>
            Usar agora nesta venda (troca)
          </button>
        )}
        <button type="button" className="botao" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
