// apps/web/src/marca.ts — identidade do SaaS num lugar só.
// Troque aqui quando o nome e a logo forem definidos (a logo fica em Logo.tsx). O título da aba
// do navegador também sai daqui (main.tsx). "Sistema Padrão" é só o nome provisório do repositório.
export const MARCA = {
  /** Nome do SaaS. Provisório: "Nome da empresa". */
  nome: 'Nome da empresa',
  /** Contato mostrado no botão "Suporte" da tela de entrada. */
  suporte: {
    texto: 'Fale com o suporte do Nome da empresa.',
    email: 'suporte@nomedaempresa.com.br',
  },
} as const;
