// apps/web/src/painel/produtos/ModaisEstoque.tsx
// Janelas do estoque (DaniPets PRD-08, 09 e 12), na unidade de cada produto (unidade ou kg):
//   - Entrada (compra, reposição), Ajuste (motivos da loja + observação; nunca deixa o saldo negativo)
//     e Estoque mínimo — só Dono e Administrador. Entrada e ajuste têm data (hoje ou antes); a data de um
//     dia com o caixa já fechado pede a liberação de um Dono, com motivo (módulo 5);
//   - "Como o saldo é calculado": inicial + entradas − vendas + cancelamentos + devoluções ± ajustes;
//   - Regras do estoque (Dono e Administrador): como a loja vende (un e/ou kg) e os motivos de ajuste.
import {
  type ComposicaoSaldo,
  composicaoDoSaldo,
  dataBr,
  formatarQuantidade,
  LIMITES_ESTOQUE,
  LIMITES_LOJA,
  lerQuantidade,
  type MovimentoManual,
  NOME_UNIDADE,
  quantidadeParaTexto,
  type RegrasDaLoja,
  UNIDADES_VENDA,
  type UnidadeVenda,
  unidadeDe,
  validarMovimentoManual,
} from '@saas/core';
import { type FormEvent, useEffect, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto, type SaldoEstoque } from '../../api';
import { Modal } from '../caixa/Modal';
import { ModalSenha } from '../caixa/ModalSenha';

export type AcaoEstoque = 'entrada' | 'ajuste' | 'minimo';

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível gravar. Tente de novo.');

