// packages/core/src/cliente.ts
// Clientes da loja: cadastro, busca e histórico de compras (alimentado pelas vendas da
// Frente de caixa). A aba Clientes ainda não tem tela: estas regras já ficam prontas para ela.
// Iguais ao DaniPets V9.3.3:
//   - nome completo (pelo menos 3 letras), telefone com DDD e CPF são obrigatórios;
//   - telefone: 10 números (fixo) ou 11 começando com 9 depois do DDD (celular); DDD sem zero;
//   - CPF conferido pelos dígitos verificadores e único entre os clientes ativos da loja;
//   - na busca (F6): 3 números ou mais procuram no CPF e no telefone; 2 letras ou mais, no nome (sem acento).
// LGPD: as telas mostram o CPF mascarado (***.456.789-**); o número inteiro fica só no cadastro.
// Fase 2, módulo 6 (DaniPets CLI-01): campo extra da loja (o "Pet" do DaniPets, com o rótulo que a loja
// escolher), nascimento, endereço, observações, limite de fiado (só Dono e Administrador), se o telefone tem
// WhatsApp, a autorização para receber mensagens da loja (com a data) e o "não incomodar".
import { formatarCentavos } from './dinheiro';
import { CONTROLE, ehObjeto, soDigitos } from './interno';
import { mensagemSemPermissao, pode } from './permissoes';
import type { ErroCampo, Resultado } from './resultado';
import { semAcento } from './texto';
import type { Recebivel } from './financeiro';
import { formatarQuantidade, unidadeDe } from './quantidade';
import { diaNoFuso, formatarNumeroVenda, NOME_FORMA_PAGAMENTO, type Operador, type Venda } from './venda';

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
  /** Campo extra da loja (DaniPets: "Pet"); o rótulo vem das regras da loja. */
  extra?: string | null;
  /** AAAA-MM-DD. */
  nascimento?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  /** Limite de fiado (centavos). 0 = não compra no fiado sem a liberação de um Dono. */
  limiteFiadoCentavos?: number;
  /** O telefone tem WhatsApp (sem: sim, se for celular). */
  whatsapp?: boolean;
  /** Autorizou receber ofertas e lembretes da loja pelo WhatsApp: quando e quem registrou. */
  autorizaMensagens?: { em: string; por: Operador } | null;
  /** Fora das listas de lembrete. */
  naoIncomodar?: boolean;
  /** Dados excluídos a pedido do cliente (LGPD): quando, quem liberou (Dono) e o motivo. */
  dadosExcluidos?: { em: string; por: Operador; motivo: string } | null;
}

export interface NovoCliente {
  nome: string;
  telefone: string;
  cpf: string;
  extra?: string | null;
  nascimento?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  /** Só o Dono e o Administrador mudam (a API confere). */
  limiteFiadoCentavos?: number;
  whatsapp?: boolean;
  /** true = o cliente autoriza mensagens da loja (a API guarda quando e quem registrou). */
  autorizaMensagens?: boolean;
  naoIncomodar?: boolean;
}

/** O que a venda precisa saber do cliente. */
export interface ClienteParaVenda {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Textos e limite de fiado com os máximos do DaniPets (TEXTO_MAX 160, OBS_MAX 300, LIMITE_MAX R$ 100.000,00). */
export const LIMITES_CLIENTE = {
  nomeMin: 3,
  nomeMax: 120,
  buscaMax: 80,
  resultadosBusca: 8,
  textoMax: 160,
  observacoesMax: 300,
  limiteFiadoMax: 10_000_000,
  motivoMax: 200,
  /** A lista da aba Clientes mostra até 300 linhas; a busca acha os outros. */
  listaMax: 300,
} as const;

/** Nome, telefone e CPF válidos (DaniPets cliCompleto): sem isso, não compra no fiado. */
export const cadastroCompleto = (c: Pick<Cliente, 'nome' | 'telefone' | 'cpf'> | null | undefined): boolean =>
  Boolean(c && c.nome.trim().length >= LIMITES_CLIENTE.nomeMin && c.nome !== NOME_CLIENTE_REMOVIDO && telefoneValido(c.telefone) && cpfValido(c.cpf));

/** O telefone tem WhatsApp? Sem a informação, sim para celular (como o DaniPets). */
export const temWhatsapp = (c: Pick<Cliente, 'telefone' | 'whatsapp'>): boolean => c.whatsapp ?? soDigitos(c.telefone).length === 11;

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

const CAMPOS_CLIENTE = new Set(['nome', 'telefone', 'cpf', 'extra', 'nascimento', 'endereco', 'observacoes', 'limiteFiadoCentavos', 'whatsapp', 'autorizaMensagens', 'naoIncomodar']);

function textoDoCliente(valor: unknown, campo: string, max: number, rotulo: string, erros: ErroCampo[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') return erros.push({ campo, mensagem: `${rotulo} deve ser um texto.` }), null;
  const t = valor.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (t.length > max) erros.push({ campo, mensagem: `${rotulo} pode ter até ${max} caracteres.` });
  else if (CONTROLE.test(t)) erros.push({ campo, mensagem: `${rotulo} contém caracteres inválidos.` });
  return t || null;
}

const diaReal = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d!));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d;
};

