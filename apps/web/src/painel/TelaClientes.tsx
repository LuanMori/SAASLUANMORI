// apps/web/src/painel/TelaClientes.tsx
// Aba Clientes (Fase 2, módulo 6), como no DaniPets V9.3.3 (pageCustomers):
//   - Clientes: busca (nome, campo extra, CPF ou telefone), filtros, lista com a situação de cada um; a linha
//     abre a CONTA do cliente: cadastro, fiado em aberto e limite, compras, extrato (compras e fiado), receber
//     fiado, editar, desativar, excluir (sem histórico) e excluir os dados (LGPD, só o Dono, com liberação);
//   - Fiado (Dono e Administrador): quem deve, quanto venceu, limite e disponível; receber; lembrar (WhatsApp);
//     aviso do CDC;
//   - Retorno (módulo 7): sumidos e cashback vencendo, com WhatsApp, "Já falei", adiar e "não incomodar", e o
//     resultado dos lembretes;
//   - Regras do programa (módulo 7; o Dono e o Administrador alteram, o Vendedor vê): cashback, retorno e cupom,
//     fiado, campo extra do cadastro (o "Pet" do DaniPets), mensagens do WhatsApp e o regulamento;
//   - no alto: cashback em aberto (e de onde vem), clientes, fiado a receber e para lembrar hoje;
//   - aviso para o Dono e o Administrador quando o Vendedor exclui um cliente (até marcar "Ciente").
// O CPF aparece mascarado; o Dono e o Administrador podem ver o número inteiro na conta (fica no histórico).
import {
  dataBr,
  diaNoFuso,
  formatarCentavos,
  formatarTelefone,
  FUSO_PADRAO,
  type PapelDeLoja,
  pctTexto,
  pode,
  primeiroNome,
  regrasPadrao,
  type TipoContato,
} from '@saas/core';
import { useState } from 'react';
import { type ApiPainel, type ContaDoCliente, ErroApi, type FiltroClientes, type LinhaCliente } from '../api';
import { Modal } from './caixa/Modal';
import { ModalSenha } from './caixa/ModalSenha';
import { AbaRegras } from './clientes/AbaRegras';
import { AbaRetorno } from './clientes/AbaRetorno';
import { ModalCadastroCliente, ModalExcluirCliente, ModalReceberFiado } from './clientes/ModaisCliente';
import { ModalWhatsapp } from './clientes/ModalWhatsapp';
import { ResumoClientes } from './clientes/ResumoClientes';
import { dataNoFuso, plural } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiPainel;
  pessoa: { nome: string; papel: PapelDeLoja };
  fuso?: string;
  agora?: () => Date;
  /** Depois de salvar as regras (a barra e as outras abas leem de novo). */
  aoMudarRegras?: () => void;
}

type Janela =
  | { tipo: 'cadastro'; conta: ContaDoCliente | null }
  | { tipo: 'receber'; conta: Pick<ContaDoCliente, 'cliente' | 'fiado'> }
  | { tipo: 'excluir'; conta: ContaDoCliente }
  | { tipo: 'lgpd'; conta: ContaDoCliente }
  /** Lembrete pelo WhatsApp (módulo 7). */
  | { tipo: 'whatsapp'; clienteId: string; contato: TipoContato }
  | { tipo: 'naoIncomodar'; clienteId: string; nome: string };

type Aba = 'clientes' | 'retorno' | 'fiado' | 'regras';

const FILTROS: { valor: FiltroClientes; rotulo: string; permissao?: 'clientes.fiado' | 'clientes.desativar' }[] = [
  { valor: 'todos', rotulo: 'Todos os clientes' },
  { valor: 'cashback', rotulo: 'Com cashback' },
  { valor: 'fiado', rotulo: 'Com fiado em aberto', permissao: 'clientes.fiado' },
  { valor: 'vencido', rotulo: 'Com fiado vencido', permissao: 'clientes.fiado' },
  { valor: 'incompleto', rotulo: 'Cadastro incompleto' },
  { valor: 'sumidos', rotulo: 'Sem comprar há muito tempo' },
  { valor: 'nao_incomodar', rotulo: 'Não incomodar' },
  { valor: 'desativados', rotulo: 'Desativados', permissao: 'clientes.desativar' },
];

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');
const diasDesde = (iso: string, hoje: string, fuso: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${diaNoFuso(iso, fuso)}T12:00:00Z`)) / 86_400_000);
const haDias = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`);

