// packages/core/src/vendasAntigas.ts
// VENDAS ANTIGAS (Fase 2, módulo 13; pedido do Luan, 25/11/2026): as vendas de outro sistema, importadas de uma
// planilha SÓ COMO HISTÓRICO. Não mexem em estoque, caixa nem financeiro, e não entram nos números do dia a dia (Visão
// geral, Frente de caixa, Caixa do dia, as outras abas dos Relatórios). Aparecem nos Relatórios, na aba "Vendas antigas".
//   - dois formatos na mesma planilha (decisão de 25/11/2026: aceitar os dois). Com a coluna Produto preenchida, cada
//     linha é um item, e as linhas com o mesmo Número e o mesmo dia são uma venda só. Sem o produto, a linha é a venda
//     inteira;
//   - o total de cada linha é o da coluna Total ou, num item, quantidade × preço unitário;
//   - venda com uma linha com erro fica de fora inteira: nunca entra pela metade;
//   - a mesma venda já importada fica de fora: o mesmo dia e número ou, sem número, o mesmo dia, total, cliente e itens.
import type { ColunaDoModelo } from './modelosDePlanilha';
import {
  type CelulaImportada,
  dataDaCelula,
  dinheiroDaCelula,
  lerCabecalho,
  type LinhaConferida,
  numeroDaCelula,
  type SituacaoDaLinha,
  type TabelaImportada,
  textoDaCelula,
  tituloNormalizado,
} from './importacao';
import type { Resultado } from './resultado';
import type { Operador } from './venda';

export interface ItemVendaAntiga {
  /** null = a linha era a venda inteira, sem o produto. */
  produto: string | null;
  quantidade: number | null;
  precoCentavos: number | null;
  totalCentavos: number;
}

export interface VendaAntiga {
  id: string;
  /** AAAA-MM-DD. */
  dia: string;
  /** O número no sistema antigo. */
  numeroAntigo: string | null;
  cliente: string | null;
  vendedor: string | null;
  pagamento: string | null;
  itens: ItemVendaAntiga[];
  totalCentavos: number;
  importadaEm: string;
  importadaPor: Operador;
}

export type VendaAntigaNova = Omit<VendaAntiga, 'id' | 'importadaEm' | 'importadaPor'>;

export const COLUNAS_VENDAS_ANTIGAS: readonly ColunaDoModelo[] = [
  { titulo: 'Data', tipo: 'data', obrigatoria: true, ajuda: 'O dia da venda (dd/mm/aaaa).' },
  { titulo: 'Número', tipo: 'texto', ajuda: 'O número da venda no sistema antigo. As linhas com o mesmo número e o mesmo dia são uma venda só.' },
  { titulo: 'Cliente', tipo: 'texto', ajuda: 'O nome do cliente (opcional).' },
  { titulo: 'Produto', tipo: 'texto', ajuda: 'Com o produto, a linha é um item da venda. Sem ele, a linha é a venda inteira.' },
  { titulo: 'Quantidade', tipo: 'numero', ajuda: 'Com o produto: a quantidade (em branco: 1).' },
  { titulo: 'Preço unitário', tipo: 'dinheiro', ajuda: 'Com o produto: o preço de cada um.' },
  { titulo: 'Total', tipo: 'dinheiro', ajuda: 'O total da linha. Num item, pode ficar em branco: vale a quantidade × o preço unitário.' },
  { titulo: 'Forma de pagamento', tipo: 'texto', ajuda: 'Dinheiro, Pix, Débito, Crédito, Fiado ou outra (opcional).' },
  { titulo: 'Vendedor', tipo: 'texto', ajuda: 'Quem vendeu (opcional, só para consulta).' },
];

export const DIA_MINIMO_VENDA_ANTIGA = '2000-01-01';

const PAGAMENTO_CONHECIDO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  especie: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  'cartao de debito': 'Débito',
  credito: 'Crédito',
  'cartao de credito': 'Crédito',
  fiado: 'Fiado',
  crediario: 'Fiado',
};
/** "cartão de débito" -> "Débito"; o que não é conhecido fica como veio. */
export const pagamentoDaVendaAntiga = (t: string): string | null => (t ? (PAGAMENTO_CONHECIDO[tituloNormalizado(t)] ?? t) : null);

