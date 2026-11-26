// packages/core/src/importacao.ts
// IMPORTAR PLANILHAS de cadastro (Fase 2, módulo 13; DaniPets DAT-07; pedido do Luan, 25/11/2026): produtos, clientes e
// fornecedores de uma planilha (.xlsx ou .csv) com as colunas do modelo (modelosDePlanilha.ts). Regras:
//   - a planilha chega como uma TABELA, com os títulos na primeira linha. Cada coluna é achada pelo título, sem
//     diferenciar maiúsculas, acentos e espaços. Coluna que não é do modelo fica de fora; se falta coluna obrigatória, o
//     arquivo é recusado;
//   - cada linha é conferida com as regras do cadastro (validarNovoProduto, validarNovoCliente, validarFornecedor);
//   - ACRESCENTA SÓ O QUE NÃO EXISTE (DaniPets DAT-07). O que já está cadastrado (mesmo código de barras, CPF, documento
//     ou nome) fica de fora, sem mudar nada. O que se repete na própria planilha entra uma vez só;
//   - cliente sem CPF ou sem telefone entra com o cadastro incompleto (decisão de 25/11/2026: é comum em quem vem de outro
//     sistema). Ele aparece no filtro "Cadastro incompleto" e só compra no fiado depois de completar;
//   - linha com erro: a prévia mostra o número da linha e o motivo, e a importação leva só as linhas certas se a pessoa
//     confirmar. A gravação é tudo ou nada (quem grava é a API).
import { type Cliente, mascararCpf, type NovoCliente, validarNovoCliente } from './cliente';
import { reaisParaCentavos } from './dinheiro';
import { validarEstoqueMinimo } from './estoque';
import { type Fornecedor, type NovoFornecedor, validarFornecedor } from './fornecedor';
import { soDigitos } from './interno';
import { type CadastroDaPlanilha, colunasClientes, COLUNAS_FORNECEDORES, COLUNAS_PRODUTOS, type ColunaDoModelo } from './modelosDePlanilha';
import { type NovoProduto, produtoParecido, validarNovoProduto } from './produto';
import type { UnidadeVenda } from './quantidade';
import type { Resultado } from './resultado';
import { semAcento } from './texto';

/** Uma célula como veio do arquivo: texto, número, sim/não ou vazia. */
export type CelulaImportada = string | number | boolean | null;
/** A planilha lida, com os títulos na primeira linha. */
export type TabelaImportada = readonly (readonly CelulaImportada[])[];

export const LIMITES_IMPORTACAO = { linhasMax: 5000, colunasMax: 60 } as const;

export type SituacaoDaLinha = 'nova' | 'existe' | 'repetida' | 'erro';

export const NOME_DA_SITUACAO: Record<SituacaoDaLinha, string> = { nova: 'Entra', existe: 'Já cadastrado', repetida: 'Repetida na planilha', erro: 'Com erro' };

export interface LinhaConferida<T> {
  /** O número da linha na planilha (a dos títulos é a 1). */
  numero: number;
  situacao: SituacaoDaLinha;
  /** O nome do produto, do cliente ou do fornecedor (para a pessoa achar a linha). */
  nome: string;
  /** O erro, ou por que a linha fica de fora. */
  motivos: string[];
  /** Entra, mas com uma observação (ex.: cadastro incompleto, custo ignorado). */
  avisos: string[];
  /** O que vai ser cadastrado (só na linha nova). */
  valor: T | null;
}

export interface ConferenciaDaImportacao<T> {
  cadastro: CadastroDaPlanilha;
  /** As colunas do modelo achadas na planilha. */
  colunas: string[];
  /** Os títulos da planilha que ficam de fora (não são do modelo, ou são só de consulta). */
  ignoradas: string[];
  linhas: LinhaConferida<T>[];
  contagem: Record<SituacaoDaLinha, number>;
}

