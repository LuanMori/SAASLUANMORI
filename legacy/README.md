# legacy/ — o sistema antigo (React + NestJS + TypeScript)

Código de referência. Não executar. Não modificar. Consultar para reconstruir backend/.
Snapshot: tag pre-demolicao.

O código foi movido para cá com `git mv` em 26/11/2026 (Fase 0 da reconstrução), então o histórico de cada
arquivo continua no git (`git log --follow legacy/...`). O contrato da reconstrução está em
`docs/migracao/PROMPT-MESTRE.md`, e o andamento, em `docs/migracao/07-STATUS-MODULOS.md`.

| Pasta | O que era | Onde ficava |
|---|---|---|
| `web/` | a tela: React 19 + Vite + TypeScript (`@saas/web`), com a API da demonstração em `web/src/demo/apiLocal.ts` | `apps/web/` |
| `api/` | o servidor: NestJS + Prisma + PostgreSQL com RLS (`@saas/api`) | `apps/api/` |
| `core/` | as regras puras, usadas pela tela e pelo servidor (`@saas/core`) | `packages/core/` |
| `demo/` | a demonstração em um arquivo só (`sistema-padrao-demo.html`): roda no navegador, sem servidor. É a referência congelada para comparar o visual da reconstrução | raiz do repositório |
| `raiz/` | o que ficava na raiz e só servia ao sistema antigo: `package.json` e `package-lock.json` (os workspaces do npm), `tsconfig.base.json`, `docker-compose.yml`, `docker-compose.prod.yml`, `.env.producao.example`, `.dockerignore`, `deploy/` (backup e restauração), `teste-local.bat` e `teste-local.ps1`, o `README.md` antigo e o `ci.yml` antigo do GitHub Actions | raiz e `.github/workflows/` |

Ordem de consulta quando duas fontes divergem (decisão 2.3 do prompt mestre): `core/` primeiro, depois
`web/src/demo/apiLocal.ts`, depois `web/src/api.ts` e, por último, `api/`.
