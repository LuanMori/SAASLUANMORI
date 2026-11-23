// apps/web/src/painel/TelaFinanceiro.tsx
// Aba Financeiro (Fase 2, módulo 9; pedido do Luan de 23/11/2026), para o Dono e o Administrador:
//   - cards: Saldo total, cada conta com o nome que a loja deu a ela (✎ troca: "Banco Itaú" no lugar de "Conta
//     bancária"), A receber (cartão + fiado) e A pagar. Clicar num card abre a parte dele logo abaixo;
//   - EXTRATO de cada conta, como o do banco: período (hoje, 7 dias, este mês, mês passado ou de/até), só entradas
//     ou só saídas, busca, o saldo anterior, cada lançamento com o saldo depois dele e o saldo final;
//   - A RECEBER: cartão (na baixa manual, "Confirmar" um a um ou "Confirmar os vencidos"; na automática, o cartão
//     já entra na conta na hora) e fiado por cliente, com "Receber";
//   - A PAGAR: compras a prazo e contas avulsas (aluguel, energia...), com "Pagar" e "+ Nova conta a pagar";
//   - lançamentos à mão (entrada, despesa, retirada do dono, transferência), saldo inicial (uma vez por conta) e as
//     taxas da maquininha (a baixa automática ou manual é escolha do Dono).
// Depois de cada ação, todas as telas que mostram dinheiro leem de novo (avisarQueOsDadosMudaram).
import { CATEGORIAS_DESPESA_PADRAO, type ContaId, type ContaPagar, contaNaFrase, dataBr, diaNoFuso, formatarCentavos, formatarNumeroVenda, FUSO_PADRAO, type LinhaDoExtrato, liquidoAReceber, NOME_FORMA_PAGAMENTO, NOME_CONTA, NOME_LANCAMENTO, type NomesDasContas, pode, type Recebivel, semAcento, somarDias, type QuemAcessa } from '@saas/core';
import { useMemo, useState } from 'react';
import { type ApiPainel, type ContaDoCliente, ErroApi, type ResumoFinanceiro } from '../api';
import { avisarQueOsDadosMudaram } from '../sincronizacao';
import { AvisoComIcone } from './AvisoComIcone';
import { ModalReceberFiado, ModalTaxasMaquininha } from './clientes/ModaisCliente';
import { ModalPagarConta } from './compras/ModaisCompra';
import { ModalConfirmarRecebimento, ModalLancamento, ModalNomeDaConta, ModalNovaContaAPagar, ModalSaldoInicial } from './financeiro/ModaisFinanceiro';
import { horaNoFuso, plural } from './formato';
import { ContextoNomesDasContas } from './nomesDasContas';
import { usarCarga } from './usarCarga';

type ApiTela = Pick<
  ApiPainel,
  | 'resumoFinanceiro'
  | 'extratoDaConta'
  | 'listarRecebiveis'
  | 'receberRecebivel'
  | 'receberRecebiveis'
  | 'lancarNoFinanceiro'
  | 'definirSaldoInicial'
  | 'lerTaxasCartao'
  | 'salvarTaxasCartao'
  | 'listarContasAPagar'
  | 'pagarContaAPagar'
  | 'cadastrarContaAPagar'
  | 'lerConfiguracao'
  | 'salvarRegrasDaLoja'
  | 'listarFiado'
  | 'contaDoCliente'
  | 'receberFiadoDoCliente'
  | 'taxasParaReceberFiado'
>;

interface Props {
  api: ApiTela;
  papel: QuemAcessa;
  fuso?: string;
  agora?: () => Date;
  /** Depois de trocar o nome de uma conta: o painel lê as regras de novo (o nome vale nas outras abas). */
  aoMudarRegras?: () => void;
}

