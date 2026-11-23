// apps/web/src/painel/financeiro/ModaisFinanceiro.tsx
// Janelas da aba Financeiro (Fase 2, módulo 9):
//   - Novo lançamento: entrada, despesa (com a categoria da loja), retirada do dono ou transferência. O Caixa
//     físico não fica negativo (o servidor recusa); a Conta bancária pode, mas a tela avisa e pede para confirmar
//     (DaniPets FIN-04);
//   - Saldo inicial: o que já havia em cada conta quando a loja começou a usar o sistema (uma vez por conta);
//   - Nome da conta: "Banco Itaú" no lugar de "Conta bancária" (pedido do Luan, 23/11/2026);
//   - Nova conta a pagar: aluguel, energia, boleto... (sem compra);
//   - Confirmar recebimento: um ou vários recebimentos de cartão de uma vez, escolhendo a conta.
import {
  contaNaFrase,
  type ContaId,
  dataBr,
  formatarCentavos,
  formatarNumeroVenda,
  LIMITES_COMPRA,
  LIMITES_FINANCEIRO,
  LIMITES_NOME_CONTA,
  liquidoAReceber,
  NOME_CONTA,
  type NomesDasContas,
  reaisParaCentavos,
  type Recebivel,
  type TipoLancamentoManual,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiPainel, ErroApi, type ResumoFinanceiro } from '../../api';
import { Modal } from '../caixa/Modal';

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');
const outra = (c: ContaId): ContaId => (c === 'caixa' ? 'banco' : 'caixa');

function Erro({ texto }: { texto: string | null }) {
  return texto ? (
    <p className="alerta alerta-erro" role="alert">
      {texto}
    </p>
  ) : null;
}

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

