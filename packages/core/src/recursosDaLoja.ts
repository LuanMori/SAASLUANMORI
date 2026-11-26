// packages/core/src/recursosDaLoja.ts
// AJUSTES DA LOJA, ferramenta do Adm. Sup (Fase 2, módulo 13f; pedido do Luan, 25/11/2026: "lançar atualizações,
// ajustes, criar visões, para conseguirmos ter acesso mesmo quando vender"). O suporte decide, loja por loja, o que
// ela usa (o que o plano dela inclui):
//   - LIGAR E DESLIGAR RECURSOS: desligado, o recurso some das abas e das opções, e o sistema recusa o que for NOVO
//     dele. Nada é apagado: o histórico continua nos Relatórios e na cópia de segurança, e tudo volta ao ligar de novo;
//   - o que o CLIENTE já tem continua valendo até acabar: o fiado a pagar pode ser recebido, o saldo de cashback e o
//     cupom já enviado podem ser usados, o vale-troca também;
//   - LIMITES: usuários ativos e produtos ativos (vazio = sem limite). Baixar o limite não desativa ninguém nem
//     inativa produto: só não deixa criar nem reativar até ficar abaixo dele;
//   - os ajustes são do suporte: não vão na cópia de segurança da loja (restaurar uma cópia antiga não religa nada).
// Só o Adm. Sup muda (permissão 'suporte.ferramentas'); todos da loja leem (as telas escondem o que está desligado).
import { ehObjeto } from './interno';
import type { ErroCampo, Resultado } from './resultado';
import type { Operador } from './venda';

/** Os recursos que o suporte liga e desliga, na ordem da tela, com o que muda quando desligados. */
export const RECURSOS_DA_LOJA = {
  compras: { nome: 'Compras', descricao: 'A aba Compras: notas de compra, fornecedores e contas a pagar das notas.' },
  financeiro: {
    nome: 'Financeiro',
    descricao: 'A aba Financeiro e os lançamentos feitos à mão. As vendas e o caixa continuam movimentando as contas.',
  },
  relatorios: { nome: 'Relatórios', descricao: 'A aba Relatórios e a importação de vendas antigas (que só aparecem nos Relatórios).' },
  fiado: { nome: 'Fiado', descricao: 'Vender fiado na Frente de caixa. O fiado que já existe continua podendo ser recebido.' },
  fidelidade: {
    nome: 'Fidelidade',
    descricao: 'Cashback nas compras, cupom de retorno e a aba Retorno (os lembretes pelo WhatsApp). O saldo e os cupons que os clientes já têm continuam valendo.',
  },
  vales: { nome: 'Vale-troca', descricao: 'Devolver como vale-troca. Os vales que já existem continuam podendo ser usados.' },
} as const satisfies Record<string, { nome: string; descricao: string }>;

export type RecursoDaLoja = keyof typeof RECURSOS_DA_LOJA;
export const LISTA_RECURSOS_DA_LOJA = Object.keys(RECURSOS_DA_LOJA) as RecursoDaLoja[];

export const ehRecursoDaLoja = (v: unknown): v is RecursoDaLoja => typeof v === 'string' && Object.hasOwn(RECURSOS_DA_LOJA, v);

export type LimiteDaLoja = 'usuariosAtivos' | 'produtosAtivos';

export const LIMITES_DA_LOJA: Record<LimiteDaLoja, { nome: string; min: number; max: number }> = {
  usuariosAtivos: { nome: 'Usuários ativos', min: 1, max: 1000 },
  produtosAtivos: { nome: 'Produtos ativos', min: 1, max: 100_000 },
};

export interface AjustesDaLoja {
  /** Os recursos desligados nesta loja, na ordem de RECURSOS_DA_LOJA (os outros estão ligados). */
  desligados: RecursoDaLoja[];
  /** null = sem limite. */
  limites: Record<LimiteDaLoja, number | null>;
  /** Quando e quem mudou por último (null = nunca mudou: tudo ligado e sem limite). */
  alteradoEm: string | null;
  alteradoPor: Operador | null;
}

export type MudancaDosAjustes = Pick<AjustesDaLoja, 'desligados' | 'limites'>;

export const AJUSTES_PADRAO: AjustesDaLoja = Object.freeze({
  desligados: [],
  limites: { usuariosAtivos: null, produtosAtivos: null },
  alteradoEm: null,
  alteradoPor: null,
}) as AjustesDaLoja;

/** O recurso está ligado? Sem ajustes (ainda não chegaram, ou o servidor não tem essa parte), tudo está ligado. */
export const recursoLigado = (ajustes: Pick<AjustesDaLoja, 'desligados'> | null | undefined, recurso: RecursoDaLoja): boolean =>
  !ajustes?.desligados.includes(recurso);

export const mensagemRecursoDesligado = (recurso: RecursoDaLoja): string => `${RECURSOS_DA_LOJA[recurso].nome}: este recurso está desligado nesta loja. Fale com o suporte.`;

/**
 * Confere os ajustes que o Adm. Sup enviou: { desligados: [recursos], limites: { usuariosAtivos, produtosAtivos } }.
 * O limite vazio (null ou '') = sem limite. Os desligados saem sem repetição e na ordem da tela.
 */
