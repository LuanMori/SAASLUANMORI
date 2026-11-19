// packages/core/src/produto.ts
// Regras do cadastro de produto. Usadas pela API (autoridade final) e pelo
// frontend (feedback imediato) — a MESMA função nos dois lados.
//
// Regras (confirmadas pelo Luan em 11/11/2026 e iguais ao DaniPets V9.2):
//   - Preço de venda maior que zero. Brinde NÃO é produto de preço zero: é dado
//     na venda, com 100% de desconto e autorização de um Dono.
//   - Código interno é sempre do sistema (nunca vem do cliente): 0001, 0002, …
//     A geração do próximo número precisa do banco e fica na API; aqui só o formato.
//   - Código de barras: opcional, só números.
//
// Cadastro completo do DaniPets (Fase 2, módulo 2 — PRD-01): marca, peso, unidade de venda (un ou kg),
// estoque inicial e o custo dele (só Dono e Administrador). No servidor, esses campos entram com o
// módulo de produtos do servidor: até lá ele valida só o básico (`validarNovoProduto(dados)`); a
// demonstração usa o cadastro completo (`validarNovoProduto(dados, { completo: true })`).
// Também: alteração do cadastro (PRD-05) e o aviso de produto parecido (PRD-04: mesmo nome, marca e peso).

import { CENTAVOS_MAX } from './dinheiro';
import { CONTROLE, ehObjeto } from './interno';
import { ehUnidadeVenda, type UnidadeVenda } from './quantidade';
import type { ErroCampo, Resultado } from './resultado';

export interface NovoProduto {
  nome: string;
  /** Opcional, só dígitos (zeros à esquerda preservados). Único por loja. */
  codigoBarras: string | null;
  /** Preço de venda; no produto vendido por kg, o preço do quilo. */
  precoCentavos: number;
  marca?: string | null;
  /** Peso da embalagem em gramas (ração de 15 kg = 15000). Só descreve o produto. */
  pesoGramas?: number | null;
  /** Como é vendido (padrão: unidade). No kg, as quantidades são em gramas. */
  unidade?: UnidadeVenda;
  /** Estoque no cadastro, na unidade do produto (un ou gramas). Depois, só por entrada ou ajuste. */
  estoqueInicial?: number;
  /** Custo de cada unidade (ou de cada kg) do estoque inicial. Só Dono e Administrador informam. */
  custoInicialCentavos?: number | null;
  /** Fornecedor principal (cadastro de fornecedores da loja). */
  fornecedorId?: string | null;
}

/** O que pode mudar num produto já cadastrado (o código interno nunca muda). */
export interface AlteracaoProduto {
  nome?: string;
  codigoBarras?: string | null;
  precoCentavos?: number;
  marca?: string | null;
  pesoGramas?: number | null;
  unidade?: UnidadeVenda;
  fornecedorId?: string | null;
}

export const LIMITES_PRODUTO = {
  nomeMax: 120,
  codigoBarrasMax: 64,
  /** Cabe em BIGINT no banco (usado para achar o maior código). */
  codigoInternoMax: 18,
  /** Código interno tem no mínimo 4 dígitos: 0001. */
  codigoInternoDigitos: 4,
  marcaMax: 60,
  /** 1 tonelada. */
  pesoMaxGramas: 1_000_000,
  /** Unidades ou gramas. */
  estoqueInicialMax: 9_999_999,
} as const;

const CAMPOS_BASICOS = ['nome', 'codigoBarras', 'precoCentavos'];
const CAMPOS_COMPLETOS = [...CAMPOS_BASICOS, 'marca', 'pesoGramas', 'unidade', 'estoqueInicial', 'custoInicialCentavos', 'fornecedorId'];
const CAMPOS_ALTERACAO = [...CAMPOS_BASICOS, 'marca', 'pesoGramas', 'unidade', 'fornecedorId'];
// Caracteres de controle (CONTROLE): o leitor de código costuma mandar \r\n no fim;
// o trim() remove nas pontas; no meio é recusado.
const SO_DIGITOS = /^[0-9]+$/;

export const MENSAGEM_PRECO_ZERO =
  'O preço de venda deve ser maior que zero. Brinde é lançado na venda (100% de desconto, com autorização do Dono).';

/** 1 -> "0001"; 12345 -> "12345". */
export function formatarCodigoInterno(numero: number): string {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new RangeError('O código interno deve ser um inteiro maior que zero.');
  }
  const texto = String(numero).padStart(LIMITES_PRODUTO.codigoInternoDigitos, '0');
  if (texto.length > LIMITES_PRODUTO.codigoInternoMax) {
    throw new RangeError('O código interno passou do limite de dígitos.');
  }
  return texto;
}

