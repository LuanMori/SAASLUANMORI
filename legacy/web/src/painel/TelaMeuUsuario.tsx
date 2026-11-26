// apps/web/src/painel/TelaMeuUsuario.tsx
// Aba "Meu usuário" (pedido do Luan, 25/11/2026), para todos, inclusive o Vendedor. Abre também pelo nome, no canto de
// baixo da barra lateral. Cada pessoa vê e muda só o que é dela:
//   - PERFIL: a foto (escolher, trocar ou tirar), o nome, o login e o papel;
//   - ENTRADAS E SAÍDAS do sistema (DaniPets USR-07, "Meus acessos"): o dia, a entrada, a saída e quanto tempo ficou;
//   - TROCAR A SENHA (antes era o botão "Trocar senha" da barra lateral).
// No sistema real, a foto e as entradas e saídas avisam que ainda não estão ligadas ao servidor; trocar a senha já
// funciona lá.
import { type AcessoDoUsuario, ACESSOS_MAX, formatarDuracao, LIMITES_FOTO, MENSAGENS_FOTO, minutosDoAcesso, nomeDoPapel, type PapelNaLoja } from '@saas/core';
import { type ChangeEvent, useState } from 'react';
import { type ApiConta, ErroApi } from '../api';
import { dataNoFuso, horaNoFuso } from './formato';
import { prepararImagem, TIPOS_DE_IMAGEM } from './imagem';
import { FormTrocarSenha } from './TrocarSenha';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiConta;
  pessoa: { nome: string; usuario: string; papel: PapelNaLoja };
  fuso: string;
  agora?: () => Date;
  /** A foto mudou (null = tirou): a barra lateral mostra a nova na hora. */
  aoMudarFoto?: (foto: string | null) => void;
  /** Errou a senha atual 5 vezes ao trocar a senha: a pessoa foi bloqueada e a sessão terminou. */
  aoBloquear: (mensagem: string) => void;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.');

/** A primeira letra do nome (sem foto). */
export const inicialDoNome = (nome: string) => (nome.trim().charAt(0) || '?').toUpperCase();

/** Arquivo escolhido → foto do perfil: cortada em quadrado no meio, reduzida a 256 px e em JPEG. */
export function prepararFoto(arquivo: File): Promise<string> {
  return prepararImagem(arquivo, { lado: 256, quadrado: true, jpeg: true, maxCaracteres: LIMITES_FOTO.maxCaracteres, grande: MENSAGENS_FOTO.grande });
}

export function TelaMeuUsuario({ api, pessoa, fuso, agora = () => new Date(), aoMudarFoto, aoBloquear }: Props) {
  return (
    <div className="rel mu">
      <header className="vg-topo">
        <div>
          <h1>Meu usuário</h1>
          <p className="suave">A sua foto, as suas entradas e saídas do sistema e a sua senha.</p>
        </div>
      </header>
      <CartaoPerfil api={api} pessoa={pessoa} aoMudarFoto={aoMudarFoto} />
      <CartaoAcessos api={api} fuso={fuso} agora={agora} />
      <CartaoSenha api={api} pessoa={pessoa} aoBloquear={aoBloquear} />
    </div>
  );
}

// ------------------------------------------------------------------ perfil e foto

