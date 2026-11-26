// packages/core/src/modelosDePlanilha.ts
// As colunas das planilhas de cadastro (Fase 2, módulo 13; DaniPets DAT-06 e DAT-07; pedido do Luan em 25/11/2026).
// A exportação de Dados e backup sai com estas colunas, e o modelo de importação usa as mesmas. Assim, o que se
// exporta de uma loja se importa em outra. A importação acha cada coluna pelo título, sem diferenciar maiúsculas
// e acentos. Coluna "só consulta" vai na exportação para a pessoa ver, e a importação não lê.

export type TipoDaColuna = 'texto' | 'dinheiro' | 'numero' | 'data';

export interface ColunaDoModelo {
  titulo: string;
  tipo: TipoDaColuna;
  /** Sem ela, a linha não entra (a importação mostra o motivo). */
  obrigatoria?: boolean;
  /** Vai na exportação, para consulta; a importação não lê. */
  soConsulta?: boolean;
  /** Como preencher (aparece no modelo da importação). */
  ajuda: string;
}

export type CadastroDaPlanilha = 'produtos' | 'clientes' | 'fornecedores';

export const NOME_DO_CADASTRO: Record<CadastroDaPlanilha, string> = { produtos: 'Produtos', clientes: 'Clientes', fornecedores: 'Fornecedores' };

export const COLUNAS_PRODUTOS: readonly ColunaDoModelo[] = [
  { titulo: 'Código interno', tipo: 'texto', soConsulta: true, ajuda: 'Gerado pelo sistema (0001, 0002…). Na importação, cada produto ganha um código novo.' },
  { titulo: 'Nome', tipo: 'texto', obrigatoria: true, ajuda: 'Até 120 letras.' },
  { titulo: 'Código de barras', tipo: 'texto', ajuda: 'Só números. Não se repete na loja.' },
  { titulo: 'Marca', tipo: 'texto', ajuda: 'Até 60 letras.' },
  { titulo: 'Unidade', tipo: 'texto', ajuda: 'un (vendido por unidade) ou kg (vendido por quilo). Em branco: un.' },
  { titulo: 'Peso da embalagem (kg)', tipo: 'numero', ajuda: 'Só descreve o produto. Exemplo: 15 para a ração de 15 kg; 0,5 para 500 g.' },
  { titulo: 'Preço de venda', tipo: 'dinheiro', obrigatoria: true, ajuda: 'Maior que zero. No produto por kg, o preço do quilo.' },
  { titulo: 'Estoque', tipo: 'numero', ajuda: 'Na importação, vira o estoque inicial. No produto por kg, em quilos (2,5).' },
  { titulo: 'Custo', tipo: 'dinheiro', ajuda: 'Custo de cada unidade (ou de cada quilo). Na importação, é o custo do estoque inicial.' },
  { titulo: 'Estoque mínimo', tipo: 'numero', ajuda: 'Aviso de estoque baixo. No produto por kg, em quilos.' },
  { titulo: 'Fornecedor', tipo: 'texto', ajuda: 'O nome do fornecedor, como está no cadastro de fornecedores.' },
  { titulo: 'Situação', tipo: 'texto', soConsulta: true, ajuda: 'Ativo ou Inativo. Na importação, todo produto entra ativo.' },
];

/** As colunas de clientes. `rotuloDoExtra`: o nome do campo extra da loja ("Pet"), quando ligado. */
export function colunasClientes(rotuloDoExtra: string | null): ColunaDoModelo[] {
  return [
    { titulo: 'Nome', tipo: 'texto', obrigatoria: true, ajuda: 'Nome completo (pelo menos 3 letras).' },
    { titulo: 'Telefone', tipo: 'texto', obrigatoria: true, ajuda: 'Com DDD. Exemplo: (41) 99999-9999.' },
    { titulo: 'CPF', tipo: 'texto', obrigatoria: true, ajuda: 'Os 11 números. Não se repete na loja.' },
    { titulo: 'WhatsApp', tipo: 'texto', ajuda: 'Sim ou Não. Em branco: sim, se o telefone for celular.' },
    { titulo: 'Nascimento', tipo: 'data', ajuda: 'Dia, mês e ano (dd/mm/aaaa).' },
    { titulo: 'Endereço', tipo: 'texto', ajuda: 'Até 160 letras.' },
    ...(rotuloDoExtra ? [{ titulo: rotuloDoExtra, tipo: 'texto' as const, ajuda: 'O campo extra da loja.' }] : []),
    { titulo: 'Limite de fiado', tipo: 'dinheiro', ajuda: 'Em branco ou zero: só compra no fiado com a liberação do Dono.' },
    { titulo: 'Aceita mensagens', tipo: 'texto', ajuda: 'Sim, se o cliente autorizou receber ofertas e lembretes da loja pelo WhatsApp.' },
    { titulo: 'Observações', tipo: 'texto', ajuda: 'Até 300 letras.' },
  ];
}

export const COLUNAS_FORNECEDORES: readonly ColunaDoModelo[] = [
  { titulo: 'Nome', tipo: 'texto', obrigatoria: true, ajuda: 'De 2 a 120 letras.' },
  { titulo: 'CNPJ ou CPF', tipo: 'texto', ajuda: 'Com ou sem pontos. Não se repete na loja.' },
  { titulo: 'Telefone', tipo: 'texto', ajuda: 'Com DDD.' },
  { titulo: 'Contato', tipo: 'texto', ajuda: 'O nome da pessoa de contato (vendedor, representante).' },
  { titulo: 'Observação', tipo: 'texto', ajuda: 'Até 300 letras.' },
  { titulo: 'Situação', tipo: 'texto', soConsulta: true, ajuda: 'Ativo ou Desativado. Na importação, todo fornecedor entra ativo.' },
];

/** "Sim" / "Não" para as colunas de marcar. */
export const simOuNao = (v: boolean | null | undefined): string | null => (v === true ? 'Sim' : v === false ? 'Não' : null);
