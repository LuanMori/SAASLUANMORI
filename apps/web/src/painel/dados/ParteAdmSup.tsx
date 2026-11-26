// apps/web/src/painel/dados/ParteAdmSup.tsx
// Dados e backup → "Adm. Sup", que só o Adm. Sup vê (pedido do Luan, 25/11/2026: "lançar atualizações, ajustes, criar
// visões, para conseguirmos ter acesso mesmo quando vender"):
//   - ATUALIZAÇÕES DO SISTEMA (13e): publicar a versão nova e as novidades dela, para todas as lojas; o que já saiu;
//   - AVISOS PARA A EQUIPE (13e): um recado para a equipe desta loja, com a importância e o último dia; encerrar;
//   - AJUSTES DESTA LOJA (13f): ligar e desligar recursos (o que o plano da loja inclui) e os limites de usuários e
//     de produtos ativos, com quantos ela tem hoje;
//   - VISÕES SOB MEDIDA (13g): tabelas dos Relatórios montadas para a loja (CartaoVisoes.tsx);
//   - MANUTENÇÃO (13h): diagnóstico da loja, conferir o estoque e o registro de erros (CartaoManutencao.tsx).
// As regras ficam no @saas/core (comunicados.ts, recursosDaLoja.ts, visoes.ts e manutencao.ts).
import {
  type AjustesDaLoja,
  type Atualizacao,
  type AvisoDaEquipe,
  dataBr,
  diaNoFuso,
  type ImportanciaDoAviso,
  LIMITES_COMUNICADOS,
  LIMITES_DA_LOJA,
  LISTA_RECURSOS_DA_LOJA,
  type LimiteDaLoja,
  RECURSOS_DA_LOJA,
  type RecursoDaLoja,
  situacaoDoAviso,
  versaoAtual,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiAjustes, type ApiComunicados, type ApiManutencao, type ApiProdutos, type ApiUsuarios, ErroApi } from '../../api';
import { ParteManutencao } from './CartaoManutencao';
import { type ApiDasVisoes, CartaoVisoes } from './CartaoVisoes';
import { dataNoFuso, horaNoFuso } from '../formato';
import { usarCarga } from '../usarCarga';

interface Props {
  api: ApiComunicados & ApiAjustes & Pick<ApiUsuarios, 'listarUsuarios'> & Pick<ApiProdutos, 'listarProdutos'> & ApiDasVisoes & ApiManutencao;
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
      <CartaoAjustes api={api} fuso={fuso} aoMudar={aoMudar} />
      <CartaoVisoes api={api} fuso={fuso} aoMudar={aoMudar} />
      <ParteManutencao api={api} fuso={fuso} aoMudar={aoMudar} />
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

// ------------------------------------------------------------------ ajustes desta loja (módulo 13f)

const ROTULO_DO_LIMITE: Record<LimiteDaLoja, { campo: string; contagem: (n: number) => string }> = {
  usuariosAtivos: { campo: 'Usuários ativos (máximo)', contagem: (n) => `Hoje: ${n} ${n === 1 ? 'ativo' : 'ativos'} (o Adm. Sup não conta)` },
  produtosAtivos: { campo: 'Produtos ativos (máximo)', contagem: (n) => `Hoje: ${n.toLocaleString('pt-BR')} ${n === 1 ? 'ativo' : 'ativos'}` },
};

/** "" = sem limite; "5" = 5; o resto vai como está, e o servidor diz o que está errado. */
const lerLimite = (t: string): number | null => (t.trim() === '' ? null : /^\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN);

function CartaoAjustes({ api, fuso, aoMudar }: Pick<Props, 'api' | 'fuso' | 'aoMudar'>) {
  const { estado, recarregar } = usarCarga(() => api.lerAjustesDaLoja(), [api]);
  // quantos a loja tem hoje, ao lado de cada limite (lido de novo depois de salvar)
  const { estado: uso, recarregar: recarregarUso } = usarCarga(
    () =>
      Promise.all([api.listarUsuarios(), api.listarProdutos()]).then(([usuarios, produtos]) => ({
        usuariosAtivos: usuarios.filter((u) => u.ativo).length,
        produtosAtivos: produtos.filter((p) => p.ativo).length,
      })),
    [api],
  );
  const ativos = uso.tipo === 'pronto' ? uso.dados : null;
  // fica aqui (e não no formulário): o formulário recomeça com os ajustes salvos
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <section className="card db-card" aria-labelledby="as-ajustes-titulo">
      <h2 id="as-ajustes-titulo">Ajustes desta loja</h2>
      <p className="suave db-sub">
        O que esta loja usa (o que o plano dela inclui). Desligar esconde a aba ou a opção e não deixa criar nada novo dela; nada é apagado, e tudo volta ao
        ligar de novo. O que o cliente já tem continua valendo. Os ajustes não vão na cópia de segurança da loja.
      </p>
      {estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
        <p className="alerta alerta-erro" role="alert">
          {estado.mensagem}
        </p>
      ) : estado.tipo === 'pronto' ? (
        <FormAjustes
          key={estado.dados.alteradoEm ?? 'padrao'}
          api={api}
          fuso={fuso}
          ajustes={estado.dados}
          ativos={ativos}
          aviso={aviso}
          aoEnviar={() => setAviso(null)}
          aoSalvar={async () => {
            await Promise.all([recarregar(), recarregarUso()]);
            setAviso('Ajustes salvos. A equipe desta loja vê a mudança na hora.');
            aoMudar?.();
          }}
        />
      ) : (
        <p className="suave">Carregando…</p>
      )}
    </section>
  );
}