export interface ConferenciaDasVendasAntigas {
  colunas: string[];
  ignoradas: string[];
  linhas: LinhaConferida<null>[];
  contagem: Record<SituacaoDaLinha, number>;
  /** As vendas novas, já juntadas (cada uma com as linhas dela). */
  vendas: (VendaAntigaNova & { linhas: number[] })[];
  /** Quantas vendas já tinham sido importadas. */
  vendasExistentes: number;
}

const chaveNome = (t: string | null | undefined) => tituloNormalizado(t ?? '');
/** O jeito de achar a mesma venda importada de novo. */
export function assinaturaDaVendaAntiga(v: Pick<VendaAntiga, 'dia' | 'numeroAntigo' | 'totalCentavos' | 'cliente' | 'itens'>): string {
  if (v.numeroAntigo) return `n|${v.dia}|${chaveNome(v.numeroAntigo)}`;
  return `s|${v.dia}|${v.totalCentavos}|${chaveNome(v.cliente)}|${v.itens.map((i) => `${chaveNome(i.produto)}:${i.totalCentavos}`).join(',')}`;
}

interface LinhaLida {
  numero: number;
  nome: string;
  motivos: string[];
  dia: string | null;
  numeroAntigo: string | null;
  cliente: string | null;
  vendedor: string | null;
  pagamento: string | null;
  item: ItemVendaAntiga | null;
}

