// apps/web/src/telas/TelaProdutos.tsx
// Lista de produtos da loja + cadastro rápido. A validação é a mesma da API
// (@saas/core), então o erro aparece antes de ir ao servidor; a API continua
// sendo a autoridade final.
import { type ErroCampo, formatarCentavos, reaisParaCentavos, validarNovoProduto } from '@saas/core';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type ApiProdutos, ErroApi, type Produto } from '../api';
import { iniciais } from '../painel/BarraLateral';
import { usarIntervalo } from '../usarIntervalo';

export interface Sessao {
  nome: string;
  loja: string | null;
}

interface Props {
  api: Pick<ApiProdutos, 'listarProdutos' | 'criarProduto'>;
  sessao: Sessao;
  aoSair: () => void;
  /** Intervalo de atualização automática (ms). */
  intervaloMs?: number;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; produtos: Produto[]; avisoRede: boolean }
  | { tipo: 'bloqueado'; mensagem: string };

export function TelaProdutos({ api, sessao, aoSair, intervaloMs = 5000 }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async () => {
    try {
      const produtos = await api.listarProdutos();
      setEstado({ tipo: 'pronto', produtos, avisoRede: false });
    } catch (e) {
      const erro = e instanceof ErroApi ? e : new ErroApi(0, 'Algo deu errado.');
      if (erro.status === 401 || erro.status === 403) {
        setEstado({ tipo: 'bloqueado', mensagem: erro.message });
      } else {
        // Sem rede ou erro temporário: mantém a lista que já está na tela.
        setEstado((atual) =>
          atual.tipo === 'pronto' ? { ...atual, avisoRede: true } : { tipo: 'pronto', produtos: [], avisoRede: true },
        );
      }
    }
  }, [api]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  usarIntervalo(() => void carregar(), intervaloMs);

  const aoCriar = (novo: Produto) =>
    setEstado((atual) =>
      atual.tipo === 'pronto'
        ? { ...atual, produtos: [...atual.produtos, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }
        : atual,
    );

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-marca">
          <span className="marca marca-pequena" aria-hidden="true">
            {iniciais(sessao.loja ?? 'Minha loja')}
          </span>
          <div>
            <strong>{sessao.loja ?? 'Minha loja'}</strong>
            <span className="suave topo-usuario">{sessao.nome}</span>
          </div>
        </div>
        <button type="button" className="botao" onClick={aoSair}>
          Sair
        </button>
      </header>

      <main className="conteudo">
        {estado.tipo === 'bloqueado' ? (
          <section className="painel">
            <p className="alerta alerta-erro" role="alert">
              {estado.mensagem}
            </p>
            <button type="button" className="botao botao-primario" onClick={aoSair}>
              Entrar com outra conta
            </button>
          </section>
        ) : (
          <>
            <FormNovoProduto api={api} aoCriar={aoCriar} />
            <section className="painel">
              <div className="painel-cabecalho">
                <h2>Produtos</h2>
                {estado.tipo === 'pronto' && <span className="suave">{estado.produtos.length} cadastrados</span>}
              </div>
              {estado.tipo === 'pronto' && estado.avisoRede && (
                <p className="alerta alerta-aviso" role="status">
                  Sem conexão com o servidor. Tentando de novo…
                </p>
              )}
              {estado.tipo === 'carregando' ? (
                <p className="suave">Carregando…</p>
              ) : estado.produtos.length === 0 ? (
                <p className="vazio">Nenhum produto cadastrado ainda.</p>
              ) : (
                <ListaProdutos produtos={estado.produtos} />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ListaProdutos({ produtos }: { produtos: Produto[] }) {
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>Código</th>
          <th>Produto</th>
          <th className="numero">Preço</th>
        </tr>
      </thead>
      <tbody>
        {produtos.map((p) => (
          <tr key={p.id}>
            <td data-rotulo="Código" className="codigos">
              <span className="mono">{p.codigoInterno}</span>
              <small className={p.codigoBarras ? 'mono suave' : 'suave'}>{p.codigoBarras ?? 'sem código de barras'}</small>
            </td>
            <td data-rotulo="Produto">{p.nome}</td>
            <td data-rotulo="Preço" className="numero">
              {formatarCentavos(p.precoCentavos)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Cadastro rápido de produto. Usado aqui e na aba Produtos e estoque do painel. */
export function FormNovoProduto({ api, aoCriar }: { api: Pick<ApiProdutos, 'criarProduto'>; aoCriar: (p: Produto) => void }) {
  const [nome, setNome] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [preco, setPreco] = useState('');
  const [erros, setErros] = useState<ErroCampo[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refNome = useRef<HTMLInputElement>(null);
  const refPreco = useRef<HTMLInputElement>(null);

  const erroDe = (campo: string) => erros.find((e) => e.campo === campo)?.mensagem;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setMensagem(null);

    const precoCentavos = reaisParaCentavos(preco);
    if (precoCentavos === null) {
      setErros([{ campo: 'precoCentavos', mensagem: 'Informe um preço válido (ex.: 12,90).' }]);
      return;
    }
    const validacao = validarNovoProduto({ nome, codigoBarras, precoCentavos });
    if (!validacao.ok) {
      setErros(validacao.erros);
      return;
    }

    setEnviando(true);
    try {
      const criado = await api.criarProduto(validacao.valor);
      aoCriar(criado);
      setNome('');
      setCodigoBarras('');
      setPreco('');
      setErros([]);
      setMensagem(`“${criado.nome}” cadastrado com o código ${criado.codigoInterno}.`);
      refNome.current?.focus();
    } catch (e) {
      const erro = e instanceof ErroApi ? e : new ErroApi(0, 'Algo deu errado.');
      setErros(erro.erros);
      setMensagem(erro.erros.length > 0 ? null : erro.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="painel">
      <h2>Novo produto</h2>
      <form className="form" onSubmit={enviar} noValidate>
        <Campo id="nome" rotulo="Nome" erro={erroDe('nome')} largo>
          <input id="nome" ref={refNome} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoComplete="off" />
        </Campo>
        <Campo id="codigoBarras" rotulo="Código de barras (opcional)" erro={erroDe('codigoBarras')}>
          <input
            id="codigoBarras"
            value={codigoBarras}
            onChange={(e) => setCodigoBarras(e.target.value)}
            // O leitor "digita" o código e manda Enter: vai para o preço em vez de enviar o formulário.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                refPreco.current?.focus();
              }
            }}
            maxLength={64}
            autoComplete="off"
            inputMode="numeric"
            placeholder="Leia ou digite"
          />
        </Campo>
        <Campo id="preco" rotulo="Preço (R$)" erro={erroDe('precoCentavos')}>
          <input id="preco" ref={refPreco} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" autoComplete="off" />
        </Campo>
        <div className="form-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Cadastrar'}
          </button>
        </div>
      </form>
      {mensagem && (
        <p className="alerta" role="status">
          {mensagem}
        </p>
      )}
    </section>
  );
}

function Campo(props: { id: string; rotulo: string; erro: string | undefined; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className={`campo${props.largo ? ' campo-largo' : ''}${props.erro ? ' campo-com-erro' : ''}`}>
      <label htmlFor={props.id}>{props.rotulo}</label>
      {props.children}
      {props.erro && <span className="campo-erro">{props.erro}</span>}
    </div>
  );
}
