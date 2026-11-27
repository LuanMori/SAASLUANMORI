# SAASLUANMORI — Sistema Padrão (SaaS multiempresa de gestão de varejo)

> **Em reconstrução desde 26/11/2026.** O sistema está sendo refeito do zero em **Java + HTML + CSS**
> (Spring Boot 3.3, Thymeleaf e HTMX), com o mesmo visual e as mesmas funcionalidades do sistema antigo
> e com o isolamento entre lojas em duas camadas: na aplicação e no banco (RLS do PostgreSQL).

## Onde fica cada coisa

| Pasta | O que é |
|---|---|
| `backend/` | o sistema novo (Java 21, Spring Boot). É aqui que se escreve código. |
| `legacy/` | o sistema antigo (React + NestJS + TypeScript), **somente leitura**: só para consulta durante a reconstrução. Ver `legacy/README.md`. |
| `docs/migracao/` | o contrato da reconstrução (`PROMPT-MESTRE.md`), a especificação (00 a 06: telas, funcionalidades, regras, design, permissões, riscos e decisões) e o andamento (`07-STATUS-MODULOS.md`). |
| `docs/` | os documentos do sistema antigo: segurança, deploy, backup, LGPD, decisões, pendências da Visão geral e o progresso por módulo (`docs/danipets/`). |
| `scripts/varrer-segredos.mjs` | a varredura de segredos que o CI roda. |

## Como compilar e testar

Precisa de Java 21, Maven 3.9 e um PostgreSQL 15 ou mais novo (os testes de isolamento entre lojas rodam num banco de
verdade: o RLS não existe em banco de mentira).

```bash
mvn -f backend/pom.xml verify
```

Tem de passar antes de qualquer commit. Os testes recriam sozinhos o banco `saasluanmori_teste` (UTF-8, ICU pt-BR) com a
role dona `saas_dono`, que não é superusuário. Eles se conectam ao servidor como administrador por
`SAAS_TESTE_PG_URL`, `SAAS_TESTE_PG_USUARIO` e `SAAS_TESTE_PG_SENHA` (padrão: `jdbc:postgresql://localhost:5432/postgres`,
`postgres`, `postgres`). O CI (`.github/workflows/ci.yml`) roda isso com um PostgreSQL 16 de serviço e a varredura de
segredos a cada push e pull request.

## Como rodar o sistema novo

O sistema lê tudo o que é segredo ou muda por instalação do ambiente (`backend/src/main/resources/application.yml`):

| Variável | O que é |
|---|---|
| `SAAS_DB_URL` | endereço JDBC do banco (ex.: `jdbc:postgresql://localhost:5432/saasluanmori`) |
| `SAAS_DB_APP_SENHA` | senha da role `saas_app`, com que o sistema conecta (sem BYPASSRLS e sem ser dona das tabelas) |
| `SAAS_DB_DONO_USUARIO`, `SAAS_DB_DONO_SENHA` | a role dona do schema, que roda as migrações e os comandos de administração |
| `SAAS_DB_DEFINIR_SENHA_APP` | `true` liga o login da `saas_app` com a senha acima logo depois das migrações |
| `DOMINIO_BASE` | o domínio do SaaS: com ele, a loja vem do endereço (`lojaa.nomedaempresa.com.br`) |
| `LOJA_DEV` | sem `DOMINIO_BASE` (desenvolvimento): o endereço da loja de teste; também vale `?loja=` no endereço |
| `COOKIE_SEGURO`, `SESSAO_INATIVIDADE_MIN`, `SESSAO_MAXIMA_HORAS`, `SALTOS_DE_PROXY`, `WEB_ORIGINS` | os mesmos do servidor antigo |

```bash
mvn -f backend/pom.xml spring-boot:run
```

O servidor se recusa a subir se a conexão escapar do RLS (superusuário, BYPASSRLS, dona de tabela, tabela de loja sem
RLS forçado ou banco fora do UTF-8). Lojas e pessoas são cadastradas pelos comandos de administração, com a role dona e
as mesmas mensagens dos scripts antigos:

```bash
SEED_LOJAS="Pet Shop da Ana=lojaa" java -jar backend/target/backend-0.1.0-SNAPSHOT.jar db:seed
```

```bash
java -jar backend/target/backend-0.1.0-SNAPSHOT.jar db:usuario --loja lojaa --usuario ana --nome "Ana Paula" --papel dono
```

```bash
java -jar backend/target/backend-0.1.0-SNAPSHOT.jar db:suporte --usuario suporte
```

O `db:usuario` também aceita `--redefinir-senha` e `--desativar`; o `db:suporte`, `--redefinir-senha`, `--desativar` e
`--reativar`; o `db:app-role` liga o login da `saas_app` com `SAAS_DB_APP_SENHA`. A senha provisória (ou a do suporte)
aparece uma vez só.

## Demonstração do sistema antigo

`legacy/demo/sistema-padrao-demo.html` abre no navegador, sem instalar nada e sem servidor: é o painel completo do
sistema antigo, com os dados guardados no próprio navegador e os usuários de teste na faixa amarela. Fica congelada
como referência para comparar o visual da reconstrução.

## Como trabalhar

- Cada fase ou módulo tem uma branch `migration/*`, que sai do `teste-local-windows` e volta para ele por pull request.
- A `main` não recebe nada até a Fase 6, e só com a autorização do dono.
- O último commit do sistema antigo, antes da mudança, é o `a7979e3`, marcado com a tag `pre-demolicao`.
