// apps/web/src/painel/produtos/ModalProduto.tsx
// Cadastrar e alterar produto (DaniPets PRD-01, 04 e 05): nome, código de barras, marca, peso, como é
// vendido (unidade ou quilo), preço; no cadastro, o estoque inicial e (Dono e Administrador) o custo dele.
//   - produto com o mesmo nome, marca e peso: pergunta antes ("Cadastrar mesmo assim?"), como o DaniPets;
//   - alterar nome ou código de barras de produto com vendas ou movimentos: pergunta antes (é o mesmo
//     produto daqui para frente); a unidade não muda com história (o servidor da demonstração recusa).
import {
  type AlteracaoProduto,
  type ErroCampo,
  formatarCentavos,
  lerQuantidade,
  type NovoProduto,
  NOME_UNIDADE,
  quantidadeParaTexto,
  reaisParaCentavos,
  type UnidadeVenda,
  validarAlteracaoProduto,
  validarNovoProduto,
} from '@saas/core';
import { type FormEvent, type InputHTMLAttributes, useState } from 'react';
import { type ApiProdutos, ErroApi, type Produto } from '../../api';
import { Modal } from '../caixa/Modal';

interface Props {
  api: Pick<ApiProdutos, 'criarProduto' | 'alterarProduto'>;
  /** null = cadastro novo. */
  produto: Produto | null;
  /** Unidades que a loja usa (Regras do estoque). */
  unidades: readonly UnidadeVenda[];
  /** Dono e Administrador: informam o custo do estoque inicial. */
  podeCusto: boolean;
  aoSalvar: (p: Produto, mensagem: string) => void;
  aoFechar: () => void;
  /** Para testes: a pergunta "mesmo assim?". */
  confirmar?: (texto: string) => boolean;
}