/** Para achar a coluna: sem acento, minúsculo e com um espaço só. */
export const tituloNormalizado = (t: unknown): string => semAcento(String(t ?? '')).replace(/\s+/g, ' ');

// ------------------------------------------------------------------ células

type Lido<T> = { ok: true; valor: T } | { ok: false };
const lido = <T>(valor: T): Lido<T> => ({ ok: true, valor });
const falhou = { ok: false } as const;

/** Texto da célula: número vira texto como está (o código de barras salvo como número no Excel não perde nada). */
export function textoDaCelula(c: CelulaImportada | undefined): string {
  if (c === null || c === undefined) return '';
  if (typeof c === 'boolean') return c ? 'Sim' : 'Não';
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : '';
  return c.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Dinheiro: número da planilha (24,9) ou texto ("R$ 1.234,56", "24,90"). Vazio = null. */
export function dinheiroDaCelula(c: CelulaImportada | undefined): Lido<number | null> {
  if (typeof c === 'number') return Number.isFinite(c) && c >= 0 ? lido(Math.round(c * 100)) : falhou;
  const t = textoDaCelula(c);
  if (t === '') return lido(null);
  const centavos = reaisParaCentavos(t);
  return centavos === null ? falhou : lido(centavos);
}

/** Número: da planilha, ou texto com vírgula ("2,5", "1.234,5") ou ponto ("2.5"). Vazio = null. */
export function numeroDaCelula(c: CelulaImportada | undefined): Lido<number | null> {
  if (typeof c === 'number') return Number.isFinite(c) ? lido(c) : falhou;
  const t = textoDaCelula(c).replace(/\s/g, '');
  if (t === '') return lido(null);
  let normal: string | null = null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) normal = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+([.,]\d+)?$/.test(t)) normal = t.replace(',', '.');
  return normal === null ? falhou : lido(Number(normal));
}

const diaReal = (a: number, m: number, d: number) => {
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Data: número de data do Excel, "dd/mm/aaaa" ou "aaaa-mm-dd". Volta "AAAA-MM-DD"; vazio = null. */
export function dataDaCelula(c: CelulaImportada | undefined): Lido<string | null> {
  if (typeof c === 'number') {
    // o Excel conta os dias desde 30/12/1899
    if (!Number.isFinite(c) || c < 1 || c > 2_958_465) return falhou;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86_400_000);
    return lido(`${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`);
  }
  const t = textoDaCelula(c);
  if (t === '') return lido(null);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
  const [a, m, d] = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0];
  if (!a || !diaReal(a, m, d)) return falhou;
  return lido(`${a}-${doisDigitos(m)}-${doisDigitos(d)}`);
}

const SIM = new Set(['sim', 's', 'yes', 'y', 'x', '1', 'true', 'verdadeiro', 'v']);
const NAO = new Set(['nao', 'n', 'no', '0', 'false', 'falso', 'f']);

/** Sim ou não ("Sim", "S", "X", "1" / "Não", "N", "0"). Vazio = null. */
export function simNaoDaCelula(c: CelulaImportada | undefined): Lido<boolean | null> {
  if (typeof c === 'boolean') return lido(c);
  const t = tituloNormalizado(textoDaCelula(c));
  if (t === '') return lido(null);
  if (SIM.has(t)) return lido(true);
  if (NAO.has(t)) return lido(false);
  return falhou;
}

// ------------------------------------------------------------------ títulos

interface Cabecalho {
  /** Título do modelo → índice da coluna na planilha. */
  indice: Map<string, number>;
  colunas: string[];
  ignoradas: string[];
}

const vazia = (linha: readonly CelulaImportada[] | undefined) => !linha || linha.every((c) => textoDaCelula(c) === '');
const listaDeNomes = (nomes: string[]) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? ''));