export function TelaClientes({ api, pessoa, fuso = FUSO_PADRAO, agora = () => new Date(), aoMudarRegras }: Props) {
  const veFiado = pode(pessoa.papel, 'clientes.fiado');
  const gestor = pode(pessoa.papel, 'clientes.desativar');
  const [aba, setAba] = useState<Aba>('clientes');
  const [ocupado, setOcupado] = useState(false);
  const [termo, setTermo] = useState('');
  const [filtro, setFiltro] = useState<FiltroClientes>('todos');
  const [contaId, setContaId] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = diaNoFuso(agora(), fuso);

  const { estado: estadoLista, recarregar: recarregarLista } = usarCarga(() => api.listarContasDeClientes({ termo, filtro }), [api, termo, filtro]);
  const { estado: estadoConfig, recarregar: recarregarConfig } = usarCarga(() => api.lerConfiguracao(), [api]);
  const { estado: estadoAvisos, recarregar: recarregarAvisos } = usarCarga(() => (gestor ? api.listarAvisosDeClientes() : Promise.resolve([])), [api, gestor]);
  const { estado: estadoFiado, recarregar: recarregarFiado } = usarCarga(() => (veFiado ? api.listarFiado() : Promise.resolve(null)), [api, veFiado]);
  const { estado: estadoConta, recarregar: recarregarConta } = usarCarga(() => (contaId ? api.contaDoCliente(contaId) : Promise.resolve(null)), [api, contaId]);
  // fidelidade (módulo 7): lista de retorno, cashback em aberto e o total de clientes (para o resumo do alto)
  const { estado: estadoRetorno, recarregar: recarregarRetorno } = usarCarga(() => api.listarRetorno(), [api]);
  const { estado: estadoCashback, recarregar: recarregarCashback } = usarCarga(() => api.resumoDoCashback(), [api]);
  const { estado: estadoTotal, recarregar: recarregarTotal } = usarCarga(() => api.listarContasDeClientes({}), [api]);
  const regras = estadoConfig.tipo === 'pronto' ? estadoConfig.dados.regras : regrasPadrao();
  const nomeLoja = estadoConfig.tipo === 'pronto' ? estadoConfig.dados.dados.nome : '';
  const rotuloExtra = regras.clientes.campoExtra.ativo ? regras.clientes.campoExtra.rotulo : null;
  const avisos = estadoAvisos.tipo === 'pronto' ? estadoAvisos.dados.filter((a) => !a.ciente) : [];

  const recarregarTudo = () => {
    void recarregarLista();
    void recarregarFiado();
    void recarregarConta();
    void recarregarAvisos();
    void recarregarRetorno();
    void recarregarCashback();
    void recarregarTotal();
  };
  const concluir = (texto: string) => {
    setErro(null);
    setAviso(texto);
    setJanela(null);
    recarregarTudo();
  };
  const falhou = (e: unknown) => {
    setAviso(null);
    setErro(mensagemDe(e));
  };
  const abrirConta = (id: string) => {
    setAviso(null);
    setErro(null);
    setContaId(id);
  };
  const irPara = (a: Aba) => {
    setContaId(null);
    setAba(a);
  };
  /** Uma ação por vez (o segundo clique de um duplo clique é ignorado, como no DaniPets). */
  async function fazer(acao: () => Promise<string>) {
    if (ocupado) return;
    setOcupado(true);
    try {
      concluir(await acao());
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  }
  const acoesRetorno = {
    ocupado,
    aoAbrir: abrirConta,
    aoWhatsapp: (clienteId: string, contato: TipoContato) => setJanela({ tipo: 'whatsapp', clienteId, contato }),
    aoFalei: (clienteId: string, contato: TipoContato, nome: string) =>
      void fazer(async () => {
        await api.registrarContato(clienteId, { tipo: contato, canal: 'outro' });
        return `Contato com ${primeiroNome(nome)} registrado.`;
      }),
    aoAdiar: (clienteId: string, nome: string) =>
      void fazer(async () => {
        const r = await api.adiarLembrete(clienteId);
        return `${primeiroNome(nome)} volta para a lista em ${dataBr(r.ate)}.`;
      }),
    aoNaoIncomodar: (clienteId: string, nome: string) => setJanela({ tipo: 'naoIncomodar', clienteId, nome }),
  };

  async function conferirAviso(id: string) {
    try {
      await api.conferirAvisoDeCliente(id);
      void recarregarAvisos();
    } catch (e) {
      falhou(e);
    }
  }

  const conta = contaId && estadoConta.tipo === 'pronto' ? estadoConta.dados : null;

  return (
    <div className="rel clientes">
      <header className="vg-topo pe-topo">
        <div>
          <h1>Clientes</h1>
          <p className="suave">Cadastro, conta de cada cliente, cashback, retorno, fiado e extrato. O CPF aparece oculto.</p>
        </div>
        <div className="pe-topo-acoes">
          <button type="button" className="botao botao-primario" onClick={() => setJanela({ tipo: 'cadastro', conta: null })}>
            + Novo cliente
          </button>
        </div>
      </header>

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
      {avisos.map((a) => (
        <div key={a.id} className="alerta alerta-aviso cli-aviso" role="status">
          <span>
            {a.por.nome} excluiu o cliente <b>{a.clienteNome}</b> ({formatarTelefone(a.telefone)}) em {dataNoFuso(a.em, fuso)}. Motivo: {a.motivo}.
          </span>
          <button type="button" className="botao" onClick={() => void conferirAviso(a.id)}>
            Ciente
          </button>
        </div>
      ))}

      <ResumoClientes
        cashback={estadoCashback}
        retorno={estadoRetorno}
        totalClientes={estadoTotal.tipo === 'pronto' ? estadoTotal.dados.total : null}
        fiado={
          veFiado && estadoFiado.tipo === 'pronto' && estadoFiado.dados
            ? { devendoCentavos: estadoFiado.dados.linhas.reduce((t, l) => t + l.devendoCentavos, 0), vencidoCentavos: estadoFiado.dados.linhas.reduce((t, l) => t + l.vencidoCentavos, 0) }
            : null
        }
        aoIrPara={irPara}
      />

      {contaId ? (
        <Conta
          estado={estadoConta}
          conta={conta}
          papel={pessoa.papel}
          rotuloExtra={rotuloExtra}
          api={api}
          fuso={fuso}
          hoje={hoje}
          aoVoltar={() => setContaId(null)}
          aoJanela={setJanela}
          aoConcluir={concluir}
          aoFalhar={falhou}
        />
      ) : (
        <>
          <nav className="cli-abas" aria-label="Seções de Clientes">
            <button type="button" className={aba === 'clientes' ? 'cli-aba-on' : ''} aria-current={aba === 'clientes' ? 'page' : undefined} onClick={() => setAba('clientes')}>
              Clientes{estadoTotal.tipo === 'pronto' ? <span className="cli-contagem">{estadoTotal.dados.total}</span> : null}
            </button>
            <button type="button" className={aba === 'retorno' ? 'cli-aba-on' : ''} aria-current={aba === 'retorno' ? 'page' : undefined} onClick={() => setAba('retorno')}>
              Retorno{estadoRetorno.tipo === 'pronto' ? <span className="cli-contagem">{estadoRetorno.dados.retorno.length + estadoRetorno.dados.cashback.length}</span> : null}
            </button>
            {veFiado && (
              <button type="button" className={aba === 'fiado' ? 'cli-aba-on' : ''} aria-current={aba === 'fiado' ? 'page' : undefined} onClick={() => setAba('fiado')}>
                Fiado{estadoFiado.tipo === 'pronto' && estadoFiado.dados ? <span className="cli-contagem">{estadoFiado.dados.linhas.length}</span> : null}
              </button>
            )}
            <button type="button" className={aba === 'regras' ? 'cli-aba-on' : ''} aria-current={aba === 'regras' ? 'page' : undefined} onClick={() => setAba('regras')}>
              Regras do programa
            </button>
          </nav>
          {aba === 'retorno' ? (
            <AbaRetorno estado={estadoRetorno} acoes={acoesRetorno} />
          ) : aba === 'regras' ? (
            estadoConfig.tipo === 'pronto' ? (
              <AbaRegras
                key={JSON.stringify(estadoConfig.dados.regras)}
                api={api}
                regras={regras}
                nomeLoja={nomeLoja}
                podeAlterar={pode(pessoa.papel, 'loja.configurar')}
                aoSalvar={(t) => {
                  void recarregarConfig();
                  aoMudarRegras?.();
                  concluir(t);
                }}
              />
            ) : (
              <p className="vazio">Carregando…</p>
            )
          ) : aba === 'clientes' || !veFiado ? (
            <section className="card card-plano" aria-labelledby="cli-lista-titulo">
              <div className="card-cabeca cli-barra">
                <h2 id="cli-lista-titulo">Clientes</h2>
                <div className="cli-ferramentas">
                  <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar nome, CPF ou telefone" aria-label="Buscar cliente" maxLength={80} />
                  <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroClientes)} aria-label="Filtrar clientes">
                    {FILTROS.filter((f) => !f.permissao || pode(pessoa.papel, f.permissao)).map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ListaClientes
                estado={estadoLista}
                veFiado={veFiado}
                rotuloExtra={rotuloExtra}
                fuso={fuso}
                hoje={hoje}
                diasRetorno={regras.retorno.diasSemComprar}
                aoAbrir={abrirConta}
                vazio={!termo && filtro === 'todos'}
              />
            </section>
          ) : (
            <AbaFiado estado={estadoFiado} hoje={hoje} aoAbrir={abrirConta} aoLembrar={(clienteId) => setJanela({ tipo: 'whatsapp', clienteId, contato: 'cobranca' })} aoReceber={async (id) => {
              try {
                const c = await api.contaDoCliente(id);
                setJanela({ tipo: 'receber', conta: c });
              } catch (e) {
                falhou(e);
              }
            }} />
          )}
        </>
      )}

      {janela?.tipo === 'cadastro' && (
        <ModalCadastroCliente
          api={api}
          cliente={janela.conta?.cliente ?? null}
          papel={pessoa.papel}
          regras={regras}
          hoje={hoje}
          aoSalvar={(c, novo) => {
            concluir(novo ? `${c.nome.split(' ')[0]} foi cadastrado.` : 'Cadastro salvo.');
            if (novo) {
              // a conta do cliente novo abre; "Voltar para a lista" leva à lista de clientes
              setAba('clientes');
              setContaId(c.id);
            }
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'receber' && <ModalReceberFiado api={api} conta={janela.conta} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === 'excluir' && (
        <ModalExcluirCliente
          api={api}
          cliente={janela.conta.cliente}
          papel={pessoa.papel}
          aoConcluir={(t) => {
            setContaId(null);
            concluir(t);
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'lgpd' && (
        <ModalSenha
          api={api}
          liberacao
          acao={{ tipo: 'excluir_dados_cliente', clienteId: janela.conta.cliente.id }}
          texto={`Excluir os dados de ${janela.conta.cliente.nome} (pedido do cliente, LGPD). O nome, o telefone, o CPF e os outros dados serão apagados; as vendas continuam no histórico da loja, sem identificar o cliente.${
            janela.conta.fidelidade.saldoCentavos > 0 ? ` O cliente perde ${formatarCentavos(janela.conta.fidelidade.saldoCentavos)} de cashback.` : ''
          }`}
          aoAutorizar={async (a) => {
            await api.excluirDadosDoCliente(janela.conta.cliente.id, { liberacao: { autorizacao: a.autorizacao, motivo: a.motivo } });
            setContaId(null);
            concluir('Dados do cliente excluídos. As vendas continuam, sem identificar o cliente.');
          }}
          aoFechar={() => setJanela(null)}
        />
      )}
      {janela?.tipo === 'whatsapp' && <ModalWhatsapp api={api} clienteId={janela.clienteId} tipo={janela.contato} aoConcluir={concluir} aoFechar={() => setJanela(null)} />}
      {janela?.tipo === 'naoIncomodar' && (
        <Modal titulo="Não incomodar" aoFechar={() => setJanela(null)}>
          <p>{janela.nome} sai das listas de lembrete. Dá para desfazer no cadastro.</p>
          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao-primario"
              disabled={ocupado}
              onClick={() =>
                void fazer(async () => {
                  await api.marcarNaoIncomodar(janela.clienteId);
                  return `${primeiroNome(janela.nome)} não vai receber lembretes.`;
                })
              }
            >
              Confirmar
            </button>
            <button type="button" className="botao" onClick={() => setJanela(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ListaClientes({
  estado,
  veFiado,
  rotuloExtra,
  fuso,
  hoje,
  diasRetorno,
  aoAbrir,
  vazio,
}: {
  estado: ReturnType<typeof usarCarga<{ clientes: LinhaCliente[]; total: number }>>['estado'];
  veFiado: boolean;
  rotuloExtra: string | null;
  fuso: string;
  hoje: string;
  /** Regra da loja: depois de quantos dias sem comprar o cliente aparece como "sem comprar há N dias". */
  diasRetorno: number;
  aoAbrir: (id: string) => void;
  vazio: boolean;
}) {
  if (estado.tipo === 'bloqueado' || estado.tipo === 'falhou') {
    return (
      <p className="alerta alerta-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }
  if (estado.tipo !== 'pronto') return <p className="vazio">Carregando…</p>;
  const { clientes, total } = estado.dados;
  if (clientes.length === 0) return <p className="vazio">{vazio ? 'Nenhum cliente cadastrado ainda. Clique em “+ Novo cliente”.' : 'Nenhum cliente encontrado. Confira a busca ou o filtro.'}</p>;
  return (
    <>
      <div className="tabela-caixa">
        <table className="tabela tabela-vendas cli-tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>CPF</th>
              <th>Última compra</th>
              <th className="numero">Cashback</th>
              {veFiado && <th className="numero">Fiado</th>}
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const tags: { texto: string; classe: string }[] = [];
              if (!c.completo) tags.push({ texto: 'cadastro incompleto', classe: 'pe-baixo' });
              if (c.fiado && c.fiado.vencidoCentavos > 0) tags.push({ texto: 'fiado vencido', classe: 'pe-zerado' });
              if (c.fiado && c.fiado.devendoCentavos > c.fiado.limiteCentavos) tags.push({ texto: 'acima do limite', classe: 'pe-zerado' });
              if (c.naoIncomodar) tags.push({ texto: 'não incomodar', classe: 'cli-tag' });
              const semComprar = c.ultimaCompraEm ? diasDesde(c.ultimaCompraEm, hoje, fuso) : null;
              if (semComprar !== null && semComprar >= diasRetorno) tags.push({ texto: `sem comprar há ${semComprar} dias`, classe: 'pe-baixo' });
              if (!c.ativo) tags.push({ texto: 'desativado', classe: 'cli-tag' });
              if (!tags.length) tags.push({ texto: 'em dia', classe: 'caixa-sem-dif' });
              return (
                <tr key={c.id} className="cli-linha" onClick={() => aoAbrir(c.id)}>
                  <td data-rotulo="Cliente">
                    <button type="button" className="link cli-nome" onClick={() => aoAbrir(c.id)} aria-label={`Abrir a conta de ${c.nome}`}>
                      {c.nome}
                    </button>
                    {rotuloExtra && c.extra && <small className="suave pe-detalhe">{c.extra}</small>}
                  </td>
                  <td data-rotulo="Telefone">
                    {formatarTelefone(c.telefone)}
                    <small className="suave pe-detalhe">{c.whatsapp ? (c.aceitaMensagens ? 'WhatsApp • aceita mensagens' : 'WhatsApp • sem autorização') : 'sem WhatsApp'}</small>
                  </td>
                  <td data-rotulo="CPF">{c.cpfMascarado}</td>
                  <td data-rotulo="Última compra">
                    {c.ultimaCompraEm ? (
                      <>
                        {haDias(diasDesde(c.ultimaCompraEm, hoje, fuso))}
                        <small className="suave pe-detalhe">{dataNoFuso(c.ultimaCompraEm, fuso)}</small>
                      </>
                    ) : (
                      <span className="suave">nunca comprou</span>
                    )}
                  </td>
                  <td data-rotulo="Cashback" className="numero">
                    {c.cashbackCentavos > 0 ? <b className="caixa-sem-dif-texto">{formatarCentavos(c.cashbackCentavos)}</b> : '—'}
                  </td>
                  {veFiado && (
                    <td data-rotulo="Fiado" className="numero">
                      {c.fiado && c.fiado.devendoCentavos > 0 ? (
                        <>
                          <span className={c.fiado.vencidoCentavos > 0 ? 'caixa-dif' : ''}>{formatarCentavos(c.fiado.devendoCentavos)}</span>
                          <small className="suave pe-detalhe">limite {formatarCentavos(c.fiado.limiteCentavos)}</small>
                        </>
                      ) : c.fiado && c.fiado.limiteCentavos > 0 ? (
                        <>
                          —<small className="suave pe-detalhe">limite {formatarCentavos(c.fiado.limiteCentavos)}</small>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td data-rotulo="Situação">
                    {tags.map((t) => (
                      <span key={t.texto} className={`pe-situacao ${t.classe}`}>
                        {t.texto}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="card-rodape">
        {clientes.length < total ? `Mostrando os primeiros ${clientes.length} de ${total}. Use a busca para achar os outros.` : `Mostrando ${plural(total, 'cliente', 'clientes')}.`} Clique no cliente para abrir a
        conta.
      </p>
    </>
  );
}

function Conta({
  estado,
  conta,
  papel,
  rotuloExtra,
  api,
  fuso,
  hoje,
  aoVoltar,
  aoJanela,
  aoConcluir,
  aoFalhar,
}: {
  estado: { tipo: string; mensagem?: string };
  conta: ContaDoCliente | null;
  papel: PapelDeLoja;
  rotuloExtra: string | null;
  api: ApiPainel;
  fuso: string;
  hoje: string;
  aoVoltar: () => void;
  aoJanela: (j: Janela) => void;
  aoConcluir: (t: string) => void;
  aoFalhar: (e: unknown) => void;
}) {
  const [cpf, setCpf] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<'tudo' | 'compras' | 'cashback' | 'fiado' | 'contatos'>('tudo');
  const voltar = (
    <div>
      <button type="button" className="botao" onClick={aoVoltar}>
        ← Voltar para a lista
      </button>
    </div>
  );
  if (estado.tipo === 'bloqueado' || estado.tipo === 'falhou') {
    return (
      <>
        {voltar}
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      </>
    );
  }
  if (!conta) return <>{voltar}<p className="vazio">Carregando…</p></>;
  const c = conta.cliente;
  const f = conta.fiado;
  const fid = conta.fidelidade;
  // "vence em 5 dias" (a compra em aberto que vence primeiro)
  const prox = f.abertos[0];
  const n = prox ? Math.round((Date.parse(`${prox.venceEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000) : null;
  const venceTexto = n === null ? null : n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : `vence em ${n} dias`;
  const limite = conta.limiteFiadoCentavos;

  async function verCpf() {
    if (cpf) return setCpf(null);
    try {
      setCpf((await api.verCpfDoCliente(c.id)).cpf);
    } catch (e) {
      aoFalhar(e);
    }
  }
  async function alternarAtivo() {
    try {
      await api.definirClienteAtivo(c.id, !c.ativo);
      aoConcluir(c.ativo ? `${c.nome} foi desativado: não aparece na busca da Frente de caixa.` : `${c.nome} foi reativado.`);
    } catch (e) {
      aoFalhar(e);
    }
  }
  const cpfInteiro = cpf ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : null;
  const linhas = conta.extrato.filter((l) => extrato === 'tudo' || l.tipo === extrato);

  return (
    <>
      {voltar}
      <section className="card card-plano cli-conta" aria-labelledby="cli-conta-titulo">
        <div className="card-cabeca">
          <h2 id="cli-conta-titulo">{c.nome}</h2>
          <span>
            {!c.ativo && <span className="pe-situacao cli-tag">desativado</span>}
            {c.autorizaMensagens ? <span className="pe-situacao caixa-sem-dif">aceita mensagens</span> : <span className="pe-situacao cli-tag">{c.whatsapp === false ? 'sem WhatsApp' : 'sem autorização para mensagens'}</span>}
            {c.naoIncomodar && <span className="pe-situacao cli-tag">não incomodar</span>}
          </span>
        </div>
        <p className="cli-sub suave">
          {formatarTelefone(c.telefone)}
          {c.whatsapp !== false ? ' · WhatsApp' : ''} · CPF {cpfInteiro ?? c.cpfMascarado}{' '}
          {pode(papel, 'clientes.cpf') && (
            <button type="button" className="link" onClick={() => void verCpf()}>
              {cpf ? 'Ocultar' : 'Mostrar'}
            </button>
          )}{' '}
          · cliente desde {dataNoFuso(c.criadoEm, fuso)}
        </p>
        {fid.cupom && (
          <p className="alerta" role="status">
            Cupom de retorno ativo: {pctTexto(fid.cupom.pct)} de desconto até {dataBr(fid.cupom.venceEm)}. Entra sozinho quando o cliente for identificado na Frente de caixa.
          </p>
        )}
        <div className="caixa-metricas cli-metricas">
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Cashback disponível</span>
            <b className={`caixa-metrica-valor${fid.saldoCentavos > 0 ? ' caixa-sem-dif-texto' : ''}`}>{formatarCentavos(fid.saldoCentavos)}</b>
            <span className="suave">{fid.proximoVencimento ? `${formatarCentavos(fid.proximoVencimento.valorCentavos)} vence em ${dataBr(fid.proximoVencimento.venceEm)}` : 'nada para vencer'}</span>
          </div>
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Fiado em aberto</span>
            <b className={`caixa-metrica-valor${f.vencidoCentavos > 0 ? ' caixa-dif' : ''}`}>{formatarCentavos(f.devendoCentavos)}</b>
            <span className="suave">{f.vencidoCentavos > 0 ? `${formatarCentavos(f.vencidoCentavos)} vencido há ${plural(f.diasVencido, 'dia', 'dias')}` : f.devendoCentavos > 0 ? (venceTexto ?? 'em dia') : 'nada em aberto'}</span>
          </div>
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Limite de fiado</span>
            <b className="caixa-metrica-valor">{formatarCentavos(limite)}</b>
            <span className="suave">{limite > 0 ? `disponível ${formatarCentavos(Math.max(0, limite - f.devendoCentavos))}` : 'sem fiado (só com a liberação de um Dono)'}</span>
          </div>
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Compras</span>
            <b className="caixa-metrica-valor">{conta.resumo.compras}</b>
            <span className="suave">
              {conta.resumo.compras ? `${formatarCentavos(conta.resumo.totalCentavos)} · ticket médio ${formatarCentavos(conta.resumo.ticketMedioCentavos)}` : 'nenhuma ainda'}
            </span>
          </div>
          <div className="caixa-metrica">
            <span className="caixa-metrica-rotulo">Última compra</span>
            <b className="caixa-metrica-valor">{conta.resumo.ultimaCompraEm ? dataNoFuso(conta.resumo.ultimaCompraEm, fuso) : '—'}</b>
            <span className="suave">{conta.resumo.ultimaCompraEm ? haDias(diasDesde(conta.resumo.ultimaCompraEm, hoje, fuso)) : 'nunca comprou'}</span>
          </div>
        </div>
        <div className="cli-acoes">
          {f.devendoCentavos > 0 && pode(papel, 'vender') && (
            <button type="button" className="botao botao-primario" onClick={() => aoJanela({ tipo: 'receber', conta })}>
              Receber fiado
            </button>
          )}
          <button type="button" className="botao" onClick={() => aoJanela({ tipo: 'cadastro', conta })}>
            Editar cadastro
          </button>
          {/* lembretes pelo WhatsApp (módulo 7), como na conta do DaniPets */}
          {fid.sumido && (
            <button type="button" className="botao" disabled={!c.ativo || !c.autorizaMensagens || c.whatsapp === false} onClick={() => aoJanela({ tipo: 'whatsapp', clienteId: c.id, contato: 'retorno' })}>
              Lembrete de retorno
            </button>
          )}
          {fid.vencendoCentavos > 0 && (
            <button type="button" className="botao" disabled={!c.ativo || !c.autorizaMensagens || c.whatsapp === false} onClick={() => aoJanela({ tipo: 'whatsapp', clienteId: c.id, contato: 'cashback' })}>
              Avisar cashback
            </button>
          )}
          {f.devendoCentavos > 0 && pode(papel, 'clientes.fiado') && (
            <button type="button" className="botao" disabled={!c.ativo || c.whatsapp === false} onClick={() => aoJanela({ tipo: 'whatsapp', clienteId: c.id, contato: 'cobranca' })}>
              Lembrar pagamento
            </button>
          )}
          {pode(papel, 'clientes.desativar') && (
            <button type="button" className="botao" onClick={() => void alternarAtivo()}>
              {c.ativo ? 'Desativar' : 'Reativar'}
            </button>
          )}
          {!conta.temHistorico && (
            <button type="button" className="botao botao-perigo" onClick={() => aoJanela({ tipo: 'excluir', conta })}>
              Excluir cliente
            </button>
          )}
          {conta.temHistorico && pode(papel, 'clientes.excluir_dados') && (
            <button
              type="button"
              className="botao botao-perigo"
              onClick={() => (f.devendoCentavos > 0 ? aoFalhar(new ErroApi(409, `${c.nome} tem ${formatarCentavos(f.devendoCentavos)} de fiado em aberto. Os dados ficam guardados até a conta ser paga.`)) : aoJanela({ tipo: 'lgpd', conta }))}
            >
              Excluir dados (LGPD)
            </button>
          )}
        </div>
        <dl className="cli-dados">
          {rotuloExtra && (
            <>
              <dt>{rotuloExtra}</dt>
              <dd>{c.extra || '—'}</dd>
            </>
          )}
          <dt>Nascimento</dt>
          <dd>{c.nascimento ? dataBr(c.nascimento) : '—'}</dd>
          <dt>Mensagens da loja</dt>
          <dd>{c.autorizaMensagens ? `Sim, desde ${dataNoFuso(c.autorizaMensagens.em, fuso)}` : 'Não autorizou'}</dd>
          <dt>Endereço</dt>
          <dd>{c.endereco || '—'}</dd>
          <dt>Observações</dt>
          <dd>{c.observacoes || '—'}</dd>
        </dl>
      </section>

      {f.abertos.length > 0 && (
        <section className="card card-plano" aria-labelledby="cli-fiado-titulo">
          <div className="card-cabeca">
            <h2 id="cli-fiado-titulo">Fiado em aberto</h2>
            <span className="suave">o pagamento abate primeiro a mais antiga</span>
          </div>
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  <th>Compra</th>
                  <th>Data</th>
                  <th>Vence</th>
                  <th className="numero">Em aberto</th>
                </tr>
              </thead>
              <tbody>
                {f.abertos.map((a) => (
                  <tr key={`${a.vendaNumero}-${a.venceEm}`}>
                    <td data-rotulo="Compra">#{String(a.vendaNumero).padStart(5, '0')}</td>
                    <td data-rotulo="Data">{dataNoFuso(a.criadoEm, fuso)}</td>
                    <td data-rotulo="Vence">
                      {dataBr(a.venceEm)} {a.venceEm < hoje && <span className="pe-situacao pe-zerado">vencida</span>}
                    </td>
                    <td data-rotulo="Em aberto" className="numero">
                      {formatarCentavos(a.abertoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card card-plano" aria-labelledby="cli-extrato-titulo">
        <div className="card-cabeca">
          <h2 id="cli-extrato-titulo">Extrato</h2>
          <span className="cli-chips" role="group" aria-label="Filtrar extrato">
            {(
              [
                ['tudo', 'Tudo'],
                ['compras', 'Compras'],
                ['cashback', 'Cashback'],
                ['fiado', 'Fiado'],
                ['contatos', 'Contatos'],
              ] as const
            ).map(([k, t]) => (
              <button key={k} type="button" className={`botao cli-chip${extrato === k ? ' cli-chip-on' : ''}`} aria-pressed={extrato === k} onClick={() => setExtrato(k)}>
                {t}
              </button>
            ))}
          </span>
        </div>
        {linhas.length === 0 ? (
          <p className="vazio">Nada neste extrato ainda.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Movimento</th>
                  <th>Detalhe</th>
                  <th className="numero">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 300).map((l, i) => (
                  <tr key={`${l.ordem}-${i}`} className={l.cancelada ? 'rel-cancelada' : undefined}>
                    <td data-rotulo="Data">{dataBr(l.dia)}</td>
                    <td data-rotulo="Movimento">
                      <b>{l.movimento}</b>
                    </td>
                    <td data-rotulo="Detalhe" className="cli-quebra">
                      {l.detalhe}
                    </td>
                    <td data-rotulo="Valor" className="numero">
                      {l.valorCentavos === null ? (
                        '—'
                      ) : (
                        <>
                          {l.sinal ? `${l.sinal} ` : ''}
                          {formatarCentavos(l.valorCentavos)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AbaFiado({
  estado,
  hoje,
  aoAbrir,
  aoReceber,
  aoLembrar,
}: {
  estado: { tipo: string; mensagem?: string; dados?: Awaited<ReturnType<ApiPainel['listarFiado']>> | null };
  hoje: string;
  aoAbrir: (id: string) => void;
  aoReceber: (id: string) => void;
  /** Lembrete de pagamento pelo WhatsApp (módulo 7). */
  aoLembrar: (id: string) => void;
}) {
  if (estado.tipo === 'bloqueado' || estado.tipo === 'falhou') {
    return (
      <p className="alerta alerta-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }
  if (estado.tipo !== 'pronto' || !estado.dados) return <p className="vazio">Carregando…</p>;
  const { linhas, limitesCentavos } = estado.dados;
  const total = linhas.reduce((s, l) => s + l.devendoCentavos, 0);
  const vencido = linhas.reduce((s, l) => s + l.vencidoCentavos, 0);
  return (
    <>
      <div className="caixa-metricas">
        <div className="card card-plano caixa-metrica">
          <span className="caixa-metrica-rotulo">A receber no fiado</span>
          <b className="caixa-metrica-valor">{formatarCentavos(total)}</b>
          <span className="suave">{plural(linhas.length, 'cliente', 'clientes')}</span>
        </div>
        <div className="card card-plano caixa-metrica">
          <span className="caixa-metrica-rotulo">Vencido</span>
          <b className={`caixa-metrica-valor${vencido > 0 ? ' caixa-dif' : ''}`}>{formatarCentavos(vencido)}</b>
          <span className="suave">{plural(linhas.filter((l) => l.vencidoCentavos > 0).length, 'cliente', 'clientes')}</span>
        </div>
        <div className="card card-plano caixa-metrica">
          <span className="caixa-metrica-rotulo">Limite concedido</span>
          <b className="caixa-metrica-valor">{formatarCentavos(limitesCentavos)}</b>
          <span className="suave">soma dos limites do cadastro</span>
        </div>
      </div>
      <section className="card card-plano" aria-labelledby="cli-abertas-titulo">
        <div className="card-cabeca">
          <h2 id="cli-abertas-titulo">Contas em aberto</h2>
          <span className="suave">{plural(linhas.length, 'cliente', 'clientes')}</span>
        </div>
        {linhas.length === 0 ? (
          <p className="vazio">Ninguém deve no fiado.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela tabela-vendas">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="numero">Devendo</th>
                  <th className="numero">Limite</th>
                  <th className="numero">Disponível</th>
                  <th>Mais antiga em aberto</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const venceu = l.vencidoCentavos > 0;
                  const n = Math.round((Date.parse(`${l.maisAntiga.venceEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
                  return (
                    <tr key={l.clienteId}>
                      <td data-rotulo="Cliente">
                        <b>{l.nome}</b>
                        <small className="suave pe-detalhe">{formatarTelefone(l.telefone)}</small>
                      </td>
                      <td data-rotulo="Devendo" className="numero">
                        <b>{formatarCentavos(l.devendoCentavos)}</b>
                        {venceu && <small className="caixa-dif pe-detalhe">{formatarCentavos(l.vencidoCentavos)} vencido</small>}
                      </td>
                      <td data-rotulo="Limite" className="numero">
                        {formatarCentavos(l.limiteCentavos)}
                      </td>
                      <td data-rotulo="Disponível" className="numero">
                        {formatarCentavos(Math.max(0, l.limiteCentavos - l.devendoCentavos))}
                      </td>
                      <td data-rotulo="Mais antiga">
                        #{String(l.maisAntiga.vendaNumero).padStart(5, '0')}
                        <small className="suave pe-detalhe">vence {dataBr(l.maisAntiga.venceEm)}</small>
                      </td>
                      <td data-rotulo="Situação">
                        <span className={`pe-situacao ${venceu ? 'pe-zerado' : n <= 3 ? 'pe-baixo' : 'caixa-sem-dif'}`}>
                          {venceu ? `vencido há ${plural(l.diasVencido, 'dia', 'dias')}` : n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : `vence em ${n} dias`}
                        </span>
                        {l.devendoCentavos > l.limiteCentavos && <span className="pe-situacao pe-zerado">acima do limite</span>}
                      </td>
                      <td data-rotulo="Ações">
                        <span className="cli-acoes-linha">
                          <button type="button" className="botao" onClick={() => aoReceber(l.clienteId)} aria-label={`Receber o fiado de ${l.nome}`}>
                            Receber
                          </button>
                          <button
                            type="button"
                            className="botao"
                            disabled={l.whatsapp === false}
                            title={l.whatsapp === false ? 'O cliente não tem WhatsApp no cadastro.' : undefined}
                            onClick={() => aoLembrar(l.clienteId)}
                            aria-label={`Lembrar ${l.nome} do pagamento`}
                          >
                            Lembrar
                          </button>
                          <button type="button" className="link" onClick={() => aoAbrir(l.clienteId)} aria-label={`Abrir a conta de ${l.nome}`}>
                            Abrir conta
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="card-rodape">
          Ao cobrar, fale só com o cliente, sem expor a dívida a outras pessoas (Código de Defesa do Consumidor, art. 42). O dinheiro recebido entra no esperado do Caixa do dia; Pix entra na Conta
          bancária.
        </p>
      </section>
    </>
  );
}
