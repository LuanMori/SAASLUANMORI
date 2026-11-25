# Migração Java — preservação funcional e visual

Esta branch é experimental. Nenhuma dependência ou arquivo da aplicação atual foi substituído. A meta de 80% Java + HTML + CSS é aproximada, subordinada à paridade.

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
