// apps/web/src/painel/TelaCaixaDoDia.tsx
// Aba Caixa do dia (Fase 2, módulo 5), como no DaniPets V9.3.3 (pageCash): Dono, Administrador e Vendedor.
//   - sem caixa aberto: "Abrir caixa de hoje" (fundo de troco, responsável = quem está logado). Sem caixa aberto
//     não há vendas; um dia anterior ainda aberto precisa ser fechado antes;
//   - caixa aberto: horário e responsável, fundo de troco, esperado na gaveta e as vendas de hoje; sangria
//     (depositar no banco ou retirada do dono), suprimento e o fechamento (contado, diferença, justificativa);
//   - o Vendedor precisa da senha do Dono ou do Administrador para a retirada do dono e para fechar com
//     diferença acima da tolerância da loja; só o Dono e o Administrador desfazem o último fechamento;
//   - histórico de caixa (dia, fundo, esperado, contado, diferença, quem abriu, fechou e autorizou) e os
//     movimentos em dinheiro desde a abertura;
//   - Regras do caixa (Dono e Administrador): a diferença que fecha sem senha (padrão R$ 10,00).
import {
  type CaixaDoDia,
  dataBr,
  formatarCentavos,
  FUSO_PADRAO,
  LIMITES_CAIXA,
  LIMITES_REGRAS,
  type Lancamento,
  NOME_LANCAMENTO,
  type PapelDeLoja,
  pode,
  reaisParaCentavos,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiCaixa, type ApiLoja, type ApiVendas, ErroApi, type PainelCaixa } from '../api';
import { Modal } from './caixa/Modal';
import { type Autorizado, ModalSenha } from './caixa/ModalSenha';
import { horaNoFuso } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiCaixa & Pick<ApiVendas, 'listarAutorizadores' | 'autorizar'> & Pick<ApiLoja, 'salvarRegrasDaLoja'>;
  /** Quem está logado (é o responsável ao abrir). */
  pessoa: { nome: string; papel: PapelDeLoja };
  fuso?: string;
  /** Depois de salvar as regras (a barra e as outras abas leem de novo). */
  aoMudarRegras?: () => void;
}

type Janela =
  | { tipo: 'senha'; acao: Parameters<Props['api']['autorizar']>[0]['acao']; texto: string; depois: (a: Autorizado) => Promise<void> }
  | { tipo: 'desfazer'; caixa: CaixaDoDia }
  | { tipo: 'regras' };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível gravar. Tente de novo.');
const sinal = (c: number) => (c > 0 ? `+${formatarCentavos(c)}` : formatarCentavos(c));

