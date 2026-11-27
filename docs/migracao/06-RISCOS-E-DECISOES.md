# 06 — Riscos e decisões

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`). Aqui ficam as decisões já tomadas, com a data e o motivo, os
riscos da reconstrução e o que ainda depende do Luan. As decisões técnicas da seção 2 seguem o sistema antigo; onde ele
não basta ou se contradiz, a escolha e o motivo ficam escritos aqui. Qualquer uma pode ser revista pelo Luan antes de
chegar a vez dela.

## 1. Decisões do dono

| # | Data | Decisão | Motivo e fonte |
|---|---|---|---|
| D1 | 26/11/2026 | **Demolir e reconstruir**: o código antigo vai para `legacy/` (só consulta) e o sistema novo é feito do zero em `backend/` (Java 21, Spring Boot, Thymeleaf e HTMX), com design e funcionalidades idênticos | "DEMOLIR o sistema atual (mover para legacy/ como referência de consulta) e RECONSTRUIR DO ZERO um sistema novo em Java + HTML + CSS, com design e funcionalidades IDÊNTICOS ao atual, arquitetura multiempresa correta desde o primeiro commit, sem pontas soltas" (`PROMPT-MESTRE.md`, missão; decisão 2.1). O estado do sistema antigo está em `00-VISAO-GERAL.md` §3: a maior parte só funcionava na demonstração, no navegador |
| D2 | 26/11/2026 | **Demonstração offline mantida**: `legacy/demo/` fica durante toda a reconstrução como referência visual e, depois do deploy em produção, por no mínimo 30 dias. Só sai com autorização do Luan, registrada aqui | decisão 2.6 do prompt mestre; CLAUDE.md ("referência congelada para comparar o visual: não se regera") |
| D3 | 26/11/2026 | **Seguir as fases sem parar entre elas**, menos a Fase 6 (deploy), que continua só com autorização expressa. As paradas por falta de informação, ambiguidade ou comportamento não documentado continuam valendo | mensagem do Luan: "pode seguir todas as fases"; regras 1.8 e Fase 6 do prompt mestre |
| D4 | 26/11/2026 | **Ajustes do CLAUDE.md**: `mvn -f backend/pom.xml verify` antes de cada commit, branches `migration/*` com pull request para o `teste-local-windows`, demonstração congelada, aba Suporte em branco | `07-STATUS-MODULOS.md`, Decisões tomadas; o CLAUDE.md vale sobre o prompt mestre (regra 1.9) |
| D5 | 27/11/2026 | **A demonstração pode ser aberta no navegador para a comparação visual**: só para olhar e tirar fotos de tela ao lado do sistema novo; nada nela é alterado, e o resto do `legacy/` continua sem ser executado | resposta do Luan à pendência P8 ("Pode abrir a demo"); registrado no CLAUDE.md |

## 2. Decisões técnicas da reconstrução

### T1. Senha: codificador scrypt próprio, no formato antigo

- **Antigo**: scrypt com N = 2^15, r = 8, p = 1, sal de 16 bytes, hash de 32 bytes, senha em NFC, gravado como
  `scrypt$<logN>$<r>$<p>$<sal base64url>$<hash base64url>`; comparação em tempo constante; usuário sem senha ou
  inexistente gasta o mesmo tempo (`legacy/api/src/auth/senhas.ts:4-61`; detalhes em 03 §1.1).
- **Conflito no prompt mestre**: a decisão 2.4 pede "Replicar EXATAMENTE o mecanismo atual" e, na mesma lista,
  "SCryptPasswordEncoder configurado com os mesmos parâmetros". O `SCryptPasswordEncoder` do Spring grava no formato
  dele (começa com `$` e junta os parâmetros num número em hexadecimal) e não normaliza a senha em NFC: com ele, as
  senhas já gravadas pelo servidor antigo deixam de conferir.
- **Decisão**: um `PasswordEncoder` próprio (scrypt do Bouncy Castle, já no `pom.xml`), usado pelo
  `DaoAuthenticationProvider`, que lê e grava exatamente o formato antigo, com as mesmas regras de leitura (logN de 10
  a 20, r de 1 a 16, p de 1 a 4, sal de 16 bytes ou mais, hash de 32 ou mais) e o mesmo hash falso para usuário sem
  senha. Atende ao "replicar exatamente" e mantém valendo as senhas do servidor antigo (Fase 6).

### T2. Isolamento por loja: `tenant_id`, `SET LOCAL` e a policy do prompt mestre

- **Antigo**: `set_config('app.loja_id', <uuid>, true)` em cada transação e policies com `app_loja_atual()`, que usa
  `current_setting('app.loja_id', true)`: sem loja definida, a consulta devolve zero linhas (`00-VISAO-GERAL.md` §4).
- **Prompt mestre (1.5)**: `SET LOCAL app.tenant_id` no início de cada transação e a policy
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. Sem o segundo argumento, sem loja definida a consulta
  **dá erro** em vez de devolver zero linhas.
- **Decisão**: seguir o prompt mestre (regra 1.9: ele vale sobre os outros documentos). As duas formas falham fechadas;
  a nova ainda mostra o erro de programação em vez de esconder dados. Na prática:
  - o valor é definido com `SELECT set_config('app.tenant_id', ?, true)`, que é o mesmo que `SET LOCAL` mas aceita o
    valor como parâmetro (o comando `SET` não aceita parâmetro, e montar o texto do comando abriria espaço para injeção);
  - toda tabela de loja tem `tenant_id`, `ENABLE` e `FORCE ROW LEVEL SECURITY` e a policy com `USING` e `WITH CHECK`
    iguais;
  - a role da aplicação não é superusuário, não tem BYPASSRLS e não é dona das tabelas; os `GRANT`s são os mínimos do
    antigo (histórico só acrescenta; sem `DELETE` onde o antigo não apagava);
  - a conferência ao subir é refeita (`legacy/api/src/banco/conferencia.ts:1-63`): o servidor não sobe se a role (ou
    uma role de que ela faça parte) escapa do RLS ou é dona de tabela, se alguma tabela com `tenant_id` está sem RLS
    forçado ou sem policy, se não acha nenhuma tabela de loja, ou se o banco ou a conexão não estão em UTF-8;
  - **consequência**: nenhuma consulta a tabela de loja pode rodar fora de uma transação com a loja definida. Isso vale
    também para as funções do Adm. Sup (T3), que rodam dentro da loja em que ele entrou.
  - **nome das policies** (Fase 3): `<tabela>_tenant_isolation`, o do template do prompt mestre. As três da fundação,
    que tinham o nome das migrações antigas (`<tabela>_isolamento_loja`), foram renomeadas na `V2__create_fornecedores.sql`.

### T3. Adm. Sup sem loja: o mesmo desenho do antigo

- **Antigo**: o Adm. Sup é uma linha de `usuarios` com `loja_id` NULL e papel `super_admin` (o `CHECK` obriga as duas
  coisas juntas); a role da API não enxerga essa linha (RLS) e usa só três funções `SECURITY DEFINER` estreitas, com
  `search_path` fixo, executáveis só por ela; uma policy deixa só a role dona do schema ver essas linhas; ele é
  cadastrado por script, nunca pela tela (`00-VISAO-GERAL.md` §4; `legacy/api/package.json:20`;
  `legacy/api/scripts/cadastrar-suporte.ts`).
- **Problema**: a regra 1.5 pede que toda entidade herde `BaseTenantEntity` (com `tenantId`), e o Adm. Sup não tem loja.
- **Decisão**: repetir o desenho antigo. `Usuario` herda `BaseTenantEntity`; a coluna `tenant_id` aceita NULL só para o
  `super_admin` (mesmo `CHECK`); a aplicação nunca cria nem lê o Adm. Sup pelo JPA: lê pelas três funções (para o login,
  pelo id e para registrar tentativas e último acesso), com os mesmos nomes de colunas e as mesmas travas. O cadastro do
  Adm. Sup é um comando de administração (equivalente ao `db:suporte`), fora das telas.

### T4. Sessão: a mesma do antigo, sem a sessão do servidor de aplicação

- **Antigo** (03 §1.5): cookie `__Host-sessao` (ou `sessao` sem cookie seguro), valor `<id da loja>.<segredo>`, só o
  SHA-256 do segredo no banco (`sessoes.token_hash`), `Path=/; HttpOnly; SameSite=Strict; Secure`, sem `Max-Age`,
  30 minutos sem uso e no máximo 12 horas; a sessão é conferida a cada pedido (`legacy/api/src/auth/cookies.ts:1-51`;
  `legacy/api/src/config/ambiente.ts:13-26`).
- **Decisão**: repetir. O Spring Security guarda quem está logado num repositório próprio, ligado à tabela de sessões, em
  vez da sessão padrão do servidor (que criaria o cookie `JSESSIONID`, que o antigo não tinha). As mesmas mensagens de
  sessão encerrada (03 §1.5).

### T5. CSRF: token do Spring Security mais a conferência de origem do antigo

- **Antigo**: cookie `SameSite=Strict` e, como segunda camada, recusa de pedido que muda dados vindo de outro site:
  403 "Pedido vindo de outro site recusado." (`legacy/api/src/auth/cookies.ts:6`;
  `legacy/api/src/http/requisicao.ts:7-8,55-70`).
- **Prompt mestre (2.4)**: "CSRF habilitado; compatível com HTMX (token nos headers via hx-headers no layout, ou exclusão
  pontual documentada)".
- **Decisão**: as três camadas. O token do Spring Security vai no `hx-headers` do layout e num campo escondido de cada
  formulário; ele fica ligado à sessão do banco: é o SHA-256 de "csrf:" + o segredo do cookie da sessão, que só o
  navegador da pessoa tem (o banco guarda outro hash, o do segredo puro). Sem cookie novo, sem coluna nova e sem chave
  nova do servidor (`backend/.../config/SessaoCsrfTokenRepository.java`). **Exclusão pontual**: o envio da tela de entrada (antes de existir sessão) não leva token e continua
  protegido como no antigo, pelo `SameSite=Strict` e pela conferência de origem, que vale para todo pedido que não é
  `GET`, `HEAD` ou `OPTIONS`.

### T6. Política de segurança de conteúdo (CSP) igual à antiga

- **Antigo**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, mais
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy` e HSTS (`legacy/web/nginx/seguranca.conf:1-13`; `legacy/web/vite.config.ts:9-23`).
- **O que isso obriga no HTML novo**: nenhum `<script>` nem `<style>` embutido e nenhum atributo `style=""` (o antigo
  também não tinha: nenhum `style={` nas telas de `legacy/web/src`). O tema entra por um arquivo de script próprio,
  `static/js/tema.js`, carregado no `<head>` antes da página aparecer, como o `iniciarTema()` do antigo, que roda antes
  de a tela ser montada (`legacy/web/src/main.tsx:9-10`; `legacy/web/src/tema.ts:35-43`). Com isso não é preciso nonce
  nem hash.
- **HTMX 1.9 com essa CSP**: o HTMX põe um `<style>` próprio para os indicadores de carregamento e aceita código em
  atributos (`hx-on`, `hx-vars`, `js:`). A configuração do layout desliga os dois (`includeIndicatorStyles: false`,
  `allowEval: false`); o estilo dos indicadores vai no `app.css`, e esses atributos não são usados.

### T7. Autorizações dadas com senha: no banco

- **Antigo**: quem autorizou, a ação exata e quando; valem 4 horas, por loja, e são gastas no uso
  (`legacy/core/src/venda.ts:91-92,262-288`); na demonstração ficavam só na memória da aba
  (`legacy/web/src/demo/apiLocal.ts:570-572,986`).
- **Decisão**: tabela própria (loja, quem autorizou, a ação, criada em, vence em, usada em). Vale a regra do core
  (4 horas). O que a pessoa vê não muda: o carrinho guardado no navegador nunca guarda a autorização
  (`legacy/web/src/painel/caixa/carrinho.ts:12-13,295,345`), então depois de recarregar a página ela autoriza de novo,
  como antes.

### T8. Histórico: guarda tudo

- **Antigo**: o core manda só acrescentar, nunca apagar (`legacy/core/src/auditoria.ts:4`) e o servidor antigo guardava
  tudo; a demonstração cortava nas últimas 2000 linhas por loja (`legacy/web/src/demo/usuariosDemo.ts:65,232`).
- **Decisão**: vale o core (regra 2.3 do prompt mestre). Sem corte; as telas leem com limite (padrão 40, de 1 a 200 no
  servidor antigo) e os Relatórios leem pelo período, no servidor.

### T9. Relatórios e planilhas do Excel montados no servidor

- **Antigo**: a tela lia tudo da loja (o histórico até 2000 linhas) e montava as tabelas e o `.xlsx` no navegador, sem
  biblioteca de fora (`legacy/web/src/relatorios/planilhas.ts:91-137`; `legacy/web/src/relatorios/xlsx.ts:1-10`); a
  importação lia `.xlsx` e `.csv` no navegador (`legacy/web/src/relatorios/lerPlanilha.ts:1-14`).
- **Decisão**: o servidor monta as mesmas tabelas e o mesmo arquivo (as mesmas colunas, formatos, negrito, linha
  congelada, filtro e texto como texto) e lê os arquivos da importação com os mesmos limites (20 MB de arquivo, 80 MB
  descompactado). O ZIP do `.xlsx` usa o `java.util.zip` do próprio Java: sem dependência nova, o mesmo princípio do
  antigo.

### T10. Cópia de segurança: o mesmo arquivo, com a conferência por chave

- **Antigo**: formato `sistema-padrao/copia-da-loja` com versão (`legacy/core/src/copiaDaLoja.ts:19`); a conferência é o
  SHA-256 do conteúdo, que pega arquivo corrompido ou mexido à mão, mas não é assinatura. O próprio core diz que, no
  servidor, ela ganha uma chave que só o servidor tem (`copiaDaLoja.ts:10-12`).
- **Decisão**: seguir o core. A conferência passa a ser HMAC-SHA256 com uma chave do servidor (vinda do ambiente, nunca
  do repositório). O resto do arquivo não muda.
- **Consequências**: cópias baixadas da demonstração (só dados de teste) não voltam no sistema novo; trocar a chave
  invalida as cópias feitas antes, e por isso a troca vai documentada no deploy (Fase 6).

### T11. Sem atraso artificial e sem dados de exemplo

A demonstração esperava um pouco a cada pedido, para parecer um servidor, e montava produtos e vendas de exemplo na
primeira vez (`legacy/web/src/demo/apiLocal.ts:905-924`). Na reconstrução não existe nenhum dos dois: a loja começa
vazia e os pedidos respondem no tempo do servidor.

### T12. Carrinho da Frente de caixa guardado no navegador

- **Antigo**: "Como no DaniPets: cada pessoa tem o próprio carrinho guardado no navegador e ele sobrevive a recarregar a
  página. As autorizações dadas com senha NÃO são guardadas." (`legacy/web/src/painel/caixa/carrinho.ts:277-285,
  289-354`). Na demonstração, a chave era `saas-demo:pdv:<loja>:<pessoa>` (`legacy/web/src/demo/DemoApp.tsx:158`); o
  sistema real antigo não passava a chave (`legacy/web/src/App.tsx:121-133`), mas ali a venda nem chegava ao servidor
  (`legacy/web/src/api.ts:1014-1042`).
- **Decisão**: repetir o comportamento da demonstração (segunda referência da hierarquia, 2.3): o carrinho fica no
  `localStorage`, por loja e pessoa, na chave `saas:pdv:<loja>:<pessoa>` (o prefixo `saas:` do sistema real, o mesmo
  da escolha do tema, `legacy/web/src/tema.ts:11`), com a mesma leitura cuidadosa do que está guardado. O servidor só
  recebe a venda pronta e confere tudo de novo, como antes: "Quem decide de verdade é a API"
  (`carrinho.ts:2-3`).
- **Consequência**: a Frente de caixa é a tela com mais JavaScript (carrinho, atalhos de teclado, troco na hora). As
  contas que a tela faz para avisar antes de enviar repetem as do servidor.

### T13. Números, textos e datas

- **Arredondamento**: as contas usam `Math.round` do JavaScript (meio para cima) sobre centavos e centésimos de %; o
  desconto compara o % com folga de 1e-9 (`legacy/core/src/venda.ts:343-354`). Em Java, `Math.round(double)` dá o mesmo
  resultado; não se usa `BigDecimal` com arredondamento bancário (03 §21, item 11).
- **Ordem alfabética e dinheiro**: `localeCompare('pt-BR')` e `Intl.NumberFormat('pt-BR')` (espaço não separável
  U+00A0 depois de "R$") no antigo; `Collator` e `NumberFormat` do Java para pt-BR na reconstrução, conferidos por testes
  contra os textos do antigo (03 §21, item 12).
  - **Ordem alfabética, revista na Fase 3**: o teste com nomes difíceis mostrou que o `java.text.Collator` do Java NÃO dá
    a mesma ordem: ele ignora espaços e pontuação ("Distribuidora PetSul" vem antes de "distribuidora pet sul", e
    "Alvaro.Cia" antes de "Alvaro (Cia)") e põe "Ølsen" depois do "Z". O `localeCompare` do navegador vem do ICU.
    **Decisão**: a ordem vem do ICU4J (`com.ibm.icu:icu4j` 78.3, a mesma versão do ICU do Node 22), em
    `backend/.../domain/OrdemAlfabetica.java`. Com 49 nomes (acentos, maiúsculas, espaço, hífen, ponto, sublinhado,
    números e letras de outras línguas), o Chromium 153, o Node 22 e o ICU4J dão a mesma ordem
    (`OrdemAlfabeticaTest`). É a segunda biblioteca fora da lista da decisão 2.8, depois do Bouncy Castle (T1), pelo
    mesmo motivo: o resultado igual ao do antigo.
- **Banco**: UTF-8 com ICU `pt-BR`, como o antigo (`legacy/raiz/docker-compose.prod.yml:31`).
- **Fuso**: `America/Sao_Paulo` como padrão da loja (`legacy/core/src/venda.ts:94-95`); textos guardados em NFC e busca
  sem acento (03 §6).

### T14. Ilustração da tela de entrada gerada pelo mesmo código, em Java

O desenho da loja na entrada é gerado por código (`legacy/web/src/telas/ilustracaoLoja.ts:1-228`). O gerador passa para
Java e produz o mesmo texto SVG (números escritos como o JavaScript escreve, sem ".0"), servido como arquivo estático
(`04-DESIGN-SYSTEM.md` §8).

### T15. Senha provisória e código do vale sorteados no servidor

- Senha provisória: 10 caracteres de `abcdefghjkmnpqrstuvwxyz23456789`, cada um escolhido por `número sorteado % 31`; no
  antigo, sorteada na tela (`legacy/web/src/painel/TelaUsuarios.tsx:59-66`).
- Código do vale: `VT-<número com 4 dígitos ou mais>-<3 caracteres>`, do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (`legacy/core/src/vale.ts:19-20,55-58`).
- **Decisão**: os dois sorteados no servidor com `SecureRandom`, com o mesmo alfabeto, o mesmo tamanho e a mesma regra.
  A pessoa vê a mesma coisa; a tela só mostra o que o servidor sorteou.

### T16. Números em sequência e saldos: travas no banco

O servidor antigo travava os códigos de cada loja com `pg_advisory_xact_lock` dentro da transação
(`legacy/api/src/produtos/codigos.ts:9-22`) e a trava de usuários fazia o mesmo para não deixar a loja sem Dono
(`legacy/api/prisma/migrations/20261118120000_login_proprio_sessoes_auditoria/migration.sql:221-226`). A reconstrução
usa a mesma trava por loja para tudo que é sequencial (código interno e os números da venda, da compra, da devolução e
do vale) e `SELECT … FOR UPDATE` no que muda saldo (03 §20).

### T17. Ids UUID versão 7

As tabelas antigas usam UUID versão 7 (`legacy/api/prisma/schema.prisma:35,59,89`), que cresce com o tempo. A
reconstrução gera os ids no mesmo formato, na aplicação.

### T18. Página de erro do servidor

O sistema antigo era uma página só: o erro de uma tela virava um aviso dentro dela, e o erro do servidor, uma mensagem
na tela. Com as páginas montadas no servidor, um endereço que não existe ou uma falha do servidor precisam de uma página.
**Decisão**: o formato da tela do sistema antigo quando a aplicação não conseguia carregar (`legacy/web/src/App.tsx:77-88`:
a mensagem e "Tentar de novo"), com as mensagens do servidor antigo: "Rota não encontrada." (404), "Você não tem permissão
para fazer isso." (403) e "Erro interno. Tente novamente." (500) (`legacy/api/src/http/filtro-erros.ts:60-87`). O cartão
"Algo deu errado nesta tela" vem com o registro de erros das ferramentas do Adm. Sup (03 §19.3).

### T19. A loja no desenvolvimento

Sem `DOMINIO_BASE`, a tela antiga mandava a loja de teste de `VITE_LOJA` ou de `?loja=` no endereço
(`legacy/web/src/configuracao.ts:14-21`). **Decisão**: `LOJA_DEV` (o mesmo papel do `VITE_LOJA`) ou `?loja=`, só sem
`DOMINIO_BASE`; com ele, a loja vem sempre do endereço.

### T20. A barra lateral leva a endereços

A barra antiga trocava a parte sem recarregar (`legacy/web/src/painel/BarraLateral.tsx:41-52`). **Decisão**: os itens
continuam sendo `<button>` com as mesmas classes (o CSS é o mesmo); cada um leva ao endereço da parte (`/caixa-do-dia`,
`/financeiro`...) e a página é montada no servidor (`backend/src/main/resources/static/js/painel.js`). "Sair" e a saída
por inatividade enviam um formulário escondido com o token de CSRF.

### T21. Os comandos de administração com os nomes antigos

Os scripts `db:seed`, `db:usuario`, `db:suporte` e `db:app-role` (`legacy/api/package.json:16-20`) viraram comandos do
próprio sistema, com as mesmas opções e mensagens (`java -jar backend.jar db:usuario --loja lojaa ...`). Os nomes ficam
iguais porque as telas citam um deles: "A senha do suporte é trocada pelo script db:suporte, não pela loja."
(`legacy/api/src/auth/sessao.service.ts:398`).

### T22. Formulários pelo HTMX e o que aparece só às vezes

- O que a tela antiga mostrava só às vezes (o aviso de Caps Lock, a explicação de "Esqueceu a senha?", a caixa do
  Suporte, o ícone do olho) fica num `<template>` da página e entra na tela quando precisa, como no React (o elemento
  nem existia); assim nenhum `[hidden]` briga com o CSS copiado.
- Formulários que mostram avisos sem perder o que foi digitado (como "Crie a sua senha") vão pelo HTMX: o servidor
  confere as mesmas regras, na mesma ordem, e devolve só os avisos, que entram no lugar dos marcadores
  (`hx-swap-oob`). Recusa de regra volta com 400, 403, 409, 422 ou 429 e aparece na tela
  (`backend/src/main/resources/static/js/htmx-config.js`); deu certo, o servidor manda para a próxima página
  (`HX-Redirect`).
- Numa aba (Fase 3, Compras), deu certo: a parte inteira volta com o aviso no alto (`HX-Retarget` e `HX-Reswap`),
  como o `concluir` das telas antigas, e a janela some junto. Recusa dentro da janela: só os avisos de cada campo (o
  campo ganha `campo-com-erro` e `aria-invalid="true"`, como no React) e o aviso geral. Recusa fora da janela: a parte
  volta com o erro no alto. O 404 ("Fornecedor não encontrado.") também aparece na tela.
- A janela por cima da tela é a do `legacy/web/src/painel/caixa/Modal.tsx` (`static/js/janela.js`): o foco vai para o
  primeiro campo, Tab não sai dela, Esc e o clique fora fecham, e o foco volta ao botão que a abriu. O "Salvando…" do
  botão e as marcas dos campos ficam em `static/js/formulario.js`.
- Sem resposta do servidor, ou com uma falha dele, a tela mostra a mensagem do antigo ("Sem conexão com o servidor.
  Verifique a internet.", "Erro interno. Tente novamente." ou "Algo deu errado. Tente novamente.",
  `legacy/web/src/api.ts:973-984`) onde o pedido saiu: no aviso geral da janela ou no alto da parte.
- O token de CSRF recusado num pedido do HTMX (a pessoa saiu e entrou de novo em outra aba) recarrega a página com a
  sessão atual (`HX-Refresh`), em vez de a página de erro entrar no meio da tela (`config/PedidoRecusadoHandler.java`).

### T23. As partes ainda não reconstruídas

Até cada módulo chegar, a parte dele mostra o mesmo aviso que o sistema real antigo mostrava nas partes que o servidor
ainda não atendia: "Esta parte ainda não está ligada ao servidor. Por enquanto ela funciona na demonstração
(sistema-padrao-demo.html)." (`legacy/web/src/api.ts:956`; `legacy/web/src/App.tsx:15-19`;
`legacy/web/src/painel/TelaPainel.tsx:268-279`). Cada módulo, ao chegar, entra na lista de partes reconstruídas
(`backend/.../web/PainelController.java`). A aba Suporte é em branco de propósito (CLAUDE.md).

### T24. Uma aba com partes de módulos diferentes

A aba Compras do antigo junta dois módulos: os fornecedores e as compras (contas a pagar, histórico de compras, validade
dos lotes e o "+ Registrar compra") (`legacy/web/src/painel/TelaCompras.tsx:93-361`). Os fornecedores chegam primeiro
(Fase 3). **Decisão**: cada parte segue a T23 por conta própria, do mesmo jeito que o sistema real antigo fazia dentro da
aba Meu usuário, onde um cartão que o servidor ainda não atendia mantinha o título e mostrava o aviso no corpo
(`legacy/web/src/painel/TelaMeuUsuario.tsx:164-200`, o aviso em `:175`; `App.tsx:15-19`):
- os cartões "Contas a pagar" e "Histórico de compras" aparecem com o título, o aviso no lugar do conteúdo e o rodapé
  que já tinham; o de validade dos lotes só aparecia com lotes, e continua sem aparecer;
- o botão "+ Registrar compra" não aparece (no antigo, os botões do alto só aparecem com os dados da aba carregados);
- o cartão "Fornecedores" funciona inteiro.

Quando o módulo Compras chegar, os cartões dele trocam o aviso pelo conteúdo e o botão volta.

### T25. As regras de um corpo JSON num formulário

As regras antigas recebiam um objeto JSON. O formulário da tela manda sempre campos de texto. Duas regras mudam de
forma, com a mesma mensagem:
- "Envie um texto." vale para o campo mandado mais de uma vez (no JSON, uma lista); para o documento e o telefone, os
  valores juntam-se com vírgula antes de tirar os números, como o `String(lista)` do JavaScript;
- "Envie um objeto com os dados do fornecedor." não tem como acontecer: um formulário sempre é um conjunto de campos.

O campo escondido do token de CSRF (`_csrf`) não é um dado e não entra no "Campo não permitido.".

## 3. Divergências entre as fontes do sistema antigo

Ordem que vale (decisão 2.3): `legacy/core` → `apiLocal.ts` (demonstração) → `api.ts` → `legacy/api`. Encontradas na
Fase 1:

| Assunto | Core | Demonstração | O que vale |
|---|---|---|---|
| Histórico | só acrescenta (`legacy/core/src/auditoria.ts:4`) | guarda as últimas 2000 linhas (`legacy/web/src/demo/usuariosDemo.ts:65,232`) | o core (T8) |
| Autorização dada com senha | vale 4 horas (`legacy/core/src/venda.ts:91-92`) | perdida ao recarregar a página (`apiLocal.ts:570-572`) | o core (T7) |
| Conferência da cópia de segurança | SHA-256, com a chave do servidor prevista (`copiaDaLoja.ts:10-12`) | SHA-256 sem chave | o core (T10) |

Fora do core, a senha também difere: a demonstração guarda PBKDF2 do navegador (`pbkdf2$<iterações>$<sal>$<hash>`,
100 mil iterações; `legacy/web/src/demo/usuariosDemo.ts:68,89-101`) e o servidor antigo, scrypt
(`legacy/api/src/auth/senhas.ts`). Vale o servidor, que é a referência para login (decisão 2.3, item 4) (T1).

Nenhuma outra divergência entre o core e a demonstração apareceu na Fase 1. Se aparecer depois, ela entra nesta tabela
antes da implementação (regra 1.8).

## 4. Casos-limite que a reconstrução repete como estão

Os 15 casos de `03-REGRAS-DE-NEGOCIO.md` §21 são repetidos exatamente como no antigo, inclusive os que parecem
estranhos (Personalizado que aparece como autorizador sem poder autorizar, Relatórios sem a aba Histórico para quem não
tem `usuarios`, vencido do cartão no mesmo dia e do fiado só no dia seguinte, CPF único só entre ativos). Mudar
qualquer um deles é decisão do Luan. O item 5 (o texto das pendências 6 e 7 usa "un" mesmo no produto por kg) só
importa se essas pendências forem ligadas (seção 6).

## 5. Riscos

| # | Risco | Como fica coberto |
|---|---|---|
| R1 | Perder um caso-limite que não foi documentado | o `03` cita arquivo e linha de cada regra; cada módulo tem testes das regras e dos casos-limite; comportamento achado fora da especificação para a implementação e volta para o `03` antes (regra 1.8) |
| R2 | Diferença visual sutil | `app.css` copia o `estilos.css` regra por regra, com o mesmo HTML (`04` §0); cada módulo é comparado lado a lado com `legacy/demo/`, nos dois temas e nas larguras do `04` §4 |
| R3 | Esquecer um fluxo pouco usado | `01` e `02` servem de lista de conferência por tela; a Fase 5 cobre cada fluxo do `01` com testes de ponta a ponta |
| R4 | Divergência entre o core e a demonstração | seção 3; vale a ordem da decisão 2.3 |
| R5 | Arredondamento, ordem alfabética ou formato de dinheiro diferentes entre JavaScript e Java | T13, com testes que comparam com os textos do antigo |
| R6 | Spring Boot 3.3.13 sem correções de segurança gratuitas (a linha 3.3 saiu do suporte gratuito) | decisão pendente P4 |
| R7 | CSP rígida com Thymeleaf e HTMX (estilo ou script embutido quebra a tela em produção) | T6; os testes conferem o cabeçalho da CSP e a ausência de `style=""` e de script embutido nas páginas |
| R8 | RLS só se testa num PostgreSQL de verdade | os testes de isolamento rodam contra PostgreSQL 15 ou mais novo (localmente e no CI), com consulta direta ao banco como a regra 1.5 pede |
| R9 | Dados do servidor antigo em produção (Fase 6) | o servidor antigo só guardava lojas, usuários, sessões, histórico e produtos (`00` §2); as senhas continuam valendo (T1) e as sessões não migram (todo mundo entra de novo). Se existe produção com dados reais é pergunta da Fase 6 (P6) |
| R10 | A `main` diverge do `teste-local-windows` (ensaio Java com Auth0) | decisão pendente P3, antes da Fase 6 |
| R11 | Tag `pre-demolicao` fora do GitHub | P1: o snapshot está no commit `a7979e3`, mas a tag só existe na cópia local desta sessão |
| R12 | Na Fase 2, as migrações rodam ao subir, com a senha da role dona no mesmo processo do sistema | basta para desenvolvimento e teste; no deploy (Fase 6) as migrações viram um passo separado e o sistema fica só com a senha da `saas_app`, como o serviço `migracao` do antigo (`legacy/raiz/docker-compose.prod.yml`) |
| R13 | A comparação visual com a demonstração precisa abrir o arquivo antigo no navegador, o que executa o JavaScript dele | decidido em D5: só para olhar e tirar fotos de tela, sem alterar nada |

## 6. Decisões pendentes (dependem do Luan)

| # | Pendente | Quando decidir |
|---|---|---|
| P1 | Enviar a tag `pre-demolicao` do computador do Luan (esta sessão recebe HTTP 403 ao enviar tags; passo a passo no `07`) | quando puder; é critério de pronto do projeto |
| P2 | Ligar a proteção da `main` no GitHub (hoje responde "Branch not protected", contra a decisão 2.2) | quando puder |
| P3 | O que fazer com o ensaio Java que só existe na `main` (PR #2: `apps/java` com Auth0, `apps/web/html`, `docs/MIGRACAO-JAVA.md`), que segue outro caminho desde `c541411` (12/11/2026) e usa Auth0, contra a decisão 2.4 | antes da Fase 6 |
| P4 | Manter o Spring Boot 3.3.13 (pedido da decisão 2.8) ou subir para uma linha com suporte | antes do deploy (Fase 6); quanto antes, menos retrabalho |
| P5 | As pendências da Visão geral (`docs/PENDENCIAS.md`, "Status: A DEFINIR"): hoje estão ligadas a 1, 2, 3, 16, 17, 18 e 19; a 6, 7, 10, 11 e 12 estão prontas e desligadas. Ligar a 6 ou a 7 pede decidir o texto do produto por kg | quando o Luan escolher; a reconstrução repete o que estiver ligado |
| P6 | Se existe produção com dados reais no sistema antigo (para o script de migração de dados da Fase 6) | na Fase 6 |
| P7 | Descontinuar a demonstração offline | só 30 dias depois do deploy, com autorização (D2) |
| P8 | ~~Como comparar o visual com o sistema antigo~~ — decidido em 27/11/2026 (D5): a demonstração pode ser aberta no navegador só para a comparação | — |
