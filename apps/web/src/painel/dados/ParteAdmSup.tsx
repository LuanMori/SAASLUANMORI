// apps/web/src/painel/dados/ParteAdmSup.tsx
// Dados e backup → "Adm. Sup", que só o Adm. Sup vê (pedido do Luan, 25/11/2026: "lançar atualizações, ajustes, criar
// visões, para conseguirmos ter acesso mesmo quando vender"):
//   - ATUALIZAÇÕES DO SISTEMA (13e): publicar a versão nova e as novidades dela, para todas as lojas; o que já saiu;
//   - AVISOS PARA A EQUIPE (13e): um recado para a equipe desta loja, com a importância e o último dia; encerrar.
// As regras ficam no @saas/core (comunicados.ts). As outras ferramentas (ajustes por loja, visões sob medida e
// manutenção) entram aqui, nas partes seguintes do módulo.
import { type Atualizacao, type AvisoDaEquipe, dataBr, diaNoFuso, type ImportanciaDoAviso, LIMITES_COMUNICADOS, situacaoDoAviso, versaoAtual } from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiComunicados, ErroApi } from '../../api';
import { dataNoFuso } from '../formato';
import { usarCarga } from '../usarCarga';

interface Props {
  api: ApiComunicados;
  fuso: string;
  agora?: () => Date;
  /** Publicou algo: a área logada lê de novo (a versão do rodapé e os avisos do alto da tela). */
  aoMudar?: () => void;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.');

/** "V0.1" -> "V0.2" (a sugestão da próxima versão). */
export function proximaVersao(atual: string): string {
  const partes = atual.replace(/^v/i, '').split('.').map(Number);
  partes[partes.length - 1] = (partes[partes.length - 1] ?? 0) + 1;
  return `V${partes.join('.')}`;
}

export function ParteAdmSup({ api, fuso, agora = () => new Date(), aoMudar }: Props) {
  return (
    <>
      <CartaoAtualizacoes api={api} fuso={fuso} aoMudar={aoMudar} />
      <CartaoAvisos api={api} fuso={fuso} agora={agora} aoMudar={aoMudar} />
    </>
  );
}

// ------------------------------------------------------------------ atualizações do sistema

function CartaoAtualizacoes({ api, fuso, aoMudar }: Pick<Props, 'api' | 'fuso' | 'aoMudar'>) {
  const { estado, recarregar } = usarCarga(() => api.listarAtualizacoes(), [api]);
  const [versao, setVersao] = useState('');
  const [novidades, setNovidades] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const lista: Atualizacao[] = estado.tipo === 'pronto' ? estado.dados : [];
  const atual = versaoAtual(lista);

  async function publicar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const a = await api.publicarAtualizacao({ versao, novidades });
      await recarregar();
      setVersao('');
      setNovidades('');
      setAviso(`Versão ${a.versao} publicada. A equipe de todas as lojas vê as novidades no alto da tela.`);
      aoMudar?.();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="as-atualizacoes-titulo">
      <h2 id="as-atualizacoes-titulo">Atualizações do sistema</h2>
      <p className="suave db-sub">
        Publique a versão nova e as novidades dela. Vale para todas as lojas: a versão aparece no rodapé da barra lateral, e cada pessoa vê as novidades uma
        vez, no alto da tela, até clicar em “Entendi”.
      </p>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          <p className="as-versao">
            Versão de agora: <strong>{atual}</strong>
          </p>
          <form className="db-form" onSubmit={(e) => void publicar(e)} noValidate>
            <div className="campo db-campo-curto">
              <label htmlFor="as-versao">Versão nova</label>
              <input id="as-versao" value={versao} onChange={(e) => setVersao(e.target.value)} placeholder={`Ex.: ${proximaVersao(atual)}`} maxLength={LIMITES_COMUNICADOS.versaoMax} />
            </div>
            <div className="campo">
              <label htmlFor="as-novidades">Novidades (uma por linha)</label>
              <textarea id="as-novidades" rows={4} value={novidades} onChange={(e) => setNovidades(e.target.value)} placeholder={'Ex.:\nAba Meu usuário\nImportar planilhas'} />
            </div>
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
            <div className="modal-acoes">
              <button type="submit" className="botao botao-primario" disabled={enviando}>
                {enviando ? 'Publicando…' : 'Publicar a atualização'}
              </button>
            </div>
          </form>
          {lista.length > 0 && (
            <ol className="as-historico" aria-label="Atualizações publicadas">
              {lista.map((a) => (
                <li key={a.id}>
                  <p>
                    <strong>{a.versao}</strong>{' '}
                    <span className="suave">
                      · {dataNoFuso(a.publicadaEm, fuso)} · {a.publicadaPor.nome}
                    </span>
                  </p>
                  <ul>
                    {a.novidades.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ avisos para a equipe desta loja

const ROTULO_DA_SITUACAO = { ativo: 'Ativo', venceu: 'Venceu', encerrado: 'Encerrado' } as const;

function CartaoAvisos({ api, fuso, agora, aoMudar }: Required<Pick<Props, 'api' | 'fuso' | 'agora'>> & Pick<Props, 'aoMudar'>) {
  const { estado, recarregar } = usarCarga(() => api.listarAvisosDaEquipe(), [api]);
  const [texto, setTexto] = useState('');
  const [importancia, setImportancia] = useState<ImportanciaDoAviso>('info');
  const [ate, setAte] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const hoje = diaNoFuso(agora(), fuso);
  const lista: AvisoDaEquipe[] = estado.tipo === 'pronto' ? estado.dados : [];

  async function publicar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando('novo');
    try {
      await api.criarAvisoDaEquipe({ texto, importancia, ate: ate || null });
      await recarregar();
      setTexto('');
      setAte('');
      setImportancia('info');
      setAviso('Aviso publicado: aparece no alto da tela de todos desta loja, até cada pessoa clicar em “Entendi”.');
      aoMudar?.();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(null);
    }
  }

  async function encerrar(id: string) {
    setErro(null);
    setAviso(null);
    setEnviando(id);
    try {
      await api.encerrarAvisoDaEquipe(id);
      await recarregar();
      setAviso('Aviso encerrado: ele sai da tela da equipe.');
      aoMudar?.();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="as-avisos-titulo">
      <h2 id="as-avisos-titulo">Avisos para a equipe desta loja</h2>
      <p className="suave db-sub">Um recado do suporte para todos desta loja (por exemplo, uma manutenção marcada). Ele aparece no alto da tela, em todas as abas.</p>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : (
        <>
          <form className="db-form" onSubmit={(e) => void publicar(e)} noValidate>
            <div className="campo">
              <label htmlFor="as-aviso">Aviso</label>
              <textarea id="as-aviso" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={LIMITES_COMUNICADOS.avisoMax} />
            </div>
            <fieldset className="db-escolha">
              <legend>Importância</legend>
              {(['info', 'atencao'] as const).map((i) => (
                <label key={i} className={importancia === i ? 'db-escolha-on' : undefined}>
                  <input type="radio" name="as-importancia" checked={importancia === i} onChange={() => setImportancia(i)} />
                  {i === 'info' ? 'Informação' : 'Atenção'}
                </label>
              ))}
            </fieldset>
            <div className="campo db-campo-curto">
              <label htmlFor="as-ate">Mostrar até (opcional)</label>
              <input id="as-ate" type="date" value={ate} min={hoje} onChange={(e) => setAte(e.target.value)} />
            </div>
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
            <div className="modal-acoes">
              <button type="submit" className="botao botao-primario" disabled={enviando !== null}>
                {enviando === 'novo' ? 'Publicando…' : 'Publicar o aviso'}
              </button>
            </div>
          </form>
          {lista.length > 0 && (
            <ul className="as-avisos" aria-label="Avisos publicados">
              {lista.map((a) => {
                const s = situacaoDoAviso(a, hoje);
                return (
                  <li key={a.id} className={`as-aviso-${s}`}>
                    <div>
                      <p>{a.texto}</p>
                      <p className="suave">
                        {ROTULO_DA_SITUACAO[s]}
                        {s === 'ativo' && a.ate ? ` até ${dataBr(a.ate)}` : ''} · {a.importancia === 'atencao' ? 'Atenção' : 'Informação'} · publicado em {dataNoFuso(a.criadoEm, fuso)}
                      </p>
                    </div>
                    {s === 'ativo' && (
                      <button type="button" className="botao" onClick={() => void encerrar(a.id)} disabled={enviando !== null} aria-label={`Encerrar o aviso: ${a.texto}`}>
                        {enviando === a.id ? 'Encerrando…' : 'Encerrar'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