const centavosParaReais = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function ModalProduto({ api, produto, unidades, podeCusto, aoSalvar, aoFechar, confirmar = (t) => window.confirm(t) }: Props) {
  const editando = produto !== null;
  const [nome, setNome] = useState(produto?.nome ?? '');
  const [codigoBarras, setCodigoBarras] = useState(produto?.codigoBarras ?? '');
  const [marca, setMarca] = useState(produto?.marca ?? '');
  const [peso, setPeso] = useState(produto?.pesoGramas ? quantidadeParaTexto(produto.pesoGramas, 'kg') : '');
  const [unidade, setUnidade] = useState<UnidadeVenda>(produto?.unidade ?? unidades[0] ?? 'un');
  const [preco, setPreco] = useState(centavosParaReais(produto?.precoCentavos));
  const [estoque, setEstoque] = useState('');
  const [custo, setCusto] = useState('');
  const [erros, setErros] = useState<ErroCampo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const erroDe = (campo: string) => erros.find((e) => e.campo === campo)?.mensagem;
  const opcoesUnidade = editando && produto.unidade && !unidades.includes(produto.unidade) ? [...unidades, produto.unidade] : unidades;
  const unidadePresa = editando && produto.temHistorico === true;

  /** Lê o formulário; null = já mostrou o erro. */
  function montar(): { dados: NovoProduto } | { mudanca: AlteracaoProduto } | null {
    const precoCentavos = reaisParaCentavos(preco);
    const pesoGramas = peso.trim() === '' ? null : lerQuantidade(peso, 'kg');
    const lidos: ErroCampo[] = [];
    if (precoCentavos === null) lidos.push({ campo: 'precoCentavos', mensagem: 'Informe um preço válido (ex.: 12,90).' });
    if (pesoGramas === null && peso.trim() !== '') lidos.push({ campo: 'pesoGramas', mensagem: 'Peso em kg, com até 3 casas (ex.: 15 ou 0,5).' });
    if (editando) {
      if (lidos.length) return setErros(lidos), null;
      const base: Required<AlteracaoProduto> = {
        nome,
        codigoBarras: codigoBarras.trim() || null,
        precoCentavos: precoCentavos!,
        marca: marca.trim() || null,
        pesoGramas,
        unidade,
      };
      const antes: Required<AlteracaoProduto> = {
        nome: produto.nome,
        codigoBarras: produto.codigoBarras,
        precoCentavos: produto.precoCentavos,
        marca: produto.marca ?? null,
        pesoGramas: produto.pesoGramas ?? null,
        unidade: produto.unidade ?? 'un',
      };
      const norm = (v: unknown) => (typeof v === 'string' ? v.normalize('NFC').trim() : v);
      const mudanca = Object.fromEntries(Object.entries(base).filter(([k, v]) => norm(v) !== norm(antes[k as keyof AlteracaoProduto])));
      if (Object.keys(mudanca).length === 0) return setErros([{ campo: '_', mensagem: 'Nada mudou.' }]), null;
      const v = validarAlteracaoProduto(mudanca);
      if (!v.ok) return setErros(v.erros), null;
      return { mudanca: v.valor };
    }
    const estoqueInicial = estoque.trim() === '' ? 0 : lerQuantidade(estoque, unidade);
    const custoInicialCentavos = custo.trim() === '' ? null : reaisParaCentavos(custo);
    if (estoqueInicial === null) lidos.push({ campo: 'estoqueInicial', mensagem: unidade === 'kg' ? 'Estoque em kg, com até 3 casas (ex.: 25 ou 12,5).' : 'Estoque em unidades inteiras.' });
    if (custoInicialCentavos === null && custo.trim() !== '') lidos.push({ campo: 'custoInicialCentavos', mensagem: 'Informe um custo válido (ex.: 8,50).' });
    if (lidos.length) return setErros(lidos), null;
    const dados = {
      nome,
      codigoBarras: codigoBarras.trim() || null,
      precoCentavos: precoCentavos!,
      marca: marca.trim() || null,
      pesoGramas,
      unidade,
      estoqueInicial: estoqueInicial!,
      custoInicialCentavos: podeCusto ? custoInicialCentavos : null,
    };
    const v = validarNovoProduto(dados, { completo: true });
    if (!v.ok) return setErros(v.erros), null;
    return { dados: v.valor };
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros([]);
    const pedido = montar();
    if (!pedido) return;
    if ('mudanca' in pedido && produto?.temHistorico && (pedido.mudanca.nome !== undefined || pedido.mudanca.codigoBarras !== undefined)) {
      const ok = confirmar(
        `"${produto.nome}" já tem vendas ou movimentos de estoque. Mudar o nome ou o código de barras muda este mesmo produto daqui para frente (o saldo continua o mesmo). Se é outro produto, cancele e use "Cadastrar produto". Continuar?`,
      );
      if (!ok) return;
    }
    setEnviando(true);
    const enviar = (mesmoAssim: boolean) =>
      'mudanca' in pedido ? api.alterarProduto(produto!.id, pedido.mudanca, { mesmoAssim }) : api.criarProduto(pedido.dados, { mesmoAssim });
    try {
      let salvo: Produto;
      try {
        salvo = await enviar(false);
      } catch (e) {
        if (!(e instanceof ErroApi && e.codigo === 'produto_parecido')) throw e;
        if (!confirmar(`${e.message} Salvar mesmo assim?`)) return;
        salvo = await enviar(true);
      }
      aoSalvar(salvo, editando ? `${salvo.nome}: alterações salvas.` : `${salvo.nome} cadastrado com o código ${salvo.codigoInterno} (${formatarCentavos(salvo.precoCentavos)}${salvo.unidade === 'kg' ? ' o kg' : ''}).`);
    } catch (e) {
      setErros(e instanceof ErroApi ? (e.erros.length ? e.erros : [{ campo: '_', mensagem: e.message }]) : [{ campo: '_', mensagem: 'Não foi possível salvar. Tente de novo.' }]);
    } finally {
      setEnviando(false);
    }
  }

  const erroGeral = erros.find((e) => !['nome', 'codigoBarras', 'precoCentavos', 'marca', 'pesoGramas', 'unidade', 'estoqueInicial', 'custoInicialCentavos'].includes(e.campo));
  const campo = (id: string, rotulo: string, nomeCampo: string, valor: string, mudar: (v: string) => void, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`campo${erroDe(nomeCampo) ? ' campo-com-erro' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} value={valor} onChange={(e) => mudar(e.target.value)} aria-invalid={Boolean(erroDe(nomeCampo))} {...extra} />
      {erroDe(nomeCampo) && <span className="campo-erro">{erroDe(nomeCampo)}</span>}
    </div>
  );

  return (
    <Modal titulo={editando ? `Alterar produto: ${produto.nome}` : 'Cadastrar produto'} aoFechar={aoFechar} larga>
      <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
        {editando && (
          <p className="modal-sub">
            Código interno <b className="mono">{produto.codigoInterno}</b> (do sistema, não muda).
          </p>
        )}
        {campo('prod-nome', 'Nome do produto', 'nome', nome, setNome, { maxLength: 120, placeholder: 'Ex.: Ração Premium Cães Adultos' })}
        <div className="modal-grade">
          {campo('prod-codigo', 'Código de barras (opcional)', 'codigoBarras', codigoBarras, setCodigoBarras, { inputMode: 'numeric', maxLength: 64 })}
          {campo('prod-marca', 'Marca (opcional)', 'marca', marca, setMarca, { maxLength: 60 })}
        </div>
        <div className="modal-grade">
          <div className={`campo${erroDe('unidade') ? ' campo-com-erro' : ''}`}>
            <label htmlFor="prod-unidade">Vendido por</label>
            <select id="prod-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeVenda)} disabled={unidadePresa || opcoesUnidade.length < 2}>
              {opcoesUnidade.map((u) => (
                <option key={u} value={u}>
                  {NOME_UNIDADE[u]}
                </option>
              ))}
            </select>
            {unidadePresa && <span className="modal-dica">Já tem vendas ou movimentos: a unidade não muda.</span>}
            {erroDe('unidade') && <span className="campo-erro">{erroDe('unidade')}</span>}
          </div>
          {campo('prod-peso', 'Peso da embalagem em kg (opcional)', 'pesoGramas', peso, setPeso, { inputMode: 'decimal', placeholder: 'Ex.: 15 ou 0,5' })}
        </div>
        {campo('prod-preco', unidade === 'kg' ? 'Preço do quilo (R$)' : 'Preço de venda (R$)', 'precoCentavos', preco, setPreco, { inputMode: 'decimal', placeholder: '0,00' })}
        {!editando && (
          <div className="modal-grade">
            {campo('prod-estoque', unidade === 'kg' ? 'Estoque inicial em kg (opcional)' : 'Estoque inicial em unidades (opcional)', 'estoqueInicial', estoque, setEstoque, {
              inputMode: unidade === 'kg' ? 'decimal' : 'numeric',
              placeholder: '0',
            })}
            {podeCusto &&
              campo('prod-custo', unidade === 'kg' ? 'Custo do kg do estoque inicial (R$, opcional)' : 'Custo de cada unidade do estoque inicial (R$, opcional)', 'custoInicialCentavos', custo, setCusto, {
                inputMode: 'decimal',
                placeholder: 'Opcional',
              })}
          </div>
        )}
        {!editando && <p className="modal-dica">Depois do cadastro, o estoque muda só por entrada, ajuste, venda e devolução.</p>}
        {erroGeral && (
          <p className="alerta alerta-erro" role="alert">
            {erroGeral.mensagem}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