/** Acha as colunas do modelo pelos títulos da primeira linha. Falta coluna obrigatória: o arquivo é recusado. */
export function lerCabecalho(tabela: TabelaImportada, colunas: readonly ColunaDoModelo[]): Resultado<Cabecalho> {
  const erro = (mensagem: string): Resultado<never> => ({ ok: false, erros: [{ campo: 'arquivo', mensagem }] });
  if (tabela.length === 0 || vazia(tabela[0])) return erro('A planilha está vazia: a primeira linha precisa ter os títulos das colunas.');
  if (tabela.length - 1 > LIMITES_IMPORTACAO.linhasMax) {
    return erro(`A planilha tem mais de ${LIMITES_IMPORTACAO.linhasMax.toLocaleString('pt-BR')} linhas. Divida em arquivos menores.`);
  }
  const titulos = (tabela[0] ?? []).slice(0, LIMITES_IMPORTACAO.colunasMax).map((c) => textoDaCelula(c));
  const doModelo = new Map(colunas.map((c) => [tituloNormalizado(c.titulo), c]));
  const indice = new Map<string, number>();
  const ignoradas: string[] = [];
  titulos.forEach((t, i) => {
    if (t === '') return;
    const coluna = doModelo.get(tituloNormalizado(t));
    if (!coluna || coluna.soConsulta) ignoradas.push(t);
    else if (!indice.has(coluna.titulo)) indice.set(coluna.titulo, i);
  });
  const faltam = colunas.filter((c) => c.obrigatoria && !indice.has(c.titulo)).map((c) => `"${c.titulo}"`);
  if (faltam.length > 0) {
    return erro(`A planilha não tem ${faltam.length > 1 ? 'as colunas' : 'a coluna'} ${listaDeNomes(faltam)}. Baixe o modelo para conferir os títulos.`);
  }
  return { ok: true, valor: { indice, colunas: colunas.filter((c) => indice.has(c.titulo)).map((c) => c.titulo), ignoradas } };
}

/** As linhas de dados (sem as totalmente vazias), com o número de cada uma na planilha. */
function linhasDeDados(tabela: TabelaImportada): { numero: number; celulas: readonly CelulaImportada[] }[] {
  return tabela
    .slice(1)
    .map((celulas, i) => ({ numero: i + 2, celulas }))
    .filter((l) => !vazia(l.celulas));
}

function contar<T>(linhas: LinhaConferida<T>[]): Record<SituacaoDaLinha, number> {
  const c: Record<SituacaoDaLinha, number> = { nova: 0, existe: 0, repetida: 0, erro: 0 };
  for (const l of linhas) c[l.situacao] += 1;
  return c;
}

/** Lê as células de uma linha pelo título da coluna (coluna que não está na planilha: undefined). */
const leitor = (cab: Cabecalho, celulas: readonly CelulaImportada[]) => (titulo: string) => {
  const i = cab.indice.get(titulo);
  return i === undefined ? undefined : (celulas[i] ?? null);
};

const chave = (t: string | null | undefined) => tituloNormalizado(t ?? '');

// ------------------------------------------------------------------ produtos

export interface ContextoProdutos {
  existentes: readonly { id: string; nome: string; codigoInterno: string; codigoBarras: string | null; marca?: string | null; pesoGramas?: number | null }[];
  fornecedores: readonly Pick<Fornecedor, 'id' | 'nome' | 'ativo'>[];
  /** As unidades que a loja usa (regras de Produtos e estoque). */
  unidades: readonly UnidadeVenda[];
  /** Custo do estoque inicial: só o Dono e o Administrador. */
  podeCusto: boolean;
  /** Estoque mínimo: quem lança no estoque. */
  podeMinimo: boolean;
}

export interface ProdutoImportado {
  produto: NovoProduto;
  /** Estoque mínimo (unidades, ou gramas no produto por kg). */
  minimo: number | null;
}

const UNIDADE_DO_TEXTO: Record<string, UnidadeVenda> = { un: 'un', und: 'un', unid: 'un', unidade: 'un', u: 'un', kg: 'kg', quilo: 'kg', kilo: 'kg', quilograma: 'kg', granel: 'kg' };

