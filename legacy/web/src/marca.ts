// apps/web/src/marca.ts — identidade do SaaS num lugar só.
// Troque aqui quando o nome e a logo forem definidos (a logo fica em Logo.tsx). O título da aba
// do navegador também sai daqui (main.tsx). "Sistema Padrão" é só o nome provisório do repositório.
export const MARCA = {
  /** Nome do SaaS. Provisório: "Nome da empresa". */
  nome: 'Nome da empresa',
  /** Contato mostrado no botão "Suporte" da tela de entrada. */
  suporte: {
    texto: 'Precisa de ajuda? Fale com o suporte do Nome da empresa.',
    email: 'suporte@nomedaempresa.com.br',
  },
  /** A linha embaixo da logo, na tela de entrada (modelo do Luan, 24/11/2026). */
  linha: 'PDV · Estoque · Financeiro',
  /** A chamada da tela de entrada: cada item, uma linha. */
  chamada: ['Sua loja,', 'mais organizada', 'e lucrativa.'],
  /** O texto embaixo da chamada. */
  descricao: 'Um sistema completo para gerenciar vendas (PDV), estoque, financeiro e o dia a dia do seu negócio.',
  /** Os recursos listados na tela de entrada (o ícone de cada um fica em telas/LayoutEntrada.tsx). */
  recursos: [
    { icone: 'pdv', texto: 'PDV e vendas' },
    { icone: 'estoque', texto: 'Controle de estoque' },
    { icone: 'financeiro', texto: 'Gestão financeira' },
  ],
} as const;
