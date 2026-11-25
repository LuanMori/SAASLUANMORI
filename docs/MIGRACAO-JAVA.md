# Migração Java — preservação funcional e visual

A API Java é candidata à substituição da API atual. O cadastro de produtos da interface principal usa o modelo HTML compartilhado. A meta de 80% Java + HTML + CSS é aproximada, subordinada à paridade.

## Primeiro passo
A conversão de texto monetário para centavos foi portada para Java em paralelo, sem integração com o runtime atual. A formatação monetária e demais regras ainda não foram migradas. Para executar os 34 casos com JDK 21:

```sh
javac -encoding UTF-8 -d /tmp/saas-java-test apps/java/src/main/java/saas/core/Dinheiro.java apps/java/src/test/java/saas/core/DinheiroTeste.java
java -cp /tmp/saas-java-test saas.core.DinheiroTeste
```

## Critérios de aceite antes de substituir a aplicação
- Inventariar contratos HTTP, respostas, validações, erros, mensagens, permissões e operações existentes.
- Reproduzir a API em Java mantendo PostgreSQL, Auth0, RLS, transações por loja e a role restrita.
- Reproduzir telas em HTML/CSS/JS sem redesign: DOM observável, textos, estados, teclado, foco, responsividade, acessibilidade e comparação visual com a versão atual.
- Executar a suíte original, testes comparativos de API e dados, isolamento de lojas, concorrência, segurança e testes de navegador.
- Não introduzir funcionalidades novas durante a migração; requisitos ainda não implementados ficam separados.
- Não remover TypeScript nem substituir main antes de comprovar equivalência e aprovar a troca.

## Candidata atual (não é produção)
- API Java 21 + Spring Boot em `apps/java`. Rotas GET e POST /produtos, Auth0/JWT, JdbcTemplate com RLS por transação, trava por loja. Nenhuma migration SQL existente foi modificada. Os scripts operacionais ainda são os originais.
- As duas entradas da interface usam `apps/web/src/telas/produtos.html`, o mesmo controlador de formulário, a mesma API e o mesmo CSS. A aplicação principal conserva a autenticação em React. O SDK Auth0 SPA é a dependência transitiva já fixada pelo lockfile; será explicitado na remoção do React.
- A API Java usa JDBC_DATABASE_URL (formato jdbc:postgresql://host:porta/banco), SAAS_APP_DB_PASSWORD, AUTH0_DOMAIN, AUTH0_AUDIENCE, WEB_ORIGINS e PORT. Usa exclusivamente saas_app. Execute somente em banco de teste com as migrations existentes aplicadas.
- Testes: `mvn -f apps/java/pom.xml test`; após `npm ci` e `npm run build:core`, use `npm test -w @saas/web` e `node --test apps/web/html/paridade.test.js`. Build da interface alternativa: `npm exec -w @saas/web -- vite build --config html/vite.config.js`. Para desenvolvimento: `npm exec -w @saas/web -- vite --config html/vite.config.js`. A configuração VITE_* é a mesma do app original.
- O CSS original não foi duplicado para aumentar a estatística. A branch principal não será substituída até os testes de integração e visuais passarem.
- O CI verifica isolamento e cadastro simultâneo em PostgreSQL e compara o cadastro com a base do PR em duas larguras de tela, nos estados de listagem, erro e confirmação.
- Pendências: testar JWT real e JWKS, conferir cabeçalhos HTTP e limite JSON de 100 KB, ampliar a integração de PostgreSQL para os demais contratos da API, migrar scripts de administração/migration, executar suíte antiga contra a nova API. Só então remover runtime antigo e apurar linguagens.
