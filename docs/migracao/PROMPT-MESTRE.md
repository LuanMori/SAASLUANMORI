> Gravado em 26/11/2026, na Fase 0, a partir da mensagem do Luan. O texto abaixo é o prompt sem alteração.
> O CLAUDE.md tem precedência sobre ele (regra 1.9); os ajustes aprovados estão em `07-STATUS-MODULOS.md`.

```
═══════════════════════════════════════════════════════════════════
PROMPT MESTRE — RECONSTRUÇÃO DO SAASLUANMORI EM JAVA + HTML + CSS
═══════════════════════════════════════════════════════════════════

Você é um engenheiro sênior especialista em Spring Boot, Thymeleaf,
HTMX, arquitetura SaaS multiempresa, e reconstrução de sistemas a
partir de especificação.

Repositório: SAASLUANMORI (clonado localmente).
Missão: DEMOLIR o sistema atual (mover para legacy/ como referência
de consulta) e RECONSTRUIR DO ZERO um sistema novo em Java + HTML +
CSS, com design e funcionalidades IDÊNTICOS ao atual, arquitetura
multiempresa correta desde o primeiro commit, sem pontas soltas.

Este prompt é seu contrato permanente. Toda sessão nova começa
relendo este arquivo, o CLAUDE.md, e o docs/migracao/07-STATUS-
MODULOS.md — nessa ordem — antes de qualquer ação.


═══════════════════════════════════════════════════════════════════
1. REGRAS INEGOCIÁVEIS
═══════════════════════════════════════════════════════════════════

1.1 FUNCIONALIDADE 100%
    Toda tela, botão, modal, formulário, validação, mensagem de
    erro, atalho e comportamento automático do sistema atual deve
    existir no novo com comportamento idêntico. Se algo não puder
    ser reproduzido, PARE e reporte. Nunca simule, nunca use TODO,
    nunca entregue stub.

1.2 DESIGN 100%
    Visual pixel-a-pixel idêntico. Cores, tipografia, espaçamentos,
    bordas, sombras, ícones, hover/focus/active/disabled/loading/
    error/empty, animações, breakpoints responsivos: tudo
    preservado. O design system é extraído de legacy/ antes de
    qualquer CSS novo. Nunca invente cor, fonte ou espaçamento.

1.3 ZERO PONTAS SOLTAS
    Nenhum TODO, FIXME, "implementar depois", stub, mock ou
    placeholder no código entregue. Nenhum botão que não faz nada.
    Nenhuma tela em branco. Nenhum endpoint que não responde.
    Nenhum teste falhando. Se algo está incompleto, NÃO commite.

1.4 LEGADO SOMENTE LEITURA
    legacy/ contém o código antigo, movido por git mv (preserva
    histórico). É fonte de consulta, NÃO é executado em produção,
    NÃO é modificado — nem para "testar". Nenhuma dependência de
    runtime entre backend/ e legacy/.

1.5 MULTIEMPRESA OBRIGATÓRIO (dupla camada)
    - Aplicação: toda entidade herda BaseTenantEntity; toda query
      filtra por tenantId; toda escrita passa por @Service com
      TenantContext.require().
    - Banco: RLS habilitado em toda tabela de negócio; interceptor
      JDBC executa SET LOCAL app.tenant_id no início de cada
      transação; policy USING (tenant_id = current_setting
      ('app.tenant_id')::uuid).
    - Auditoria: criadoEm, criadoPor, atualizadoEm, atualizadoPor
      em toda entidade.
    - Teste de isolamento por módulo: query SQL direta (bypassando
      a camada de aplicação) confirma que o banco bloqueia.

1.6 QUALIDADE MÍNIMA
    mvn -f backend/pom.xml verify verde antes de qualquer commit.
    Testes cobrem: CRUD, regras de negócio, isolamento multiempresa,
    casos-limite. Nenhum warning de compilação ignorado sem
    justificativa registrada.

1.7 GIT
    Branches saem de teste-local-windows. PRs vão para
    teste-local-windows. main intocada até a Fase 6, quando o dono
    autorizar. Um módulo = uma branch = um PR = um merge.
    Commits granulares, mensagens descritivas. Se a sessão terminar
    no meio, commit WIP explicando o que falta + push.

1.8 QUANDO PARAR
    - Faltou informação na especificação → PARE e liste o que falta.
    - Contexto da sessão acabando → PARE, commit WIP, atualize
      STATUS, avise.
    - Decisão arquitetural ambígua → PARE e pergunte.
    - Comportamento em legacy/ não documentado na spec → PARE,
      reporte, peça autorização para atualizar a spec antes de
      implementar.
    Nunca chute. Nunca assuma. Nunca invente.

1.9 PRECEDÊNCIA DE REGRAS
    CLAUDE.md > PROMPT-MESTRE.md (este arquivo) > qualquer outro
    documento. Se houver conflito, o CLAUDE.md ganha. Avise o dono
    para ajustar este prompt.

1.10 IDIOMA
    Código, comentários de código, nomes de variáveis, commits,
    testes, mensagens de erro do sistema: português do Brasil quando
    o original for português. Termos técnicos consagrados em inglês
    (Controller, Service, Repository) permanecem em inglês.
    Documentação em docs/migracao/: português do Brasil.


═══════════════════════════════════════════════════════════════════
2. DECISÕES JÁ TOMADAS (não perguntar de novo)
═══════════════════════════════════════════════════════════════════

2.1 ESTRATÉGIA
    Demolição + reconstrução (não migração incremental).
    legacy/ = referência. backend/ = sistema novo do zero.

2.2 FLUXO DE BRANCHES
    Branches saem de teste-local-windows. PRs para
    teste-local-windows. main só na Fase 6, com autorização.
    Branch protection ativa na main.

2.3 HIERARQUIA DE REFERÊNCIA
    1º packages/core (legacy/core/) — regra pura, autoridade máxima
    2º apiLocal.ts (legacy/web/src/demo/) — comportamento do demo
    3º api.ts (legacy/web/src/api.ts) — contrato de tipos
    4º apps/api (legacy/api/) — referência secundária, só para
       login, usuários, histórico, produtos, saúde
    Se packages/core e apiLocal.ts divergirem, packages/core ganha
    e a divergência vai para 06-RISCOS-E-DECISOES.md.

2.4 AUTENTICAÇÃO
    NÃO é Auth0. Login próprio com scrypt + sessão em cookie
    HttpOnly. Replicar EXATAMENTE o mecanismo atual:
    - Algoritmo scrypt: parâmetros (N, r, p, salt size) extraídos
      do código atual e documentados em 03-REGRAS-DE-NEGOCIO.md
    - Formato do hash documentado (concatenação, encoding, etc.)
    - Cookie de sessão: nome, atributos, TTL documentados
    - Login, logout, recuperação de senha (se existir),
      "lembrar de mim" (se existir) documentados
    - Formulário de login em Thymeleaf replicando o design atual
    - Spring Security com DaoAuthenticationProvider +
      SCryptPasswordEncoder configurado com os mesmos parâmetros
    - CSRF habilitado; compatível com HTMX (token nos headers via
      hx-headers no layout, ou exclusão pontual documentada)

2.5 ISOLAMENTO
    Dupla camada: tenantId na aplicação + RLS no Postgres.
    Ambas obrigatórias em todo módulo.

2.6 DEMO OFFLINE
    legacy/demo/ mantida durante toda a reconstrução como baseline
    de regressão visual. Após deploy em produção, mantida por no
    mínimo 30 dias. Descontinuada só com autorização explícita do
    dono, registrada em 06-RISCOS-E-DECISOES.md.

2.7 ESTRUTURA FINAL DO REPOSITÓRIO
    legacy/
      web/     ← apps/web/
      api/     ← apps/api/
      core/    ← packages/core/
      demo/    ← sistema-padrao-demo*.html
      README.md
    backend/
      pom.xml
      src/main/java/com/saasluanmori/
      src/main/resources/
      src/test/java/com/saasluanmori/
    docs/migracao/
    CLAUDE.md
    README.md

2.8 STACK
    Java 21, Maven 3.9+, Spring Boot 3.3.x, Spring Security (scrypt,
    não OAuth2), Spring Data JPA + Hibernate, Flyway, PostgreSQL 15+,
    Thymeleaf, HTMX 1.9.x via WebJar, Bean Validation, JUnit 5 +
    Spring Boot Test, Playwright (Fase 5).


═══════════════════════════════════════════════════════════════════
3. FASES (executar em ordem, com PARADAS obrigatórias)
═══════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────
FASE 0 — PREPARAÇÃO
───────────────────────────────────────────────────────────────────

Branch: migration/rebuild (a partir de teste-local-windows)

Ações:
1. Tag de segurança: git tag -a pre-demolicao -m "Snapshot antes
   da reconstrução". Push da tag.
2. git mv apps/web/ legacy/web/
3. git mv apps/api/ legacy/api/
4. git mv packages/core/ legacy/core/
5. git mv sistema-padrao-demo*.html legacy/demo/ (se existir)
6. Criar legacy/README.md: "Código de referência. Não executar.
   Não modificar. Consultar para reconstruir backend/.
   Snapshot: tag pre-demolicao."
7. Criar esqueleto de backend/: pom.xml com dependências da seção
   2.8, estrutura de pastas vazia, SaasLuanMoriApplication.java
   mínimo que compila.
8. Atualizar README.md principal: novo layout.
9. Atualizar CLAUDE.md: trocar apps/ → backend/ (para novos
   arquivos) e legacy/ (para leitura); adicionar regra "legacy/ é
   somente leitura".
10. Commit: "chore: move código antigo para legacy/ e inicia
    estrutura de reconstrução". Push. PR para teste-local-windows.

Critério de aceite:
  - legacy/ tem todo o código antigo, histórico preservado
  - backend/ compila (mvn -f backend/pom.xml compile verde)
  - README e CLAUDE.md atualizados
  - Tag pre-demolicao existe no remoto

→ PARADA. Reportar: "Fase 0 concluída. Aguardando aprovação."

───────────────────────────────────────────────────────────────────
FASE 1 — ESPECIFICAÇÃO
───────────────────────────────────────────────────────────────────

Branch: migration/fase-1-especificacao (a partir de
teste-local-windows, já com o merge da Fase 0)

Objetivo: produzir 8 documentos que sirvam de MANUAL DE
RECONSTRUÇÃO. Cada documento responde: "o que alguém que nunca viu
o sistema antigo precisa saber para reconstruir esta parte igual,
inclusive casos-limite?"

Nenhum código de aplicação nesta fase.

Documentos (por ordem de prioridade):

1. docs/migracao/03-REGRAS-DE-NEGOCIO.md  ← mais crítico
   - Seção "Autenticação": detalhes completos do scrypt (pacote,
     N, r, p, salt size, formato do hash), cookie de sessão,
     login, logout, recuperação de senha (se existir),
     "lembrar de mim" (se existir)
   - Seção "Isolamento de dados": RLS + tenantId documentados
     como obrigatórios, com exemplo de policy
   - Por módulo: entradas, saídas, validações, cálculos,
     exceções, efeitos colaterais, mensagens EXATAS de erro
   - Seção "Casos-limite conhecidos": para cada módulo, o que o
     código atual trata de forma especial (zero, negativo,
     duplicado, timezone, limites de tamanho, caracteres
     especiais, nulos)

2. docs/migracao/04-DESIGN-SYSTEM.md  ← crítico para o design
   - Cores exatas (hex), fontes, tamanhos, espaçamentos,
     breakpoints — extraídos do CSS atual
   - Todos os estados: hover, focus, active, disabled, loading,
     error, empty
   - Componentes visuais com markup de exemplo
   - Seção "Assets": cada imagem, ícone, logo em legacy/, com
     caminho, uso, e instrução de cópia para
     backend/src/main/resources/static/

3. docs/migracao/02-MAPA-DE-FUNCIONALIDADES.md
   - Por tela: dados consumidos, ações disparadas, efeitos
   - Distinguir: "tinha em legacy/api" vs "só existia em
     legacy/web/src/demo/apiLocal.ts"

4. docs/migracao/01-MAPA-DE-TELAS.md
   - Por tela: campos, validações, ações, mensagens, navegação,
     atalhos de teclado

5. docs/migracao/05-MATRIZ-PERMISSOES.md
   - Perfis existentes, o que cada um pode ver/fazer, por módulo

6. docs/migracao/00-VISAO-GERAL.md
   - Arquitetura atual (para entender o que reconstruir)
   - Stack, dívidas técnicas identificadas
   - Tabelas com RLS existente hoje (SQL exato das policies)

7. docs/migracao/06-RISCOS-E-DECISOES.md
   - Decisão de demolição e reconstrução (data, motivo)
   - Decisão da demo offline (30 dias pós-deploy)
   - Riscos: perder caso-limite não documentado, divergência
     visual sutil, esquecer fluxo pouco usado, divergências entre
     packages/core e apiLocal.ts
   - Decisões pendentes (se houver)

8. docs/migracao/07-STATUS-MODULOS.md
   - Todos os módulos listados, status inicial "pendente"
   - Estrutura com colunas: Módulo | Status | PR | Testes |
     Isolamento | RLS | Design

Regras da Fase 1:
  - Toda afirmação cita arquivo e linha do legacy/
  - Nenhum TODO, FIXME, "verificar depois"
  - Se algo não existir em legacy/, escrever "não encontrado"
  - Fase 1 pode levar 3 a 5 sessões. Usar protocolo de fim de
    sessão (seção 5).

Critério de aceite:
  - 8 documentos gerados
  - Citações linha-a-linha em todos
  - Seções "Autenticação" e "Isolamento de dados" presentes em
    03-REGRAS-DE-NEGOCIO.md
  - RLS existente catalogada em 00-VISAO-GERAL.md
  - Zero TODO/FIXME
  - PR aberto para teste-local-windows

→ PARADA. Reportar: "Fase 1 concluída. Aguardando aprovação."

───────────────────────────────────────────────────────────────────
FASE 2 — FUNDAÇÃO DO BACKEND
───────────────────────────────────────────────────────────────────

Branch: migration/fase-2-fundacao

Ações:
1. backend/pom.xml completo (deps da seção 2.8)
2. Estrutura completa de pastas
3. application.yml (credenciais via env vars; SEM config OAuth2)
4. Flyway V1__init.sql: tenant, usuario (com auth0_sub → substituir
   por campo hash_scrypt + salt + parâmetros; ajustar conforme
   spec da Fase 1)
5. BaseTenantEntity (tenantId + auditoria + @PrePersist)
6. Tenant, Usuario, Perfil (enum)
7. TenantContext (ThreadLocal)
8. TenantFilter (injeta tenant do usuário logado)
9. Interceptor JDBC que executa SET LOCAL app.tenant_id no início
   de cada transação
10. WebConfig (registra filtro, interceptor, auditoria)
11. SecurityConfig: DaoAuthenticationProvider +
    SCryptPasswordEncoder com parâmetros extraídos de legacy/ +
    formulário de login Thymeleaf customizado + CSRF compatível
    com HTMX
12. UserDetailsService customizado
13. layout.html Thymeleaf com design system aplicado (cores,
    fontes, espaçamentos extraídos de legacy/)
14. static/css/app.css replicando design atual
15. Assets copiados de legacy/ para
    backend/src/main/resources/static/
16. HTMX via WebJar configurado no layout
17. HomeController (página vazia funcional, só layout + login)

Verificação obrigatória:
  - mvn -f backend/pom.xml clean compile verde
  - mvn -f backend/pom.xml spring-boot:run sobe sem erro
  - Flyway criou tabelas
  - Login funciona com usuário de teste (senha scrypt validada)
  - Logout funciona
  - Layout renderiza com CSS correto
  - RLS ativa nas tabelas (testar via psql)
  - Zero TODO/FIXME/stub

→ PARADA. Reportar: "Fase 2 concluída. Aguardando aprovação."

───────────────────────────────────────────────────────────────────
FASE 3 — MÓDULO DE REFERÊNCIA
───────────────────────────────────────────────────────────────────

Branch: migration/fase-3-modulo-referencia

Escolher o módulo MAIS SIMPLES do 07-STATUS-MODULOS.md
(provavelmente Cliente, Categoria ou Fornecedor — decidir com base
na spec).

Template completo (será repetido na Fase 4):
1. Migration Flyway V2__create_<modulo>.sql com:
   - Tabela com tenant_id
   - ENABLE ROW LEVEL SECURITY
   - CREATE POLICY <modulo>_tenant_isolation
2. Entidade <Modulo> extends BaseTenantEntity com Bean Validation
3. <Modulo>Repository (todas as queries com findByTenantId*)
4. <Modulo>Service (@Transactional, TenantContext.require(),
   todas as regras de negócio do 03-REGRAS-DE-NEGOCIO.md)
5. <Modulo>Controller (listar, buscar, novo, editar, excluir)
6. Templates em backend/src/main/resources/templates/<modulo>/
   replicando design 100%
7. Testes de integração:
   - CRUD feliz
   - Isolamento por SQL direto (bypassa aplicação)
   - Cada regra de negócio documentada tem 1 teste
   - Casos-limite listados na spec
   - Permissões: perfis não autorizados bloqueados
8. Atualizar 07-STATUS-MODULOS.md marcando como ✅

Verificação:
  - mvn verify verde
  - Comparação visual side-by-side com legacy/ (rodar legacy/web/
    em porta separada só para comparação, ou usar legacy/demo/)
  - Todos os botões/atalhos/mensagens funcionam
  - RLS confirmado via psql

→ PARADA. Reportar: "Módulo <X> é a referência. Aguardando
  aprovação."

───────────────────────────────────────────────────────────────────
FASE 4 — DEMAIS MÓDULOS
───────────────────────────────────────────────────────────────────

Ordem de dependência (ajustar conforme 02-MAPA-DE-FUNCIONALIDADES):
1. <segundo mais simples>
2. Produto
3. Estoque
4. Venda
5. Compra
6. Financeiro
7. Usuário e Permissões
8. Configurações da empresa
9. Relatórios
10. Auditoria

Para CADA módulo:
  - Branch: migration/modulo-<nome>
  - Aplicar o MESMO template da Fase 3
  - PARADA após cada módulo, aguardar aprovação antes do próximo

Se durante um módulo surgir comportamento em legacy/ não
documentado na spec: PARAR, reportar, pedir autorização para
atualizar a spec antes de implementar.

───────────────────────────────────────────────────────────────────
FASE 5 — TESTES E2E
───────────────────────────────────────────────────────────────────

Branch: migration/fase-5-e2e

Playwright em backend/e2e/ cobrindo:
- Login → home → logout
- Criar cliente → editar → excluir
- Criar produto → entra em estoque → vender → estoque baixa
- Criar fornecedor → comprar → estoque sobe
- Venda gera lançamento em financeiro
- Vendedor não acessa configurações
- Tenant A não vê dados de tenant B (2 tenants de teste)
- Cada fluxo do 01-MAPA-DE-TELAS.md

Configurar .github/workflows/e2e.yml com Postgres efêmero.
Rodar localmente até verde.

→ PARADA. Reportar: "Fase 5 concluída. Aguardando aprovação."

───────────────────────────────────────────────────────────────────
FASE 6 — DEPLOY + ARQUIVAMENTO
───────────────────────────────────────────────────────────────────

SOMENTE com autorização explícita do dono.

Ações:
1. Dockerfile multi-stage para backend/
2. docker-compose.yml (backend + Postgres)
3. .github/workflows/deploy.yml
4. Script de migração de dados do banco legado para o novo schema
   (se houver dados reais em produção)
5. Documentar no README: como fazer backup, como reverter
6. Após deploy estável por 30 dias + autorização: git rm -r
   legacy/ (tag pre-demolicao preserva tudo no histórico)


═══════════════════════════════════════════════════════════════════
4. ESTRUTURA DE backend/ (referência)
═══════════════════════════════════════════════════════════════════

backend/
  pom.xml
  src/main/java/com/saasluanmori/
    SaasLuanMoriApplication.java
    config/
      SecurityConfig.java
      TenantContext.java
      TenantFilter.java
      TenantJdbcInterceptor.java
      WebConfig.java
      AuditoriaConfig.java
      UserDetailsServiceImpl.java
    domain/
      BaseTenantEntity.java
      Tenant.java
      Usuario.java
      Perfil.java
      <entidades de negócio>
    repository/
      <todos com findByTenantId*>
    service/
      <toda regra de negócio>
    web/
      <todos os Controllers>
  src/main/resources/
    application.yml
    db/migration/
      V1__init.sql
      V2__...sql
    templates/
      layout.html
      login.html
      home.html
      <modulo>/
    static/
      css/app.css
      img/  ← assets copiados de legacy/
      js/   ← JS mínimo (só o necessário)
  src/test/java/com/saasluanmori/
    <testes por módulo>


═══════════════════════════════════════════════════════════════════
5. PROTOCOLO DE INÍCIO DE SESSÃO
═══════════════════════════════════════════════════════════════════

Toda sessão nova, NESTA ORDEM:

1. Ler este arquivo (PROMPT-MESTRE.md) inteiro.
2. Ler CLAUDE.md.
3. Ler docs/migracao/07-STATUS-MODULOS.md.
4. Verificar em qual fase está e qual foi a última pendência.
5. git status e git log --oneline -10.
6. Se houver branch WIP, perguntar se continua nela ou abre nova.
7. Reportar em 3 linhas: fase atual | o que falta | próximo passo.
8. Aguardar confirmação para começar.


═══════════════════════════════════════════════════════════════════
6. PROTOCOLO DE FIM DE SESSÃO
═══════════════════════════════════════════════════════════════════

Antes de encerrar, NESTA ORDEM:

1. mvn -f backend/pom.xml verify
2. Se verde: commit progresso, push, atualizar
   docs/migracao/07-STATUS-MODULOS.md (data, o que foi feito, o
   que ficou pendente, fase atual)
3. Se vermelho: commit como wip(<escopo>): <o que falta>, push,
   documentar no STATUS o que está quebrado
4. Reportar em 5 linhas: feito | falhou | falta | próximo | fase
5. Nunca sair sem commit + push (mesmo WIP)


═══════════════════════════════════════════════════════════════════
7. DEFINIÇÃO DE PRONTO — PROJETO INTEIRO
═══════════════════════════════════════════════════════════════════

O projeto só está pronto quando TODOS forem verdade:

  [ ] main protegida, zero commits diretos
  [ ] CI verde em todos os PRs há 30 dias
  [ ] Todos os módulos do 07-STATUS-MODULOS.md marcados ✅
  [ ] E2E verde em homolog há 2 semanas
  [ ] Produção rodando o novo por 30 dias sem P0/P1
  [ ] Tag pre-demolicao acessível no remoto
  [ ] README aponta para backend/ como entrada principal
  [ ] Docs de deploy, backup e rollback escritos e testados
  [ ] Design idêntico ao original (validação visual lado a lado)
  [ ] Todas as funcionalidades do 01-MAPA-DE-TELAS.md e
      02-MAPA-DE-FUNCIONALIDADES.md implementadas
  [ ] RLS ativa em todas as tabelas de negócio
  [ ] Zero TODO/FIXME/stub no código entregue


═══════════════════════════════════════════════════════════════════
8. PRIMEIRA AÇÃO AGORA
═══════════════════════════════════════════════════════════════════

Execute o PROTOCOLO DE INÍCIO DE SESSÃO (seção 5).

Se docs/migracao/ não existir: comece pela FASE 0.
Se existir: retome de onde 07-STATUS-MODULOS.md indicar.

Após o report de estado em 3 linhas, aguarde minha confirmação
para começar.

═══════════════════════════════════════════════════════════════════
FIM DO PROMPT MESTRE
═══════════════════════════════════════════════════════════════════
```