function lerNome(valor: unknown, erros: ErroCampo[]): string {
  if (typeof valor !== 'string') {
    erros.push({ campo: 'nome', mensagem: 'Informe o nome do produto.' });
    return '';
  }
  const nome = valor.normalize('NFC').trim();
  if (nome === '') erros.push({ campo: 'nome', mensagem: 'Informe o nome do produto.' });
  else if (nome.length > LIMITES_PRODUTO.nomeMax) erros.push({ campo: 'nome', mensagem: `O nome pode ter até ${LIMITES_PRODUTO.nomeMax} caracteres.` });
  else if (CONTROLE.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });
  return nome;
}

function lerCodigoBarras(valor: unknown, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    erros.push({ campo: 'codigoBarras', mensagem: 'O código de barras deve ser enviado como texto.' });
    return null;
  }
  const c = valor.trim();
  if (c === '') return null;
  if (!SO_DIGITOS.test(c)) erros.push({ campo: 'codigoBarras', mensagem: 'O código de barras deve ter só números.' });
  else if (c.length > LIMITES_PRODUTO.codigoBarrasMax) {
    erros.push({ campo: 'codigoBarras', mensagem: `O código de barras pode ter até ${LIMITES_PRODUTO.codigoBarrasMax} dígitos.` });
  } else return c;
  return null;
}

function lerPreco(preco: unknown, erros: ErroCampo[]): number {
  if (typeof preco !== 'number' || !Number.isInteger(preco)) erros.push({ campo: 'precoCentavos', mensagem: 'O preço deve ser um número inteiro de centavos.' });
  else if (preco <= 0) erros.push({ campo: 'precoCentavos', mensagem: MENSAGEM_PRECO_ZERO });
  else if (preco > CENTAVOS_MAX) erros.push({ campo: 'precoCentavos', mensagem: 'Preço acima do limite permitido.' });
  else return preco;
  return 0;
}

function lerMarca(valor: unknown, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    erros.push({ campo: 'marca', mensagem: 'A marca deve ser um texto.' });
    return null;
  }
  const m = valor.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (m.length > LIMITES_PRODUTO.marcaMax) erros.push({ campo: 'marca', mensagem: `A marca pode ter até ${LIMITES_PRODUTO.marcaMax} caracteres.` });
  else if (CONTROLE.test(m)) erros.push({ campo: 'marca', mensagem: 'A marca contém caracteres inválidos.' });
  return m || null;
}

function lerPeso(valor: unknown, erros: ErroCampo[]): number | null {
  if (valor === undefined || valor === null || valor === 0) return null;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > LIMITES_PRODUTO.pesoMaxGramas) {
    erros.push({ campo: 'pesoGramas', mensagem: 'O peso vai de 0 a 1.000 kg, com até 3 casas (gramas).' });
    return null;
  }
  return valor;
}

function lerFornecedorId(valor: unknown, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.trim().length > 64) {
    erros.push({ campo: 'fornecedorId', mensagem: 'Escolha o fornecedor na lista.' });
    return null;
  }
  return valor.trim();
}

function lerUnidade(valor: unknown, erros: ErroCampo[]): UnidadeVenda {
  if (valor === undefined) return 'un';
  if (!ehUnidadeVenda(valor)) erros.push({ campo: 'unidade', mensagem: 'Escolha como o produto é vendido: por unidade (un) ou por quilo (kg).' });
  return valor === 'kg' ? 'kg' : 'un';
}

/** Campos que não são deste formulário (ex.: lojaId, id, codigoInterno): recusados (impede "mass assignment"). */
function camposPermitidos(dados: Record<string, unknown>, permitidos: readonly string[], erros: ErroCampo[]) {
  for (const chave of Object.keys(dados)) {
    if (!permitidos.includes(chave)) {
      erros.push({ campo: chave, mensagem: chave === 'codigoInterno' ? 'O código interno é gerado pelo sistema.' : 'Campo não permitido.' });
    }
  }
}

/**
 * Cadastro de produto. `completo`: aceita também marca, peso, unidade e o estoque inicial (com custo)
 * — a demonstração usa; o servidor ainda não guarda esses campos (até lá, ficam recusados).
 */
