// packages/core/src/cliente.ts
// Clientes da loja: cadastro, busca e histórico de compras (alimentado pelas vendas da
// Frente de caixa). A aba Clientes ainda não tem tela: estas regras já ficam prontas para ela.
// Iguais ao DaniPets V9.3.3:
//   - nome completo (pelo menos 3 letras), telefone com DDD e CPF são obrigatórios;
//   - telefone: 10 números (fixo) ou 11 começando com 9 depois do DDD (celular); DDD sem zero;
//   - CPF conferido pelos dígitos verificadores e único entre os clientes ativos da loja;
//   - na busca (F6): 3 números ou mais procuram no CPF e no telefone; 2 letras ou mais, no nome (sem acento).
// LGPD: as telas mostram o CPF mascarado (***.456.789-**); o número inteiro fica só no cadastro.
import { formatarCentavos } from './dinheiro';
import { CONTROLE, ehObjeto, soDigitos } from './interno';
import { mensagemSemPermissao, pode } from './permissoes';
import type { ErroCampo, Resultado } from './resultado';
import { semAcento } from './texto';
import type { Venda } from './venda';

export interface Cliente {
  id: string;
  nome: string;
  /** Só números, com DDD (10 ou 11 dígitos). */
  telefone: string;
  /** Só números (11 dígitos). */
  cpf: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface NovoCliente {
  nome: string;
  telefone: string;
  cpf: string;
}

/** O que a venda precisa saber do cliente. */
export interface ClienteParaVenda {
  id: string;
  nome: string;
  ativo: boolean;
}

export const LIMITES_CLIENTE = { nomeMin: 3, nomeMax: 120, buscaMax: 80, resultadosBusca: 8 } as const;

/** Confere os dois dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Fixo (10 números) ou celular (11, com 9 depois do DDD). DDD sem zero. */
export function telefoneValido(telefone: string): boolean {
  const d = soDigitos(telefone);
  if (d.length !== 10 && d.length !== 11) return false;
  if (d[0] === '0' || d[1] === '0') return false;
  return d.length === 10 || d[2] === '9';
}

/** "11987654321" -> "(11) 98765-4321"; "1134567890" -> "(11) 3456-7890". */
export function formatarTelefone(telefone: string | null | undefined): string {
  const d = soDigitos(telefone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** "12345678909" -> "***.456.789-**" (para mostrar em tela sem expor o CPF inteiro). */
export function mascararCpf(cpf: string | null | undefined): string {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '—';
}

const CAMPOS_CLIENTE = new Set(['nome', 'telefone', 'cpf']);

export function validarNovoCliente(entrada: unknown): Resultado<NovoCliente> {
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: '_', mensagem: 'Envie um objeto com os dados do cliente.' }] };
  const d = entrada;
  const erros: ErroCampo[] = [];
  for (const k of Object.keys(d)) if (!CAMPOS_CLIENTE.has(k)) erros.push({ campo: k, mensagem: 'Campo não permitido.' });

  const nome = typeof d.nome === 'string' ? d.nome.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (nome.length < LIMITES_CLIENTE.nomeMin) erros.push({ campo: 'nome', mensagem: 'Informe o nome completo do cliente (pelo menos 3 letras).' });
  else if (nome.length > LIMITES_CLIENTE.nomeMax) erros.push({ campo: 'nome', mensagem: `O nome pode ter até ${LIMITES_CLIENTE.nomeMax} caracteres.` });
  else if (CONTROLE.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome contém caracteres inválidos.' });
  else if (!/\p{L}/u.test(nome)) erros.push({ campo: 'nome', mensagem: 'O nome precisa ter letras.' });

  const telefone = typeof d.telefone === 'string' ? soDigitos(d.telefone) : '';
  if (!telefoneValido(telefone)) erros.push({ campo: 'telefone', mensagem: 'Telefone inválido. Use o DDD e o número, por exemplo (41) 99999-9999.' });

  const cpf = typeof d.cpf === 'string' ? soDigitos(d.cpf) : '';
  if (!cpfValido(cpf)) erros.push({ campo: 'cpf', mensagem: cpf.length === 11 ? 'CPF inválido. Confira os números.' : 'Informe os 11 números do CPF.' });

  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { nome, telefone, cpf } };
}

/** CPF único entre os clientes ativos (na edição, o próprio cliente não conta). */
export function conferirCpfUnico(cpf: string, clientes: readonly Pick<Cliente, 'id' | 'nome' | 'cpf' | 'ativo'>[], ignorarId?: string): Resultado<null> {
  const outro = clientes.find((c) => c.ativo && c.cpf === soDigitos(cpf) && c.id !== ignorarId);
  return outro ? { ok: false, erros: [{ campo: 'cpf', mensagem: `Este CPF já está no cadastro de ${outro.nome}.` }] } : { ok: true, valor: null };
}

