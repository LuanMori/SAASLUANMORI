// apps/api/src/banco/conferencia.ts
// Conferência de segurança ao subir (itens 2.2 e 4.5 da revisão). A API se RECUSA a subir se:
//   1. a role da conexão, ou qualquer role de que ela faça parte (mesmo com NOINHERIT: dá para
//      "virar" ela com SET ROLE), é superusuário ou tem BYPASSRLS — o RLS deixaria de valer e uma
//      loja veria os dados de outra;
//   2. a role é dona de alguma tabela (ou faz parte da role dona): o dono pode desligar o RLS;
//   3. alguma tabela com coluna loja_id está sem RLS ligado e forçado, ou sem policy;
//   4. o banco ou a conexão não estão em UTF-8 (acentos viram "?" ou "Ã§").
// As mensagens citam só nomes de roles e de tabelas — nunca senha ou endereço de conexão.

export type Consultar = <T>(sql: string) => Promise<T[]>;

const ROLES = `
  WITH RECURSIVE papeis AS (
    SELECT oid FROM pg_roles WHERE rolname = current_user
    UNION
    SELECT m.roleid FROM pg_auth_members m JOIN papeis p ON m.member = p.oid
  )
  SELECT r.rolname AS nome, r.rolsuper AS super, r.rolbypassrls AS bypass
    FROM pg_roles r JOIN papeis p ON p.oid = r.oid
   ORDER BY r.rolname`;

const DONA_DE_TABELA = `
  SELECT c.relname AS tabela
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'MEMBER')
   ORDER BY c.relname`;

const TABELAS_DE_LOJA = `
  SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
         EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS policy
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'loja_id' AND NOT a.attisdropped)
   ORDER BY c.relname`;

const CODIFICACAO = `
  SELECT pg_encoding_to_char(d.encoding) AS banco, current_setting('client_encoding') AS conexao
    FROM pg_database d WHERE d.datname = current_database()`;

export async function problemasDeSeguranca(consultar: Consultar): Promise<string[]> {
  const problemas: string[] = [];

  for (const r of await consultar<{ nome: string; super: boolean; bypass: boolean }>(ROLES)) {
    if (r.super) problemas.push(`A role "${r.nome}" é superusuário.`);
    if (r.bypass) problemas.push(`A role "${r.nome}" tem BYPASSRLS.`);
  }

  const donas = await consultar<{ tabela: string }>(DONA_DE_TABELA);
  if (donas.length > 0) problemas.push(`A role da API é dona de tabela(s): ${donas.map((d) => d.tabela).join(', ')}.`);

  const tabelas = await consultar<{ tabela: string; rls: boolean; forcado: boolean; policy: boolean }>(TABELAS_DE_LOJA);
  if (tabelas.length === 0) problemas.push('Nenhuma tabela de loja encontrada (as migrations foram aplicadas neste banco?).');
  for (const t of tabelas) {
    if (!t.rls || !t.forcado || !t.policy) problemas.push(`A tabela "${t.tabela}" tem loja_id mas está sem RLS ligado e forçado, ou sem policy.`);
  }

  const [cod] = await consultar<{ banco: string; conexao: string }>(CODIFICACAO);
  if (cod?.banco !== 'UTF8') problemas.push(`O banco está em ${cod?.banco ?? '?'}; precisa ser UTF8 (docs/deploy.md).`);
  if (cod?.conexao !== 'UTF8') problemas.push(`A conexão está em ${cod?.conexao ?? '?'}; precisa ser UTF8.`);

  return problemas;
}
