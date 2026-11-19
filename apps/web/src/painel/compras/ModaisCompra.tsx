// apps/web/src/painel/compras/ModaisCompra.tsx
// Janelas da aba Compras (DaniPets CMP-06, CMP-09 e PRD-11):
//   - Estornar um item de compra lançada errada (motivo; mostra o que acontece com o estoque e o dinheiro);
//   - Pagar uma conta a pagar (escolhe a conta de onde sai);
//   - Dar baixa no lote vencido (quanto ainda estava na prateleira sai como "Produto vencido").
import {
  type Compra,
  type ContaId,
  type ContaPagar,
  dataBr,
  formatarCentavos,
  formatarQuantidade,
  LIMITES_COMPRA,
  type LoteVencendo,
  lerQuantidade,
  NOME_CONTA,
  quantidadeParaTexto,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiCompras, ErroApi } from '../../api';
import { Modal } from '../caixa/Modal';

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');

function Acoes({ enviando, rotulo, aoFechar }: { enviando: boolean; rotulo: string; aoFechar: () => void }) {
  return (
    <div className="modal-acoes">
      <button type="submit" className="botao botao-primario" disabled={enviando}>
        {enviando ? 'Gravando…' : rotulo}
      </button>
      <button type="button" className="botao" onClick={aoFechar}>
        Cancelar
      </button>
    </div>
  );
}

export function ModalEstornoItem({
  api,
  compra,
  linha,
  contaPagar,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiCompras, 'estornarItemDaCompra'>;
  compra: Compra;
  linha: number;
  contaPagar: ContaPagar | null;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const item = compra.itens[linha]!;
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const volta =
    compra.pagamento.tipo === 'avista'
      ? `Volta para ${NOME_CONTA[compra.pagamento.conta]}: ${formatarCentavos(item.totalCentavos)}.`
      : contaPagar?.situacao === 'paga'
        ? `Volta para ${NOME_CONTA[contaPagar.pagamento!.conta]}: ${formatarCentavos(item.totalCentavos)} (a conta já tinha sido paga).`
        : contaPagar?.situacao === 'aberta'
          ? contaPagar.valorCentavos - item.totalCentavos <= 0
            ? `A conta a pagar (${formatarCentavos(contaPagar.valorCentavos)}) é cancelada.`
            : `A conta a pagar diminui ${formatarCentavos(item.totalCentavos)} (de ${formatarCentavos(contaPagar.valorCentavos)} para ${formatarCentavos(contaPagar.valorCentavos - item.totalCentavos)}).`
          : 'Não há valor a devolver.';

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!motivo.trim()) return setErro('Informe o motivo do estorno.');
    setEnviando(true);
    try {
      await api.estornarItemDaCompra(compra.id, linha, motivo);
      aoConcluir(`Compra estornada: ${item.nome}. Estoque e financeiro corrigidos.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Estornar: ${item.nome}`} aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <p className="modal-sub">
          Compra nº {compra.numero} de {dataBr(compra.data)}
          {compra.notaFiscal ? `, NF ${compra.notaFiscal}` : ''}: {formatarQuantidade(item.quantidade, item.unidade)} × {formatarCentavos(item.custoCentavos)}
          {item.unidade === 'kg' ? '/kg' : ''} = {formatarCentavos(item.totalCentavos)}.
        </p>
        <ul className="compra-efeitos">
          <li>Sai do estoque: {formatarQuantidade(item.quantidade, item.unidade)}.</li>
          <li>{volta}</li>
        </ul>
        <div className="campo">
          <label htmlFor="estorno-motivo">Motivo do estorno</label>
          <input id="estorno-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={LIMITES_COMPRA.motivoMax} placeholder="Ex.: lançada em dobro" />
        </div>
        <p className="modal-dica">Depois do estorno, lance a compra certa.</p>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <Acoes enviando={enviando} rotulo="Estornar" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

export function ModalPagarConta({
  api,
  conta,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiCompras, 'pagarContaAPagar'>;
  conta: ContaPagar;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [de, setDe] = useState<ContaId>('banco');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.pagarContaAPagar(conta.id, de);
      aoConcluir(`Conta paga: ${formatarCentavos(conta.valorCentavos)} saíram de ${NOME_CONTA[de]}.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Pagar conta" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={confirmar} noValidate>
        <p className="modal-sub">
          {conta.descricao} • vence {dataBr(conta.vencimento)} • <b>{formatarCentavos(conta.valorCentavos)}</b>
        </p>
        <div className="campo">
          <label htmlFor="pagar-conta">Sai de</label>
          <select id="pagar-conta" value={de} onChange={(e) => setDe(e.target.value as ContaId)}>
            <option value="banco">{NOME_CONTA.banco}</option>
            <option value="caixa">{NOME_CONTA.caixa}</option>
          </select>
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <Acoes enviando={enviando} rotulo="Pagar" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

export function ModalBaixaLote({
  api,
  lote,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiCompras, 'darBaixaNoLote'>;
  lote: LoteVencendo;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const { item, compra } = lote;
  const [quantidade, setQuantidade] = useState(quantidadeParaTexto(lote.restante, item.unidade));
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const q = quantidade.trim() === '' ? 0 : lerQuantidade(quantidade, item.unidade);
    if (q === null) return setErro(`Informe a quantidade ${item.unidade === 'kg' ? 'em kg (até 3 casas)' : 'em unidades inteiras'} (0 = o lote já acabou).`);
    setEnviando(true);
    try {
      await api.darBaixaNoLote(compra.id, lote.linha, { quantidade: q, ...(observacao.trim() ? { observacao } : {}) });
      aoConcluir(q > 0 ? `Baixa do lote registrada: ${formatarQuantidade(q, item.unidade)} de ${item.nome} saíram do estoque como vencidos.` : `Baixa do lote registrada (${item.nome}: o lote já tinha acabado).`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Dar baixa no lote" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <p className="modal-sub">
          <b>{item.nome}</b> • compra de {dataBr(compra.data)}
          {compra.notaFiscal ? ` • NF ${compra.notaFiscal}` : ''} • validade {item.validade ? dataBr(item.validade) : '—'}. Pela regra do mais antigo sai primeiro, cerca de{' '}
          {formatarQuantidade(lote.restante, item.unidade)} deste lote ainda estariam no estoque.
        </p>
        <div className="campo">
          <label htmlFor="baixa-qtd">{`Vencidos que ainda estão na prateleira (${item.unidade === 'kg' ? 'kg' : 'unidades'})`}</label>
          <input id="baixa-qtd" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode={item.unidade === 'kg' ? 'decimal' : 'numeric'} />
          <span className="modal-dica">Mais que zero: sai do estoque como "Produto vencido". Zero: o lote já acabou e o aviso some.</span>
        </div>
        <div className="campo">
          <label htmlFor="baixa-obs">Observação (opcional)</label>
          <input id="baixa-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={LIMITES_COMPRA.observacaoMax} placeholder="Ex.: conferido na prateleira" />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <Acoes enviando={enviando} rotulo="Dar baixa" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}