export function ModalEstoque({
  acao,
  produto,
  atual,
  motivos,
  hoje,
  api,
  aoConcluir,
  aoFechar,
}: {
  acao: AcaoEstoque;
  produto: Produto;
  atual: SaldoEstoque;
  /** Motivos de ajuste da loja (padrão do DaniPets). */
  motivos: readonly string[];
  /** AAAA-MM-DD no fuso da loja (a data do movimento vai até hoje). */
  hoje: string;
  api: Pick<ApiPainel, 'lancarMovimentoEstoque' | 'definirEstoqueMinimo' | 'listarAutorizadores' | 'autorizar'>;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const u = unidadeDe(produto.unidade);
  const q = (n: number) => formatarQuantidade(n, u);
  const [quantidade, setQuantidade] = useState(acao === 'minimo' && atual.minimo ? quantidadeParaTexto(atual.minimo, u) : '');
  const [sentido, setSentido] = useState<'tirar' | 'por'>('tirar');
  const [motivo, setMotivo] = useState(acao === 'ajuste' ? '' : '');
  const [observacao, setObservacao] = useState('');
  const [dia, setDia] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Data de um dia com o caixa já fechado: espera a liberação do Dono. */
  const [liberar, setLiberar] = useState<{ movimento: MovimentoManual; texto: string } | null>(null);

  const n = quantidade.trim() === '' ? null : lerQuantidade(quantidade, u);
  const variacao = n === null ? null : acao === 'ajuste' && sentido === 'tirar' ? -n : n;
  const dicaQuantidade = u === 'kg' ? 'em kg, com até 3 casas (ex.: 2,5)' : 'em unidades inteiras';

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    try {
      if (acao === 'minimo') {
        const minimo = quantidade.trim() === '' ? 0 : n;
        if (minimo === null) return setErro(`Informe o mínimo ${dicaQuantidade} (0 = sem aviso de estoque baixo).`);
        setEnviando(true);
        const novo = await api.definirEstoqueMinimo(produto.id, minimo);
        return aoConcluir(novo.minimo ? `Estoque mínimo de ${produto.nome}: ${q(novo.minimo)}.` : `${produto.nome} ficou sem aviso de estoque baixo.`);
      }
      if (variacao === null || variacao === 0) return setErro(`Informe a quantidade ${dicaQuantidade}, maior que zero.`);
      if (acao === 'ajuste' && !motivo) return setErro('Escolha o motivo do ajuste.');
      const local = validarMovimentoManual(
        {
          produtoId: produto.id,
          tipo: acao,
          quantidade: variacao,
          motivo: acao === 'ajuste' ? motivo : observacao,
          ...(acao === 'ajuste' && observacao.trim() ? { observacao } : {}),
          ...(dia && dia !== hoje ? { dia } : {}),
        },
        { hoje },
      );
      if (!local.ok) return setErro(local.erros[0]!.mensagem);
      setEnviando(true);
      try {
        await lancar(local.valor);
      } catch (e) {
        // dia com o caixa já fechado: pede a liberação do Dono e lança depois dela
        if (e instanceof ErroApi && e.codigo === 'dia_fechado') return setLiberar({ movimento: local.valor, texto: e.message });
        throw e;
      }
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  async function lancar(m: MovimentoManual, liberacao: { autorizacao: string; motivo: string } | null = null) {
    const novo = await api.lancarMovimentoEstoque(m, liberacao ? { liberacao } : {});
    const quando = m.dia && m.dia !== hoje ? ` (data ${dataBr(m.dia)})` : '';
    aoConcluir(`${acao === 'entrada' ? 'Entrada lançada' : 'Ajuste lançado'}${quando}: ${produto.nome} ${m.quantidade > 0 ? '+' : ''}${q(m.quantidade)}. Saldo agora: ${q(novo.saldo)}.`);
  }

  if (liberar) {
    return (
      <ModalSenha
        api={api}
        liberacao
        acao={{ tipo: 'dia_fechado', dia: liberar.movimento.dia ?? hoje }}
        texto={liberar.texto}
        aoAutorizar={(a) => lancar(liberar.movimento, { autorizacao: a.autorizacao, motivo: a.motivo })}
        aoFechar={() => {
          setLiberar(null);
          setErro(`${acao === 'entrada' ? 'Entrada não lançada' : 'Ajuste não lançado'}: falta a liberação de um Dono.`);
        }}
      />
    );
  }

  const titulo = acao === 'entrada' ? 'Entrada de estoque' : acao === 'ajuste' ? 'Ajuste de estoque' : 'Estoque mínimo';
  return (
    <Modal titulo={`${titulo}: ${produto.nome}`} aoFechar={aoFechar}>
      <p className="modal-sub">
        Saldo atual: <b>{q(atual.saldo)}</b>
        {acao !== 'minimo' && variacao !== null && variacao !== 0 && (
          <>
            {' '}
            → depois: <b>{q(atual.saldo + variacao)}</b>
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
          <label htmlFor="pe-quantidade">{acao === 'minimo' ? `Estoque mínimo ${u === 'kg' ? 'em kg' : 'em unidades'} (0 = sem aviso)` : `Quantidade ${u === 'kg' ? 'em kg' : 'em unidades'}`}</label>
          <input id="pe-quantidade" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode={u === 'kg' ? 'decimal' : 'numeric'} maxLength={12} placeholder="0" />
        </div>
        {acao === 'ajuste' && (
          <div className="campo">
            <label htmlFor="pe-motivo">Motivo</label>
            <select id="pe-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Escolha…</option>
              {motivos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {acao !== 'minimo' && (
          <div className="campo">
            <label htmlFor="pe-dia">Data</label>
            <input id="pe-dia" type="date" value={dia} max={hoje} onChange={(e) => setDia(e.target.value)} />
            {dia && dia < hoje && <span className="modal-dica">Data de um dia anterior: se o caixa desse dia já foi fechado, um Dono precisa liberar.</span>}
          </div>
        )}
        {acao !== 'minimo' && (
          <div className="campo">
            <label htmlFor="pe-obs">{acao === 'ajuste' ? 'Observação (opcional)' : 'Observação (opcional)'}</label>
            <input
              id="pe-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={acao === 'ajuste' ? LIMITES_ESTOQUE.observacaoMax : LIMITES_ESTOQUE.motivoMax}
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

/** "Como o saldo é calculado" (DaniPets PRD-09), a partir dos movimentos do produto. */
export function ModalSaldo({ produto, api, aoFechar }: { produto: Produto; api: Pick<ApiPainel, 'listarMovimentosEstoque'>; aoFechar: () => void }) {
  const [c, setC] = useState<ComposicaoSaldo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    api.listarMovimentosEstoque({ produtoId: produto.id }).then(
      (movs) => setC(composicaoDoSaldo(movs, produto.id)),
      (e: unknown) => setErro(mensagemDe(e)),
    );
  }, [api, produto.id]);
  const q = (n: number) => formatarQuantidade(n, unidadeDe(produto.unidade));
  const linhas: [string, string][] = c
    ? [
        ['Estoque inicial', q(c.inicial)],
        ['+ Compras (menos as estornadas)', q(c.compras)],
        ['+ Entradas', q(c.entradas)],
        ['− Vendas', q(c.vendas)],
        ['+ Vendas canceladas', q(c.cancelamentos)],
        ['+ Devoluções que voltaram para a prateleira', q(c.devolucoes)],
        ['± Ajustes', `${c.ajustes > 0 ? '+' : ''}${q(c.ajustes)}`],
      ]
    : [];
  return (
    <Modal titulo={`Como o saldo é calculado: ${produto.nome}`} aoFechar={aoFechar}>
      {erro ? (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      ) : !c ? (
        <p className="suave">Carregando…</p>
      ) : (
        <div className="modal-form">
          <table className="tabela tabela-detalhe">
            <tbody>
              {linhas.map(([rotulo, valor]) => (
                <tr key={rotulo}>
                  <td>{rotulo}</td>
                  <td className="numero">{valor}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>= Saldo</b>
                </td>
                <td className="numero">
                  <b>{q(c.saldo)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="modal-dica">Devoluções de avaria ou vencido não voltam para o estoque. Nada é apagado: para corrigir, lance um ajuste.</p>
          <div className="modal-acoes">
            <button type="button" className="botao" onClick={aoFechar}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Regras do estoque (P5: as regras ficam na própria aba): unidades de venda e motivos de ajuste. */
export function ModalRegrasEstoque({
  regras,
  api,
  aoSalvar,
  aoFechar,
}: {
  regras: RegrasDaLoja;
  api: Pick<ApiPainel, 'salvarRegrasDaLoja'>;
  aoSalvar: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [unidades, setUnidades] = useState<UnidadeVenda[]>([...regras.produtos.unidades]);
  const [motivos, setMotivos] = useState(regras.estoque.motivosAjuste.join('\n'));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const lista = motivos
      .split('\n')
      .map((m) => m.trim())
      .filter(Boolean);
    setEnviando(true);
    try {
      await api.salvarRegrasDaLoja({ produtos: { unidades }, estoque: { motivosAjuste: lista } });
      aoSalvar('Regras do estoque salvas.');
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Regras do estoque" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate>
        <fieldset className="dev-acao">
          <legend>Como a loja vende</legend>
          {UNIDADES_VENDA.map((u) => (
            <label key={u}>
              <input
                type="checkbox"
                checked={unidades.includes(u)}
                onChange={(e) => setUnidades((atual) => UNIDADES_VENDA.filter((x) => (x === u ? e.target.checked : atual.includes(x))))}
              />{' '}
              {NOME_UNIDADE[u]}
            </label>
          ))}
        </fieldset>
        <p className="modal-dica">Desligar uma unidade só vale para produtos novos ou alterados; os já cadastrados continuam vendendo como antes.</p>
        <div className="campo">
          <label htmlFor="pe-motivos">Motivos de ajuste (um por linha)</label>
          <textarea id="pe-motivos" className="pe-motivos" value={motivos} onChange={(e) => setMotivos(e.target.value)} rows={6} maxLength={LIMITES_LOJA.itensMax * (LIMITES_LOJA.itemMax + 1)} />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar as regras'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
