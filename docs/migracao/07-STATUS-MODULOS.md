# Status da Migração

## Fase atual

**Fase 0 — Preparação: concluída em 26/11/2026, aguardando aprovação** (branch `migration/rebuild`, PR #3 para o
`teste-local-windows`).
Falta só um item do critério de aceite, que depende do dono: a tag `pre-demolicao` no GitHub (ver Pendências abertas).
Próxima: **Fase 1 — Especificação** (branch `migration/fase-1-especificacao`, depois do merge da Fase 0).

## Última sessão

Data: 2026-11-26

O que foi feito:
- Tag `pre-demolicao` (anotada, "Snapshot antes da reconstrução") criada no commit `a7979e3`, o último do sistema
  antigo no `teste-local-windows`. O GitHub recusou o envio da tag a partir desta sessão (HTTP 403; o envio de
  branches funciona).
- Código antigo movido com `git mv` para `legacy/` (303 arquivos, todos como renomeação, histórico preservado):
  `legacy/web`, `legacy/api`, `legacy/core`, `legacy/demo` e `legacy/raiz` (os arquivos da raiz que só serviam ao
  sistema antigo). `legacy/README.md` explica cada pasta.
- `backend/`: `pom.xml` com a stack da seção 2.8 (Spring Boot 3.3.13, Java 21, HTMX 1.9.12 via WebJar, Bouncy
  Castle 1.87 para o scrypt), `SaasLuanMoriApplication` e a documentação de cada pacote (`config`, `domain`,
  `repository`, `service`, `web`). `mvn -f backend/pom.xml clean verify`: BUILD SUCCESS, sem nenhum aviso
  (compila com `-Xlint:all -Werror`).
- CI novo (`.github/workflows/ci.yml`): varredura de segredos (arquivos e histórico) e `mvn verify` do backend.
  O CI antigo ficou em `legacy/raiz/ci.yml`.
- `README.md` e `CLAUDE.md` atualizados; o prompt mestre gravado em `docs/migracao/PROMPT-MESTRE.md`.

O que ficou pendente: ver Pendências abertas.

## Módulos

Lista inicial, tirada da barra lateral do sistema antigo: o botão em destaque e os quatro grupos
(`legacy/web/src/painel/menu.tsx:191-198`), mais a entrada (`legacy/web/src/telas/TelaEntrada.tsx`). A lista
definitiva, com a ordem de dependência e o módulo de referência, sai na Fase 1.

| Módulo | Status | PR | Testes | Isolamento | RLS | Design |
|---|---|---|---|---|---|---|
| Preparação (Fase 0) | ✅ aguardando aprovação | #3 | — | — | — | — |
| Especificação (Fase 1) | ⏳ pendente | — | — | — | — | — |
| Fundação (Fase 2) | ⏳ pendente | — | — | — | — | — |
| Entrada (login, primeiro acesso, trocar a senha) | ⏳ pendente | — | — | — | — | — |
| Visão geral | ⏳ pendente | — | — | — | — | — |
| Frente de caixa | ⏳ pendente | — | — | — | — | — |
| Caixa do dia | ⏳ pendente | — | — | — | — | — |
| Produtos e estoque | ⏳ pendente | — | — | — | — | — |
| Compras (com fornecedores e contas a pagar) | ⏳ pendente | — | — | — | — | — |
| Clientes (com fiado, fidelidade e vale-troca) | ⏳ pendente | — | — | — | — | — |
| Financeiro | ⏳ pendente | — | — | — | — | — |
| Relatórios | ⏳ pendente | — | — | — | — | — |
| Usuários | ⏳ pendente | — | — | — | — | — |
| Dados e backup (com as ferramentas do Adm. Sup) | ⏳ pendente | — | — | — | — | — |
| Suporte (em branco no sistema antigo: `legacy/web/src/painel/TelaPainel.tsx:5-6`) | ⏳ pendente | — | — | — | — | — |
| Meu usuário | ⏳ pendente | — | — | — | — | — |
| Testes E2E (Fase 5) | ⏳ pendente | — | — | — | — | — |
| Deploy e arquivamento (Fase 6) | ⏳ pendente | — | — | — | — | — |

## Pendências abertas

- [ ] **Enviar a tag `pre-demolicao` para o GitHub** (depende do dono): esta sessão recebe HTTP 403 ao enviar tags.
  Do computador do Luan, criar a mesma tag no mesmo commit e enviar:
  `git fetch origin` · `git tag -a pre-demolicao a7979e3 -m "Snapshot antes da reconstrução"` · `git push origin pre-demolicao`.
- [ ] **Ativar a proteção da `main`** no GitHub (Settings → Branches). Hoje o GitHub responde "Branch not protected",
  o contrário do que diz a decisão 2.2.
- [ ] **Decidir, antes da Fase 6, o que fazer com o ensaio Java que só existe na `main`** (25/11/2026, PR #2 e os commits
  antes dele): `apps/java` (API com Auth0 e PostgreSQL), `apps/web/html` (interface HTML alternativa),
  `docs/MIGRACAO-JAVA.md` e `.github/workflows/validar-migracao.yml`. A `main` segue um caminho separado do
  `teste-local-windows` desde 12/11/2026 (`c541411`), e esse ensaio usa Auth0, o contrário da decisão 2.4. No merge da
  Fase 6 ele vai conflitar com a reconstrução.
- [ ] **Aprovação da Fase 0** (PR #3 para o `teste-local-windows`) para começar a Fase 1.

## Decisões tomadas

- 26/11: **CLAUDE.md ajustado** com a aprovação do Luan: o teste antes de cada commit passa a ser
  `mvn -f backend/pom.xml verify` (no lugar do `npm test` e de regerar a demonstração). O trabalho fica em branches
  `migration/*` com pull request para o `teste-local-windows`. A demonstração `legacy/demo/` fica congelada como
  referência visual.
- 26/11: **a aba Suporte**, que está em branco no sistema antigo, será reconstruída em branco, igual. O CLAUDE.md
  manda manter assim e, pela regra 1.9, vale sobre a regra 1.3 ("nenhuma tela em branco").
- 26/11: **os arquivos da raiz que só serviam ao sistema antigo** foram para `legacy/raiz/` (npm, TypeScript, Docker,
  deploy, scripts do Windows, README e CI antigos). `scripts/varrer-segredos.mjs` e `docs/` continuam na raiz.
  O `node_modules` e as saídas geradas (`dist`, `dist-demo`, `coverage` e o cliente gerado do Prisma) foram apagados
  do disco: não estão no git e se geram de novo a partir do código.
- 26/11: **o prompt mestre** fica em `docs/migracao/PROMPT-MESTRE.md`, para cada sessão nova reler.
- 26/11: **Spring Boot 3.3.13**, a última versão da linha 3.3.x pedida na decisão 2.8. O risco (a linha 3.3 não recebe
  mais correções de segurança gratuitas) vai para o `06-RISCOS-E-DECISOES.md` na Fase 1.
- 26/11: **compilação com `-Xlint:all -Werror`**: qualquer aviso de compilação para o build (regra 1.6).