export function conferirProdutos(tabela: TabelaImportada, ctx: ContextoProdutos): Resultado<ConferenciaDaImportacao<ProdutoImportado>> {
  const cab = lerCabecalho(tabela, COLUNAS_PRODUTOS);
  if (!cab.ok) return cab;
  const ativos = new Map(ctx.fornecedores.filter((f) => f.ativo).map((f) => [chave(f.nome), f]));
  const todosFornecedores = new Map(ctx.fornecedores.map((f) => [chave(f.nome), f]));
  const naPlanilha: { numero: number; codigoBarras: string | null; nome: string; marca: string | null; pesoGramas: number | null; id: string }[] = [];
  const linhas: LinhaConferida<ProdutoImportado>[] = [];

  for (const { numero, celulas } of linhasDeDados(tabela)) {
    const ler = leitor(cab.valor, celulas);
    const motivos: string[] = [];
    const avisos: string[] = [];
    const nome = textoDaCelula(ler('Nome'));
    const codigoBarras = textoDaCelula(ler('Código de barras')).replace(/\s/g, '') || null;
    const marca = textoDaCelula(ler('Marca')) || null;

    const textoUnidade = tituloNormalizado(textoDaCelula(ler('Unidade')));
    const unidade: UnidadeVenda = textoUnidade === '' ? 'un' : (UNIDADE_DO_TEXTO[textoUnidade] ?? 'un');
    if (textoUnidade !== '' && !UNIDADE_DO_TEXTO[textoUnidade]) motivos.push(`Unidade "${textoDaCelula(ler('Unidade'))}": use un (por unidade) ou kg (por quilo).`);
    else if (!ctx.unidades.includes(unidade)) motivos.push(unidade === 'kg' ? 'Esta loja não vende por quilo. Ligue o kg em Produtos e estoque → Regras do estoque.' : 'Esta loja não vende por unidade.');

    const peso = numeroDaCelula(ler('Peso da embalagem (kg)'));
    if (!peso.ok || (peso.valor !== null && peso.valor < 0)) motivos.push('Peso da embalagem: use um número em quilos (15, ou 0,5 para 500 g).');
    const pesoGramas = peso.ok && peso.valor ? Math.round(peso.valor * 1000) : null;

    const preco = dinheiroDaCelula(ler('Preço de venda'));
    if (!preco.ok) motivos.push('Preço de venda: use um valor em reais, como 24,90.');
    else if (preco.valor === null) motivos.push('Informe o preço de venda.');

    const estoque = numeroDaCelula(ler('Estoque'));
    let estoqueInicial = 0;
    if (!estoque.ok || (estoque.valor !== null && estoque.valor < 0)) motivos.push('Estoque: use um número de 0 em diante.');
    else if (estoque.valor !== null) {
      if (unidade === 'un' && !Number.isInteger(estoque.valor)) motivos.push('Estoque: no produto por unidade, use um número inteiro.');
      else estoqueInicial = unidade === 'kg' ? Math.round(estoque.valor * 1000) : estoque.valor;
    }

    const custo = dinheiroDaCelula(ler('Custo'));
    let custoInicialCentavos: number | null = null;
    if (!custo.ok) motivos.push('Custo: use um valor em reais, como 12,50.');
    else if (custo.valor) {
      if (!ctx.podeCusto) avisos.push('O custo fica de fora: só o Dono e o Administrador informam o custo.');
      else if (estoqueInicial === 0) avisos.push('O custo fica de fora: ele vale só para o estoque inicial, e a linha não tem estoque.');
      else custoInicialCentavos = custo.valor;
    }

    const min = numeroDaCelula(ler('Estoque mínimo'));
    let minimo: number | null = null;
    if (!min.ok || (min.valor !== null && min.valor < 0)) motivos.push('Estoque mínimo: use um número de 0 em diante.');
    else if (min.valor) {
      const valor = unidade === 'kg' ? Math.round(min.valor * 1000) : min.valor;
      const v = validarEstoqueMinimo(valor);
      if (!v.ok) motivos.push(`Estoque mínimo: ${v.erros[0]!.mensagem}`);
      else if (!ctx.podeMinimo) avisos.push('O estoque mínimo fica de fora: só quem lança no estoque define o mínimo.');
      else minimo = v.valor;
    }

    const nomeFornecedor = textoDaCelula(ler('Fornecedor'));
    let fornecedorId: string | null = null;
    if (nomeFornecedor) {
      const f = ativos.get(chave(nomeFornecedor));
      if (f) fornecedorId = f.id;
      else avisos.push(todosFornecedores.has(chave(nomeFornecedor)) ? `O fornecedor "${nomeFornecedor}" está desativado: o produto entra sem fornecedor.` : `O fornecedor "${nomeFornecedor}" não está cadastrado: o produto entra sem fornecedor.`);
    }

    let valor: ProdutoImportado | null = null;
    if (motivos.length === 0) {
      const v = validarNovoProduto(
        { nome, codigoBarras, precoCentavos: preco.ok ? preco.valor : null, marca, pesoGramas, unidade, estoqueInicial, custoInicialCentavos, fornecedorId },
        { completo: true },
      );
      if (!v.ok) motivos.push(...v.erros.map((e) => e.mensagem));
      else valor = { produto: v.valor, minimo };
    }
    if (!valor) {
      linhas.push({ numero, situacao: 'erro', nome, motivos, avisos, valor: null });
      continue;
    }

    const p = valor.produto;
    // o que já existe na loja fica de fora; o código de barras não pode ser o código interno de outro produto
    const doCodigo = p.codigoBarras ? ctx.existentes.find((e) => e.codigoBarras === p.codigoBarras) : undefined;
    const doInterno = p.codigoBarras ? ctx.existentes.find((e) => e.codigoInterno === p.codigoBarras) : undefined;
    const parecido = produtoParecido(p, ctx.existentes.map((e) => ({ ...e, id: e.id })));
    const repetida = naPlanilha.find((e) => (p.codigoBarras && e.codigoBarras === p.codigoBarras) || produtoParecido(p, [e]));
    if (doInterno) linhas.push({ numero, situacao: 'erro', nome, motivos: [`O código de barras ${p.codigoBarras} é o código interno do produto "${doInterno.nome}".`], avisos, valor: null });
    else if (doCodigo) linhas.push({ numero, situacao: 'existe', nome, motivos: [`Já cadastrado com o código de barras ${p.codigoBarras}: "${doCodigo.nome}".`], avisos: [], valor: null });
    else if (parecido) linhas.push({ numero, situacao: 'existe', nome, motivos: [`Já cadastrado: "${parecido.nome}" (código ${parecido.codigoInterno}).`], avisos: [], valor: null });
    else if (repetida) linhas.push({ numero, situacao: 'repetida', nome, motivos: [`Repetida: igual à linha ${repetida.numero}.`], avisos: [], valor: null });
    else {
      linhas.push({ numero, situacao: 'nova', nome, motivos: [], avisos, valor });
      naPlanilha.push({ numero, codigoBarras: p.codigoBarras, nome: p.nome, marca: p.marca ?? null, pesoGramas: p.pesoGramas ?? null, id: `linha-${numero}` });
    }
  }
  return { ok: true, valor: { cadastro: 'produtos', colunas: cab.valor.colunas, ignoradas: cab.valor.ignoradas, linhas, contagem: contar(linhas) } };
}

