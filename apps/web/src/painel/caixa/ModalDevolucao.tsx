// apps/web/src/painel/caixa/ModalDevolucao.tsx
// Devolução e cancelamento pela Frente de caixa (fluxo do DaniPets V9.3.3):
//   1) escolhe a venda pelo número ou numa lista das vendas de hoje;
//   2) devolve itens (quantidade de cada um) ou cancela a venda inteira (só no mesmo dia e sem
//      devolução); informa o motivo; o Vendedor precisa da senha do Dono ou do Administrador;
//   3) o valor volta pelas mesmas formas de pagamento da venda;
//   4) cada item devolvido volta para o estoque (prateleira) ou não (avaria, vencido); no cancelamento,
//      tudo volta para o estoque.
// O vale-troca do DaniPets entra junto com a aba Clientes.
import {
  type Devolucao,
  descreverPagamentos,
  diaNoFuso,
  estornavelPorForma,
  formatarCentavos,
  formatarNumeroVenda,
  NOME_PAPEL,
  type PapelDeLoja,
  podeCancelarVenda,
  quemAutorizaEstorno,
  repartirEstorno,
  restanteParaDevolver,
  type Venda,
} from '@saas/core';
import { type FormEvent, useEffect, useState } from 'react';
import { type ApiPainel, type Autorizador, ErroApi } from '../../api';
import { dataNoFuso, horaNoFuso, pagamentosComValores } from '../formato';
import { Modal } from './Modal';

interface Props {
  api: Pick<ApiPainel, 'listarVendas' | 'buscarVenda' | 'listarAutorizadores' | 'autorizar' | 'cancelarVenda' | 'devolverItens'>;
  operador: { nome: string; papel: PapelDeLoja };
  fuso: string;
  agora: () => Date;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}

const comValores = pagamentosComValores;

const mensagemDe = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);

export function ModalDevolucao({ api, operador, fuso, agora, aoConcluir, aoFechar }: Props) {
  const [venda, setVenda] = useState<Venda | null>(null);
  return venda ? (
    <PassoVenda venda={venda} api={api} operador={operador} fuso={fuso} agora={agora} aoConcluir={aoConcluir} aoVoltar={() => setVenda(null)} aoFechar={aoFechar} />
  ) : (
    <PassoEscolher api={api} fuso={fuso} agora={agora} aoEscolher={setVenda} aoFechar={aoFechar} />
  );
}