export function validarAjustes(entrada: unknown): Resultado<MudancaDosAjustes> {
  const erros: ErroCampo[] = [];
  if (!ehObjeto(entrada)) return { ok: false, erros: [{ campo: 'ajustes', mensagem: 'Envie os recursos desligados e os limites da loja.' }] };
  for (const k of Object.keys(entrada)) if (k !== 'desligados' && k !== 'limites') erros.push({ campo: k, mensagem: 'Campo não permitido.' });

  const pedidos = entrada.desligados ?? [];
  if (!Array.isArray(pedidos)) erros.push({ campo: 'desligados', mensagem: 'Envie a lista dos recursos desligados.' });
  else for (const r of pedidos) if (!ehRecursoDaLoja(r)) erros.push({ campo: 'desligados', mensagem: `Recurso desconhecido: ${String(r)}.` });
  const desligados = Array.isArray(pedidos) ? LISTA_RECURSOS_DA_LOJA.filter((r) => pedidos.includes(r)) : [];

  const limites: Record<LimiteDaLoja, number | null> = { usuariosAtivos: null, produtosAtivos: null };
  const pedidosDeLimite = entrada.limites ?? {};
  if (!ehObjeto(pedidosDeLimite)) erros.push({ campo: 'limites', mensagem: 'Envie os limites da loja.' });
  else {
    for (const k of Object.keys(pedidosDeLimite)) if (!Object.hasOwn(LIMITES_DA_LOJA, k)) erros.push({ campo: `limites.${k}`, mensagem: 'Limite desconhecido.' });
    for (const k of Object.keys(LIMITES_DA_LOJA) as LimiteDaLoja[]) {
      const v = pedidosDeLimite[k];
      if (v === undefined || v === null || v === '') continue;
      const { nome, min, max } = LIMITES_DA_LOJA[k];
      const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
        erros.push({ campo: `limites.${k}`, mensagem: `${nome}: use um número inteiro de ${min} a ${max.toLocaleString('pt-BR')}, ou deixe em branco para não ter limite.` });
      } else limites[k] = n;
    }
  }
  return erros.length > 0 ? { ok: false, erros } : { ok: true, valor: { desligados, limites } };
}

/**
 * Cabe mais `novos` no limite? null = cabe; senão, a mensagem para a tela. `ativos`: quantos há agora.
 * Acima do limite (o suporte baixou depois), nada é desfeito: só não entra nenhum novo.
 */
export function conferirLimiteDaLoja(limite: LimiteDaLoja, ajustes: Pick<AjustesDaLoja, 'limites'> | null | undefined, ativos: number, novos = 1): string | null {
  const max = ajustes?.limites[limite] ?? null;
  if (max === null || novos <= 0 || ativos + novos <= max) return null;
  if (limite === 'usuariosAtivos') {
    return `Esta loja pode ter até ${max} ${max === 1 ? 'usuário ativo' : 'usuários ativos'} (hoje: ${ativos}). Desative um usuário ou fale com o suporte para aumentar o limite.`;
  }
  const ate = `até ${max.toLocaleString('pt-BR')} ${max === 1 ? 'produto ativo' : 'produtos ativos'} (hoje: ${ativos.toLocaleString('pt-BR')})`;
  return novos === 1
    ? `Esta loja pode ter ${ate}. Inative um produto ou fale com o suporte para aumentar o limite.`
    : `A planilha traz ${novos.toLocaleString('pt-BR')} produtos novos, e esta loja pode ter ${ate}. Fale com o suporte para aumentar o limite.`;
}

/** O que mudou, para o histórico (sem dado pessoal): os recursos ligados e desligados e os limites novos. */
export function mudancasDosAjustes(antes: MudancaDosAjustes, depois: MudancaDosAjustes): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const desligou = depois.desligados.filter((r) => !antes.desligados.includes(r));
  const ligou = antes.desligados.filter((r) => !depois.desligados.includes(r));
  if (desligou.length) d.desligou = desligou;
  if (ligou.length) d.ligou = ligou;
  for (const k of Object.keys(LIMITES_DA_LOJA) as LimiteDaLoja[]) if (antes.limites[k] !== depois.limites[k]) d[k] = depois.limites[k];
  return d;
}

/** "desligou Fiado e Vale-troca • ligou Compras • usuários: até 5 • produtos: sem limite". */
export function resumoDosAjustes(detalhes: Record<string, unknown>): string {
  const nomes = (v: unknown) => {
    const n = Array.isArray(v) ? v.filter(ehRecursoDaLoja).map((r) => RECURSOS_DA_LOJA[r].nome) : [];
    return n.length <= 1 ? (n[0] ?? null) : `${n.slice(0, -1).join(', ')} e ${n.at(-1)}`;
  };
  const limite = (k: LimiteDaLoja, rotulo: string) => {
    if (!Object.hasOwn(detalhes, k)) return null;
    const v = detalhes[k];
    return typeof v === 'number' && Number.isInteger(v) ? `${rotulo}: até ${v.toLocaleString('pt-BR')}` : v === null ? `${rotulo}: sem limite` : null;
  };
  const desligou = nomes(detalhes.desligou);
  const ligou = nomes(detalhes.ligou);
  return [desligou && `desligou ${desligou}`, ligou && `ligou ${ligou}`, limite('usuariosAtivos', 'usuários'), limite('produtosAtivos', 'produtos')]
    .filter((x): x is string => Boolean(x))
    .join(' • ');
}