// ------------------------------------------------------------------ clientes

export interface ContextoClientes {
  existentes: readonly Pick<Cliente, 'id' | 'nome' | 'telefone' | 'cpf' | 'ativo'>[];
  /** AAAA-MM-DD: limita o nascimento. */
  hoje: string;
  /** O nome do campo extra da loja ("Pet"), quando ligado. */
  rotuloDoExtra: string | null;
  /** O limite de fiado: só o Dono e o Administrador. */
  podeLimite: boolean;
}

/** Os campos de um cliente para achar o mesmo cliente: o CPF; sem ele, o nome com o telefone. */
const chaveDoCliente = (c: { nome: string; telefone: string; cpf: string }) => (c.cpf ? `cpf:${c.cpf}` : `nome:${chave(c.nome)}|${soDigitos(c.telefone)}`);

export function conferirClientes(tabela: TabelaImportada, ctx: ContextoClientes): Resultado<ConferenciaDaImportacao<NovoCliente>> {
  const cab = lerCabecalho(tabela, colunasClientes(ctx.rotuloDoExtra));
  if (!cab.ok) return cab;
  const existentes = new Map(ctx.existentes.map((c) => [chaveDoCliente(c), c]));
  const naPlanilha = new Map<string, number>();
  const linhas: LinhaConferida<NovoCliente>[] = [];

  for (const { numero, celulas } of linhasDeDados(tabela)) {
    const ler = leitor(cab.valor, celulas);
    const motivos: string[] = [];
    const avisos: string[] = [];
    const nome = textoDaCelula(ler('Nome'));
    const dados: Record<string, unknown> = { nome, telefone: soDigitos(textoDaCelula(ler('Telefone'))), cpf: soDigitos(textoDaCelula(ler('CPF'))) };

    const whatsapp = simNaoDaCelula(ler('WhatsApp'));
    if (!whatsapp.ok) motivos.push('WhatsApp: use Sim ou Não.');
    else if (whatsapp.valor !== null) dados.whatsapp = whatsapp.valor;
    const nascimento = dataDaCelula(ler('Nascimento'));
    if (!nascimento.ok) motivos.push('Nascimento: use dia, mês e ano (dd/mm/aaaa).');
    else if (nascimento.valor) dados.nascimento = nascimento.valor;
    const endereco = textoDaCelula(ler('Endereço'));
    if (endereco) dados.endereco = endereco;
    if (ctx.rotuloDoExtra) {
      const extra = textoDaCelula(ler(ctx.rotuloDoExtra));
      if (extra) dados.extra = extra;
    }
    const limite = dinheiroDaCelula(ler('Limite de fiado'));
    if (!limite.ok) motivos.push('Limite de fiado: use um valor em reais, como 200,00.');
    else if (limite.valor) {
      if (ctx.podeLimite) dados.limiteFiadoCentavos = limite.valor;
      else avisos.push('O limite de fiado fica de fora: só o Dono e o Administrador definem o limite.');
    }
    const mensagens = simNaoDaCelula(ler('Aceita mensagens'));
    if (!mensagens.ok) motivos.push('Aceita mensagens: use Sim ou Não.');
    else if (mensagens.valor) dados.autorizaMensagens = true;
    const observacoes = textoDaCelula(ler('Observações'));
    if (observacoes) dados.observacoes = observacoes;

    let valor: NovoCliente | null = null;
    if (motivos.length === 0) {
      const v = validarNovoCliente(dados, { hoje: ctx.hoje, incompletoPermitido: true });
      if (!v.ok) motivos.push(...v.erros.map((e) => e.mensagem));
      else valor = v.valor;
    }
    if (!valor) {
      linhas.push({ numero, situacao: 'erro', nome, motivos, avisos, valor: null });
      continue;
    }
    const faltam = [!valor.cpf && 'sem CPF', !valor.telefone && 'sem telefone'].filter(Boolean) as string[];
    if (faltam.length) avisos.push(`Cadastro incompleto (${faltam.join(' e ')}): só compra no fiado depois de completar.`);

    const k = chaveDoCliente(valor);
    const existente = existentes.get(k);
    const repetida = naPlanilha.get(k);
    if (existente) {
      const quem = valor.cpf ? `com o CPF ${mascararCpf(valor.cpf)}` : 'com o mesmo nome e telefone';
      linhas.push({ numero, situacao: 'existe', nome, motivos: [`Já cadastrado ${quem}: "${existente.nome}"${existente.ativo ? '' : ' (desativado)'}.`], avisos: [], valor: null });
    } else if (repetida) linhas.push({ numero, situacao: 'repetida', nome, motivos: [`Repetida: o mesmo cliente da linha ${repetida}.`], avisos: [], valor: null });
    else {
      linhas.push({ numero, situacao: 'nova', nome, motivos: [], avisos, valor });
      naPlanilha.set(k, numero);
    }
  }
  return { ok: true, valor: { cadastro: 'clientes', colunas: cab.valor.colunas, ignoradas: cab.valor.ignoradas, linhas, contagem: contar(linhas) } };
}

