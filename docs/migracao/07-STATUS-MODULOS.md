# Status da Migração

## Fase atual

**Fase 4 — demais módulos, em andamento** (desde 28/11/2026), na ordem da tabela abaixo, cada um com o template da
Fase 3 (o módulo de referência, Fornecedores, PR #9). Pronto: **Meu usuário** (PR #10). Próximo: **Usuários**.

## Última sessão

Data: 2026-11-27

O que foi feito:
- Fase 1 juntada ao `teste-local-windows` (PR #6, merge `d241f24`).
- Fase 2, a fundação do `backend/`, com 51 testes contra um PostgreSQL de verdade (o CI ganhou um PostgreSQL 16 de
  serviço):
  - banco: `V1__fundacao.sql` com lojas, usuários, sessões e histórico, RLS ligado e forçado com a policy da regra 1.5,
    as funções do Adm. Sup, a trava de usuários e os privilégios mínimos da `saas_app`; a loja e a pessoa vão para o banco
    no início de cada transação; o servidor se recusa a subir se a conexão escapar do RLS;
  - segurança: senha scrypt no formato antigo (confere hashes gerados pelo `crypto.scrypt` do Node), login próprio com
    todos os passos do servidor antigo pelo `DaoAuthenticationProvider`, sessão no banco pelo cookie `__Host-sessao`
    (sem `JSESSIONID`), CSRF ligado à sessão, conferência de origem, a CSP e os cabeçalhos do nginx antigo, "Crie a sua
    senha", sair e a saída por inatividade;
  - telas: `app.css` igual ao `estilos.css`, a entrada com a ilustração gerada em Java, "Crie a sua senha", a moldura com
    a barra lateral por papel, o tema claro/escuro, o aviso nas partes ainda não reconstruídas e o Suporte em branco;
  - comandos de administração `db:seed`, `db:usuario`, `db:suporte` e `db:app-role`;
  - conferido no navegador (Chromium) com o servidor rodando (`mvn spring-boot:run` e `java -jar`), e o RLS conferido
    pelo `psql` no banco de desenvolvimento;
  - decisões T18 a T23 e a pendência P8 registradas no `06-RISCOS-E-DECISOES.md`.
- Fase 2 juntada ao `teste-local-windows` (PR #7, merge `55e3e48`).
- P8 decidida pelo Luan (D5): a demonstração pode ser aberta no navegador só para olhar e tirar fotos de tela. Com isso,
  a comparação lado a lado no Chromium, nos temas claro e escuro: medidas, cores e fontes de cada elemento pelo
  navegador e as fotos de tela pixel a pixel. A janela é a mesma nos dois: 1440 × 943 na demonstração, que tem a faixa
  amarela de 43 px no alto; no sistema novo, o tamanho da tela da demonstração sem a faixa (1440 × 900).
  - Entrada e "Crie a sua senha": iguais. Sobram diferenças de até 1 px na posição e de 0,03 px na fonte, porque a
    demonstração desconta 44 px da altura por causa da faixa (`legacy/web/src/demo/demo.css`), e o sistema, o antigo e o
    novo, usa a altura toda (`legacy/web/src/estilos.css:286`).
  - Ilustração da loja: o SVG gerado em Java é igual byte a byte ao da demonstração (teste `IlustracaoLojaTest`).
  - Moldura (barra lateral, tema, nome e papel, Sair): igual. A loja da demonstração tem a descrição "Rações, petiscos e
    acessórios" embaixo do nome (`legacy/web/src/painel/BarraLateral.tsx:66`); no sistema novo a descrição e o logo da
    loja chegam com os dados da loja (módulo Dados e backup) e, até lá, a barra mostra as iniciais e o nome, como o
    antigo mostra numa loja sem logo e sem descrição.
- Comparação juntada ao `teste-local-windows` (PR #8, merge `c4835b6`).
- Fase 3, o módulo de referência **Fornecedores** (fica na aba Compras), com 36 testes novos (89 no total):
  - banco: `V2__create_fornecedores.sql` com `tenant_id`, RLS ligado e forçado, a policy
    `fornecedores_tenant_isolation` (o nome do template; as da fundação ganharam o mesmo formato), o documento único por
    loja, o formato do documento e do telefone conferidos, e a `saas_app` sem `DELETE` e sem poder mudar a loja, o id ou a
    criação;
  - regras: as do `fornecedor.ts`, na mesma ordem e com as mesmas mensagens (nome, CNPJ ou CPF com os dígitos
    verificadores, telefone com DDD, contato, observação, "Campo não permitido.", documento repetido com o nome de quem já
    o tem); a permissão `compras`; alterar só grava se algo mudou; desativar e reativar; o histórico (`fornecedor.*`, com
    os campos alterados) na mesma transação; a trava da loja para dois cadastros ao mesmo tempo;
  - tela: a aba Compras com o cartão Fornecedores, a janela de cadastrar e alterar (foco, Tab, Esc, clique fora), os
    avisos de cada campo, "Salvando…", as mensagens de sucesso, desativar e reativar; os cartões do módulo Compras mostram
    o aviso das partes ainda não reconstruídas (T24);
  - comparação lado a lado com a demonstração (mesmos fornecedores cadastrados nos dois, pelas telas): o cartão vazio, com
    a lista e no tema escuro, e a janela vazia, com avisos e no alterar ficaram **iguais pixel a pixel**; só falta o botão
    "+ Registrar compra", que chega com o módulo Compras;
  - RLS conferido pelo `psql` no banco de desenvolvimento (sem loja: erro; outra loja: nenhum fornecedor; apagar ou mudar
    a loja: recusado);
  - a ordem alfabética passou para o ICU4J (T13): o `Collator` do Java não dava a ordem do navegador;
  - decisões T24 e T25 e as revisões de T2, T13 e T22 no `06-RISCOS-E-DECISOES.md`.
- Fase 3 juntada ao `teste-local-windows` (PR #9, merge `c47b07e`).
- Fase 4, módulo **Meu usuário** (28/11/2026), com 16 testes novos (105 no total):
  - banco: `V3__meu_usuario.sql` com a coluna `usuarios.foto` (PNG, JPEG ou WebP em data URL, até 150.000 caracteres,
    conferidos no banco), as funções da foto do Adm. Sup e o índice das entradas e saídas da pessoa;
  - regras do `perfil.ts`: a foto, as entradas e saídas montadas do histórico (a de agora, a sem saída registrada, a
    saída por falta de uso), o tempo de cada uma e o texto da duração; a saída por falta de uso passa a gravar o motivo,
    como na demonstração;
  - tela: o perfil com a foto (cortada em quadrado e reduzida no navegador, com prévia, Cancelar, Salvar, Tirar), a foto
    também na barra lateral, as 30 entradas e saídas mais recentes e trocar a senha (o mesmo formulário de "Crie a sua
    senha", que encerra as sessões dos outros aparelhos);
  - comparação lado a lado com a demonstração: os três cartões iguais em todos os estados (sem foto, prévia, salva,
    tirada; os avisos da senha da tela e do servidor), e a foto reduzida sai com o mesmo texto, byte a byte; sobram
    diferenças de fração de pixel no desenho de algumas letras (T27);
  - decisões T26 e T27, a foto do Adm. Sup na T3 e a divergência da saída por falta de uso no `06`.

O que ficou pendente: ver Pendências abertas.

## Módulos

Lista definitiva, tirada das telas do sistema antigo (`01-MAPA-DE-TELAS.md`; barra lateral em
`legacy/web/src/painel/menu.tsx:191-198`), na ordem em que vão ser reconstruídos.

**Como a ordem foi escolhida.** A fundação traz o que todo módulo usa (loja, usuário, sessão, permissões, histórico). As
regras da loja e as autorizações com senha chegam com o primeiro módulo que as usa. Depois vem o módulo mais simples, como referência: **Fornecedores**, uma
tabela só, sem depender de outro módulo (`03-REGRAS-DE-NEGOCIO.md` §8). Os demais seguem quem alimenta quem: um
módulo só vem depois dos que ele lê. Cada módulo traz as próprias tabelas e telas; o efeito dele sobre um módulo que já
existe (por exemplo, a trava do Caixa do dia na venda) entra no pull request dele, com os testes dos dois lados. Nenhuma
tela mostra número inventado.

| Módulo | Status | PR | Testes | Isolamento | RLS | Design |
|---|---|---|---|---|---|---|
| Preparação (Fase 0) | ✅ concluída | #3 | — | — | — | — |
| Especificação (Fase 1) | ✅ concluída | #6 | — | — | — | — |
| Fundação (Fase 2): lojas, usuários e permissões, entrada, primeiro acesso, sair, moldura (barra lateral, tema, saída por inatividade), histórico (gravação), conferência ao subir, comandos de administração | ✅ concluída | #7 e o PR da comparação | 53 | ✅ | ✅ | ✅ conferido com o `04` e o `01` e lado a lado com a demonstração (D5), nos temas claro e escuro |
| Fornecedores (módulo de referência, Fase 3; fica na aba Compras) | ✅ concluído | #9 | 36 | ✅ | ✅ | ✅ igual à demonstração pixel a pixel (falta só o "+ Registrar compra", do módulo Compras) |
| Meu usuário | ✅ concluído | #10 | 16 | ✅ | ✅ | ✅ igual à demonstração em todos os estados (T27: frações de pixel no texto) |
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
| Dados e backup (dados e regras da loja, com o logo e a descrição na barra lateral; planilhas, cópia de segurança, vendas antigas) | ⏳ pendente | — | — | — | — | — |
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
- 27/11: **as decisões técnicas da reconstrução** (T1 a T23 do `06-RISCOS-E-DECISOES.md`; T18 a T23 vieram na Fase 2): codificador scrypt próprio no
  formato antigo; policy do prompt mestre com `set_config(..., true)`; o Adm. Sup com o mesmo desenho do antigo; a
  sessão e o cookie do antigo; CSRF com token e conferência de origem; a mesma CSP; autorizações e histórico completos no
  banco; relatórios, Excel e importação no servidor; cópia de segurança conferida com chave do servidor; carrinho no
  navegador; os mesmos arredondamentos e textos; sorteios com `SecureRandom`; travas por loja; ids UUID versão 7.
- 27/11: **Fornecedores é o módulo de referência** da Fase 3, e a ordem dos demais é a da tabela de módulos.
- 27/11: **a demonstração pode ser aberta no navegador** só para olhar e tirar fotos de tela ao lado do sistema novo, na
  comparação de cada módulo; nada nela é alterado, e o resto do `legacy/` continua sem ser executado (resposta do Luan à
  P8, decisão D5; registrado no CLAUDE.md).
- 27/11: **uma aba com partes de módulos diferentes** (T24): na aba Compras, os fornecedores funcionam e os cartões do
  módulo Compras mostram o aviso das partes ainda não reconstruídas no corpo, como o antigo fazia na aba Meu usuário.
- 27/11: **a ordem alfabética vem do ICU4J** (T13), a mesma do navegador; o `Collator` do Java ignorava espaços e
  pontuação. É a segunda biblioteca fora da lista da decisão 2.8, depois do Bouncy Castle.
- 27/11: **as policies de RLS se chamam `<tabela>_tenant_isolation`** (T2), o nome do template do prompt mestre.
