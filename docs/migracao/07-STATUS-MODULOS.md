# Status da Migração

## Fase atual

**Fase 1 — Especificação: concluída em 27/11/2026** (branch `migration/fase-1-especificacao`, pull request para o
`teste-local-windows`). Os 8 documentos estão em `docs/migracao/` (00 a 07).
Próxima: **Fase 2 — Fundação** (branch `migration/fase-2-fundacao`, depois do merge da Fase 1). Pela decisão D3 do
`06-RISCOS-E-DECISOES.md`, as fases seguem sem esperar aprovação entre elas, menos a Fase 6.

## Última sessão

Data: 2026-11-27

O que foi feito:
- Fase 0 juntada ao `teste-local-windows` (PR #3, merge `d4e65be`).
- Fase 1, os 8 documentos, com arquivo e linha do `legacy/` em cada afirmação:
  - `03-REGRAS-DE-NEGOCIO.md`: Autenticação (scrypt, cookie, sessão, login, saída), Isolamento de dados, as regras e
    mensagens de cada módulo, como cada operação grava e os 15 casos-limite;
  - `04-DESIGN-SYSTEM.md`: cores dos dois temas, tipografia, medidas, breakpoints, estados, componentes com o HTML e os
    assets (só SVG embutido e a ilustração gerada por código);
  - `02-MAPA-DE-FUNCIONALIDADES.md`: o que cada tela lê e grava, e o que existia no servidor antigo ou só na demonstração;
  - `01-MAPA-DE-TELAS.md`: cada tela, com campos, botões, mensagens, navegação e atalhos de teclado;
  - `05-MATRIZ-PERMISSOES.md`: papéis, permissões, mensagens de recusa, Personalizado e barra lateral;
  - `00-VISAO-GERAL.md`: o sistema antigo e o novo, as dívidas técnicas e o SQL exato do isolamento por loja;
  - `06-RISCOS-E-DECISOES.md`: as decisões do dono (D1 a D4), 17 decisões técnicas (T1 a T17), as divergências entre as
    fontes, os riscos e as decisões pendentes;
  - este arquivo, com a lista definitiva de módulos e a ordem.

O que ficou pendente: ver Pendências abertas.

## Módulos

Lista definitiva, tirada das telas do sistema antigo (`01-MAPA-DE-TELAS.md`; barra lateral em
`legacy/web/src/painel/menu.tsx:191-198`), na ordem em que vão ser reconstruídos.

**Como a ordem foi escolhida.** A fundação traz o que todo módulo usa (loja, usuário, sessão, permissões, histórico,
regras da loja, autorizações com senha). Depois vem o módulo mais simples, como referência: **Fornecedores**, uma
tabela só, sem depender de outro módulo (`03-REGRAS-DE-NEGOCIO.md` §8). Os demais seguem quem alimenta quem: um
módulo só vem depois dos que ele lê. Cada módulo traz as próprias tabelas e telas; o efeito dele sobre um módulo que já
existe (por exemplo, a trava do Caixa do dia na venda) entra no pull request dele, com os testes dos dois lados. Nenhuma
tela mostra número inventado.

| Módulo | Status | PR | Testes | Isolamento | RLS | Design |
|---|---|---|---|---|---|---|
| Preparação (Fase 0) | ✅ concluída | #3 | — | — | — | — |
| Especificação (Fase 1) | ✅ concluída | ver o PR da Fase 1 | — | — | — | — |
| Fundação (Fase 2): lojas (endereço, dados, regras e ajustes, com os padrões), usuários e permissões, entrada, primeiro acesso, trocar a senha, sair, moldura (barra lateral, tema, saída por inatividade), histórico (gravação), autorizações com senha, conferência ao subir | ⏳ pendente | — | — | — | — | — |
| Fornecedores (módulo de referência, Fase 3; fica na aba Compras) | ⏳ pendente | — | — | — | — | — |
| Meu usuário | ⏳ pendente | — | — | — | — | — |
| Usuários (com o Histórico e "O que cada papel pode fazer") | ⏳ pendente | — | — | — | — | — |
| Produtos e estoque | ⏳ pendente | — | — | — | — | — |
| Clientes (cadastro, busca, conta, fiado e LGPD) | ⏳ pendente | — | — | — | — | — |
| Frente de caixa (venda, desconto e autorização, cancelamento, devolução, carrinho) | ⏳ pendente | — | — | — | — | — |
| Caixa do dia (com a trava nas outras operações e o fechamento automático) | ⏳ pendente | — | — | — | — | — |
| Compras e contas a pagar | ⏳ pendente | — | — | — | — | — |
| Fidelidade (cashback, cupom de retorno, aba Retorno, mensagens e regras do programa) | ⏳ pendente | — | — | — | — | — |
| Vale-troca | ⏳ pendente | — | — | — | — | — |
| Financeiro | ⏳ pendente | — | — | — | — | — |
| Visão geral (cartões do dia e pendências) | ⏳ pendente | — | — | — | — | — |
| Relatórios (com o Excel) | ⏳ pendente | — | — | — | — | — |
| Dados e backup (dados e regras da loja, planilhas, cópia de segurança, vendas antigas) | ⏳ pendente | — | — | — | — | — |
| Ferramentas do Adm. Sup (atualizações e avisos, ajustes da loja, visões sob medida, manutenção, registro de erros) | ⏳ pendente | — | — | — | — | — |
| Suporte (em branco, como no sistema antigo: `legacy/web/src/painel/TelaPainel.tsx:5-6`) | ⏳ pendente | — | — | — | — | — |
| Testes E2E (Fase 5) | ⏳ pendente | — | — | — | — | — |
| Deploy e arquivamento (Fase 6, só com autorização) | ⏳ pendente | — | — | — | — | — |

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
- [ ] **Spring Boot 3.3.13 ou uma linha com suporte** (P4 do `06`): a 3.3 já saiu do suporte gratuito. Quanto antes a
  decisão, menos retrabalho.
- [ ] **Pendências da Visão geral** (`docs/PENDENCIAS.md`, "Status: A DEFINIR"): a reconstrução repete o que estiver
  ligado (hoje 1, 2, 3, 16, 17, 18 e 19).

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
- 26/11: **Spring Boot 3.3.13**, a última versão da linha 3.3.x pedida na decisão 2.8. O risco está no
  `06-RISCOS-E-DECISOES.md` (R6 e P4).
- 26/11: **compilação com `-Xlint:all -Werror`**: qualquer aviso de compilação para o build (regra 1.6).
- 26/11: **seguir todas as fases** sem esperar aprovação entre elas, menos a Fase 6 (mensagem do Luan, decisão D3).
- 27/11: **as decisões técnicas da reconstrução** (T1 a T17 do `06-RISCOS-E-DECISOES.md`): codificador scrypt próprio no
  formato antigo; policy do prompt mestre com `set_config(..., true)`; o Adm. Sup com o mesmo desenho do antigo; a
  sessão e o cookie do antigo; CSRF com token e conferência de origem; a mesma CSP; autorizações e histórico completos no
  banco; relatórios, Excel e importação no servidor; cópia de segurança conferida com chave do servidor; carrinho no
  navegador; os mesmos arredondamentos e textos; sorteios com `SecureRandom`; travas por loja; ids UUID versão 7.
- 27/11: **Fornecedores é o módulo de referência** da Fase 3, e a ordem dos demais é a da tabela de módulos.