/**
 * Confere o cadastro. Nome, telefone e CPF são obrigatórios; os outros campos são opcionais e só voltam
 * quando enviados. `hoje` (AAAA-MM-DD) limita o nascimento.
 */
export function validarNovoCliente(entrada: unknown, ctx: { hoje?: string } = {}): Resultado<NovoCliente> {
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

  const extras: Partial<NovoCliente> = {};
  if ('extra' in d) extras.extra = textoDoCliente(d.extra, 'extra', LIMITES_CLIENTE.textoMax, 'O campo extra', erros);
  if ('endereco' in d) extras.endereco = textoDoCliente(d.endereco, 'endereco', LIMITES_CLIENTE.textoMax, 'O endereço', erros);
  if ('observacoes' in d) extras.observacoes = textoDoCliente(d.observacoes, 'observacoes', LIMITES_CLIENTE.observacoesMax, 'As observações', erros);
  if ('nascimento' in d) {
    const n = d.nascimento;
    if (n === null || n === undefined || n === '') extras.nascimento = null;
    else if (typeof n !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(n) || !diaReal(n) || n < '1900-01-01' || (ctx.hoje && n > ctx.hoje)) {
      erros.push({ campo: 'nascimento', mensagem: 'Data de nascimento inválida.' });
    } else extras.nascimento = n;
  }
  if ('limiteFiadoCentavos' in d) {
    const l = d.limiteFiadoCentavos;
    if (typeof l !== 'number' || !Number.isSafeInteger(l) || l < 0) erros.push({ campo: 'limiteFiadoCentavos', mensagem: 'O limite de fiado não pode ser negativo.' });
    else if (l > LIMITES_CLIENTE.limiteFiadoMax) erros.push({ campo: 'limiteFiadoCentavos', mensagem: `O limite de fiado pode ser no máximo ${formatarCentavos(LIMITES_CLIENTE.limiteFiadoMax)}.` });
    else extras.limiteFiadoCentavos = l;
  }
  for (const k of ['whatsapp', 'autorizaMensagens', 'naoIncomodar'] as const) {
    if (!(k in d)) continue;
    if (typeof d[k] !== 'boolean') erros.push({ campo: k, mensagem: 'Marque sim ou não.' });
    else extras[k] = d[k] as boolean;
  }

  if (erros.length) return { ok: false, erros };
  return { ok: true, valor: { nome, telefone, cpf, ...extras } };
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

/**
 * O cadastro sem nenhum dado pessoal (fica só o id, para as vendas antigas continuarem ligadas). Com a
 * liberação (módulo 6), guarda quem liberou e o motivo.
 */
export function anonimizarCliente(c: Cliente, agora: Date, liberacao?: { por: Operador; motivo: string }): Cliente {
  const semDados: Cliente = { ...c, nome: NOME_CLIENTE_REMOVIDO, telefone: '', cpf: '', ativo: false, atualizadoEm: agora.toISOString() };
  for (const k of ['extra', 'nascimento', 'endereco', 'observacoes'] as const) if (k in c) semDados[k] = null;
  if ('limiteFiadoCentavos' in c) semDados.limiteFiadoCentavos = 0;
  if ('whatsapp' in c) semDados.whatsapp = false;
  if ('autorizaMensagens' in c) semDados.autorizaMensagens = null;
  if (liberacao) {
    semDados.naoIncomodar = true;
    semDados.dadosExcluidos = { em: agora.toISOString(), por: liberacao.por, motivo: liberacao.motivo };
  }
  return semDados;
}

/** Tira o nome do cliente de vendas, recebimentos de fiado e outros registros que guardaram o nome. */
export function tirarNomeDoCliente<T extends { cliente?: { id: string; nome: string } | null }>(lista: readonly T[], clienteId: string): T[] {
  return lista.map((x) => (x.cliente?.id === clienteId ? { ...x, cliente: { id: clienteId, nome: NOME_CLIENTE_REMOVIDO } } : x));
}

// ------------------------------------------------------------------ conta do cliente (módulo 6)
/** Cliente com compra ou fiado não pode ser excluído (só os dados, pela LGPD). DaniPets cliTemHistorico. */
export function clienteTemHistorico(clienteId: string, vendas: readonly Pick<Venda, 'cliente'>[], recebiveis: readonly Pick<Recebivel, 'cliente'>[]): boolean {
  return vendas.some((v) => v.cliente?.id === clienteId) || recebiveis.some((r) => r.cliente?.id === clienteId);
}

export type TipoExtrato = 'compras' | 'fiado';

export interface LinhaExtrato {
  /** AAAA-MM-DD. */
  dia: string;
  /** Desempate dentro do dia (instante ISO). */
  ordem: string;
  tipo: TipoExtrato;
  movimento: string;
  detalhe: string;
  valorCentavos: number;
  sinal: '' | '+' | '−';
  /** Venda cancelada aparece riscada. */
  cancelada: boolean;
}

/** "2 Areia", "1,5 kg Granel", "Ração" (uma unidade, sem número), como o DaniPets. */
const comQuantidade = (i: { quantidade: number; unidade?: 'un' | 'kg'; nome: string }) =>
  unidadeDe(i.unidade) === 'kg' ? `${formatarQuantidade(i.quantidade, 'kg')} ${i.nome}` : i.quantidade !== 1 ? `${i.quantidade} ${i.nome}` : i.nome;
const itensDaVenda = (v: Pick<Venda, 'itens'>) => v.itens.map(comQuantidade).join(', ');

/** Extrato do cliente (DaniPets cliExtrato): compras, devoluções, compras no fiado e pagamentos do fiado. Do mais novo para o mais antigo. */
export function extratoDoCliente(clienteId: string, vendas: readonly Venda[], recebiveis: readonly Recebivel[], fuso: string): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  const dia = (iso: string) => diaNoFuso(iso, fuso);
  for (const v of vendas) {
    if (v.cliente?.id !== clienteId) continue;
    const formas = v.pagamentos.map((p) => NOME_FORMA_PAGAMENTO[p.forma]).join(' + ') || 'sem pagamento';
    linhas.push({
      dia: dia(v.criadaEm),
      ordem: `${v.criadaEm}1`,
      tipo: 'compras',
      movimento: `Compra ${formatarNumeroVenda(v.numero)}${v.status === 'cancelada' ? ' (cancelada)' : ''}`,
      detalhe: `${itensDaVenda(v)} • ${formas}${v.descontoCentavos > 0 ? ` • desconto ${formatarCentavos(v.descontoCentavos)}` : ''}`,
      valorCentavos: v.totalCentavos,
      sinal: '',
      cancelada: v.status === 'cancelada',
    });
    for (const d of v.devolucoes) {
      linhas.push({
        dia: dia(d.criadaEm),
        ordem: `${d.criadaEm}2`,
        tipo: 'compras',
        movimento: `Devolução nº ${d.numero}`,
        detalhe: `da compra ${formatarNumeroVenda(v.numero)} • ${d.itens.map(comQuantidade).join(', ')}`,
        valorCentavos: d.totalCentavos,
        sinal: '−',
        cancelada: false,
      });
      const noFiado = d.estornos.filter((e) => e.forma === 'fiado').reduce((s, e) => s + e.valorCentavos, 0);
      if (noFiado > 0) {
        linhas.push({ dia: dia(d.criadaEm), ordem: `${d.criadaEm}3`, tipo: 'fiado', movimento: 'Fiado estornado', detalhe: `Devolução nº ${d.numero} • compra ${formatarNumeroVenda(v.numero)}`, valorCentavos: noFiado, sinal: '−', cancelada: false });
      }
    }
  }
  // compra no fiado: uma linha por venda (somando as partes, quando o pagamento dividiu a conta)
  const porVenda = new Map<string, { numero: number; criadoEm: string; venceEm: string; bruto: number }>();
  for (const r of recebiveis) {
    if (r.forma !== 'fiado' || r.cliente?.id !== clienteId) continue;
    const ja = porVenda.get(r.vendaId);
    porVenda.set(r.vendaId, { numero: r.vendaNumero, criadoEm: r.criadoEm, venceEm: r.venceEm, bruto: (ja?.bruto ?? 0) + r.brutoCentavos });
    if (r.recebimento && r.situacao === 'recebido') {
      linhas.push({
        dia: dia(r.recebimento.em),
        ordem: `${r.recebimento.em}4`,
        tipo: 'fiado',
        movimento: 'Fiado pago',
        detalhe: `${r.recebimento.forma ? NOME_FORMA_PAGAMENTO[r.recebimento.forma] : r.recebimento.conta === 'caixa' ? 'Caixa físico' : 'Conta bancária'} • compra ${formatarNumeroVenda(r.vendaNumero)} • ${r.recebimento.por.nome}`,
        valorCentavos: r.recebimento.valorCentavos,
        sinal: '−',
        cancelada: false,
      });
    }
  }
  for (const f of porVenda.values()) {
    linhas.push({
      dia: dia(f.criadoEm),
      ordem: `${f.criadoEm}5`,
      tipo: 'fiado',
      movimento: 'Compra no fiado',
      detalhe: `compra ${formatarNumeroVenda(f.numero)} • vence ${f.venceEm.split('-').reverse().join('/')}`,
      valorCentavos: f.bruto,
      sinal: '+',
      cancelada: false,
    });
  }
  return linhas.sort((a, b) => b.dia.localeCompare(a.dia) || b.ordem.localeCompare(a.ordem));
}