/**
 * Busca (F6): 3 números ou mais procuram no CPF e no telefone; 2 letras ou mais, no nome, sem acento.
 * Só clientes ativos, em ordem alfabética. Termo vazio devolve todos (para a lista da aba Clientes).
 */
export function buscarClientes<T extends Pick<Cliente, 'nome' | 'telefone' | 'cpf' | 'ativo'>>(clientes: readonly T[], termo: string, limite?: number): T[] {
  const t = semAcento(String(termo ?? '').slice(0, LIMITES_CLIENTE.buscaMax));
  const dig = soDigitos(t);
  const ativos = clientes.filter((c) => c.ativo);
  const achados = !t
    ? ativos
    : ativos.filter(
        (c) =>
          (dig.length >= 3 && (soDigitos(c.cpf).includes(dig) || soDigitos(c.telefone).includes(dig))) ||
          (t.length >= 2 && !/^[\d\s().-]+$/.test(t) && semAcento(c.nome).includes(t)),
      );
  const ordem = [...achados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return limite ? ordem.slice(0, limite) : ordem;
}

/** O que foi digitado na busca já preenche o cadastro novo (CPF válido, telefone ou nome). */
export function sugestaoDeCadastro(termo: string): Partial<NovoCliente> {
  const t = String(termo ?? '').trim();
  const d = soDigitos(t);
  if (d.length === 11 && cpfValido(d)) return { cpf: d };
  if (d.length >= 10) return { telefone: d };
  if (!d && t) return { nome: t.replace(/\s+/g, ' ').slice(0, LIMITES_CLIENTE.nomeMax) };
  return {};
}

export interface ResumoCliente {
  compras: number;
  /** O que o cliente gastou: vendas finalizadas menos o que ele devolveu. */
  totalCentavos: number;
  ticketMedioCentavos: number;
  ultimaCompraEm: string | null;
}

/** Histórico do cliente (para a aba Clientes e para o relatório). Canceladas não contam. */
export function resumirCliente(vendas: readonly Venda[], clienteId: string): ResumoCliente {
  const dele = vendas.filter((v) => v.cliente?.id === clienteId && v.status === 'finalizada');
  const total = dele.reduce((s, v) => s + v.totalCentavos - v.devolucoes.reduce((t, d) => t + d.totalCentavos, 0), 0);
  const ultima = dele.reduce<string | null>((u, v) => (!u || v.criadaEm > u ? v.criadaEm : u), null);
  return { compras: dele.length, totalCentavos: total, ticketMedioCentavos: dele.length ? Math.round(total / dele.length) : 0, ultimaCompraEm: ultima };
}

// ------------------------------------------------------------------ LGPD: exclusão a pedido do cliente
// Como o DaniPets V9.3.3 (cliAnonimizar): só o Dono; recusada enquanto houver fiado em aberto (os
// dados ficam até a conta ser paga); o nome, o telefone e o CPF somem; as vendas continuam no histórico
// da loja (obrigação fiscal), sem identificar o cliente.

export const NOME_CLIENTE_REMOVIDO = 'Cliente removido';

export function conferirExclusaoDeCliente(
  papel: string,
  cliente: Pick<Cliente, 'nome' | 'ativo'> | null,
  fiadoEmAbertoCentavos: number,
): Resultado<null> {
  if (!pode(papel, 'clientes.excluir_dados')) return { ok: false, erros: [{ campo: '_', mensagem: mensagemSemPermissao('clientes.excluir_dados') }] };
  if (!cliente || cliente.nome === NOME_CLIENTE_REMOVIDO) return { ok: false, erros: [{ campo: '_', mensagem: 'Cliente não encontrado.' }] };
  if (fiadoEmAbertoCentavos > 0) {
    return {
      ok: false,
      erros: [{ campo: '_', mensagem: `${cliente.nome} tem ${formatarCentavos(fiadoEmAbertoCentavos)} de fiado em aberto. Os dados ficam guardados até a conta ser paga.` }],
    };
  }
  return { ok: true, valor: null };
}

/** O cadastro sem nenhum dado pessoal (fica só o id, para as vendas antigas continuarem ligadas). */
export function anonimizarCliente(c: Cliente, agora: Date): Cliente {
  return { ...c, nome: NOME_CLIENTE_REMOVIDO, telefone: '', cpf: '', ativo: false, atualizadoEm: agora.toISOString() };
}

/** Tira o nome do cliente de vendas, recebimentos de fiado e outros registros que guardaram o nome. */
export function tirarNomeDoCliente<T extends { cliente?: { id: string; nome: string } | null }>(lista: readonly T[], clienteId: string): T[] {
  return lista.map((x) => (x.cliente?.id === clienteId ? { ...x, cliente: { id: clienteId, nome: NOME_CLIENTE_REMOVIDO } } : x));
}