// ------------------------------------------------------------------ fornecedores

export interface ContextoFornecedores {
  existentes: readonly Pick<Fornecedor, 'id' | 'nome' | 'documento' | 'ativo'>[];
}

export function conferirFornecedores(tabela: TabelaImportada, ctx: ContextoFornecedores): Resultado<ConferenciaDaImportacao<NovoFornecedor>> {
  const cab = lerCabecalho(tabela, COLUNAS_FORNECEDORES);
  if (!cab.ok) return cab;
  const naPlanilha: { numero: number; nome: string; documento: string | null }[] = [];
  const linhas: LinhaConferida<NovoFornecedor>[] = [];

  for (const { numero, celulas } of linhasDeDados(tabela)) {
    const ler = leitor(cab.valor, celulas);
    const nome = textoDaCelula(ler('Nome'));
    const texto = (t: string) => textoDaCelula(ler(t)) || null;
    const v = validarFornecedor({ nome, documento: texto('CNPJ ou CPF'), telefone: texto('Telefone'), contato: texto('Contato'), observacao: texto('Observação') });
    if (!v.ok) {
      linhas.push({ numero, situacao: 'erro', nome, motivos: v.erros.map((e) => e.mensagem), avisos: [], valor: null });
      continue;
    }
    const f = v.valor;
    const mesmo = (e: { nome: string; documento: string | null }) => (f.documento && e.documento ? e.documento === f.documento : chave(e.nome) === chave(f.nome));
    const existente = ctx.existentes.find(mesmo);
    const repetida = naPlanilha.find(mesmo);
    if (existente) {
      linhas.push({ numero, situacao: 'existe', nome, motivos: [`Já cadastrado: "${existente.nome}"${existente.ativo ? '' : ' (desativado)'}.`], avisos: [], valor: null });
    } else if (repetida) linhas.push({ numero, situacao: 'repetida', nome, motivos: [`Repetida: o mesmo fornecedor da linha ${repetida.numero}.`], avisos: [], valor: null });
    else {
      linhas.push({ numero, situacao: 'nova', nome, motivos: [], avisos: [], valor: f });
      naPlanilha.push({ numero, nome: f.nome, documento: f.documento });
    }
  }
  return { ok: true, valor: { cadastro: 'fornecedores', colunas: cab.valor.colunas, ignoradas: cab.valor.ignoradas, linhas, contagem: contar(linhas) } };
}

/** "95 linhas entram, 20 já cadastradas, 2 repetidas e 3 com erro." */
export function resumoDaImportacao(c: Record<SituacaoDaLinha, number>): string {
  const partes = [
    `${c.nova} ${c.nova === 1 ? 'linha entra' : 'linhas entram'}`,
    c.existe ? `${c.existe} já ${c.existe === 1 ? 'cadastrada' : 'cadastradas'}` : null,
    c.repetida ? `${c.repetida} ${c.repetida === 1 ? 'repetida' : 'repetidas'}` : null,
    c.erro ? `${c.erro} com erro` : null,
  ].filter(Boolean) as string[];
  return `${listaDeNomes(partes)}.`;
}