export function validarNovoProduto(entrada: unknown, opcoes: { completo?: boolean } = {}): Resultado<NovoProduto> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados do produto.' }] };
  const dados = entrada;
  const erros: ErroCampo[] = [];
  camposPermitidos(dados, opcoes.completo ? CAMPOS_COMPLETOS : CAMPOS_BASICOS, erros);
  const nome = lerNome(dados.nome, erros);
  const codigoBarras = lerCodigoBarras(dados.codigoBarras, erros);
  const precoCentavos = lerPreco(dados.precoCentavos, erros);
  if (!opcoes.completo) {
    return erros.length > 0 ? { ok: false, erros } : { ok: true, valor: { nome, codigoBarras, precoCentavos } };
  }

  const marca = lerMarca(dados.marca, erros);
  const pesoGramas = lerPeso(dados.pesoGramas, erros);
  const unidade = lerUnidade(dados.unidade, erros);
  const fornecedorId = lerFornecedorId(dados.fornecedorId, erros);
  let estoqueInicial = 0;
  const ini = dados.estoqueInicial;
  if (ini !== undefined && ini !== null) {
    if (typeof ini !== 'number' || !Number.isInteger(ini) || ini < 0 || ini > LIMITES_PRODUTO.estoqueInicialMax) {
      erros.push({
        campo: 'estoqueInicial',
        mensagem: unidade === 'kg' ? 'O estoque inicial é um peso de 0 em diante (até 3 casas).' : 'O estoque inicial é um número inteiro de unidades, de 0 em diante.',
      });
    } else estoqueInicial = ini;
  }
  let custoInicialCentavos: number | null = null;
  const custo = dados.custoInicialCentavos;
  if (custo !== undefined && custo !== null) {
    if (typeof custo !== 'number' || !Number.isInteger(custo) || custo < 0 || custo > CENTAVOS_MAX) {
      erros.push({ campo: 'custoInicialCentavos', mensagem: 'O custo do estoque inicial não pode ser negativo.' });
    } else if (custo > 0) custoInicialCentavos = custo;
  }
  if (custoInicialCentavos !== null && estoqueInicial === 0) {
    erros.push({ campo: 'custoInicialCentavos', mensagem: 'Informe o custo só quando houver estoque inicial.' });
  }
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, valor: { nome, codigoBarras, precoCentavos, marca, pesoGramas, unidade, estoqueInicial, custoInicialCentavos, fornecedorId } };
}

/** Alteração do cadastro: só os campos enviados (pelo menos um). */
export function validarAlteracaoProduto(entrada: unknown): Resultado<AlteracaoProduto> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com o que muda.' }] };
  const erros: ErroCampo[] = [];
  camposPermitidos(entrada, CAMPOS_ALTERACAO, erros);
  const mudanca: AlteracaoProduto = {};
  if (entrada.nome !== undefined) mudanca.nome = lerNome(entrada.nome, erros);
  if (entrada.codigoBarras !== undefined) mudanca.codigoBarras = lerCodigoBarras(entrada.codigoBarras, erros);
  if (entrada.precoCentavos !== undefined) mudanca.precoCentavos = lerPreco(entrada.precoCentavos, erros);
  if (entrada.marca !== undefined) mudanca.marca = lerMarca(entrada.marca, erros);
  if (entrada.pesoGramas !== undefined) mudanca.pesoGramas = lerPeso(entrada.pesoGramas, erros);
  if (entrada.unidade !== undefined) mudanca.unidade = lerUnidade(entrada.unidade, erros);
  if (entrada.fornecedorId !== undefined) mudanca.fornecedorId = lerFornecedorId(entrada.fornecedorId, erros);
  if (!erros.length && Object.keys(mudanca).length === 0) erros.push({ campo: '_', mensagem: 'Nada para alterar.' });
  return erros.length ? { ok: false, erros } : { ok: true, valor: mudanca };
}

const chaveDoNome = (nome: string) => nome.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

/**
 * Produto com o mesmo nome, a mesma marca e o mesmo peso (DaniPets: "Já existe produto com o mesmo nome,
 * marca e peso. Cadastrar mesmo assim?"). null = nenhum parecido.
 */
export function produtoParecido<T extends { id: string; nome: string; marca?: string | null; pesoGramas?: number | null }>(
  produto: { nome: string; marca?: string | null; pesoGramas?: number | null },
  existentes: readonly T[],
  excetoId: string | null = null,
): T | null {
  const nome = chaveDoNome(produto.nome);
  const marca = chaveDoNome(produto.marca ?? '');
  return (
    existentes.find(
      (p) => p.id !== excetoId && chaveDoNome(p.nome) === nome && chaveDoNome(p.marca ?? '') === marca && (p.pesoGramas ?? null) === (produto.pesoGramas ?? null),
    ) ?? null
  );
}
