// packages/core/src/fornecedor.ts
// Cadastro simples de fornecedores de cada loja (Fase 2, módulo 3 — decisão P9 do Luan). No DaniPets o
// fornecedor era um texto livre no produto e na compra (CMP-10); aqui vira um cadastro, para a compra e o
// produto apontarem para o mesmo fornecedor (e o nome não sair escrito de três jeitos).
//   - nome obrigatório; documento (CNPJ ou CPF) e telefone opcionais, conferidos quando informados;
//   - o mesmo documento não se repete na loja;
//   - desativar tira o fornecedor das listas de escolha (compras e produtos antigos continuam com ele);
//   - quem cuida: Dono e Administrador (permissão 'compras', como a aba Compras do DaniPets).
import { cpfValido, telefoneValido } from './cliente';
import { CONTROLE, ehObjeto, soDigitos } from './interno';
import type { ErroCampo, Resultado } from './resultado';

export interface NovoFornecedor {
  nome: string;
  /** CNPJ (14 dígitos) ou CPF (11), só números. */
  documento: string | null;
  /** Só números, com DDD. */
  telefone: string | null;
  /** Nome da pessoa de contato (vendedor, representante). */
  contato: string | null;
  observacao: string | null;
}

export interface Fornecedor extends NovoFornecedor {
  id: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export const LIMITES_FORNECEDOR = { nomeMin: 2, nomeMax: 120, contatoMax: 80, observacaoMax: 300 } as const;

/** CNPJ com os dígitos verificadores certos (só números, 14 dígitos, não todos iguais). */
export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

/** "12.345.678/0001-95" ou "529.982.247-25" (para mostrar). */
export function formatarDocumento(documento: string | null | undefined): string {
  const d = soDigitos(documento);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

const linha = (v: unknown) => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

function textoOpcional(v: unknown, campo: string, max: number, erros: ErroCampo[]): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    erros.push({ campo, mensagem: 'Envie um texto.' });
    return null;
  }
  const t = linha(v);
  if (t.length > max) erros.push({ campo, mensagem: `Use até ${max} caracteres.` });
  else if (CONTROLE.test(t)) erros.push({ campo, mensagem: 'O texto contém caracteres inválidos.' });
  return t || null;
}

export function validarFornecedor(entrada: unknown): Resultado<NovoFornecedor> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados do fornecedor.' }] };
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(entrada)) if (!['nome', 'documento', 'telefone', 'contato', 'observacao'].includes(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });
  const nome = linha(entrada.nome);
  if (nome.length < LIMITES_FORNECEDOR.nomeMin) erros.push({ campo: 'nome', mensagem: 'Informe o nome do fornecedor.' });
  else if (nome.length > LIMITES_FORNECEDOR.nomeMax) erros.push({ campo: 'nome', mensagem: `O nome pode ter até ${LIMITES_FORNECEDOR.nomeMax} caracteres.` });
  else if (CONTROLE.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });

  let documento: string | null = null;
  if (entrada.documento !== undefined && entrada.documento !== null && soDigitos(entrada.documento) !== '') {
    const d = soDigitos(entrada.documento);
    if (d.length === 14 ? !cnpjValido(d) : d.length === 11 ? !cpfValido(d) : true) {
      erros.push({ campo: 'documento', mensagem: 'Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números).' });
    } else documento = d;
  }
  let telefone: string | null = null;
  if (entrada.telefone !== undefined && entrada.telefone !== null && soDigitos(entrada.telefone) !== '') {
    const t = soDigitos(entrada.telefone);
    if (!telefoneValido(t)) erros.push({ campo: 'telefone', mensagem: 'Telefone com DDD: 10 ou 11 números.' });
    else telefone = t;
  }
  const contato = textoOpcional(entrada.contato, 'contato', LIMITES_FORNECEDOR.contatoMax, erros);
  const observacao = textoOpcional(entrada.observacao, 'observacao', LIMITES_FORNECEDOR.observacaoMax, erros);
  return erros.length ? { ok: false, erros } : { ok: true, valor: { nome, documento, telefone, contato, observacao } };
}

/** O mesmo CNPJ/CPF não se repete entre os fornecedores da loja. */
export function conferirDocumentoUnico(documento: string | null, fornecedores: readonly Pick<Fornecedor, 'id' | 'nome' | 'documento'>[], ignorarId?: string): Resultado<null> {
  if (!documento) return { ok: true, valor: null };
  const outro = fornecedores.find((f) => f.id !== ignorarId && f.documento === documento);
  return outro
    ? { ok: false, erros: [{ campo: 'documento', mensagem: `Este documento já é do fornecedor "${outro.nome}".` }] }
    : { ok: true, valor: null };
}