export function conferirVendasAntigas(
  tabela: TabelaImportada,
  ctx: { hoje: string; existentes: readonly Pick<VendaAntiga, 'dia' | 'numeroAntigo' | 'totalCentavos' | 'cliente' | 'itens'>[] },
): Resultado<ConferenciaDasVendasAntigas> {
  const cab = lerCabecalho(tabela, COLUNAS_VENDAS_ANTIGAS);
  if (!cab.ok) return cab;
  const indice = cab.valor.indice;
  const lidas: LinhaLida[] = [];
  tabela.slice(1).forEach((celulas, i) => {
    if (celulas.every((c) => textoDaCelula(c) === '')) return;
    const ler = (titulo: string): CelulaImportada | undefined => {
      const k = indice.get(titulo);
      return k === undefined ? undefined : (celulas[k] ?? null);
    };
    const motivos: string[] = [];
    const data = dataDaCelula(ler('Data'));
    if (!data.ok) motivos.push('Data: use dia, mês e ano (dd/mm/aaaa).');
    else if (!data.valor) motivos.push('Informe a data da venda.');
    else if (data.valor > ctx.hoje) motivos.push('A data é depois de hoje.');
    else if (data.valor < DIA_MINIMO_VENDA_ANTIGA) motivos.push('A data é de antes de 2000.');
    const produto = textoDaCelula(ler('Produto')) || null;
    const qtd = numeroDaCelula(ler('Quantidade'));
    const preco = dinheiroDaCelula(ler('Preço unitário'));
    const total = dinheiroDaCelula(ler('Total'));
    let quantidade: number | null = null;
    if (produto) {
      if (!qtd.ok || (qtd.valor !== null && qtd.valor <= 0)) motivos.push('Quantidade: use um número maior que zero.');
      else quantidade = qtd.valor ?? 1;
    }
    if (!preco.ok) motivos.push('Preço unitário: use um valor em reais, como 24,90.');
    if (!total.ok) motivos.push('Total: use um valor em reais, como 24,90.');
    let totalCentavos: number | null = total.ok ? total.valor : null;
    if (total.ok && totalCentavos === null) {
      if (produto && quantidade !== null && preco.ok && preco.valor !== null) totalCentavos = Math.round(quantidade * preco.valor);
      else motivos.push(produto ? 'Informe o total do item, ou o preço unitário.' : 'Informe o total da venda.');
    }
    const nome = produto ?? (textoDaCelula(ler('Número')) ? `Venda ${textoDaCelula(ler('Número'))}` : 'Venda');
    lidas.push({
      numero: i + 2,
      nome,
      motivos,
      dia: data.ok ? data.valor : null,
      numeroAntigo: textoDaCelula(ler('Número')) || null,
      cliente: textoDaCelula(ler('Cliente')) || null,
      vendedor: textoDaCelula(ler('Vendedor')) || null,
      pagamento: pagamentoDaVendaAntiga(textoDaCelula(ler('Forma de pagamento'))),
      item: motivos.length === 0 && totalCentavos !== null ? { produto, quantidade, precoCentavos: produto && preco.ok ? preco.valor : null, totalCentavos } : null,
    });
  });

  // junta as linhas de cada venda: o mesmo número no mesmo dia; sem número, cada linha é uma venda
  const grupos = new Map<string, LinhaLida[]>();
  for (const l of lidas) {
    const k = l.numeroAntigo && l.dia ? `${l.dia}|${chaveNome(l.numeroAntigo)}` : `linha|${l.numero}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const existentes = new Set(ctx.existentes.map(assinaturaDaVendaAntiga));
  const situacao = new Map<number, { situacao: SituacaoDaLinha; motivos: string[] }>();
  const vendas: ConferenciaDasVendasAntigas['vendas'] = [];
  let vendasExistentes = 0;
  for (const ls of grupos.values()) {
    const comErro = ls.find((l) => l.motivos.length > 0);
    if (comErro) {
      for (const l of ls) situacao.set(l.numero, { situacao: 'erro', motivos: l.motivos.length ? l.motivos : [`A venda tem uma linha com erro (linha ${comErro.numero}): fica de fora inteira.`] });
      continue;
    }
    const primeiro = <K extends 'cliente' | 'vendedor' | 'pagamento'>(campo: K) => ls.find((l) => l[campo])?.[campo] ?? null;
    const itens = ls.map((l) => l.item!);
    const venda: VendaAntigaNova & { linhas: number[] } = {
      dia: ls[0]!.dia!,
      numeroAntigo: ls[0]!.numeroAntigo,
      cliente: primeiro('cliente'),
      vendedor: primeiro('vendedor'),
      pagamento: primeiro('pagamento'),
      itens,
      totalCentavos: itens.reduce((s, i) => s + i.totalCentavos, 0),
      linhas: ls.map((l) => l.numero),
    };
    if (venda.totalCentavos <= 0) {
      for (const l of ls) situacao.set(l.numero, { situacao: 'erro', motivos: ['O total da venda precisa ser maior que zero.'] });
      continue;
    }
    if (existentes.has(assinaturaDaVendaAntiga(venda))) {
      vendasExistentes += 1;
      const qual = venda.numeroAntigo ? `a venda ${venda.numeroAntigo} de ${venda.dia.split('-').reverse().join('/')}` : 'uma venda igual (mesmo dia, total, cliente e itens)';
      for (const l of ls) situacao.set(l.numero, { situacao: 'existe', motivos: [`Já importada: ${qual}.`] });
      continue;
    }
    vendas.push(venda);
    for (const l of ls) situacao.set(l.numero, { situacao: 'nova', motivos: [] });
  }
  const linhas: LinhaConferida<null>[] = lidas.map((l) => ({ numero: l.numero, nome: l.nome, avisos: [], valor: null, ...situacao.get(l.numero)! }));
  const contagem: Record<SituacaoDaLinha, number> = { nova: 0, existe: 0, repetida: 0, erro: 0 };
  for (const l of linhas) contagem[l.situacao] += 1;
  return { ok: true, valor: { colunas: cab.valor.colunas, ignoradas: cab.valor.ignoradas, linhas, contagem, vendas, vendasExistentes } };
}

/** O resumo da aba Vendas antigas: quanto, quantas, ticket médio e itens (com produto). */
export function resumirVendasAntigas(vendas: readonly Pick<VendaAntiga, 'totalCentavos' | 'itens'>[]) {
  const totalCentavos = vendas.reduce((s, v) => s + v.totalCentavos, 0);
  return {
    vendas: vendas.length,
    totalCentavos,
    ticketMedioCentavos: vendas.length ? Math.round(totalCentavos / vendas.length) : 0,
    itens: vendas.reduce((s, v) => s + v.itens.filter((i) => i.produto).length, 0),
  };
}
