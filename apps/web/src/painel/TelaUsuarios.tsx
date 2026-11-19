// apps/web/src/painel/TelaUsuarios.tsx
// Aba Usuários (DaniPets V9.3.3 + revisão de 18/11/2026, item 5.4): o Dono e o Administrador
// cadastram a equipe da loja. Cada pessoa entra com o próprio usuário e senha; a senha que o Dono
// cria é PROVISÓRIA (no primeiro acesso a pessoa cria a dela, e nem o Dono fica sabendo).
// As regras (quem mexe em quem) são as de @saas/core, as mesmas do servidor e da demonstração.
import {
  type AlteracaoUsuario,
  LIMITES_USUARIO,
  NOME_PAPEL,
  PAPEIS_DE_LOJA,
  type PapelDeLoja,
  PERMISSOES,
  type Permissao,
  pode,
  quemPode,
  resumirAuditoria,
  situacaoDoUsuario,
  validarNovoUsuario,
  validarSenhaNova,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiUsuarios, ErroApi, type ItemAuditoria, type UsuarioDaLoja } from '../api';
import { Modal } from './caixa/Modal';
import { dataNoFuso, horaNoFuso } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiUsuarios;
  /** Quem está usando a tela. */
  eu: { id: string; papel: PapelDeLoja };
  fuso: string;
  agora?: () => Date;
}

type Janela =
  | { tipo: 'novo' }
  | { tipo: 'editar'; u: UsuarioDaLoja }
  | { tipo: 'senha'; u: UsuarioDaLoja }
  | { tipo: 'excluir'; u: UsuarioDaLoja }
  | { tipo: 'criado'; u: UsuarioDaLoja; senha: string }
  | { tipo: 'redefinida'; u: UsuarioDaLoja; senha: string };

const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o, 1/l/i: fácil de ditar

/** Senha provisória sorteada (10 letras e números). */
export function sortearSenhaProvisoria(): string {
  const n = new Uint32Array(10);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => LETRAS[x % LETRAS.length]).join('');
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível salvar. Tente de novo.');

