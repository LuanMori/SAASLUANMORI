// apps/web/src/painel/dados/CartaoManutencao.tsx
// Dados e backup → Adm. Sup → MANUTENÇÃO (módulo 13h):
//   - DIAGNÓSTICO DA LOJA: a versão, a equipe, o histórico, o espaço ocupado, o caixa e quantos registros de cada
//     assunto a loja tem (os mesmos da cópia de segurança);
//   - CONFERIR O ESTOQUE: os produtos com saldo negativo, com "Zerar o saldo" (um ajuste, que fica no histórico), e os
//     movimentos de produto que não existe mais;
//   - REGISTRO DE ERROS: os erros inesperados das telas da loja (quando, quem, em que aba, a mensagem e quantas
//     vezes), com "Limpar o registro".
// Reabrir um caixa é o "Desfazer o fechamento" da aba Caixa do dia (o último fechamento, para não quebrar o saldo dos
// dias seguintes); aqui fica só a situação do caixa.
import { dataBr, formatarQuantidade, NOME_SUPORTE, unidadeDe } from '@saas/core';
import { useState } from 'react';
import { type ApiManutencao, type DiagnosticoDaLoja, ErroApi, type ItemDoRegistroDeErros } from '../../api';
import { dataNoFuso, horaNoFuso } from '../formato';
import { ITENS_MENU } from '../menu';
import { usarCarga } from '../usarCarga';