export function TelaCaixaDoDia({ api, pessoa, fuso = FUSO_PADRAO, aoMudarRegras }: Props) {
  const { estado, recarregar } = usarCarga(() => api.lerCaixa(), [api]);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const gestor = pode(pessoa.papel, 'caixa.desfazer');

  const concluir = (texto: string) => {
    setErro(null);
    setAviso(texto);
    setJanela(null);
    void recarregar();
  };
  const falhou = (e: unknown) => {
    setAviso(null);
    setErro(mensagemDe(e));
  };
  /** Pede a senha do Dono ou do Administrador e então grava (a janela mostra o erro, se houver). */
  const comSenha = (acao: Extract<Janela, { tipo: 'senha' }>['acao'], texto: string, depois: (a: Autorizado) => Promise<void>) =>
    setJanela({ tipo: 'senha', acao, texto, depois });

  return (
    <div className="rel caixa-dia">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Caixa do dia</h1>
          <p className="suave">Abertura, sangria, suprimento, retirada e fechamento do caixa. Sem caixa aberto não há vendas.</p>
        </div>
        {dados && (
          <div className="pe-topo-acoes">
            <SituacaoCaixa dados={dados} fuso={fuso} />
            {pode(pessoa.papel, 'loja.configurar') && (
              <button type="button" className="botao" onClick={() => setJanela({ tipo: 'regras' })}>
                Regras do caixa
              </button>
            )}
          </div>
        )}
      </header>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : !dados ? (
        <p className="vazio">Carregando…</p>
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
          {dados.atrasado && (
            <p className="alerta alerta-erro" role="alert">
              O caixa de {dataBr(dados.atrasado.dia)} ainda está aberto. Feche esse dia antes de abrir o caixa de hoje.
            </p>
          )}
          {dados.estado === 'fechado' && (
            <p className="alerta" role="status">
              O caixa de hoje já foi fechado.{gestor ? ' Para lançar hoje, desfaça o fechamento no histórico abaixo.' : ''}
            </p>
          )}
          {dados.estado === 'nao_aberto' && !dados.atrasado && (
            <>
              <p className="alerta" role="status">
                O caixa de hoje ({dataBr(dados.hoje)}) ainda não foi aberto. Sem caixa aberto não há vendas.
              </p>
              <CardAbrir api={api} dados={dados} pessoa={pessoa} aoConcluir={concluir} aoFalhar={falhou} />
            </>
          )}
          {dados.estado === 'aberto' && dados.caixa && <Metricas dados={dados} caixa={dados.caixa} fuso={fuso} />}
          {(dados.estado === 'aberto' || dados.aFechar) && (
            <div className="caixa-grade">
              {dados.estado === 'aberto' && <CardOperacao api={api} dados={dados} pessoa={pessoa} aoConcluir={concluir} aoFalhar={falhou} comSenha={comSenha} />}
              {dados.aFechar && <CardFechar api={api} dados={dados} pessoa={pessoa} aoConcluir={concluir} aoFalhar={falhou} comSenha={comSenha} />}
            </div>
          )}
          <Historico dados={dados} fuso={fuso} podeDesfazer={gestor} aoDesfazer={(caixa) => setJanela({ tipo: 'desfazer', caixa })} />
          <Movimentos dados={dados} fuso={fuso} />
        </>
      )}

      {janela?.tipo === 'senha' && (
        <ModalSenha
          api={api}
          acao={janela.acao}
          texto={janela.texto}
          aoAutorizar={async (a) => {
            await janela.depois(a);
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'desfazer' && <ModalDesfazer api={api} caixa={janela.caixa} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === 'regras' && dados && (
        <ModalRegrasCaixa
          api={api}
          toleranciaCentavos={dados.toleranciaCentavos}
          aoSalvar={(t) => {
            aoMudarRegras?.();
            concluir(t);
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
    </div>
  );
}

/** "Caixa aberto às 08:10" (DaniPets: cabeçalho e Frente de caixa). */
function SituacaoCaixa({ dados, fuso }: { dados: PainelCaixa; fuso: string }) {
  if (dados.estado === 'aberto' && dados.caixa) return <span className="caixa-situacao caixa-aberto">Caixa aberto às {horaNoFuso(dados.caixa.abertura.em, fuso)}</span>;
  if (dados.estado === 'fechado') return <span className="caixa-situacao">Caixa de hoje fechado</span>;
  return <span className="caixa-situacao caixa-nao-aberto">Caixa de hoje não aberto</span>;
}

function Metricas({ dados, caixa, fuso }: { dados: PainelCaixa; caixa: CaixaDoDia; fuso: string }) {
  const v = dados.vendasDeHoje;
  const gaveta = dados.aFechar?.caixa.id === caixa.id ? dados.aFechar.gaveta : null;
  return (
    <div className="caixa-metricas" aria-label="Caixa de hoje">
      <div className="card card-plano caixa-metrica">
        <span className="caixa-metrica-rotulo">Caixa aberto às</span>
        <b className="caixa-metrica-valor">{horaNoFuso(caixa.abertura.em, fuso)}</b>
        <span className="suave">Responsável: {caixa.abertura.por.nome}</span>
      </div>
      <div className="card card-plano caixa-metrica">
        <span className="caixa-metrica-rotulo">Fundo de troco</span>
        <b className="caixa-metrica-valor">{formatarCentavos(caixa.abertura.fundoCentavos)}</b>
        <span className="suave">Informado na abertura</span>
      </div>
      <div className="card card-plano caixa-metrica">
        <span className="caixa-metrica-rotulo">Esperado na gaveta</span>
        <b className="caixa-metrica-valor" data-testid="caixa-esperado">
          {gaveta ? formatarCentavos(gaveta.esperadoCentavos) : '—'}
        </b>
        <span className="suave">Fundo + entradas − saídas em dinheiro desde a abertura</span>
      </div>
      <div className="card card-plano caixa-metrica">
        <span className="caixa-metrica-rotulo">Vendas de hoje</span>
        <b className="caixa-metrica-valor">{formatarCentavos(v.dinheiro)}</b>
        <span className="suave">
          em dinheiro • Pix {formatarCentavos(v.pix)} • cartões {formatarCentavos(v.debito + v.credito)}
          {v.fiado > 0 && ` • fiado ${formatarCentavos(v.fiado)}`}
        </span>
      </div>
    </div>
  );
}

function CardAbrir({
  api,
  dados,
  pessoa,
  aoConcluir,
  aoFalhar,
}: {
  api: Pick<ApiCaixa, 'abrirCaixa'>;
  dados: PainelCaixa;
  pessoa: { nome: string };
  aoConcluir: (t: string) => void;
  aoFalhar: (e: unknown) => void;
}) {
  const [fundo, setFundo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function abrir(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const centavos = fundo.trim() === '' ? null : reaisParaCentavos(fundo);
    if (centavos === null || centavos < 0) return setErro('Informe o fundo de troco (todo o dinheiro que está na gaveta agora). Sem troco, digite 0.');
    setEnviando(true);
    try {
      const c = await api.abrirCaixa({ fundoCentavos: centavos, observacao: observacao.trim() || null });
      aoConcluir(`Caixa aberto com ${formatarCentavos(c.abertura.fundoCentavos)} de fundo de troco. Responsável: ${c.abertura.por.nome}.`);
    } catch (e) {
      aoFalhar(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card card-plano" aria-labelledby="abrir-titulo">
      <div className="card-cabeca">
        <h2 id="abrir-titulo">Abrir caixa de hoje</h2>
      </div>
      <form className="caixa-form" onSubmit={abrir} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="cx-fundo">Fundo de troco na gaveta (R$)</label>
          <input id="cx-fundo" value={fundo} onChange={(e) => setFundo(e.target.value)} inputMode="decimal" placeholder="0,00" maxLength={14} />
        </div>
        <div className="campo">
          <label htmlFor="cx-responsavel">Responsável</label>
          <input id="cx-responsavel" value={pessoa.nome} readOnly />
        </div>
        <div className="campo">
          <label htmlFor="cx-obs">Observação (opcional)</label>
          <input id="cx-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={LIMITES_CAIXA.observacaoMax} />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Abrindo…' : 'Abrir caixa'}
          </button>
        </div>
      </form>
      <p className="card-rodape">
        Informe todo o dinheiro que está na gaveta agora. O esperado no fechamento parte deste valor.
        {dados.saldoCaixaFisicoCentavos !== null && ` No sistema, o Caixa físico tem ${formatarCentavos(dados.saldoCaixaFisicoCentavos)}.`}
      </p>
    </section>
  );
}

function CardOperacao({
  api,
  dados,
  pessoa,
  aoConcluir,
  aoFalhar,
  comSenha,
}: {
  api: Pick<ApiCaixa, 'operarCaixa'>;
  dados: PainelCaixa;
  pessoa: { papel: PapelDeLoja };
  aoConcluir: (t: string) => void;
  aoFalhar: (e: unknown) => void;
  comSenha: (acao: { tipo: 'retirada'; valorCentavos: number }, texto: string, depois: (a: Autorizado) => Promise<void>) => void;
}) {
  const [operacao, setOperacao] = useState<'sangria' | 'suprimento'>('sangria');
  const [destino, setDestino] = useState<'banco' | 'retirada'>('banco');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const retiradaSemSenha = pode(pessoa.papel, 'caixa.retirada');
  const esperado = dados.aFechar?.caixa.id === dados.caixa?.id ? (dados.aFechar?.gaveta.esperadoCentavos ?? null) : null;

  async function registrar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const centavos = reaisParaCentavos(valor);
    if (centavos === null || centavos <= 0) return setErro('Informe o valor.');
    if (!descricao.trim()) return setErro('Descreva a operação (ex.: levou ao banco).');
    const tipo = operacao === 'suprimento' ? 'suprimento' : destino === 'retirada' ? 'retirada' : 'sangria';
    if (tipo !== 'suprimento' && esperado !== null && centavos > esperado) {
      return setErro(`O valor (${formatarCentavos(centavos)}) é maior que o dinheiro esperado na gaveta (${formatarCentavos(Math.max(0, esperado))}). Confira o valor digitado. Se entrou dinheiro sem registro, lance um suprimento antes.`);
    }
    const gravar = async (autorizacao: string | null) => {
      await api.operarCaixa({ tipo, valorCentavos: centavos, descricao: descricao.trim(), autorizacao });
      setValor('');
      setDescricao('');
      aoConcluir(
        tipo === 'sangria'
          ? `Sangria registrada: ${formatarCentavos(centavos)} da gaveta para a Conta bancária.`
          : tipo === 'retirada'
            ? `Retirada do dono registrada: ${formatarCentavos(centavos)} da gaveta.`
            : `Suprimento registrado: ${formatarCentavos(centavos)} na gaveta.`,
      );
    };
    if (tipo === 'retirada' && !retiradaSemSenha) {
      return comSenha(
        { tipo: 'retirada', valorCentavos: centavos },
        `Retirada do dono: ${formatarCentavos(centavos)} da gaveta (${descricao.trim()}). O vendedor não registra a retirada do dono sozinho.`,
        (a) => gravar(a.autorizacao),
      );
    }
    setEnviando(true);
    try {
      await gravar(null);
    } catch (e) {
      aoFalhar(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card card-plano" aria-labelledby="operacao-titulo">
      <div className="card-cabeca">
        <h2 id="operacao-titulo">Sangria, suprimento ou retirada</h2>
      </div>
      <form className="caixa-form" onSubmit={registrar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="cx-operacao">Operação</label>
          <select id="cx-operacao" value={operacao} onChange={(e) => setOperacao(e.target.value as 'sangria' | 'suprimento')}>
            <option value="sangria">Sangria (tirar da gaveta)</option>
            <option value="suprimento">Suprimento (pôr na gaveta)</option>
          </select>
        </div>
        {operacao === 'sangria' && (
          <div className="campo">
            <label htmlFor="cx-destino">Destino da sangria</label>
            <select id="cx-destino" value={destino} onChange={(e) => setDestino(e.target.value as 'banco' | 'retirada')}>
              <option value="banco">Depositar no banco</option>
              <option value="retirada">Retirada do dono (levou para casa){retiradaSemSenha ? '' : ' • pede a senha do Dono ou do Administrador'}</option>
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="cx-valor">Valor (R$)</label>
          <input id="cx-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" maxLength={14} />
        </div>
        <div className="campo">
          <label htmlFor="cx-descricao">Descrição</label>
          <input id="cx-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={LIMITES_CAIXA.descricaoMax} placeholder="Ex.: levou ao banco" />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Gravando…' : 'Registrar'}
          </button>
        </div>
      </form>
      <p className="card-rodape">Sangria tira da gaveta: vai para a Conta bancária ou é a retirada do dono. Suprimento põe troco na gaveta.</p>
    </section>
  );
}

function CardFechar({
  api,
  dados,
  pessoa,
  aoConcluir,
  aoFalhar,
  comSenha,
}: {
  api: Pick<ApiCaixa, 'fecharCaixa'>;
  dados: PainelCaixa;
  pessoa: { papel: PapelDeLoja };
  aoConcluir: (t: string) => void;
  aoFalhar: (e: unknown) => void;
  comSenha: (acao: { tipo: 'fechamento'; dia: string; contadoCentavos: number }, texto: string, depois: (a: Autorizado) => Promise<void>) => void;
}) {
  const alvo = dados.aFechar!;
  const g = alvo.gaveta;
  const [contado, setContado] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const centavos = contado.trim() === '' ? null : reaisParaCentavos(contado);
  const diferenca = centavos === null ? null : centavos - g.esperadoCentavos;

  async function fechar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (centavos === null || centavos < 0) return setErro('Informe o dinheiro contado na gaveta.');
    const dif = centavos - g.esperadoCentavos;
    if (dif !== 0 && !justificativa.trim()) {
      return setErro(`Há ${dif < 0 ? 'falta' : 'sobra'} de ${formatarCentavos(Math.abs(dif))} na gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).`);
    }
    const gravar = async (autorizacao: string | null) => {
      const c = await api.fecharCaixa({ dia: alvo.caixa.dia, contadoCentavos: centavos, justificativa: justificativa.trim() || null, autorizacao });
      const d = c.fechamento?.diferencaCentavos ?? 0;
      aoConcluir(d === 0 ? `Caixa de ${dataBr(c.dia)} fechado sem diferença.` : `Caixa de ${dataBr(c.dia)} fechado. ${d < 0 ? 'Falta' : 'Sobra'} de ${formatarCentavos(Math.abs(d))} lançada como ajuste no saldo do Caixa físico.`);
    };
    const pedeSenha = (texto: string) =>
      comSenha({ tipo: 'fechamento', dia: alvo.caixa.dia, contadoCentavos: centavos }, texto, (a) => gravar(a.autorizacao));
    const textoSenha = `Fechamento do caixa de ${dataBr(alvo.caixa.dia)} com ${dif < 0 ? 'falta' : 'sobra'} de ${formatarCentavos(Math.abs(dif))} (esperado ${formatarCentavos(g.esperadoCentavos)}, contado ${formatarCentavos(centavos)}). Acima de ${formatarCentavos(dados.toleranciaCentavos)}, o Dono ou o Administrador precisa autorizar.`;
    if (Math.abs(dif) > dados.toleranciaCentavos && !pode(pessoa.papel, 'caixa.diferenca')) return pedeSenha(textoSenha);
    setEnviando(true);
    try {
      await gravar(null);
    } catch (e) {
      // a regra mudou em outra aba: pede a senha agora
      if (e instanceof ErroApi && e.codigo === 'precisa_autorizacao') pedeSenha(textoSenha);
      else aoFalhar(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card card-plano" aria-labelledby="fechar-titulo">
      <div className="card-cabeca">
        <h2 id="fechar-titulo">Fechar caixa de {dataBr(alvo.caixa.dia)}</h2>
      </div>
      <form className="caixa-form" onSubmit={fechar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="cx-contado">Dinheiro contado na gaveta (R$)</label>
          <input id="cx-contado" value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" placeholder="0,00" maxLength={14} />
        </div>
        <div className="campo">
          <label htmlFor="cx-justificativa">Observação (obrigatória se houver diferença)</label>
          <input
            id="cx-justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            maxLength={LIMITES_CAIXA.justificativaMax}
            placeholder="Ex.: troco errado na venda das 15h"
          />
        </div>
        <p className="caixa-previa" aria-live="polite">
          Esperado na gaveta: <b>{formatarCentavos(g.esperadoCentavos)}</b>
          {diferenca !== null && (
            <>
              {' '}
              • Diferença: <b className={diferenca === 0 ? 'caixa-ok' : 'caixa-dif'}>{sinal(diferenca)}</b>
            </>
          )}
        </p>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Fechando…' : 'Fechar caixa'}
          </button>
        </div>
      </form>
      <p className="card-rodape">
        = fundo de troco {formatarCentavos(g.fundoCentavos)} + entradas {formatarCentavos(g.entradasCentavos)} − saídas {formatarCentavos(g.saidasCentavos)} em dinheiro desde a abertura. Conte a
        gaveta inteira, incluindo o troco. Se o contado for diferente do esperado, a falta ou a sobra é lançada como ajuste no saldo do Caixa físico, com a sua justificativa. Acima de{' '}
        {formatarCentavos(dados.toleranciaCentavos)}, o vendedor precisa da senha do Dono ou do Administrador.
      </p>
    </section>
  );
}

function Historico({ dados, fuso, podeDesfazer, aoDesfazer }: { dados: PainelCaixa; fuso: string; podeDesfazer: boolean; aoDesfazer: (c: CaixaDoDia) => void }) {
  const ultimo = dados.historico.filter((c) => c.fechamento).sort((a, b) => b.dia.localeCompare(a.dia))[0] ?? null;
  const temDepois = (c: CaixaDoDia) => dados.historico.some((x) => x.dia > c.dia);
  return (
    <section className="card card-plano" aria-labelledby="hist-caixa-titulo">
      <div className="card-cabeca">
        <h2 id="hist-caixa-titulo">Histórico de caixa</h2>
        <span className="suave">Só o último fechamento pode ser desfeito</span>
      </div>
      {dados.historico.length === 0 ? (
        <p className="vazio">Nenhum caixa aberto ainda.</p>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela tabela-vendas caixa-historico">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="numero">Fundo de troco</th>
                <th className="numero">Esperado</th>
                <th className="numero">Contado</th>
                <th>Diferença</th>
                <th>Quem</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.historico.map((c) => {
                const f = c.fechamento;
                return (
                  <tr key={c.id}>
                    <td data-rotulo="Dia">
                      {dataBr(c.dia)}
                      {c.desfeitos.length > 0 && <small className="suave pe-detalhe">{c.desfeitos.length === 1 ? 'fechamento desfeito 1 vez' : `fechamento desfeito ${c.desfeitos.length} vezes`}</small>}
                    </td>
                    <td data-rotulo="Fundo de troco" className="numero">
                      {formatarCentavos(c.abertura.fundoCentavos)}
                    </td>
                    <td data-rotulo="Esperado" className="numero">
                      {f ? formatarCentavos(f.esperadoCentavos) : '—'}
                    </td>
                    <td data-rotulo="Contado" className="numero">
                      {f && f.contadoCentavos !== null ? formatarCentavos(f.contadoCentavos) : '—'}
                    </td>
                    <td data-rotulo="Diferença">
                      {!f ? (
                        <span className="pe-situacao pe-baixo">aberto</span>
                      ) : f.automatico ? (
                        <span className="pe-situacao pe-baixo">automático • sem contagem</span>
                      ) : (
                        <>
                          <span className={`pe-situacao ${f.diferencaCentavos ? 'pe-zerado' : 'caixa-sem-dif'}`}>{sinal(f.diferencaCentavos ?? 0)}</span>
                          {f.diferencaCentavos !== 0 && f.justificativa && <small className="suave pe-detalhe">{f.justificativa}</small>}
                        </>
                      )}
                    </td>
                    <td data-rotulo="Quem">
                      abriu: {c.abertura.por.nome} às {horaNoFuso(c.abertura.em, fuso)}
                      {f && (
                        <small className="suave pe-detalhe">
                          {f.automatico ? 'fechou: Sistema (meia-noite)' : `fechou: ${f.por?.nome ?? '—'} às ${horaNoFuso(f.em, fuso)}`}
                          {f.autorizadoPor ? ` • autorizou: ${f.autorizadoPor.nome}` : ''}
                        </small>
                      )}
                    </td>
                    <td data-rotulo="Ação">
                      {podeDesfazer && f && ultimo?.id === c.id && !temDepois(c) ? (
                        <button type="button" className="botao botao-perigo" onClick={() => aoDesfazer(c)} aria-label={`Desfazer o fechamento de ${dataBr(c.dia)}`}>
                          Desfazer fechamento
                        </button>
                      ) : (
                        <span className="suave">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Movimentos({ dados, fuso }: { dados: PainelCaixa; fuso: string }) {
  const titulo = dados.estado === 'aberto' ? 'Movimentos em dinheiro desde a abertura' : 'Movimentos em dinheiro de hoje';
  return (
    <section className="card card-plano" aria-labelledby="mov-caixa-titulo">
      <div className="card-cabeca">
        <h2 id="mov-caixa-titulo">{titulo}</h2>
      </div>
      {dados.movimentos.length === 0 ? (
        <p className="vazio">Nenhum movimento em dinheiro ainda.</p>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela tabela-vendas">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Quem</th>
                <th className="numero">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dados.movimentos.map((m: Lancamento) => (
                <tr key={m.id}>
                  <td data-rotulo="Hora">{horaNoFuso(m.criadoEm, fuso)}</td>
                  <td data-rotulo="Descrição">{m.descricao}</td>
                  <td data-rotulo="Tipo">{NOME_LANCAMENTO[m.tipo] ?? m.tipo}</td>
                  <td data-rotulo="Quem">
                    {m.por.nome}
                    {m.autorizadoPor && <small className="suave pe-detalhe">autorizou: {m.autorizadoPor.nome}</small>}
                  </td>
                  <td data-rotulo="Valor" className={`numero ${m.valorCentavos < 0 ? 'caixa-dif' : ''}`}>
                    {formatarCentavos(m.valorCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ModalDesfazer({ api, caixa, aoConcluir, aoFechar }: { api: Pick<ApiCaixa, 'desfazerFechamento'>; caixa: CaixaDoDia; aoConcluir: (t: string) => void; aoFechar: () => void }) {
  const automatico = caixa.fechamento?.automatico === true;
  const [motivo, setMotivo] = useState('');
  const [explicacao, setExplicacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!motivo.trim()) return setErro('Informe o motivo.');
    if (automatico && !explicacao.trim()) return setErro('Explique por que o fechamento automático precisa ser ajustado.');
    setEnviando(true);
    try {
      await api.desfazerFechamento(caixa.id, { motivo: motivo.trim(), explicacao: explicacao.trim() || null });
      aoConcluir(`Fechamento de ${dataBr(caixa.dia)} desfeito. O dia está aberto de novo.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const f = caixa.fechamento;
  return (
    <Modal titulo={`Desfazer o fechamento de ${dataBr(caixa.dia)}`} aoFechar={aoFechar}>
      <p className="modal-sub">
        {automatico
          ? 'Fechamento automático (sem contagem). Desfeito, o dia volta a ficar aberto para ser fechado com a contagem da gaveta.'
          : `Esperado ${formatarCentavos(f?.esperadoCentavos ?? 0)}, contado ${formatarCentavos(f?.contadoCentavos ?? 0)}.${f?.ajusteCentavos ? ` O ajuste de ${formatarCentavos(f.ajusteCentavos)} no Caixa físico é estornado.` : ''} O dia volta a ficar aberto.`}
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="desf-motivo">{automatico ? 'Motivo do ajuste do fechamento automático' : 'Motivo para desfazer o fechamento'}</label>
          <input id="desf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={LIMITES_CAIXA.motivoMax} placeholder="Ex.: contei errado" />
        </div>
        {automatico && (
          <div className="campo">
            <label htmlFor="desf-explicacao">Explique por que o fechamento automático precisa ser ajustado</label>
            <input id="desf-explicacao" value={explicacao} onChange={(e) => setExplicacao(e.target.value)} maxLength={LIMITES_CAIXA.justificativaMax} />
          </div>
        )}
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-perigo" disabled={enviando}>
            {enviando ? 'Gravando…' : 'Desfazer fechamento'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRegrasCaixa({
  api,
  toleranciaCentavos,
  aoSalvar,
  aoFechar,
}: {
  api: Pick<ApiLoja, 'salvarRegrasDaLoja'>;
  toleranciaCentavos: number;
  aoSalvar: (t: string) => void;
  aoFechar: () => void;
}) {
  const limite = LIMITES_REGRAS['caixa.toleranciaCentavos'];
  const [valor, setValor] = useState(formatarCentavos(toleranciaCentavos).replace(/^R\$\s*/, ''));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const centavos = reaisParaCentavos(valor);
    if (centavos === null || centavos < limite.min || centavos > limite.max) {
      return setErro(`Informe um valor de ${formatarCentavos(limite.min)} a ${formatarCentavos(limite.max)}.`);
    }
    setEnviando(true);
    try {
      const r = await api.salvarRegrasDaLoja({ caixa: { toleranciaCentavos: centavos } });
      aoSalvar(`Regras do caixa salvas: o Vendedor fecha sozinho com diferença de até ${formatarCentavos(r.caixa.toleranciaCentavos)}.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Regras do caixa" aoFechar={aoFechar}>
      <p className="modal-sub">Diferença na gaveta que o Vendedor fecha sozinho, com justificativa. Acima dela, o Dono ou o Administrador digita a senha.</p>
      <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="cx-tolerancia">Diferença aceita no fechamento (R$)</label>
          <input id="cx-tolerancia" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" maxLength={10} />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
