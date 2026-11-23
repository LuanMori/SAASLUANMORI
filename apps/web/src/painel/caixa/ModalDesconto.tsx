// apps/web/src/painel/caixa/ModalDesconto.tsx
// Desconto num item (regras do DaniPets V9.3.3):
//   - informa o preço final (0 = brinde) e o motivo (obrigatório);
//   - o Vendedor dá até 10% sozinho; acima disso, o Dono ou o Administrador autoriza com a senha;
//   - brinde só com a autorização de um Dono (quem está operando sendo Dono, não precisa).
// A autorização vale só para este produto e este preço, uma vez, e o servidor confere de novo.
import { classificarDesconto, formatarCentavos, LIMITE_DESCONTO_VENDEDOR_PCT, NOME_PAPEL, quemAutorizaDesconto, reaisParaCentavos, type PapelNaLoja } from '@saas/core';
import { type FormEvent, useEffect, useState } from 'react';
import { type Autorizador, ErroApi, type Produto } from '../../api';
import { centavosParaTexto, type DescontoNaLinha } from './carrinho';
import { Modal } from './Modal';

interface Props {
  produto: Produto;
  atual: DescontoNaLinha | null;
  operador: { nome: string; papel: PapelNaLoja; permissoes?: readonly string[] | null };
  carregarAutorizadores: () => Promise<Autorizador[]>;
  autorizar: (usuarioId: string, senha: string, precoFinalCentavos: number) => Promise<{ autorizacao: string; autorizador: Autorizador }>;
  aoAplicar: (desconto: DescontoNaLinha) => void;
  aoFechar: () => void;
  /** Desconto que o Vendedor dá sem senha (regra da loja; padrão 10%, como o DaniPets). */
  limitePct?: number;
}

const pctTexto = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

export function ModalDesconto({ produto, atual, operador, carregarAutorizadores, autorizar, aoAplicar, aoFechar, limitePct = LIMITE_DESCONTO_VENDEDOR_PCT }: Props) {
  const [precoTexto, setPrecoTexto] = useState(centavosParaTexto(atual?.precoFinalCentavos ?? produto.precoCentavos));
  const [motivo, setMotivo] = useState(atual?.motivo ?? '');
  const [autorizadores, setAutorizadores] = useState<Autorizador[] | null>(null);
  const [quemId, setQuemId] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const centavos = reaisParaCentavos(precoTexto);
  const { tipo, pct } = centavos === null ? { tipo: 'invalido' as const, pct: 0 } : classificarDesconto(produto.precoCentavos, centavos, limitePct);
  const quem = quemAutorizaDesconto(tipo, operador);
  const opcoes = (autorizadores ?? []).filter((a) => (quem === 'dono' ? a.papel === 'dono' : true));

  useEffect(() => {
    if (!quem || autorizadores) return;
    carregarAutorizadores()
      .then(setAutorizadores)
      .catch(() => setAutorizadores([]));
  }, [quem, autorizadores, carregarAutorizadores]);
  useEffect(() => {
    if (opcoes.length && !opcoes.some((o) => o.id === quemId)) setQuemId(opcoes[0]!.id);
  }, [opcoes, quemId]);

  async function aplicar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (centavos === null) return setErro('Informe o preço final (ex.: 6,50). Use 0 para brinde.');
    if (tipo === 'nenhum' || tipo === 'invalido') return setErro('O preço final deve ser menor que o preço de tabela (0 para brinde).');
    if (!motivo.trim()) return setErro('Informe o motivo do desconto.');
    if (!quem) {
      aoAplicar({ precoFinalCentavos: centavos, motivo: motivo.trim(), responsavelNome: operador.nome, autorizacao: null });
      return;
    }
    if (!quemId) return setErro(quem === 'dono' ? 'Não há Dono cadastrado para autorizar.' : 'Não há Dono ou Administrador cadastrado para autorizar.');
    if (!senha) return setErro('Digite a senha de quem autoriza.');
    setEnviando(true);
    try {
      const r = await autorizar(quemId, senha, centavos);
      aoAplicar({ precoFinalCentavos: centavos, motivo: motivo.trim(), responsavelNome: r.autorizador.nome, autorizacao: r.autorizacao });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível autorizar. Tente de novo.');
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Desconto em ${produto.nome}`} aoFechar={aoFechar}>
      <p className="modal-sub">
        Preço de tabela: <b>{formatarCentavos(produto.precoCentavos)}</b>. O Vendedor pode dar até {String(limitePct).replace('.', ',')}% sozinho.
      </p>
      <form className="modal-form" onSubmit={aplicar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="desc-preco">Preço final (R$)</label>
          <input id="desc-preco" value={precoTexto} onChange={(e) => setPrecoTexto(e.target.value)} inputMode="decimal" aria-describedby="desc-calc" />
          <span id="desc-calc" className="modal-dica" role="status">
            {tipo === 'brinde'
              ? 'Brinde: o produto sai de graça.'
              : tipo === 'dentro-do-limite' || tipo === 'acima-do-limite'
                ? `Desconto de ${pctTexto(pct)} (${formatarCentavos(produto.precoCentavos - (centavos ?? 0))} ${produto.unidade === 'kg' ? 'por kg' : 'por unidade'}).`
                : 'Use 0 para brinde.'}
          </span>
        </div>
        <div className="campo">
          <label htmlFor="desc-motivo">Motivo do desconto</label>
          <input id="desc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: embalagem amassada" />
        </div>

        {quem && (
          <fieldset className="modal-autorizacao">
            <legend>{quem === 'dono' ? 'Brinde: autorização de um Dono' : `Passa de ${String(limitePct).replace('.', ',')}%: autorização do Dono ou do Administrador`}</legend>
            <div className="modal-grade">
              <div className="campo">
                <label htmlFor="desc-quem">Quem autoriza</label>
                <select id="desc-quem" value={quemId} onChange={(e) => setQuemId(e.target.value)} disabled={autorizadores === null}>
                  {autorizadores === null && <option value="">Carregando…</option>}
                  {opcoes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {NOME_PAPEL[a.papel]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="desc-senha">Senha</label>
                <input id="desc-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </fieldset>
        )}

        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Conferindo…' : quem ? 'Autorizar e aplicar' : 'Aplicar desconto'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