export function TelaUsuarios({ api, eu, fuso, agora = () => new Date() }: Props) {
  const { estado, recarregar } = usarCarga(
    async () => {
      const [usuarios, historico] = await Promise.all([api.listarUsuarios(), api.listarAuditoria(40)]);
      return { usuarios, historico };
    },
    [api],
  );
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const souDono = pode(eu.papel, 'usuarios.donos');
  const dados = estado.tipo === 'pronto' ? estado.dados : null;

  async function alternarAtivo(u: UsuarioDaLoja) {
    setErro(null);
    setAviso(null);
    try {
      await api.alterarUsuario(u.id, { ativo: !u.ativo });
      setAviso(u.ativo ? `${u.nome} foi desativado. As sessões abertas dele terminaram.` : `${u.nome} foi reativado.`);
      await recarregar();
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }

  const fechar = (mensagem?: string) => {
    setJanela(null);
    if (mensagem) setAviso(mensagem);
    void recarregar();
  };

  return (
    <div className="rel us">
      <header className="vg-topo">
        <div>
          <h1>Usuários</h1>
          <p className="suave">Quem pode entrar nesta loja e o que cada um pode fazer. Cada pessoa tem o próprio usuário e senha.</p>
        </div>
        {dados && (
          <button type="button" className="botao botao-primario" onClick={() => setJanela({ tipo: 'novo' })}>
            + Novo usuário
          </button>
        )}
      </header>

      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
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

          <section className="card card-plano" aria-labelledby="us-lista-titulo">
            <div className="card-cabeca">
              <h2 id="us-lista-titulo">Equipe da loja</h2>
              {dados && <span className="suave">{dados.usuarios.filter((u) => u.ativo).length} ativos</span>}
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela us-tabela">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Usuário</th>
                      <th>Papel</th>
                      <th>Situação</th>
                      <th>Último acesso</th>
                      <th>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.usuarios.map((u) => {
                      const ehEu = u.id === eu.id;
                      const mexeEmDono = u.papel === 'dono' && !souDono;
                      const situacao = situacaoDoUsuario(u, agora());
                      return (
                        <tr key={u.id} className={u.ativo ? undefined : 'us-inativo'}>
                          <td data-rotulo="Nome">
                            {u.nome}
                            {ehEu && <small className="suave"> (você)</small>}
                          </td>
                          <td data-rotulo="Usuário" className="mono">
                            {u.usuario}
                          </td>
                          <td data-rotulo="Papel">{NOME_PAPEL[u.papel]}</td>
                          <td data-rotulo="Situação">
                            <span className={`us-situacao us-${situacao.split(' ')[0]!.toLowerCase()}`}>{situacao}</span>
                          </td>
                          <td data-rotulo="Último acesso" className="suave">
                            {u.ultimoAcessoEm ? `${dataNoFuso(u.ultimoAcessoEm, fuso)} ${horaNoFuso(u.ultimoAcessoEm, fuso)}` : '—'}
                          </td>
                          <td data-rotulo="Ações" className="us-acoes">
                            {!mexeEmDono && (
                              <>
                                <button type="button" className="link" onClick={() => setJanela({ tipo: 'editar', u })} aria-label={`Editar ${u.nome}`}>
                                  Editar
                                </button>
                                {!ehEu && (
                                  <>
                                    <button type="button" className="link" onClick={() => void alternarAtivo(u)} aria-label={`${u.ativo ? 'Desativar' : 'Reativar'} ${u.nome}`}>
                                      {u.ativo ? 'Desativar' : 'Reativar'}
                                    </button>
                                    {u.ativo && (
                                      <button type="button" className="link" onClick={() => setJanela({ tipo: 'senha', u })} aria-label={`Nova senha para ${u.nome}`}>
                                        Nova senha
                                      </button>
                                    )}
                                  </>
                                )}
                                {!u.ativo && !ehEu && pode(eu.papel, 'usuarios.excluir_dados') && u.nome !== 'Usuário removido' && (
                                  <button type="button" className="link us-perigo" onClick={() => setJanela({ tipo: 'excluir', u })} aria-label={`Excluir os dados de ${u.nome}`}>
                                    Excluir dados
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-rodape">
              Desativar tira o acesso na hora (as sessões abertas terminam) e mantém o histórico. Para a sua própria senha, use “Trocar senha” na barra lateral.
            </p>
          </section>

          <TabelaPermissoes />

          <section className="card card-plano" aria-labelledby="us-hist-titulo">
            <div className="card-cabeca">
              <h2 id="us-hist-titulo">Histórico</h2>
              <span className="suave">Quem fez o quê (últimos 40 registros)</span>
            </div>
            {!dados ? (
              <p className="vazio">Carregando…</p>
            ) : dados.historico.length === 0 ? (
              <p className="vazio">Nada registrado ainda.</p>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela us-historico">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Quem</th>
                      <th>O quê</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.historico.map((h) => (
                      <tr key={h.id}>
                        <td data-rotulo="Quando" className="mono">
                          {dataNoFuso(h.criadoEm, fuso)} {horaNoFuso(h.criadoEm, fuso)}
                        </td>
                        <td data-rotulo="Quem">{h.quem ?? <span className="suave">—</span>}</td>
                        <td data-rotulo="O quê">{descreverAuditoria(h)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {janela?.tipo === 'novo' && <ModalNovoUsuario api={api} souDono={souDono} aoFechar={() => setJanela(null)} aoCriar={(u, senha) => setJanela({ tipo: 'criado', u, senha })} />}
      {janela?.tipo === 'editar' && (
        <ModalEditarUsuario api={api} u={janela.u} ehEu={janela.u.id === eu.id} souDono={souDono} aoFechar={() => setJanela(null)} aoSalvar={(n) => fechar(`${n.nome}: alterações salvas.`)} />
      )}
      {janela?.tipo === 'senha' && <ModalNovaSenha api={api} u={janela.u} aoFechar={() => setJanela(null)} aoSalvar={(senha) => setJanela({ tipo: 'redefinida', u: janela.u, senha })} />}
      {janela?.tipo === 'excluir' && <ModalExcluirDados api={api} u={janela.u} aoFechar={() => setJanela(null)} aoExcluir={() => fechar('Dados pessoais excluídos. O histórico continua, como “Usuário removido”.')} />}
      {(janela?.tipo === 'criado' || janela?.tipo === 'redefinida') && (
        <Modal titulo={janela.tipo === 'criado' ? 'Usuário criado' : 'Senha provisória criada'} aoFechar={() => fechar()}>
          <div className="modal-form">
            <p className="modal-sub">
              Entregue para <strong>{janela.u.nome}</strong> o usuário <strong className="mono">{janela.u.usuario}</strong> e a senha provisória abaixo. No primeiro
              acesso, a pessoa cria a própria senha (esta deixa de valer).
            </p>
            <p className="us-senha-mostrada mono" aria-label="Senha provisória">
              {janela.senha}
            </p>
            <div className="modal-acoes">
              <button type="button" className="botao botao-primario" onClick={() => fechar()}>
                Pronto
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * "Usuário criado: Joana (Vendedor)" / "Venda cancelada (venda nº 00012 • R$ 189,90 • autorizado por Ana)".
 * O resumo vem pronto da API (@saas/core/auditoria); sem ele, é calculado aqui com os mesmos textos.
 */
export function descreverAuditoria(h: ItemAuditoria): string {
  const alvo = h.alvo?.nome ? `: ${h.alvo.nome}` : '';
  const resumo = h.resumo ?? resumirAuditoria(h.acao, h.detalhes);
  return `${h.texto}${alvo}${resumo ? ` (${resumo})` : ''}`;
}

/** Quem pode o quê (a mesma matriz que o servidor usa). */
function TabelaPermissoes() {
  const [aberta, setAberta] = useState(false);
  const lista = Object.keys(PERMISSOES) as Permissao[];
  return (
    <section className="card card-plano" aria-labelledby="us-perm-titulo">
      <div className="card-cabeca">
        <h2 id="us-perm-titulo">O que cada papel pode fazer</h2>
        <button type="button" className="link" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>
          {aberta ? 'Esconder' : 'Ver'}
        </button>
      </div>
      {aberta && (
        <div className="tabela-caixa">
          <table className="tabela us-permissoes">
            <thead>
              <tr>
                <th>Permissão</th>
                {PAPEIS_DE_LOJA.map((p) => (
                  <th key={p} className="numero">
                    {NOME_PAPEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((perm) => {
                const quem = quemPode(perm);
                return (
                  <tr key={perm}>
                    <td data-rotulo="Permissão">{PERMISSOES[perm]}</td>
                    {PAPEIS_DE_LOJA.map((p) => (
                      <td key={p} data-rotulo={NOME_PAPEL[p]} className="numero">
                        {quem.includes(p) ? <span aria-label="pode">✓</span> : <span className="suave" aria-label="não pode">—</span>}
                      </td>
                    ))}
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

function CampoSenhaProvisoria({ valor, aoMudar, erro, id }: { valor: string; aoMudar: (v: string) => void; erro?: string; id: string }) {
  return (
    <div className="campo">
      <label htmlFor={id}>Senha provisória</label>
      <div className="us-senha-linha">
        <input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} autoComplete="new-password" spellCheck={false} maxLength={LIMITES_USUARIO.senhaMax} className="mono" />
        <button type="button" className="botao" onClick={() => aoMudar(sortearSenhaProvisoria())}>
          Gerar
        </button>
      </div>
      <span className="modal-dica">Pelo menos {LIMITES_USUARIO.senhaMin} caracteres. A pessoa troca no primeiro acesso.</span>
      {erro && <span className="campo-erro">{erro}</span>}
    </div>
  );
}

function ModalNovoUsuario({
  api,
  souDono,
  aoFechar,
  aoCriar,
}: {
  api: ApiUsuarios;
  souDono: boolean;
  aoFechar: () => void;
  aoCriar: (u: UsuarioDaLoja, senha: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [papel, setPapel] = useState<PapelDeLoja>('vendedor');
  const [senha, setSenha] = useState(() => sortearSenhaProvisoria());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const dados = { nome, usuario, papel, senha };
    const v = validarNovoUsuario(dados);
    if (!v.ok) {
      setErros(Object.fromEntries(v.erros.map((e) => [e.campo, e.mensagem])));
      return;
    }
    setErros({});
    setErro(null);
    setEnviando(true);
    try {
      aoCriar(await api.criarUsuario(v.valor), v.valor.senha);
    } catch (e) {
      if (e instanceof ErroApi && e.erros.length) setErros(Object.fromEntries(e.erros.map((x) => [x.campo, x.mensagem])));
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Novo usuário" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={enviar} noValidate>
        <p className="modal-sub">A pessoa entra com o usuário e a senha provisória; no primeiro acesso ela cria a própria senha.</p>
        <div className="campo">
          <label htmlFor="us-nome">Nome</label>
          <input id="us-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITES_USUARIO.nomeMax} autoComplete="off" />
          {erros.nome && <span className="campo-erro">{erros.nome}</span>}
        </div>
        <div className="modal-grade">
          <div className="campo">
            <label htmlFor="us-login">Usuário (login)</label>
            <input id="us-login" value={usuario} onChange={(e) => setUsuario(e.target.value.toLowerCase())} maxLength={LIMITES_USUARIO.loginMax} autoCapitalize="none" spellCheck={false} placeholder="ex.: maria.silva" autoComplete="off" />
            {erros.usuario && <span className="campo-erro">{erros.usuario}</span>}
          </div>
          <div className="campo">
            <label htmlFor="us-papel">Papel</label>
            <select id="us-papel" value={papel} onChange={(e) => setPapel(e.target.value as PapelDeLoja)}>
              {PAPEIS_DE_LOJA.filter((p) => p !== 'dono' || souDono).map((p) => (
                <option key={p} value={p}>
                  {NOME_PAPEL[p]}
                </option>
              ))}
            </select>
            {erros.papel && <span className="campo-erro">{erros.papel}</span>}
          </div>
        </div>
        <CampoSenhaProvisoria id="us-senha" valor={senha} aoMudar={setSenha} erro={erros.senha} />
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Cadastrar'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalEditarUsuario({
  api,
  u,
  ehEu,
  souDono,
  aoFechar,
  aoSalvar,
}: {
  api: ApiUsuarios;
  u: UsuarioDaLoja;
  ehEu: boolean;
  souDono: boolean;
  aoFechar: () => void;
  aoSalvar: (u: UsuarioDaLoja) => void;
}) {
  const [nome, setNome] = useState(u.nome);
  const [papel, setPapel] = useState<PapelDeLoja>(u.papel);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const mudanca: AlteracaoUsuario = {};
    if (nome.trim() !== u.nome) mudanca.nome = nome;
    if (papel !== u.papel) mudanca.papel = papel;
    if (Object.keys(mudanca).length === 0) return aoFechar();
    setErro(null);
    setEnviando(true);
    try {
      aoSalvar(await api.alterarUsuario(u.id, mudanca));
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Editar ${u.nome}`} aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="us-ed-nome">Nome</label>
          <input id="us-ed-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITES_USUARIO.nomeMax} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor="us-ed-papel">Papel</label>
          <select id="us-ed-papel" value={papel} onChange={(e) => setPapel(e.target.value as PapelDeLoja)} disabled={ehEu}>
            {PAPEIS_DE_LOJA.filter((p) => p !== 'dono' || souDono).map((p) => (
              <option key={p} value={p}>
                {NOME_PAPEL[p]}
              </option>
            ))}
          </select>
          {ehEu && <span className="modal-dica">Ninguém muda o próprio papel. Peça a outro Dono.</span>}
        </div>
        <p className="modal-dica">
          O usuário (login) <span className="mono">{u.usuario}</span> não muda.
        </p>
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

function ModalNovaSenha({ api, u, aoFechar, aoSalvar }: { api: ApiUsuarios; u: UsuarioDaLoja; aoFechar: () => void; aoSalvar: (senha: string) => void }) {
  const [senha, setSenha] = useState(() => sortearSenhaProvisoria());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const v = validarSenhaNova(senha, { usuario: u.usuario, nome: u.nome });
    if (!v.ok) return setErro(v.erros[0]!.mensagem);
    setErro(null);
    setEnviando(true);
    try {
      await api.redefinirSenhaUsuario(u.id, senha);
      aoSalvar(senha);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Nova senha para ${u.nome}`} aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={enviar} noValidate>
        <p className="modal-sub">A senha atual deixa de valer, o bloqueio por senhas erradas some e as sessões abertas dele terminam.</p>
        <CampoSenhaProvisoria id="us-nova-senha" valor={senha} aoMudar={setSenha} />
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Criar senha provisória'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluirDados({ api, u, aoFechar, aoExcluir }: { api: ApiUsuarios; u: UsuarioDaLoja; aoFechar: () => void; aoExcluir: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function excluir() {
    setErro(null);
    setEnviando(true);
    try {
      await api.excluirDadosUsuario(u.id);
      aoExcluir();
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Excluir os dados de ${u.nome}`} aoFechar={aoFechar}>
      <div className="modal-form">
        <p className="modal-sub">
          Para atender um pedido da pessoa (LGPD): o nome, o login e a senha são apagados e não dá para desfazer. O que ela fez continua no histórico, como “Usuário
          removido”.
        </p>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="button" className="botao botao-perigo" onClick={() => void excluir()} disabled={enviando}>
            {enviando ? 'Excluindo…' : 'Excluir os dados'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