type Parte = ContaId | 'receber' | 'pagar';
type Janela =
  | { tipo: 'lancamento' }
  | { tipo: 'saldo' }
  | { tipo: 'nome'; conta: ContaId }
  | { tipo: 'novaConta' }
  | { tipo: 'pagar'; conta: ContaPagar }
  | { tipo: 'confirmar'; recebiveis: Recebivel[] }
  | { tipo: 'taxas' }
  | { tipo: 'fiado'; conta: ContaDoCliente };

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');

export function TelaFinanceiro({ api, papel, fuso = FUSO_PADRAO, agora = () => new Date(), aoMudarRegras }: Props) {
  const hoje = diaNoFuso(agora(), fuso);
  const [parte, setParte] = useState<Parte>('banco');
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { estado } = usarCarga(async () => {
    const [resumo, config] = await Promise.all([api.resumoFinanceiro(), api.lerConfiguracao().catch(() => null)]);
    return {
      resumo,
      categorias: config?.regras.financeiro.categoriasDespesa ?? [...CATEGORIAS_DESPESA_PADRAO],
    };
  }, [api]);
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const resumo = dados?.resumo ?? null;
  // os nomes vêm do resumo (o servidor manda o nome que a loja deu a cada conta)
  const nomeCaixa = resumo?.contas.find((c) => c.id === 'caixa')?.nome ?? NOME_CONTA.caixa;
  const nomeBanco = resumo?.contas.find((c) => c.id === 'banco')?.nome ?? NOME_CONTA.banco;
  const nomes: NomesDasContas = useMemo(() => ({ caixa: nomeCaixa, banco: nomeBanco }), [nomeCaixa, nomeBanco]);
  const renomeia = pode(papel, 'loja.configurar');

  const concluir = (texto: string) => {
    setJanela(null);
    setErro(null);
    setAviso(texto);
    avisarQueOsDadosMudaram(); // cards, extrato, listas e a Visão geral leem de novo
  };
  async function abrirFiado(clienteId: string) {
    setErro(null);
    try {
      setJanela({ tipo: 'fiado', conta: await api.contaDoCliente(clienteId) });
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }

  return (
    <ContextoNomesDasContas.Provider value={nomes}>
      <div className="rel fin">
        <header className="vg-topo pe-topo">
          <div>
            <h1>Financeiro</h1>
            <p className="suave">Saldo de cada conta, extrato como o do banco, contas a receber e a pagar.</p>
          </div>
          {resumo && (
            <div className="pe-topo-acoes">
              <button type="button" className="botao" onClick={() => setJanela({ tipo: 'taxas' })}>
                Taxas da maquininha
              </button>
              {resumo.contas.some((c) => !c.temSaldoInicial) && (
                <button type="button" className="botao" onClick={() => setJanela({ tipo: 'saldo' })}>
                  Saldo inicial
                </button>
              )}
              <button type="button" className="botao botao-primario" onClick={() => setJanela({ tipo: 'lancamento' })}>
                + Novo lançamento
              </button>
            </div>
          )}
        </header>

        {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
          <p className="alerta alerta-erro" role="alert">
            {estado.mensagem}
          </p>
        ) : !resumo ? (
          <p className="vazio">Carregando…</p>
        ) : (
          <>
            {aviso && (
              <AvisoComIcone tipo="ok" papel="status">
                {aviso}
              </AvisoComIcone>
            )}
            {erro && (
              <AvisoComIcone tipo="erro" papel="alert">
                {erro}
              </AvisoComIcone>
            )}
            <Cards resumo={resumo} parte={parte} renomeia={renomeia} aoEscolher={setParte} aoRenomear={(conta) => setJanela({ tipo: 'nome', conta })} />
            {(parte === 'caixa' || parte === 'banco') && <Extrato key={parte} api={api} conta={parte} nomes={nomes} hoje={hoje} fuso={fuso} />}
            {parte === 'receber' && (
              <AReceber
                api={api}
                resumo={resumo}
                nomes={nomes}
                hoje={hoje}
                fuso={fuso}
                aoConfirmar={(recebiveis) => setJanela({ tipo: 'confirmar', recebiveis })}
                aoReceberFiado={(id) => void abrirFiado(id)}
                aoTaxas={() => setJanela({ tipo: 'taxas' })}
              />
            )}
            {parte === 'pagar' && (
              <APagar
                api={api}
                nomes={nomes}
                hoje={hoje}
                fuso={fuso}
                aoPagar={(conta) => setJanela({ tipo: 'pagar', conta })}
                aoNova={() => setJanela({ tipo: 'novaConta' })}
              />
            )}
          </>
        )}

        {janela?.tipo === 'lancamento' && resumo && dados && (
          <ModalLancamento
            api={api}
            contas={resumo.contas}
            nomes={nomes}
            categorias={dados.categorias}
            aoConcluir={concluir}
            aoFechar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === 'saldo' && resumo && (
          <ModalSaldoInicial api={api} contas={resumo.contas} nomes={nomes} aoConcluir={concluir} aoFechar={() => setJanela(null)} />
        )}
        {janela?.tipo === 'nome' && (
          <ModalNomeDaConta
            api={api}
            conta={janela.conta}
            nomes={nomes}
            aoConcluir={(texto) => {
              concluir(texto);
              aoMudarRegras?.();
            }}
            aoFechar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === 'novaConta' && dados && (
          <ModalNovaContaAPagar api={api} categorias={dados.categorias} hoje={hoje} aoConcluir={concluir} aoFechar={() => setJanela(null)} />
        )}
        {janela?.tipo === 'pagar' && <ModalPagarConta api={api} conta={janela.conta} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
        {janela?.tipo === 'confirmar' && (
          <ModalConfirmarRecebimento api={api} recebiveis={janela.recebiveis} nomes={nomes} aoConcluir={concluir} aoFechar={() => setJanela(null)} />
        )}
        {janela?.tipo === 'taxas' && <ModalTaxasMaquininha api={api} papel={papel} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
        {janela?.tipo === 'fiado' && <ModalReceberFiado api={api} conta={janela.conta} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
      </div>
    </ContextoNomesDasContas.Provider>
  );
}

// ------------------------------------------------------------------ cards
function Cards({
  resumo,
  parte,
  renomeia,
  aoEscolher,
  aoRenomear,
}: {
  resumo: ResumoFinanceiro;
  parte: Parte;
  renomeia: boolean;
  aoEscolher: (p: Parte) => void;
  aoRenomear: (c: ContaId) => void;
}) {
  const aReceber = resumo.aReceber.totalCentavos + resumo.fiado.totalCentavos;
  const vencidosReceber = resumo.aReceber.vencidos + resumo.fiado.vencidos;
  const botao = (p: Parte, rotulo: string, valor: number, nota: string, negativo = false) => (
    <button type="button" className="fin-card-abrir" aria-pressed={parte === p} onClick={() => aoEscolher(p)}>
      <span className="fin-card-rotulo">{rotulo}</span>
      <strong className={negativo ? 'fin-card-valor fin-sai' : 'fin-card-valor'}>{formatarCentavos(valor)}</strong>
      <span className="fin-card-nota">{nota}</span>
    </button>
  );
  return (
    <div className="fin-cards" role="group" aria-label="Saldos e totais">
      <div className="fin-card fin-card-total">
        <span className="fin-card-rotulo">Saldo total</span>
        <strong className={resumo.totalCentavos < 0 ? 'fin-card-valor fin-sai' : 'fin-card-valor'} data-testid="fin-total">
          {formatarCentavos(resumo.totalCentavos)}
        </strong>
        <span className="fin-card-nota">{resumo.contas.map((c) => c.nome).join(' + ')}</span>
      </div>
      {resumo.contas.map((c) => (
        <div key={c.id} className={parte === c.id ? 'fin-card fin-card-on' : 'fin-card'}>
          {botao(c.id, c.nome, c.saldoCentavos, parte === c.id ? 'extrato aberto abaixo' : 'ver extrato', c.saldoCentavos < 0)}
          {renomeia && (
            <button
              type="button"
              className="fin-renomear"
              onClick={() => aoRenomear(c.id)}
              aria-label={`Trocar o nome de ${c.nome}`}
              title="Trocar o nome da conta"
            >
              ✎
            </button>
          )}
        </div>
      ))}
      <div className={parte === 'receber' ? 'fin-card fin-card-on' : 'fin-card'}>
        {botao(
          'receber',
          'A receber',
          aReceber,
          `cartão ${formatarCentavos(resumo.aReceber.totalCentavos)} • fiado ${formatarCentavos(resumo.fiado.totalCentavos)}${vencidosReceber > 0 ? ` • ${plural(vencidosReceber, 'vencido', 'vencidos')}` : ''}`,
        )}
      </div>
      <div className={parte === 'pagar' ? 'fin-card fin-card-on' : 'fin-card'}>
        {botao(
          'pagar',
          'A pagar',
          resumo.aPagar.totalCentavos,
          resumo.aPagar.quantidade === 0
            ? 'nenhuma conta em aberto'
            : `${plural(resumo.aPagar.quantidade, 'conta', 'contas')}${resumo.aPagar.vencidas > 0 ? ` • ${plural(resumo.aPagar.vencidas, 'vencida', 'vencidas')}` : ''}`,
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ extrato
type Periodo = 'hoje' | '7dias' | 'mes' | 'mesPassado' | 'personalizado';
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7dias', rotulo: 'Últimos 7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mesPassado', rotulo: 'Mês passado' },
  { id: 'personalizado', rotulo: 'Escolher datas' },
];
const doisDigitos = (n: number) => String(n).padStart(2, '0');

function intervalo(p: Exclude<Periodo, 'personalizado'>, hoje: string): { de: string; ate: string } {
  const [a, m] = hoje.split('-').map(Number) as [number, number];
  const inicioDoMes = `${a}-${doisDigitos(m)}-01`;
  if (p === 'hoje') return { de: hoje, ate: hoje };
  if (p === '7dias') return { de: somarDias(hoje, -6), ate: hoje };
  if (p === 'mes') return { de: inicioDoMes, ate: hoje };
  const anterior = m === 1 ? `${a - 1}-12-01` : `${a}-${doisDigitos(m - 1)}-01`;
  return { de: anterior, ate: somarDias(inicioDoMes, -1) };
}

/** Sinal e valor, como no extrato do banco: "+ R$ 50,00" e "− R$ 30,00". */
const comSinal = (v: number) => `${v < 0 ? '−' : '+'} ${formatarCentavos(Math.abs(v))}`;

function Extrato({
  api,
  conta,
  nomes,
  hoje,
  fuso,
}: {
  api: Pick<ApiPainel, 'extratoDaConta'>;
  conta: ContaId;
  nomes: NomesDasContas;
  hoje: string;
  fuso: string;
}) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [de, setDe] = useState(() => intervalo('mes', hoje).de);
  const [ate, setAte] = useState(hoje);
  const [mostrar, setMostrar] = useState<'tudo' | 'entradas' | 'saidas'>('tudo');
  const [busca, setBusca] = useState('');
  const faixa = periodo === 'personalizado' ? { de, ate } : intervalo(periodo, hoje);
  const datasOk = /^\d{4}-\d{2}-\d{2}$/.test(faixa.de) && /^\d{4}-\d{2}-\d{2}$/.test(faixa.ate) && faixa.de <= faixa.ate;
  const { estado } = usarCarga(
    () => (datasOk ? api.extratoDaConta({ conta, de: faixa.de, ate: faixa.ate }) : Promise.reject(new ErroApi(400, 'A data inicial é depois da final.'))),
    [api, conta, faixa.de, faixa.ate, datasOk],
  );
  const x = estado.tipo === 'pronto' ? estado.dados : null;
  const termo = semAcento(busca.trim());
  const linhas = useMemo(
    () =>
      (x?.linhas ?? []).filter((l) => {
        if (mostrar === 'entradas' && l.lancamento.valorCentavos < 0) return false;
        if (mostrar === 'saidas' && l.lancamento.valorCentavos >= 0) return false;
        if (!termo) return true;
        const texto = semAcento(`${NOME_LANCAMENTO[l.lancamento.tipo]} ${l.lancamento.descricao} ${l.lancamento.categoria ?? ''} ${l.lancamento.por.nome}`);
        return texto.includes(termo);
      }),
    [x, mostrar, termo],
  );
  const filtrando = mostrar !== 'tudo' || Boolean(termo);

  return (
    <section className="card card-plano fin-extrato" aria-labelledby="fin-extrato-titulo">
      <div className="card-cabeca">
        <h2 id="fin-extrato-titulo">Extrato {contaNaFrase(conta, nomes, 'de')}</h2>
        {x && <span className="suave">{x.de === x.ate ? dataBr(x.de) : `${dataBr(x.de)} a ${dataBr(x.ate)}`}</span>}
      </div>
      <div className="fin-filtros">
        <div className="campo">
          <label htmlFor="fin-periodo">Período</label>
          <select id="fin-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        {periodo === 'personalizado' && (
          <>
            <div className="campo">
              <label htmlFor="fin-de">De</label>
              <input id="fin-de" type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="fin-ate">Até</label>
              <input id="fin-ate" type="date" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} />
            </div>
          </>
        )}
        <div className="campo">
          <label htmlFor="fin-mostrar">Mostrar</label>
          <select id="fin-mostrar" value={mostrar} onChange={(e) => setMostrar(e.target.value as typeof mostrar)}>
            <option value="tudo">Tudo</option>
            <option value="entradas">Só entradas</option>
            <option value="saidas">Só saídas</option>
          </select>
        </div>
        <div className="campo fin-busca">
          <label htmlFor="fin-busca">Buscar</label>
          <input id="fin-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, categoria ou quem lançou" />
        </div>
      </div>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro fin-dentro" role="alert">
          {estado.mensagem}
        </p>
      ) : !x ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <>
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas fin-tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Lançamento</th>
                  <th className="numero">Valor</th>
                  <th className="numero">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="fin-linha-saldo">
                  <td data-rotulo="Data">{dataBr(x.de)}</td>
                  <td data-rotulo="Lançamento">Saldo anterior</td>
                  <td data-rotulo="Valor" className="numero" />
                  <td data-rotulo="Saldo" className="numero">
                    {formatarCentavos(x.saldoAnteriorCentavos)}
                  </td>
                </tr>
                {linhas.map((l) => (
                  <LinhaExtrato key={l.lancamento.id} l={l} fuso={fuso} />
                ))}
                {linhas.length === 0 && (
                  <tr className="tabela-vazia">
                    <td colSpan={4}>{filtrando ? 'Nenhum lançamento com esse filtro no período.' : 'Nenhum lançamento no período.'}</td>
                  </tr>
                )}
                <tr className="fin-linha-saldo">
                  <td data-rotulo="Data">{dataBr(x.ate)}</td>
                  <td data-rotulo="Lançamento">Saldo em {dataBr(x.ate)}</td>
                  <td data-rotulo="Valor" className="numero" />
                  <td data-rotulo="Saldo" className={x.saldoFinalCentavos < 0 ? 'numero fin-sai' : 'numero'}>
                    {formatarCentavos(x.saldoFinalCentavos)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="fin-totais" aria-label="Totais do período">
            <span>
              Entradas <b className="fin-entra">{formatarCentavos(x.entradasCentavos)}</b>
            </span>
            <span>
              Saídas <b className="fin-sai">{formatarCentavos(x.saidasCentavos)}</b>
            </span>
            <span>
              Saldo final <b>{formatarCentavos(x.saldoFinalCentavos)}</b>
            </span>
          </p>
        </>
      )}
    </section>
  );
}

function LinhaExtrato({ l, fuso }: { l: LinhaDoExtrato; fuso: string }) {
  const { lancamento: x } = l;
  const lancadoNoutroDia = diaNoFuso(x.criadoEm, fuso) !== l.dia;
  const detalhes = [
    x.descricao && x.descricao !== NOME_LANCAMENTO[x.tipo] ? x.descricao : null,
    x.categoria,
    `por ${x.por.nome}${x.autorizadoPor ? ` (autorizou ${x.autorizadoPor.nome})` : ''}`,
    lancadoNoutroDia ? `lançado em ${dataBr(diaNoFuso(x.criadoEm, fuso))}` : null,
  ].filter(Boolean);
  return (
    <tr>
      <td data-rotulo="Data">
        {dataBr(l.dia)}
        {!lancadoNoutroDia && <small className="fin-hora">{horaNoFuso(x.criadoEm, fuso)}</small>}
      </td>
      <td data-rotulo="Lançamento" className="fin-desc">
        <b>{NOME_LANCAMENTO[x.tipo]}</b>
        <small>{detalhes.join(' • ')}</small>
      </td>
      <td data-rotulo="Valor" className={x.valorCentavos < 0 ? 'numero fin-sai' : 'numero fin-entra'}>
        {comSinal(x.valorCentavos)}
      </td>
      <td data-rotulo="Saldo" className={l.saldoCentavos < 0 ? 'numero fin-sai' : 'numero'}>
        {formatarCentavos(l.saldoCentavos)}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ a receber
function AReceber({
  api,
  resumo,
  nomes,
  hoje,
  fuso,
  aoConfirmar,
  aoReceberFiado,
  aoTaxas,
}: {
  api: Pick<ApiPainel, 'listarRecebiveis' | 'listarFiado'>;
  resumo: ResumoFinanceiro;
  nomes: NomesDasContas;
  hoje: string;
  fuso: string;
  aoConfirmar: (r: Recebivel[]) => void;
  aoReceberFiado: (clienteId: string) => void;
  aoTaxas: () => void;
}) {
  const { estado } = usarCarga(async () => {
    const [recebiveis, fiado] = await Promise.all([api.listarRecebiveis({ situacao: 'pendente' }), api.listarFiado().catch(() => null)]);
    return {
      cartao: recebiveis.filter((r) => r.forma !== 'fiado' && liquidoAReceber(r) > 0),
      fiado,
    };
  }, [api]);
  const d = estado.tipo === 'pronto' ? estado.dados : null;
  const vencidos = d?.cartao.filter((r) => r.venceEm <= hoje) ?? [];
  const devendo = d?.fiado?.linhas.filter((l) => l.devendoCentavos > 0) ?? [];

  return (
    <>
      <AvisoComIcone
        tipo={resumo.baixaAutomatica ? 'ok' : 'atencao'}
        papel="status"
        acao={
          <button type="button" className="botao" onClick={aoTaxas}>
            Taxas da maquininha
          </button>
        }
      >
        {resumo.baixaAutomatica
          ? `Baixa automática: as vendas no cartão entram ${contaNaFrase('banco', nomes, 'em')} na hora, já sem a taxa. Não há o que confirmar aqui.`
          : 'Baixa manual: cada venda no cartão fica a receber até alguém confirmar o depósito da operadora (o prazo de cada cartão está nas taxas da maquininha).'}
      </AvisoComIcone>
      <section className="card card-plano" aria-labelledby="fin-cartao-titulo">
        <div className="card-cabeca">
          <h2 id="fin-cartao-titulo">Cartão (maquininha)</h2>
          {d && d.cartao.length > 0 && (
            <span className="fin-cabeca-acoes">
              <span className="suave">{`${formatarCentavos(resumo.aReceber.totalCentavos)} em ${plural(d.cartao.length, 'recebimento', 'recebimentos')}`}</span>
              {vencidos.length > 0 && (
                <button type="button" className="botao botao-primario" onClick={() => aoConfirmar(vencidos)}>
                  Confirmar os vencidos ({vencidos.length})
                </button>
              )}
            </span>
          )}
        </div>
        {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
          <p className="alerta alerta-erro fin-dentro" role="alert">
            {estado.mensagem}
          </p>
        ) : !d ? (
          <p className="vazio">Carregando…</p>
        ) : d.cartao.length === 0 ? (
          <p className="vazio">Nenhum recebimento de cartão a confirmar.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas fin-tabela-receber">
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Forma</th>
                  <th className="numero">Bruto</th>
                  <th className="numero">Taxa</th>
                  <th className="numero">Líquido</th>
                  <th>Cai em</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {d.cartao.map((r) => (
                  <tr key={r.id}>
                    <td data-rotulo="Venda">
                      {formatarNumeroVenda(r.vendaNumero)} <small className="suave">{dataBr(diaNoFuso(r.criadoEm, fuso))}</small>
                    </td>
                    <td data-rotulo="Forma">{NOME_FORMA_PAGAMENTO[r.forma]}</td>
                    <td data-rotulo="Bruto" className="numero">
                      {formatarCentavos(r.brutoCentavos - r.estornadoBrutoCentavos)}
                    </td>
                    <td data-rotulo="Taxa" className="numero">
                      {formatarCentavos(r.taxaCentavos - r.estornadoTaxaCentavos)}
                    </td>
                    <td data-rotulo="Líquido" className="numero">
                      <b>{formatarCentavos(liquidoAReceber(r))}</b>
                    </td>
                    <td data-rotulo="Cai em">
                      {dataBr(r.venceEm)}
                        {r.venceEm <= hoje && <span className="pe-situacao pe-zerado">vencido</span>}
                    </td>
                    <td data-rotulo="Ação">
                      <button
                        type="button"
                        className="botao"
                        onClick={() => aoConfirmar([r])}
                        aria-label={`Confirmar o recebimento da venda ${formatarNumeroVenda(r.vendaNumero)}`}
                      >
                        Confirmar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card card-plano" aria-labelledby="fin-fiado-titulo">
        <div className="card-cabeca">
          <h2 id="fin-fiado-titulo">Fiado (clientes)</h2>
          <span className="suave">
            {formatarCentavos(resumo.fiado.totalCentavos)}
            {resumo.fiado.vencidos > 0 && ` • ${formatarCentavos(resumo.fiado.vencidosCentavos)} vencido`}
          </span>
        </div>
        {!d ? (
          <p className="vazio">Carregando…</p>
        ) : devendo.length === 0 ? (
          <p className="vazio">Nenhum cliente devendo no fiado.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="numero">Deve</th>
                  <th className="numero">Vencido</th>
                  <th>Vence primeiro</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {devendo.map((l) => (
                  <tr key={l.clienteId}>
                    <td data-rotulo="Cliente">{l.nome}</td>
                    <td data-rotulo="Deve" className="numero">
                      <b>{formatarCentavos(l.devendoCentavos)}</b>
                    </td>
                    <td data-rotulo="Vencido" className={l.vencidoCentavos > 0 ? 'numero fin-sai' : 'numero'}>
                      {l.vencidoCentavos > 0 ? `${formatarCentavos(l.vencidoCentavos)} (${plural(l.diasVencido, 'dia', 'dias')})` : '—'}
                    </td>
                    <td data-rotulo="Vence primeiro">{dataBr(l.maisAntiga.venceEm)}</td>
                    <td data-rotulo="Ação">
                      <button type="button" className="botao" onClick={() => aoReceberFiado(l.clienteId)} aria-label={`Receber o fiado de ${l.nome}`}>
                        Receber
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fin-nota">Para cobrar pelo WhatsApp e ver o extrato de cada cliente, use Clientes → Fiado.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ a pagar
function APagar({
  api,
  nomes,
  hoje,
  fuso,
  aoPagar,
  aoNova,
}: {
  api: Pick<ApiPainel, 'listarContasAPagar'>;
  nomes: NomesDasContas;
  hoje: string;
  fuso: string;
  aoPagar: (c: ContaPagar) => void;
  aoNova: () => void;
}) {
  const [filtro, setFiltro] = useState<'aberta' | 'paga' | 'todas'>('aberta');
  const { estado } = usarCarga(() => api.listarContasAPagar(filtro === 'todas' ? {} : { situacao: filtro }), [api, filtro]);
  const contas = estado.tipo === 'pronto' ? estado.dados : null;
  // pagas: a mais recente primeiro
  const lista = contas && filtro === 'paga' ? [...contas].sort((a, b) => (b.pagamento?.em ?? '').localeCompare(a.pagamento?.em ?? '')) : contas;

  return (
    <section className="card card-plano" aria-labelledby="fin-pagar-titulo">
      <div className="card-cabeca">
        <h2 id="fin-pagar-titulo">Contas a pagar</h2>
        <span className="fin-cabeca-acoes">
          <span className="cli-abas" role="group" aria-label="Quais contas">
            {(
              [
                ['aberta', 'Em aberto'],
                ['paga', 'Pagas'],
                ['todas', 'Todas'],
              ] as const
            ).map(([id, rotulo]) => (
              <button key={id} type="button" className={filtro === id ? 'cli-aba-on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                {rotulo}
              </button>
            ))}
          </span>
          <button type="button" className="botao botao-primario" onClick={aoNova}>
            + Nova conta a pagar
          </button>
        </span>
      </div>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro fin-dentro" role="alert">
          {estado.mensagem}
        </p>
      ) : !lista ? (
        <p className="vazio">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="vazio">
          {filtro === 'aberta'
            ? 'Nenhuma conta a pagar em aberto. As compras a prazo entram sozinhas; aluguel, energia e boletos, em “+ Nova conta a pagar”.'
            : 'Nenhuma conta aqui.'}
        </p>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela tabela-vendas">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Vencimento</th>
                <th className="numero">Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td data-rotulo="Conta" className="fin-desc">
                    <b>{c.descricao}</b>
                    <small>{[c.compraId ? 'compra a prazo' : 'conta avulsa', c.categoria].filter(Boolean).join(' • ')}</small>
                  </td>
                  <td data-rotulo="Vencimento">
                    {dataBr(c.vencimento)}
                      {c.situacao === 'aberta' && c.vencimento < hoje && <span className="pe-situacao pe-zerado">vencida</span>}
                    {c.situacao === 'aberta' && c.vencimento === hoje && <span className="pe-situacao pe-baixo">vence hoje</span>}
                  </td>
                  <td data-rotulo="Valor" className="numero">
                    {formatarCentavos(c.situacao === 'cancelada' ? c.valorOriginalCentavos : c.valorCentavos)}
                  </td>
                  <td data-rotulo="Situação">
                    {c.situacao === 'aberta' ? (
                      <button type="button" className="botao" onClick={() => aoPagar(c)} aria-label={`Pagar ${c.descricao}`}>
                        Pagar
                      </button>
                    ) : c.situacao === 'paga' && c.pagamento ? (
                      <span className="suave">
                        paga em {dataBr(diaNoFuso(c.pagamento.em, fuso))} • {nomes[c.pagamento.conta]}
                      </span>
                    ) : (
                      <span className="suave">cancelada (compra estornada)</span>
                    )}
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