function FormAjustes({
  api,
  fuso,
  ajustes,
  ativos,
  aviso,
  aoEnviar,
  aoSalvar,
}: Pick<Props, 'api' | 'fuso'> & {
  ajustes: AjustesDaLoja;
  ativos: Record<LimiteDaLoja, number> | null;
  aviso: string | null;
  aoEnviar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [desligados, setDesligados] = useState<Set<RecursoDaLoja>>(() => new Set(ajustes.desligados));
  const [limites, setLimites] = useState<Record<LimiteDaLoja, string>>(() => ({
    usuariosAtivos: ajustes.limites.usuariosAtivos === null ? '' : String(ajustes.limites.usuariosAtivos),
    produtosAtivos: ajustes.limites.produtosAtivos === null ? '' : String(ajustes.limites.produtosAtivos),
  }));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const limitesLidos = { usuariosAtivos: lerLimite(limites.usuariosAtivos), produtosAtivos: lerLimite(limites.produtosAtivos) };
  // o limite novo fica abaixo do que a loja já tem: nada é desfeito, só não entra nenhum novo
  const acima = (Object.keys(LIMITES_DA_LOJA) as LimiteDaLoja[]).filter((k) => {
    const max = limitesLidos[k];
    return ativos !== null && max !== null && Number.isInteger(max) && ativos[k] > max;
  });

  const alternar = (r: RecursoDaLoja) =>
    setDesligados((d) => {
      const novo = new Set(d);
      if (novo.has(r)) novo.delete(r);
      else novo.add(r);
      return novo;
    });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    aoEnviar();
    setEnviando(true);
    try {
      await api.salvarAjustesDaLoja({ desligados: LISTA_RECURSOS_DA_LOJA.filter((r) => desligados.has(r)), limites: limitesLidos });
      await aoSalvar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="db-form" onSubmit={(e) => void salvar(e)} noValidate>
      <fieldset className="as-recursos">
        <legend>Recursos ligados</legend>
        {LISTA_RECURSOS_DA_LOJA.map((r) => (
          <div key={r} className={desligados.has(r) ? 'as-recurso as-recurso-off' : 'as-recurso'}>
            <input id={`as-recurso-${r}`} type="checkbox" checked={!desligados.has(r)} onChange={() => alternar(r)} aria-describedby={`as-recurso-${r}-sobre`} />
            <span>
              <label htmlFor={`as-recurso-${r}`}>{RECURSOS_DA_LOJA[r].nome}</label>
              <small id={`as-recurso-${r}-sobre`} className="suave">
                {desligados.has(r) ? 'Desligado. ' : ''}
                {RECURSOS_DA_LOJA[r].descricao}
              </small>
            </span>
          </div>
        ))}
      </fieldset>
      <fieldset className="as-limites">
        <legend>Limites (em branco = sem limite)</legend>
        {(Object.keys(LIMITES_DA_LOJA) as LimiteDaLoja[]).map((k) => (
          <div key={k} className="campo db-campo-curto">
            <label htmlFor={`as-limite-${k}`}>{ROTULO_DO_LIMITE[k].campo}</label>
            <input
              id={`as-limite-${k}`}
              inputMode="numeric"
              value={limites[k]}
              onChange={(e) => setLimites((l) => ({ ...l, [k]: e.target.value }))}
              placeholder="Sem limite"
              maxLength={7}
              aria-describedby={`as-uso-${k}`}
            />
            <small id={`as-uso-${k}`} className="suave">
              {ativos ? ROTULO_DO_LIMITE[k].contagem(ativos[k]) : 'Contando…'}
            </small>
          </div>
        ))}
      </fieldset>
      {acima.length > 0 && (
        <p className="alerta" role="status">
          {acima.map((k) => LIMITES_DA_LOJA[k].nome.toLowerCase()).join(' e ')}: a loja já tem mais do que o limite novo. Ninguém é desativado e nenhum
          produto é inativado; só não dá para criar nem reativar até ficar abaixo do limite.
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
      <div className="modal-acoes as-ajustes-acoes">
        <p className="suave">
          {ajustes.alteradoEm
            ? `Última mudança: ${dataNoFuso(ajustes.alteradoEm, fuso)} às ${horaNoFuso(ajustes.alteradoEm, fuso)}${ajustes.alteradoPor ? ` · ${ajustes.alteradoPor.nome}` : ''}`
            : 'Esta loja usa o padrão: tudo ligado e sem limite.'}
        </p>
        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar os ajustes'}
        </button>
      </div>
    </form>
  );
}
