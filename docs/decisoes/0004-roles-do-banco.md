# 0004 — Quem conecta no banco, e com que poderes

- **Data:** 18/11/2026 · **Origem:** revisão, itens 2.1, 2.2 e 3.4 · **Situação:** adotado e vigiado por teste

| Role | Usada por | Pode | Não pode |
|---|---|---|---|
| dona do schema (`postgres` no Docker; master no RDS) | migrations e scripts de instalação | tudo | — (nunca usada pela API) |
| `saas_app` | a API | `SELECT`/`INSERT` nas tabelas de loja; `UPDATE` só em `produtos` e em colunas listadas de `usuarios` e `sessoes`; `SELECT` em `lojas` | `DELETE`, `TRUNCATE`, DDL, ignorar o RLS (`NOBYPASSRLS`), ser dona de tabela, ser superusuário |
| `saas_backup` | `pg_dump` (deploy/backup.sh) | `SELECT` em tudo, **com BYPASSRLS** | escrever qualquer coisa |

## Por quê

- RLS com `FORCE` vale até para o dono das tabelas; só superusuário e quem tem `BYPASSRLS` escapam.
  Por isso a API conecta com uma role sem nenhum dos dois, e **confere isso ao subir**
  (`apps/api/src/banco/conferencia.ts`): se a conexão for de superusuário, tiver BYPASSRLS (mesmo
  herdado de outra role), for dona de tabela, ou se alguma tabela com `loja_id` estiver sem RLS, ela
  **não sobe** — melhor fora do ar do que vazando dados entre lojas.
- O backup precisa ver todas as lojas: `saas_backup` tem BYPASSRLS, mas só lê e não é usada pela API.
- `vigilancia.spec.ts` (no CI, a cada push) falha se: uma tabela de loja ficar sem RLS/FORCE/policy;
  aparecer tabela nova sem `loja_id` fora da lista; a `saas_app` ganhar qualquer privilégio fora da
  lista revisada; a `saas_app` (ou role de que faça parte) virar superusuário ou ganhar BYPASSRLS.

## Ao criar uma tabela nova

Na migration: `loja_id` + `ENABLE` e `FORCE ROW LEVEL SECURITY` + policy `<tabela>_isolamento_loja`
(`USING`/`WITH CHECK` `loja_id = app_loja_atual()`) + os `GRANT`s mínimos. Depois, acrescente os
privilégios novos na lista de `vigilancia.spec.ts` e em `docs/SEGURANCA.md` — o teste obriga essa
revisão consciente.