function CartaoPerfil({ api, pessoa, aoMudarFoto }: Pick<Props, 'api' | 'pessoa' | 'aoMudarFoto'>) {
  const { estado, recarregar } = usarCarga(() => api.meuPerfil(), [api]);
  /** A foto escolhida, ainda não salva. */
  const [nova, setNova] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const salva = estado.tipo === 'pronto' ? (estado.dados.foto ?? null) : null;
  const mostrada = nova ?? salva;

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(null);
    setAviso(null);
    try {
      setNova(await prepararFoto(arquivo));
    } catch (falha) {
      setErro(mensagemDe(falha));
    }
  }

  async function gravar(foto: string | null) {
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const salvo = await api.salvarMinhaFoto(foto);
      aoMudarFoto?.(salvo.foto ?? null);
      // primeiro a foto gravada chega; só então a prévia sai (sem piscar a inicial no meio)
      await recarregar();
      setNova(null);
      setAviso(foto ? 'Foto salva. Ela aparece também no canto da barra lateral.' : 'Foto tirada.');
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="mu-perfil-titulo">
      <h2 id="mu-perfil-titulo">Perfil</h2>
      <div className="mu-perfil">
        <div className="mu-foto">
          {mostrada ? <img src={mostrada} alt={nova ? 'A foto escolhida (ainda não salva)' : 'A sua foto'} /> : <span aria-hidden="true">{inicialDoNome(pessoa.nome)}</span>}
        </div>
        <dl className="mu-dados">
          <div>
            <dt>Nome</dt>
            <dd>{pessoa.nome}</dd>
          </div>
          <div>
            <dt>Usuário (login)</dt>
            <dd>{pessoa.usuario || '—'}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>{nomeDoPapel(pessoa.papel)}</dd>
          </div>
        </dl>
      </div>
      {estado.tipo === 'pronto' ? (
        <div className="mu-foto-acoes">
          {nova ? (
            <>
              <button type="button" className="botao botao-primario" onClick={() => void gravar(nova)} disabled={enviando}>
                {enviando ? 'Salvando…' : 'Salvar a foto'}
              </button>
              <button type="button" className="botao" onClick={() => setNova(null)} disabled={enviando}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <label className="botao db-arquivo">
                {salva ? 'Trocar a foto' : 'Escolher uma foto'}
                <input type="file" accept={TIPOS_DE_IMAGEM.join(',')} onChange={(e) => void escolher(e)} aria-label="Escolher a foto do perfil" disabled={enviando} />
              </label>
              {salva && (
                <button type="button" className="link" onClick={() => void gravar(null)} disabled={enviando}>
                  Tirar a foto
                </button>
              )}
            </>
          )}
          <span className="modal-dica">PNG, JPEG ou WebP. A foto é cortada em quadrado e reduzida aqui mesmo, no navegador.</span>
        </div>
      ) : estado.tipo === 'carregando' ? null : (
        <p className="modal-dica mu-indisponivel">Foto do perfil: {estado.mensagem}</p>
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

// ------------------------------------------------------------------ entradas e saídas

function CartaoAcessos({ api, fuso, agora }: Required<Pick<Props, 'api' | 'fuso' | 'agora'>>) {
  const { estado } = usarCarga(() => api.meusAcessos(), [api]);
  return (
    <section className="card card-plano mu-acessos" aria-labelledby="mu-acessos-titulo">
      <div className="card-cabeca">
        <h2 id="mu-acessos-titulo">Entradas e saídas</h2>
        <span className="suave">as {ACESSOS_MAX} mais recentes</span>
      </div>
      {estado.tipo === 'carregando' ? (
        <p className="vazio">Carregando…</p>
      ) : estado.tipo !== 'pronto' ? (
        <p className="vazio">{estado.mensagem}</p>
      ) : estado.dados.length === 0 ? (
        <p className="vazio">Nenhuma entrada registrada ainda.</p>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela mu-tabela">
            <thead>
              <tr>
                <th scope="col">Dia</th>
                <th scope="col">Entrada</th>
                <th scope="col">Saída</th>
                <th scope="col">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {estado.dados.map((a, i) => (
                <LinhaDoAcesso key={`${a.entrada ?? ''}-${a.saida ?? ''}-${i}`} acesso={a} fuso={fuso} agora={agora()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="card-rodape">
        Saída “não registrada”: o sistema foi fechado sem clicar em Sair. Depois de um tempo sem uso, o sistema sai sozinho (“por falta de uso”).
      </p>
    </section>
  );
}

function LinhaDoAcesso({ acesso: a, fuso, agora }: { acesso: AcessoDoUsuario; fuso: string; agora: Date }) {
  const dia = dataNoFuso((a.entrada ?? a.saida)!, fuso);
  const minutos = minutosDoAcesso(a, agora);
  // saída em outro dia (passou da meia-noite): mostra o dia junto
  const diaDaSaida = a.saida && a.entrada && dataNoFuso(a.saida, fuso) !== dia ? ` (${dataNoFuso(a.saida, fuso).slice(0, 5)})` : '';
  return (
    <tr className={a.atual ? 'mu-atual' : undefined}>
      <td className="mu-dia">{dia}</td>
      <td data-rotulo="Entrada">{a.entrada ? horaNoFuso(a.entrada, fuso) : '—'}</td>
      <td data-rotulo="Saída">
        {a.saida ? (
          <>
            {horaNoFuso(a.saida, fuso)}
            {diaDaSaida}
            {a.como === 'inatividade' && <small className="mu-como"> por falta de uso</small>}
          </>
        ) : a.atual ? (
          <strong className="mu-agora">em uso agora</strong>
        ) : (
          <span className="suave">não registrada</span>
        )}
      </td>
      <td data-rotulo="Tempo">{minutos === null ? '—' : formatarDuracao(minutos)}</td>
    </tr>
  );
}

// ------------------------------------------------------------------ senha

function CartaoSenha({ api, pessoa, aoBloquear }: Pick<Props, 'api' | 'pessoa' | 'aoBloquear'>) {
  /** Muda a cada troca: o formulário volta vazio. */
  const [vez, setVez] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <section className="card db-card" aria-labelledby="mu-senha-titulo">
      <h2 id="mu-senha-titulo">Trocar a senha</h2>
      <p className="suave db-sub">A senha vale para entrar no sistema e para autorizar operações no caixa. Depois da troca, a sua sessão em outros aparelhos termina.</p>
      {aviso && (
        <p className="alerta mu-senha-aviso" role="status">
          {aviso}
        </p>
      )}
      <FormTrocarSenha
        key={vez}
        api={api}
        pessoa={pessoa}
        aoTrocar={() => {
          setAviso('Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa.');
          setVez((v) => v + 1);
        }}
        aoBloquear={aoBloquear}
      />
    </section>
  );
}
