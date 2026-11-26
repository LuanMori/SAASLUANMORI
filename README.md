# SAASLUANMORI — Sistema Padrão (SaaS multiempresa de gestão de varejo)

> **Em reconstrução desde 26/11/2026.** O sistema está sendo refeito do zero em **Java + HTML + CSS**
> (Spring Boot 3.3, Thymeleaf e HTMX), com o mesmo visual e as mesmas funcionalidades do sistema antigo
> e com o isolamento entre lojas em duas camadas: na aplicação e no banco (RLS do PostgreSQL).

## Onde fica cada coisa

| Pasta | O que é |
|---|---|
| `backend/` | o sistema novo (Java 21, Spring Boot). É aqui que se escreve código. |
| `legacy/` | o sistema antigo (React + NestJS + TypeScript), **somente leitura**: só para consulta durante a reconstrução. Ver `legacy/README.md`. |
| `docs/migracao/` | o contrato da reconstrução (`PROMPT-MESTRE.md`) e o andamento (`07-STATUS-MODULOS.md`). A especificação (documentos 00 a 06) entra na Fase 1. |
| `docs/` | os documentos do sistema antigo: segurança, deploy, backup, LGPD, decisões, pendências da Visão geral e o progresso por módulo (`docs/danipets/`). |
| `scripts/varrer-segredos.mjs` | a varredura de segredos que o CI roda. |

## Como compilar e testar

Precisa de Java 21 e Maven 3.9 (o PostgreSQL 15 ou mais novo entra a partir da Fase 2).

```bash
mvn -f backend/pom.xml verify
```

Tem de passar antes de qualquer commit. O CI (`.github/workflows/ci.yml`) roda isso e a varredura de segredos a cada
push e pull request.

## Demonstração do sistema antigo

`legacy/demo/sistema-padrao-demo.html` abre no navegador, sem instalar nada e sem servidor: é o painel completo do
sistema antigo, com os dados guardados no próprio navegador e os usuários de teste na faixa amarela. Fica congelada
como referência para comparar o visual da reconstrução.

## Como trabalhar

- Cada fase ou módulo tem uma branch `migration/*`, que sai do `teste-local-windows` e volta para ele por pull request.
- A `main` não recebe nada até a Fase 6, e só com a autorização do dono.
- O último commit do sistema antigo, antes da mudança, é o `a7979e3`, marcado com a tag `pre-demolicao`.
