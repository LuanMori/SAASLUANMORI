// packages/core/src/produto.ts
// Regras do cadastro de produto. Usadas pela API (autoridade final) e pelo
// frontend (feedback imediato) — a MESMA função nos dois lados.
//
// Regras (confirmadas pelo Luan em 11/11/2026 e iguais ao DaniPets V9.2):
//   - Preço de venda maior que zero. Brinde NÃO é produto de preço zero: é dado
//     na venda, com 100% de desconto e autorização de um Dono (Fase 4).
//   - Código interno é sempre do sistema (nunca vem do cliente): 0001, 0002, …
//     A geração do próximo número precisa do banco e fica na API; aqui só o formato.
//   - Código de barras: opcional, só números.
//
// Fase -1: só os campos mínimos. Cadastro completo (marca, peso, unidade, custo,
// estoque, validade…) entra na Fase 5.1, com as regras vindas do DaniPets.

import { CENTAVOS_MAX } from './dinheiro';
import type { ErroCampo, Resultado } from './resultado';

export interface NovoProduto {
  nome: string;
  /** Opcional, só dígitos (zeros à esquerda preservados). Único por loja. */
  codigoBarras: string | null;
  precoCentavos: number;
}

export const LIMITES_PRODUTO = {
  nomeMax: 120,
  codigoBarrasMax: 64,
  /** Cabe em BIGINT no banco (usado para achar o maior código). */
  codigoInternoMax: 18,
  /** Código interno tem no mínimo 4 dígitos: 0001. */
  codigoInternoDigitos: 4,
} as const;

const CAMPOS_PERMITIDOS = new Set(['nome', 'codigoBarras', 'precoCentavos']);
// Caracteres de controle (inclui \n, \t, NUL). O leitor de código costuma mandar
// \r\n no fim: o trim() remove nas pontas; no meio é recusado.
const CONTROLE = /[\u0000-\u001f\u007f]/;
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

export function validarNovoProduto(entrada: unknown): Resultado<NovoProduto> {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados do produto.' }] };
  }

  const dados = entrada as Record<string, unknown>;
  const erros: ErroCampo[] = [];

  // Recusa campos desconhecidos (ex.: lojaId, id, codigoInterno). Impede "mass
  // assignment": ninguém escolhe a loja nem o código interno pelo corpo.
  for (const chave of Object.keys(dados)) {
    if (!CAMPOS_PERMITIDOS.has(chave)) {
      erros.push({
        campo: chave,
        mensagem: chave === 'codigoInterno' ? 'O código interno é gerado pelo sistema.' : 'Campo não permitido.',
      });
    }
  }

  // nome
  let nome = '';
  if (typeof dados.nome !== 'string') {
    erros.push({ campo: 'nome', mensagem: 'Informe o nome do produto.' });
  } else {
    nome = dados.nome.trim();
    if (nome === '') {
      erros.push({ campo: 'nome', mensagem: 'Informe o nome do produto.' });
    } else if (nome.length > LIMITES_PRODUTO.nomeMax) {
      erros.push({ campo: 'nome', mensagem: `O nome pode ter até ${LIMITES_PRODUTO.nomeMax} caracteres.` });
    } else if (CONTROLE.test(nome)) {
      erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });
    }
  }

  // codigoBarras (opcional, só números)
  let codigoBarras: string | null = null;
  if (dados.codigoBarras !== undefined && dados.codigoBarras !== null) {
    if (typeof dados.codigoBarras !== 'string') {
      erros.push({ campo: 'codigoBarras', mensagem: 'O código de barras deve ser enviado como texto.' });
    } else {
      const c = dados.codigoBarras.trim();
      if (c === '') {
        codigoBarras = null;
      } else if (!SO_DIGITOS.test(c)) {
        erros.push({ campo: 'codigoBarras', mensagem: 'O código de barras deve ter só números.' });
      } else if (c.length > LIMITES_PRODUTO.codigoBarrasMax) {
        erros.push({
          campo: 'codigoBarras',
          mensagem: `O código de barras pode ter até ${LIMITES_PRODUTO.codigoBarrasMax} dígitos.`,
        });
      } else {
        codigoBarras = c;
      }
    }
  }

  // precoCentavos (> 0)
  const preco = dados.precoCentavos;
  if (typeof preco !== 'number' || !Number.isInteger(preco)) {
    erros.push({ campo: 'precoCentavos', mensagem: 'O preço deve ser um número inteiro de centavos.' });
  } else if (preco <= 0) {
    erros.push({ campo: 'precoCentavos', mensagem: MENSAGEM_PRECO_ZERO });
  } else if (preco > CENTAVOS_MAX) {
    erros.push({ campo: 'precoCentavos', mensagem: 'Preço acima do limite permitido.' });
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, valor: { nome, codigoBarras, precoCentavos: preco as number } };
}