function EscolhaDaConta({
  id,
  rotulo,
  valor,
  nomes,
  aoMudar,
  sem,
}: {
  id: string;
  rotulo: string;
  valor: ContaId;
  nomes: NomesDasContas;
  aoMudar: (c: ContaId) => void;
  sem?: ContaId;
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value as ContaId)}>
        {(['banco', 'caixa'] as const)
          .filter((c) => c !== sem)
          .map((c) => (
            <option key={c} value={c}>
              {nomes[c]}
            </option>
          ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------ novo lançamento
const TIPOS: { id: TipoLancamentoManual; rotulo: string }[] = [
  { id: 'entrada', rotulo: 'Entrada' },
  { id: 'despesa', rotulo: 'Despesa' },
  { id: 'retirada', rotulo: 'Retirada do dono' },
  { id: 'transferencia', rotulo: 'Transferência' },
];

export function ModalLancamento({
  api,
  contas,
  nomes,
  categorias,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'lancarNoFinanceiro'>;
  contas: ResumoFinanceiro['contas'];
  nomes: NomesDasContas;
  categorias: readonly string[];
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoLancamentoManual>('despesa');
  const [conta, setConta] = useState<ContaId>('banco');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState(categorias[0] ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** A Conta bancária vai ficar negativa: pede para confirmar uma vez. */
  const [negativoConfirmado, setNegativoConfirmado] = useState(false);
  const centavos = reaisParaCentavos(valor);
  const sai = tipo !== 'entrada';
  const saldoDaConta = contas.find((c) => c.id === conta)?.saldoCentavos ?? 0;
  const bancoNegativo = sai && conta === 'banco' && centavos !== null && centavos > saldoDaConta;

  async function lancar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (centavos === null || centavos <= 0) return setErro('Informe um valor maior que zero.');
    if (!descricao.trim()) return setErro('Descreva o lançamento.');
    if (bancoNegativo && !negativoConfirmado) {
      setNegativoConfirmado(true);
      return;
    }
    setEnviando(true);
    try {
      await api.lancarNoFinanceiro({
        tipo,
        conta,
        valorCentavos: centavos,
        descricao: descricao.trim(),
        ...(tipo === 'transferencia' ? { contaDestino: outra(conta) } : {}),
        ...(tipo === 'despesa' ? { categoria: categoria || null } : {}),
      });
      const v = formatarCentavos(centavos);
      aoConcluir(
        tipo === 'transferencia'
          ? `Transferência de ${v}: ${contaNaFrase(conta, nomes, 'de')} ${contaNaFrase(outra(conta), nomes, 'para')}.`
          : `${TIPOS.find((t) => t.id === tipo)!.rotulo} de ${v} lançada ${contaNaFrase(conta, nomes, 'em')}.`,
      );
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Novo lançamento" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={lancar} noValidate autoComplete="off">
        <div className="baixa-formas" role="group" aria-label="Tipo de lançamento">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tipo === t.id ? 'botao botao-primario' : 'botao'}
              aria-pressed={tipo === t.id}
              onClick={() => {
                setTipo(t.id);
                setNegativoConfirmado(false);
              }}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        <div className="cli-form">
          <EscolhaDaConta
            id="lanc-conta"
            rotulo={tipo === 'entrada' ? 'Entra em' : tipo === 'transferencia' ? 'Sai de' : 'Sai de'}
            valor={conta}
            nomes={nomes}
            aoMudar={(c) => {
              setConta(c);
              setNegativoConfirmado(false);
            }}
          />
          {tipo === 'transferencia' ? (
            <div className="campo">
              <label htmlFor="lanc-destino">Vai para</label>
              <input id="lanc-destino" value={nomes[outra(conta)]} readOnly />
            </div>
          ) : (
            <div className="campo">
              <label htmlFor="lanc-valor">Valor (R$)</label>
              <input
                id="lanc-valor"
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  setNegativoConfirmado(false);
                }}
                inputMode="decimal"
                placeholder="0,00"
                maxLength={14}
              />
            </div>
          )}
        </div>
        {tipo === 'transferencia' && (
          <div className="campo">
            <label htmlFor="lanc-valor">Valor (R$)</label>
            <input
              id="lanc-valor"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setNegativoConfirmado(false);
              }}
              inputMode="decimal"
              placeholder="0,00"
              maxLength={14}
            />
          </div>
        )}
        <div className="campo">
          <label htmlFor="lanc-descricao">Descrição</label>
          <input
            id="lanc-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={LIMITES_FINANCEIRO.descricaoMax}
            placeholder={
              tipo === 'despesa' ? 'Ex.: conta de luz de novembro' : tipo === 'transferencia' ? 'Ex.: depósito do dinheiro da gaveta' : 'Ex.: aporte do dono'
            }
          />
        </div>
        {tipo === 'despesa' && (
          <div className="campo">
            <label htmlFor="lanc-categoria">Categoria</label>
            <select id="lanc-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {bancoNegativo && negativoConfirmado && (
          <p className="alerta" role="alert">
            {`${nomes.banco} vai ficar negativa em ${formatarCentavos((centavos ?? 0) - saldoDaConta)} (saldo de ${formatarCentavos(saldoDaConta)}). Confira o valor; se estiver certo, clique em “Lançar mesmo assim”.`}
          </p>
        )}
        <p className="modal-dica">
          {tipo === 'retirada'
            ? 'Retirada do dono: dinheiro que o dono tira da loja para ele.'
            : tipo === 'transferencia'
              ? 'Transferência: o dinheiro sai de uma conta e entra na outra, com o mesmo valor.'
              : `O lançamento aparece no extrato ${contaNaFrase(conta, nomes, 'de')} com a sua data e o seu nome.`}
        </p>
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo={bancoNegativo && negativoConfirmado ? 'Lançar mesmo assim' : 'Lançar'} aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ saldo inicial
export function ModalSaldoInicial({
  api,
  contas,
  nomes,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'definirSaldoInicial'>;
  contas: ResumoFinanceiro['contas'];
  nomes: NomesDasContas;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const livres = contas.filter((c) => !c.temSaldoInicial);
  const [conta, setConta] = useState<ContaId>(livres[0]?.id ?? 'banco');
  const [valor, setValor] = useState('');
  const [negativo, setNegativo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function definir(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const centavos = reaisParaCentavos(valor);
    if (centavos === null) return setErro('Informe o valor (pode ser zero).');
    setEnviando(true);
    try {
      const v = negativo && conta === 'banco' ? -centavos : centavos;
      await api.definirSaldoInicial({ conta, valorCentavos: v });
      aoConcluir(`Saldo inicial ${contaNaFrase(conta, nomes, 'de')}: ${formatarCentavos(v)}.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Saldo inicial" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={definir} noValidate autoComplete="off">
        <p className="modal-sub">O dinheiro que já havia na conta quando a loja começou a usar o sistema. Só pode ser definido uma vez por conta.</p>
        <div className="cli-form">
          <div className="campo">
            <label htmlFor="si-conta">Conta</label>
            <select id="si-conta" value={conta} onChange={(e) => setConta(e.target.value as ContaId)}>
              {livres.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomes[c.id]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="si-valor">Valor (R$)</label>
            <input id="si-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" maxLength={14} />
          </div>
        </div>
        {conta === 'banco' && (
          <label className="fin-check">
            <input type="checkbox" checked={negativo} onChange={(e) => setNegativo(e.target.checked)} /> A conta começa negativa (cheque especial)
          </label>
        )}
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Definir saldo inicial" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ nome da conta
export function ModalNomeDaConta({
  api,
  conta,
  nomes,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'salvarRegrasDaLoja'>;
  conta: ContaId;
  nomes: NomesDasContas;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(nomes[conta]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(novo: string) {
    setErro(null);
    const limpo = novo.trim().replace(/\s+/g, ' ');
    if (limpo.length < LIMITES_NOME_CONTA.min || limpo.length > LIMITES_NOME_CONTA.max)
      return setErro(`O nome da conta tem de ${LIMITES_NOME_CONTA.min} a ${LIMITES_NOME_CONTA.max} caracteres.`);
    setEnviando(true);
    try {
      await api.salvarRegrasDaLoja({
        financeiro: { nomesContas: { ...nomes, [conta]: limpo } },
      });
      aoConcluir(limpo === nomes[conta] ? 'Nada mudou no nome da conta.' : `Conta renomeada: “${nomes[conta]}” agora é “${limpo}”.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nome da conta" aoFechar={aoFechar}>
      <form
        className="modal-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void salvar(nome);
        }}
        noValidate
        autoComplete="off"
      >
        <p className="modal-sub">
          O nome aparece nos cards, no extrato e nas escolhas de conta de todo o sistema (ex.: “Banco Itaú” no lugar de “{NOME_CONTA.banco}”). O dinheiro e o
          histórico não mudam.
        </p>
        <div className="campo">
          <label htmlFor="nome-conta">Nome da conta ({NOME_CONTA[conta]})</label>
          <input id="nome-conta" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITES_NOME_CONTA.max} />
        </div>
        <Erro texto={erro} />
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Gravando…' : 'Salvar nome'}
          </button>
          {nomes[conta] !== NOME_CONTA[conta] && (
            <button type="button" className="botao" disabled={enviando} onClick={() => void salvar(NOME_CONTA[conta])}>
              Voltar para “{NOME_CONTA[conta]}”
            </button>
          )}
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ nova conta a pagar
export function ModalNovaContaAPagar({
  api,
  categorias,
  hoje,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'cadastrarContaAPagar'>;
  categorias: readonly string[];
  hoje: string;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(hoje);
  const [categoria, setCategoria] = useState(categorias[0] ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function lancar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const centavos = reaisParaCentavos(valor);
    if (centavos === null || centavos <= 0) return setErro('Informe um valor maior que zero.');
    setEnviando(true);
    try {
      const c = await api.cadastrarContaAPagar({
        descricao: descricao.trim(),
        valorCentavos: centavos,
        vencimento,
        categoria: categoria || null,
      });
      aoConcluir(`Conta a pagar lançada: ${c.descricao} • ${formatarCentavos(c.valorCentavos)} • vence ${dataBr(c.vencimento)}.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nova conta a pagar" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={lancar} noValidate autoComplete="off">
        <p className="modal-sub">Aluguel, energia, internet, boleto de fornecedor… As compras a prazo já entram sozinhas (aba Compras).</p>
        <div className="campo">
          <label htmlFor="cp-descricao">Descrição</label>
          <input
            id="cp-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={LIMITES_COMPRA.descricaoMax}
            placeholder="Ex.: Aluguel de dezembro"
          />
        </div>
        <div className="cli-form">
          <div className="campo">
            <label htmlFor="cp-valor">Valor (R$)</label>
            <input id="cp-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" maxLength={14} />
          </div>
          <div className="campo">
            <label htmlFor="cp-vencimento">Vencimento</label>
            <input id="cp-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="cp-categoria">Categoria</label>
          <select id="cp-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="">Sem categoria</option>
          </select>
        </div>
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Lançar conta" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ confirmar recebimento de cartão
export function ModalConfirmarRecebimento({
  api,
  recebiveis,
  nomes,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'receberRecebivel' | 'receberRecebiveis'>;
  recebiveis: readonly Recebivel[];
  nomes: NomesDasContas;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [conta, setConta] = useState<ContaId>('banco');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const total = recebiveis.reduce((s, r) => s + liquidoAReceber(r), 0);
  const um = recebiveis.length === 1;

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (um) await api.receberRecebivel(recebiveis[0]!.id, conta);
      else
        await api.receberRecebiveis(
          recebiveis.map((r) => r.id),
          conta,
        );
      aoConcluir(
        `${um ? 'Recebimento confirmado' : `${recebiveis.length} recebimentos confirmados`}: ${formatarCentavos(total)} ${contaNaFrase(conta, nomes, 'em')}.`,
      );
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={um ? 'Confirmar recebimento' : 'Confirmar recebimentos'} aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={confirmar} noValidate>
        <p className="modal-sub">
          {um
            ? `Venda ${formatarNumeroVenda(recebiveis[0]!.vendaNumero)} • cai em ${dataBr(recebiveis[0]!.venceEm)} • líquido `
            : `${recebiveis.length} recebimentos de cartão • líquido `}
          <b>{formatarCentavos(total)}</b>
        </p>
        <p className="modal-dica">Confirme quando a operadora depositar: o valor líquido (já sem a taxa) entra na conta escolhida.</p>
        <EscolhaDaConta id="rec-conta" rotulo="Entra em" valor={conta} nomes={nomes} aoMudar={setConta} />
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Confirmar" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}
