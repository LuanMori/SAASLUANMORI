// apps/api/test/apoio/config.ts
// Configuração dos testes. Só precisa de um Postgres local com um superusuário
// (padrão: o do docker-compose). Nada aqui é usado em produção.

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export const BANCO_TESTE = 'saas_teste';
export const SENHA_APP_TESTE = 'senha-de-teste-nao-usar-em-producao';

/** URL do banco `nome`, como superusuário (padrão) ou como outra role. */
export function urlDoBanco(nome: string, credenciais?: { usuario: string; senha: string }): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${nome}`;
  if (credenciais) {
    url.username = credenciais.usuario;
    url.password = credenciais.senha;
  }
  return url.toString();
}

export const URL_APP_TESTE = urlDoBanco(BANCO_TESTE, { usuario: 'saas_app', senha: SENHA_APP_TESTE });
