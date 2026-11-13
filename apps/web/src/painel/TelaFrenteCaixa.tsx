// apps/web/src/painel/TelaFrenteCaixa.tsx
// Frente de caixa: busca o produto (leitor de código, código interno ou nome),
// monta o carrinho, escolhe a forma de pagamento e finaliza.
// A tela só manda produto + quantidade + forma de pagamento. Quem vendeu é a
// pessoa logada (a API registra) e o preço sai do cadastro, nunca da tela.
import {
  type FormaPagamento,
  FORMAS_PAGAMENTO,
  formatarCentavos,
  LIMITES_VENDA,
  NOME_FORMA_PAGAMENTO,
  type Venda,
} from '@saas/core';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { type ApiPainel, ErroApi, type Produto } from '../api';
import { plural } from './formato';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiPainel;
  /** Quem está operando (só para mostrar; quem registra é a API). */
  operador: { nome: string; papel: string };
  aoVender?: (venda: Venda) => void;
}

interface Linha {
  produto: Produto;
  quantidade: number;
}

/** Sem acento e em minúsculas, para buscar "racao" e achar "Ração". */
const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function TelaFrenteCaixa({ api, operador, aoVender }: Props) {
  const { estado } = usarCarga(() => api.listarProdutos(), [api]);
  const produtos = useMemo(() => (estado.tipo === 'pronto' ? estado.dados.filter((p) => p.ativo) : []), [estado]);

  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultima, setUltima] = useState<Venda | null>(null);
  const refBusca = useRef<HTMLInputElement>(null);

  const termo = normalizar(busca);
  const sugestoes = termo
    ? produtos
        .filter((p) => p.codigoInterno === termo || p.codigoBarras === termo || normalizar(p.nome).includes(termo) || p.codigoInterno.startsWith(termo))
        .slice(0, 8)
    : [];

  const total = linhas.reduce((s, l) => s + l.produto.precoCentavos * l.quantidade, 0);
  const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);

  function adicionar(produto: Produto) {
    setUltima(null);
    setErro(null);
    setLinhas((atual) => {
      const existe = atual.find((l) => l.produto.id === produto.id);
      if (existe) {
        return atual.map((l) =>
          l.produto.id === produto.id ? { ...l, quantidade: Math.min(l.quantidade + 1, LIMITES_VENDA.quantidadeMax) } : l,
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
    setBusca('');
    setAviso(null);
    refBusca.current?.focus();
  }

  function aoBuscar(ev: FormEvent) {
    ev.preventDefault();
    if (!termo) return;
    // Código exato (leitor manda o código + Enter) tem prioridade.
    const exato = produtos.find((p) => p.codigoBarras === termo || p.codigoInterno === termo);
    if (exato) return adicionar(exato);
    if (sugestoes.length === 1) return adicionar(sugestoes[0]!);
    setAviso(sugestoes.length === 0 ? `Nenhum produto encontrado para “${busca.trim()}”.` : 'Mais de um produto encontrado: escolha na lista.');
  }

  const mudarQuantidade = (id: string, quantidade: number) =>
    setLinhas((atual) =>
      atual.map((l) => (l.produto.id === id ? { ...l, quantidade: Math.max(1, Math.min(LIMITES_VENDA.quantidadeMax, quantidade)) } : l)),
    );
  const remover = (id: string) => setLinhas((atual) => atual.filter((l) => l.produto.id !== id));

  function cancelar() {
    if (linhas.length && !window.confirm('Cancelar esta venda e limpar o carrinho?')) return;
    setLinhas([]);
    setForma(null);
    setErro(null);
    refBusca.current?.focus();
  }

  async function finalizar() {
    if (!forma || linhas.length === 0 || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const venda = await api.criarVenda({
        itens: linhas.map((l) => ({ produtoId: l.produto.id, quantidade: l.quantidade })),
        formaPagamento: forma,
      });
      setUltima(venda);
      setLinhas([]);
      setForma(null);
      aoVender?.(venda);
      refBusca.current?.focus();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível registrar a venda. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  if (estado.tipo === 'bloqueado' || estado.tipo === 'falhou') {
    return (
      <p className="alerta alerta-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }

  return (
    <div className="pdv">
      <header className="pdv-topo">
        <div>
          <h1>Frente de caixa</h1>
          <p className="suave">
            Operador: <b className="pdv-operador">{operador.nome}</b> ({operador.papel})
          </p>
        </div>
      </header>

      <div className="pdv-corpo">
        <section className="card pdv-carrinho" aria-labelledby="pdv-carrinho-titulo">
          <form className="pdv-busca" onSubmit={aoBuscar} role="search">
            <label htmlFor="pdv-busca">Código ou nome do produto</label>
            <input
              id="pdv-busca"
              ref={refBusca}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAviso(null);
              }}
              placeholder={estado.tipo === 'carregando' ? 'Carregando produtos…' : 'Leia o código de barras ou digite'}
              autoComplete="off"
              autoFocus
              aria-describedby={aviso ? 'pdv-aviso' : undefined}
              aria-controls="pdv-sugestoes"
            />
            {aviso && (
              <p id="pdv-aviso" className="campo-erro" role="status">
                {aviso}
              </p>
            )}
            {sugestoes.length > 0 && (
              <ul id="pdv-sugestoes" className="pdv-sugestoes" aria-label="Produtos encontrados">
                {sugestoes.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => adicionar(p)}>
                      <span className="mono suave">{p.codigoInterno}</span>
                      <span className="pdv-sug-nome">{p.nome}</span>
                      <span className="numero">{formatarCentavos(p.precoCentavos)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div className="card-cabeca">
            <h2 id="pdv-carrinho-titulo">Itens da venda</h2>
            <span className="suave">{plural(unidades, 'unidade', 'unidades')}</span>
          </div>
          {linhas.length === 0 ? (
            <p className="vazio">Nenhum item ainda. Leia o código de barras ou busque o produto acima.</p>
          ) : (
            <ul className="pdv-linhas" aria-label="Itens da venda">
              {linhas.map((l) => (
                <li key={l.produto.id} className="pdv-linha">
                  <div className="pdv-linha-produto">
                    <b>{l.produto.nome}</b>
                    <small className="suave mono">
                      {l.produto.codigoInterno} · {formatarCentavos(l.produto.precoCentavos)} cada
                    </small>
                  </div>
                  <div className="pdv-qtd" role="group" aria-label={`Quantidade de ${l.produto.nome}`}>
                    <button type="button" onClick={() => mudarQuantidade(l.produto.id, l.quantidade - 1)} disabled={l.quantidade <= 1} aria-label="Diminuir">
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={LIMITES_VENDA.quantidadeMax}
                      value={l.quantidade}
                      aria-label="Quantidade"
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(n)) mudarQuantidade(l.produto.id, n);
                      }}
                    />
                    <button type="button" onClick={() => mudarQuantidade(l.produto.id, l.quantidade + 1)} aria-label="Aumentar">
                      +
                    </button>
                  </div>
                  <span className="numero pdv-subtotal">{formatarCentavos(l.produto.precoCentavos * l.quantidade)}</span>
                  <button type="button" className="pdv-remover" onClick={() => remover(l.produto.id)} aria-label={`Remover ${l.produto.nome}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="card pdv-pagamento" aria-labelledby="pdv-total-titulo">
          <h2 id="pdv-total-titulo" className="pdv-total-rotulo">
            Total
          </h2>
          <strong className="pdv-total" data-testid="pdv-total">
            {formatarCentavos(total)}
          </strong>

          <fieldset className="pdv-formas">
            <legend>Forma de pagamento</legend>
            {FORMAS_PAGAMENTO.map((f) => (
              <label key={f} className={`pdv-forma${forma === f ? ' pdv-forma-on' : ''}`}>
                <input type="radio" name="forma" value={f} checked={forma === f} onChange={() => setForma(f)} />
                {NOME_FORMA_PAGAMENTO[f]}
              </label>
            ))}
          </fieldset>

          {erro && (
            <p className="alerta alerta-erro" role="alert">
              {erro}
            </p>
          )}

          <button
            type="button"
            className="botao botao-primario botao-grande pdv-finalizar"
            onClick={() => void finalizar()}
            disabled={linhas.length === 0 || !forma || enviando}
          >
            {enviando ? 'Registrando…' : 'Finalizar venda'}
          </button>
          {linhas.length > 0 && !forma && <p className="suave pdv-dica">Escolha a forma de pagamento para finalizar.</p>}
          <button type="button" className="botao pdv-cancelar" onClick={cancelar} disabled={linhas.length === 0 || enviando}>
            Cancelar venda
          </button>

          {ultima && (
            <p className="alerta pdv-sucesso" role="status">
              Venda nº {ultima.numero} registrada: <b>{formatarCentavos(ultima.totalCentavos)}</b> em{' '}
              {NOME_FORMA_PAGAMENTO[ultima.formaPagamento]}, por {ultima.vendedor.nome}. Já aparece na Visão geral.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
