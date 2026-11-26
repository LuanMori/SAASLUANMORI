// apps/web/src/painel/dados/planilhasDeCadastro.ts
// As planilhas de cadastro de Dados e backup (Fase 2, módulo 13): produtos, clientes e fornecedores, com as colunas
// do @saas/core (modelosDePlanilha.ts), as mesmas do modelo de importação. Também os nomes dos arquivos baixados.
import {
  type CadastroDaPlanilha,
  type Cliente,
  type ColunaDoModelo,
  colunasClientes,
  COLUNAS_FORNECEDORES,
  COLUNAS_PRODUTOS,
  COLUNAS_VENDAS_ANTIGAS,
  formatarDocumento,
  formatarTelefone,
  type Fornecedor,
  NOME_DO_CADASTRO,
  simOuNao,
  temWhatsapp,
  unidadeDe,
} from '@saas/core';
import type { Produto, SaldoEstoque } from '../../api';
import { naUnidade } from '../../relatorios/planilhas';
import type { Celula, Planilha } from '../../relatorios/xlsx';

/** Cada registro vira uma linha na ordem das colunas do modelo (pelo título; o que falta fica vazio). */
function montar(nome: string, colunas: readonly ColunaDoModelo[], registros: readonly Record<string, Celula>[]): Planilha {
  return {
    nome,
    colunas: colunas.map((c) => ({ titulo: c.titulo, tipo: c.tipo })),
    linhas: registros.map((r) => colunas.map((c) => r[c.titulo] ?? null)),
  };
}

const porNome = <T extends { nome: string }>(lista: readonly T[]) => [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const ouNada = (t: string | null | undefined) => (t ? t : null);

/**
 * Produtos com o estoque, o custo médio e o fornecedor. `estoque` null (o sistema da loja ainda não tem, ou quem baixa
 * não vê o custo): essas colunas vão vazias. No produto por kg, estoque e mínimo em quilos.
 */
export function planilhaDeProdutos(produtos: readonly Produto[], estoque: readonly SaldoEstoque[] | null, fornecedores: readonly Fornecedor[] | null): Planilha {
  const saldos = new Map((estoque ?? []).map((e) => [e.produtoId, e]));
  const nomes = new Map((fornecedores ?? []).map((f) => [f.id, f.nome]));
  return montar(
    'Produtos',
    COLUNAS_PRODUTOS,
    porNome(produtos).map((p) => {
      const u = unidadeDe(p.unidade);
      const e = saldos.get(p.id);
      return {
        'Código interno': p.codigoInterno,
        Nome: p.nome,
        'Código de barras': ouNada(p.codigoBarras),
        Marca: ouNada(p.marca),
        Unidade: u,
        'Peso da embalagem (kg)': p.pesoGramas ? p.pesoGramas / 1000 : null,
        'Preço de venda': p.precoCentavos,
        Estoque: e ? naUnidade(e.saldo, u) : null,
        Custo: e?.custoMedioCentavos ?? null,
        'Estoque mínimo': e?.minimo == null ? null : naUnidade(e.minimo, u),
        Fornecedor: p.fornecedorId ? (nomes.get(p.fornecedorId) ?? null) : null,
        Situação: p.ativo ? 'Ativo' : 'Inativo',
      };
    }),
  );
}

/**
 * Clientes ativos (os de dados excluídos pela LGPD ficam de fora). `extra`: o campo extra da loja ("Pet"), quando
 * ligado. `comCpf`: quem baixa pode ver o CPF completo; sem isso, a coluna vai vazia (nunca mascarada, para o arquivo
 * continuar servindo para importar).
 */
export function planilhaDeClientes(clientes: readonly Cliente[], extra: { ativo: boolean; rotulo: string } | null, comCpf: boolean): Planilha {
  const rotulo = extra?.ativo ? extra.rotulo : null;
  return montar(
    'Clientes',
    colunasClientes(rotulo),
    porNome(clientes.filter((c) => !c.dadosExcluidos)).map((c) => ({
      Nome: c.nome,
      Telefone: ouNada(formatarTelefone(c.telefone)),
      CPF: comCpf ? ouNada(formatarDocumento(c.cpf)) : null,
      WhatsApp: simOuNao(temWhatsapp(c)),
      Nascimento: ouNada(c.nascimento),
      Endereço: ouNada(c.endereco),
      ...(rotulo ? { [rotulo]: ouNada(c.extra) } : {}),
      'Limite de fiado': c.limiteFiadoCentavos ?? 0,
      'Aceita mensagens': simOuNao(Boolean(c.autorizaMensagens)),
      Observações: ouNada(c.observacoes),
    })),
  );
}

export function planilhaDeFornecedores(fornecedores: readonly Fornecedor[]): Planilha {
  return montar(
    'Fornecedores',
    COLUNAS_FORNECEDORES,
    porNome(fornecedores).map((f) => ({
      Nome: f.nome,
      'CNPJ ou CPF': f.documento ? formatarDocumento(f.documento) : null,
      Telefone: f.telefone ? ouNada(formatarTelefone(f.telefone)) : null,
      Contato: ouNada(f.contato),
      Observação: ouNada(f.observacao),
      Situação: f.ativo ? 'Ativo' : 'Desativado',
    })),
  );
}

/**
 * O modelo para importar (Baixar o modelo): a aba do cadastro só com os títulos, sem as colunas de consulta (nenhuma
 * linha de exemplo, para não entrar sem querer), e a aba "Como preencher", com o que vai em cada coluna.
 */
export function modeloDeImportacao(cadastro: CadastroDaPlanilha | 'vendas', rotuloDoExtra: string | null): Planilha[] {
  const todas =
    cadastro === 'produtos' ? COLUNAS_PRODUTOS : cadastro === 'clientes' ? colunasClientes(rotuloDoExtra) : cadastro === 'fornecedores' ? COLUNAS_FORNECEDORES : COLUNAS_VENDAS_ANTIGAS;
  const colunas = todas.filter((c) => !c.soConsulta);
  return [
    { nome: cadastro === 'vendas' ? 'Vendas antigas' : NOME_DO_CADASTRO[cadastro], colunas: colunas.map((c) => ({ titulo: c.titulo, tipo: c.tipo })), linhas: [] },
    {
      nome: 'Como preencher',
      colunas: [{ titulo: 'Coluna' }, { titulo: 'Obrigatória' }, { titulo: 'Como preencher' }],
      linhas: [
        ...colunas.map((c) => [c.titulo, c.obrigatoria ? 'Sim' : 'Não', c.ajuda]),
        ['(cada linha)', '', 'Um cadastro por linha, a partir da linha 2. Não mude os títulos da linha 1.'],
        cadastro === 'vendas'
          ? ['(histórico)', '', 'As vendas antigas entram só como histórico (Relatórios → Vendas antigas): não mexem em estoque, caixa nem financeiro.']
          : ['(o que já existe)', '', 'O que já está cadastrado na loja fica como está: a importação só acrescenta.'],
      ],
    },
  ];
}

/** "Loja Pet & Cia" -> "loja-pet-cia" (para o nome do arquivo). */
export function nomeParaArquivo(texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'loja';
}

/** "2026-11-25-1432": o dia e a hora da loja, para o nome do arquivo. */
export function momentoParaArquivo(quando: Date, fuso: string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(quando)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}-${partes.hour}${partes.minute}`;
}