// ------------------------------------------------------------------ 1) escolher a venda
function PassoEscolher({
  api,
  fuso,
  agora,
  aoEscolher,
  aoFechar,
}: {
  api: Props['api'];
  fuso: string;
  agora: () => Date;
  aoEscolher: (v: Venda) => void;
  aoFechar: () => void;
}) {
  const [numero, setNumero] = useState('');
  const [hoje, setHoje] = useState<Venda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const dia = diaNoFuso(agora(), fuso);
    api
      .listarVendas({ de: dia, ate: dia })
      .then((vs) => setHoje(vs.filter((v) => v.status === 'finalizada').slice(0, 8)))
      .catch(() => setHoje([]));
    // só ao abrir a janela
  }, []);

  async function procurar(n: number) {
    setErro(null);
    setBuscando(true);
    try {
      const v = await api.buscarVenda(n);
      if (v.status === 'cancelada') setErro('Esta venda já foi cancelada.');
      else aoEscolher(v);
    } catch (e) {
      setErro(mensagemDe(e, 'Não foi possível buscar a venda.'));
    } finally {
      setBuscando(false);
    }
  }

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    const n = Number(numero.replace(/\D/g, ''));
    if (!n) return setErro('Digite o número da venda (ex.: 12).');
    void procurar(n);
  }

  return (
    <Modal titulo="Devolução ou cancelamento" aoFechar={aoFechar}>
      <p className="modal-sub">Digite o número da venda ou escolha uma venda de hoje.</p>
      <form className="modal-form" onSubmit={enviar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="dev-numero">Número da venda</label>
          <input id="dev-numero" value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" placeholder="Ex.: 12" />
        </div>
        {hoje && hoje.length > 0 && (
          <div className="dev-hoje" role="group" aria-label="Vendas de hoje">
            {hoje.map((v) => (
              <button key={v.id} type="button" className="chip" onClick={() => aoEscolher(v)}>
                {formatarNumeroVenda(v.numero)} · {horaNoFuso(v.criadaEm, fuso)} · {formatarCentavos(v.totalCentavos)}
              </button>
            ))}
          </div>
        )}
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={buscando}>
            {buscando ? 'Buscando…' : 'Continuar'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ 2) devolver itens ou cancelar
function PassoVenda({
  venda,
  api,
  operador,
  fuso,
  agora,
  aoConcluir,
  aoVoltar,
  aoFechar,
}: {
  venda: Venda;
  api: Props['api'];
  operador: Props['operador'];
  fuso: string;
  agora: () => Date;
  aoConcluir: (mensagem: string) => void;
  aoVoltar: () => void;
  aoFechar: () => void;
}) {
  const podeCancelar = podeCancelarVenda(venda, agora(), fuso);
  const restante = restanteParaDevolver(venda);
  const [acao, setAcao] = useState<'devolver' | 'cancelar'>('devolver');
  const [qtds, setQtds] = useState<string[]>(venda.itens.map(() => '0'));
  // como no DaniPets: vem marcado ("volta"); desmarque para avaria ou vencido
  const [voltam, setVoltam] = useState<boolean[]>(venda.itens.map(() => true));
  const [motivo, setMotivo] = useState('');
  const [autorizadores, setAutorizadores] = useState<Autorizador[] | null>(null);
  const [quemId, setQuemId] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const precisa = quemAutorizaEstorno(operador.papel);

  useEffect(() => {
    if (!precisa) return;
    api
      .listarAutorizadores()
      .then((lista) => {
        setAutorizadores(lista);
        if (lista[0]) setQuemId(lista[0].id);
      })
      .catch(() => setAutorizadores([]));
    // só ao abrir a janela
  }, []);

  const itens = venda.itens
    .map((_, linha) => ({
      linha,
      quantidade: Math.max(0, Math.min(restante[linha]!, Number.parseInt(qtds[linha] || '0', 10) || 0)),
      voltaAoEstoque: voltam[linha] !== false,
    }))
    .filter((x) => x.quantidade > 0);
  const descartados = itens.filter((x) => !x.voltaAoEstoque);
  const totalDevolver = acao === 'cancelar' ? venda.totalCentavos : itens.reduce((s, x) => s + venda.itens[x.linha]!.precoCentavos * x.quantidade, 0);
  const previa = acao === 'cancelar' ? { ok: true as const, valor: venda.pagamentos } : repartirEstorno(venda, totalDevolver);
  const disponivel = estornavelPorForma(venda);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (acao === 'devolver' && itens.length === 0) return setErro('Informe a quantidade de pelo menos um item.');
    if (!motivo.trim()) return setErro(acao === 'cancelar' ? 'Informe o motivo do cancelamento.' : 'Informe o motivo da devolução.');
    if (precisa && !quemId) return setErro('Não há Dono ou Administrador cadastrado para autorizar.');
    if (precisa && !senha) return setErro('Digite a senha de quem autoriza.');
    setEnviando(true);
    try {
      let autorizacao: string | null = null;
      if (precisa) {
        const r = await api.autorizar({ usuarioId: quemId, senha, acao: { tipo: acao === 'cancelar' ? 'cancelamento' : 'devolucao', vendaId: venda.id } });
        autorizacao = r.autorizacao;
      }
      if (acao === 'cancelar') {
        const v = await api.cancelarVenda(venda.id, { motivo: motivo.trim(), autorizacao });
        aoConcluir(`Venda ${formatarNumeroVenda(v.numero)} cancelada. Devolvido: ${comValores(v.cancelamento?.estornos ?? [])}.`);
      } else {
        const { devolucao }: { devolucao: Devolucao } = await api.devolverItens(venda.id, { itens, motivo: motivo.trim(), autorizacao });
        aoConcluir(
          `Devolução registrada na venda ${formatarNumeroVenda(venda.numero)}: ${formatarCentavos(devolucao.totalCentavos)} (${comValores(devolucao.estornos)}).`,
        );
      }
    } catch (e) {
      setErro(mensagemDe(e, 'Não foi possível concluir. Tente de novo.'));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Venda ${formatarNumeroVenda(venda.numero)}`} aoFechar={aoFechar} larga>
      <p className="modal-sub">
        {dataNoFuso(venda.criadaEm, fuso)} {horaNoFuso(venda.criadaEm, fuso)} · vendido por {venda.vendedor.nome} · {descreverPagamentos(venda.pagamentos)} · total{' '}
        {formatarCentavos(venda.totalCentavos)}
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        {podeCancelar ? (
          <fieldset className="dev-acao">
            <legend>O que fazer</legend>
            <label>
              <input type="radio" name="dev-acao" checked={acao === 'devolver'} onChange={() => setAcao('devolver')} /> Devolver itens
            </label>
            <label>
              <input type="radio" name="dev-acao" checked={acao === 'cancelar'} onChange={() => setAcao('cancelar')} /> Cancelar a venda inteira
            </label>
          </fieldset>
        ) : (
          <p className="modal-dica">
            {venda.devolucoes.length
              ? 'Esta venda já teve devolução: dá para devolver o que sobrou, mas não cancelar a venda inteira.'
              : 'Cancelar a venda inteira só no mesmo dia. Dá para devolver itens.'}
          </p>
        )}

        {acao === 'devolver' && (
          <div className="tabela-caixa tabela-caixa-borda">
            <table className="tabela tabela-detalhe dev-tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="numero">Vendido</th>
                  <th className="numero">Já devolvido</th>
                  <th className="numero">Devolver</th>
                  <th>Volta ao estoque</th>
                  <th className="numero">Preço</th>
                </tr>
              </thead>
              <tbody>
                {venda.itens.map((item, linha) => (
                  <tr key={linha}>
                    <td data-rotulo="Produto">{item.nome}</td>
                    <td data-rotulo="Vendido" className="numero">
                      {item.quantidade} un
                    </td>
                    <td data-rotulo="Já devolvido" className="numero">
                      {item.quantidade - restante[linha]! || '—'}
                    </td>
                    <td data-rotulo="Devolver" className="numero">
                      <input
                        type="number"
                        min={0}
                        max={restante[linha]}
                        value={qtds[linha]}
                        disabled={restante[linha] === 0}
                        aria-label={`Quantidade a devolver de ${item.nome}`}
                        onChange={(e) => setQtds((q) => q.map((v, i) => (i === linha ? e.target.value : v)))}
                      />
                    </td>
                    <td data-rotulo="Volta ao estoque">
                      <label className="dev-volta-estoque">
                        <input
                          type="checkbox"
                          checked={voltam[linha] !== false}
                          disabled={restante[linha] === 0}
                          aria-label={`${item.nome} volta ao estoque`}
                          onChange={(e) => setVoltam((v) => v.map((x, i) => (i === linha ? e.target.checked : x)))}
                        />{' '}
                        volta
                      </label>
                    </td>
                    <td data-rotulo="Preço" className="numero">
                      {formatarCentavos(item.precoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="dev-volta" role="status">
          {acao === 'cancelar' ? (
            <>
              Volta tudo para o cliente: <b>{comValores(venda.pagamentos)}</b>. Todos os itens voltam ao estoque.
              {venda.pagamentos.some((p) => p.forma === 'fiado') && ' O fiado sai do que o cliente deve.'}
            </>
          ) : totalDevolver > 0 && previa.ok ? (
            <>
              Volta para o cliente: <b>{formatarCentavos(totalDevolver)}</b> ({comValores(previa.valor)}).
              {previa.valor.some((p) => p.forma === 'fiado') && ' A parte no fiado sai do que o cliente deve.'}
              {descartados.length > 0 && (
                <> Não volta ao estoque (avaria ou vencido): {descartados.map((x) => `${x.quantidade}× ${venda.itens[x.linha]!.nome}`).join(', ')}.</>
              )}
            </>
          ) : (
            <>O valor volta pelas mesmas formas da venda ({disponivel.length ? `${comValores(disponivel)} disponíveis` : 'nada mais a devolver'}).</>
          )}
        </p>

        <div className="campo">
          <label htmlFor="dev-motivo">Motivo</label>
          <input id="dev-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: produto errado, cliente desistiu, embalagem furada" />
        </div>

        {precisa && (
          <fieldset className="modal-autorizacao">
            <legend>Autorização do Dono ou do Administrador</legend>
            <div className="modal-grade">
              <div className="campo">
                <label htmlFor="dev-quem">Quem autoriza</label>
                <select id="dev-quem" value={quemId} onChange={(e) => setQuemId(e.target.value)} disabled={autorizadores === null}>
                  {autorizadores === null && <option value="">Carregando…</option>}
                  {(autorizadores ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {NOME_PAPEL[a.papel]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="dev-senha">Senha</label>
                <input id="dev-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" />
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
          <button type="submit" className={`botao ${acao === 'cancelar' ? 'botao-perigo' : 'botao-primario'}`} disabled={enviando}>
            {enviando ? 'Registrando…' : acao === 'cancelar' ? 'Cancelar a venda' : 'Confirmar devolução'}
          </button>
          <button type="button" className="botao" onClick={aoVoltar}>
            Voltar
          </button>
        </div>
      </form>
    </Modal>
  );
}