const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.');

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
/** 2048 -> "2 KB"; 1.572.864 -> "1,5 MB". */
export const formatarBytes = (n: number): string =>
  n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${NUMERO.format(Math.round(n / 1024))} KB` : `${NUMERO.format(n / (1024 * 1024))} MB`;

const NOME_DO_ESTADO = { nao_aberto: 'não aberto', aberto: 'aberto', fechado: 'fechado' } as const;
const nomeDaAba = (tela: string | null) => (tela ? (ITENS_MENU.find((i) => i.id === tela)?.rotulo ?? tela) : '—');

export function ParteManutencao({ api, fuso, aoMudar }: { api: ApiManutencao; fuso: string; aoMudar?: () => void }) {
  const { estado, recarregar } = usarCarga(() => api.diagnosticoDaLoja(), [api]);
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  return (
    <>
      <section className="card db-card" aria-labelledby="as-diag-titulo">
        <div className="as-cabeca">
          <h2 id="as-diag-titulo">Diagnóstico da loja</h2>
          <button type="button" className="botao" onClick={() => void recarregar()} disabled={estado.tipo === 'carregando'}>
            Atualizar
          </button>
        </div>
        {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
          <p className="alerta alerta-erro" role="alert">
            {estado.mensagem}
          </p>
        ) : d ? (
          <Diagnostico d={d} fuso={fuso} />
        ) : (
          <p className="suave">Carregando…</p>
        )}
      </section>
      {d && <CartaoEstoque api={api} d={d} aoMudar={() => void recarregar().then(() => aoMudar?.())} />}
      <CartaoErros api={api} fuso={fuso} aoMudar={() => void recarregar()} />
    </>
  );
}

function Diagnostico({ d, fuso }: { d: DiagnosticoDaLoja; fuso: string }) {
  const perto = d.espaco.totalBytes !== null && d.espaco.limiteBytes !== null && d.espaco.totalBytes >= d.espaco.limiteBytes * 0.8;
  return (
    <>
      <p className="suave db-sub">
        Gerado em {dataNoFuso(d.geradoEm, fuso)} às {horaNoFuso(d.geradoEm, fuso)}.
      </p>
      <dl className="as-fatos">
        <div>
          <dt>Versão do sistema</dt>
          <dd>{d.versao}</dd>
        </div>
        <div>
          <dt>Equipe</dt>
          <dd>
            {d.equipe.ativos} {d.equipe.ativos === 1 ? 'ativo' : 'ativos'} de {d.equipe.total}
          </dd>
        </div>
        <div>
          <dt>Histórico</dt>
          <dd>{d.historico.toLocaleString('pt-BR')} linhas</dd>
        </div>
        <div>
          <dt>Espaço</dt>
          <dd>
            Esta loja: {formatarBytes(d.espaco.daLojaBytes)}
            {d.espaco.totalBytes !== null && (
              <>
                {' '}
                · tudo no navegador: {formatarBytes(d.espaco.totalBytes)}
                {d.espaco.limiteBytes !== null && ` de cerca de ${formatarBytes(d.espaco.limiteBytes)}`}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Caixa</dt>
          <dd>
            Hoje: {NOME_DO_ESTADO[d.caixa.hoje]} · último fechado: {d.caixa.ultimoFechado ? dataBr(d.caixa.ultimoFechado) : '—'} · a verificar: {d.caixa.aVerificar}
          </dd>
        </div>
        <div>
          <dt>Erros no registro</dt>
          <dd>{d.erros}</dd>
        </div>
      </dl>
      {perto && (
        <p className="alerta alerta-aviso" role="status">
          O armazenamento do navegador está quase cheio. Baixe uma cópia de segurança e limpe o que não precisa (como o registro de erros).
        </p>
      )}
      <p className="suave as-nota">Para reabrir um caixa, use “Desfazer o fechamento” na aba Caixa do dia (vale para o último fechamento, para não quebrar o saldo dos dias seguintes).</p>
      <div className="tabela-caixa">
        <table className="tabela as-assuntos" aria-label="Registros por assunto">
          <thead>
            <tr>
              <th>Assunto</th>
              <th className="numero">Registros</th>
            </tr>
          </thead>
          <tbody>
            {d.assuntos.map((a) => (
              <tr key={a.assunto}>
                <td>{a.nome}</td>
                <td className="numero">{a.registros.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ conferir o estoque

function CartaoEstoque({ api, d, aoMudar }: { api: ApiManutencao; d: DiagnosticoDaLoja; aoMudar: () => void }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { negativos, movimentosSemProduto } = d.estoque;

  async function zerar(produtoId: string, nome: string, saldo: number, unidade: string) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.zerarEstoqueNegativo(produtoId);
      setConfirmar(null);
      setAviso(`Saldo de ${nome} zerado com um ajuste de +${formatarQuantidade(-saldo, unidadeDe(unidade))} (fica no histórico do produto).`);
      aoMudar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="as-estoque-titulo">
      <h2 id="as-estoque-titulo">Conferir o estoque</h2>
      <p className="suave db-sub">
        O saldo de cada produto é sempre recalculado a partir dos movimentos (estoque inicial, entradas, compras, vendas, devoluções e ajustes). Aqui aparecem
        os que ficaram negativos.
      </p>
      {negativos.length === 0 ? (
        <p className="alerta" role="status">
          Nenhum produto com saldo negativo.
        </p>
      ) : (
        <ul className="as-visoes" aria-label="Produtos com saldo negativo">
          {negativos.map((n) => (
            <li key={n.produtoId}>
              <div>
                <p>
                  <strong>{n.nome}</strong>
                </p>
                <p className="suave">Saldo: {formatarQuantidade(n.saldo, unidadeDe(n.unidade))}</p>
              </div>
              {confirmar === n.produtoId ? (
                <span className="as-visoes-acoes" role="group" aria-label={`Zerar o saldo de ${n.nome}?`}>
                  <button type="button" className="botao botao-primario" onClick={() => void zerar(n.produtoId, n.nome, n.saldo, n.unidade)} disabled={ocupado}>
                    {ocupado ? 'Zerando…' : 'Sim, zerar'}
                  </button>
                  <button type="button" className="botao" onClick={() => setConfirmar(null)} disabled={ocupado}>
                    Não
                  </button>
                </span>
              ) : (
                <button type="button" className="botao" onClick={() => setConfirmar(n.produtoId)} aria-label={`Zerar o saldo de ${n.nome}`}>
                  Zerar o saldo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {movimentosSemProduto > 0 && (
        <p className="suave as-nota">
          {movimentosSemProduto} {movimentosSemProduto === 1 ? 'movimento é de um produto' : 'movimentos são de produtos'} que não existe mais (não muda nenhum
          saldo da lista).
        </p>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="alerta" role="status">
          {aviso}
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ registro de erros

function CartaoErros({ api, fuso, aoMudar }: { api: ApiManutencao; fuso: string; aoMudar: () => void }) {
  const { estado, recarregar } = usarCarga(() => api.listarErros(), [api]);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const lista: ItemDoRegistroDeErros[] = estado.tipo === 'pronto' ? estado.dados : [];

  async function limpar() {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.limparErros();
      await recarregar();
      setConfirmar(false);
      setAviso('Registro de erros limpo.');
      aoMudar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="as-erros-titulo">
      <div className="as-cabeca">
        <h2 id="as-erros-titulo">Registro de erros</h2>
        <button
          type="button"
          className="botao"
          onClick={() => {
            setAviso(null);
            void recarregar();
          }}
          disabled={estado.tipo === 'carregando'}
        >
          Atualizar
        </button>
      </div>
      <p className="suave db-sub">
        Os erros inesperados que aconteceram nas telas desta loja (os 100 mais novos): quando, quem, em que aba e a mensagem técnica. O mesmo erro em seguida vira
        “vezes”.
      </p>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : lista.length === 0 ? (
        estado.tipo === 'pronto' && (
          <p className="alerta" role="status">
            Nenhum erro registrado.
          </p>
        )
      ) : (
        <>
          <div className="tabela-caixa">
            <table className="tabela as-erros" aria-label="Erros registrados">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Aba</th>
                  <th>Erro</th>
                  <th className="numero">Vezes</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td data-rotulo="Quando">
                      {dataNoFuso(e.ultimoEm, fuso)} {horaNoFuso(e.ultimoEm, fuso)}
                    </td>
                    <td data-rotulo="Quem">{e.quemNome ?? (e.quem === 'adm-sup' ? NOME_SUPORTE : '—')}</td>
                    <td data-rotulo="Aba">{nomeDaAba(e.tela)}</td>
                    <td data-rotulo="Erro" className="as-erro-texto">
                      {e.mensagem}
                      {e.onde && <small className="suave"> · {e.onde}</small>}
                    </td>
                    <td data-rotulo="Vezes" className="numero">
                      {e.vezes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirmar ? (
            <div className="modal-acoes" role="group" aria-label="Limpar o registro de erros?">
              <button type="button" className="botao botao-perigo" onClick={() => void limpar()} disabled={ocupado}>
                {ocupado ? 'Limpando…' : `Sim, limpar ${lista.length === 1 ? 'o erro' : `os ${lista.length} erros`}`}
              </button>
              <button type="button" className="botao" onClick={() => setConfirmar(false)} disabled={ocupado}>
                Não
              </button>
            </div>
          ) : (
            <div className="modal-acoes">
              <button type="button" className="botao" onClick={() => setConfirmar(true)}>
                Limpar o registro
              </button>
            </div>
          )}
        </>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="alerta" role="status">
          {aviso}
        </p>
      )}
    </section>
  );
}
