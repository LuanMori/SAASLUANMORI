# 03 — Regras de negócio (manual de reconstrução)

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`). Cada afirmação cita o arquivo e a linha do sistema antigo
em `legacy/` (o snapshot é o commit `a7979e3`, tag `pre-demolicao`). Quando duas fontes divergem, vale a ordem da
decisão 2.3: `legacy/core` → `legacy/web/src/demo/apiLocal.ts` → `legacy/web/src/api.ts` → `legacy/api`.

Convenções deste documento:
- `arquivo:linha` (ou `arquivo:inicio-fim`) aponta para o trecho em `legacy/`.
- "Mensagem" entre aspas é o texto exato que a pessoa vê; reproduzir sem mudar uma letra.
- Status HTTP e `codigo` vêm do servidor antigo (`legacy/api`) ou da API da demonstração (`ErroApi(status, mensagem,
  erros, codigo)`), que usa o mesmo contrato (`legacy/web/src/api.ts`).

---

## 1. Autenticação

O login é próprio: usuário e senha guardados no banco da loja, sem provedor externo
(`legacy/api/src/auth/sessao.service.ts:2`). Não existe "lembrar de mim" (não encontrado em `legacy/web/src` nem em
`legacy/api/src`).

### 1.1 Senha: scrypt

| Item | Valor | Fonte |
|---|---|---|
| Biblioteca | `scrypt` do próprio Node (`node:crypto`), sem dependência extra | `legacy/api/src/auth/senhas.ts:2,6` |
| N | 2^15 (guardado como `logN = 15`) | `legacy/api/src/auth/senhas.ts:17-18` |
| r | 8 | `legacy/api/src/auth/senhas.ts:18` |
| p | 1 | `legacy/api/src/auth/senhas.ts:18` |
| Memória máxima | `256 * r * 2^logN + 1 MiB` (`maxmem`) | `legacy/api/src/auth/senhas.ts:29` |
| Sal | 16 bytes aleatórios por senha (`randomBytes(16)`) | `legacy/api/src/auth/senhas.ts:32` |
| Tamanho do hash | 32 bytes | `legacy/api/src/auth/senhas.ts:33` |
| Normalização | a senha passa por `normalize('NFC')` antes do scrypt ("ç" do Mac = "ç" do Windows) | `legacy/api/src/auth/senhas.ts:4,33` |
| Formato guardado | `scrypt$<logN>$<r>$<p>$<sal base64url>$<hash base64url>` | `legacy/api/src/auth/senhas.ts:5,34` |
| Leitura do formato | 6 partes separadas por `$`, a primeira `scrypt`; logN de 10 a 20, r de 1 a 16, p de 1 a 4; sal com 16 bytes ou mais e hash com 32 ou mais; fora disso, o guardado é inválido | `legacy/api/src/auth/senhas.ts:37-46` |
| Comparação | tempo constante (`timingSafeEqual`), recalculando com o sal, o custo e o tamanho guardados | `legacy/api/src/auth/senhas.ts:60-61` |
| Usuário sem senha ou inexistente | calcula um scrypt com um hash falso (mesmo tempo) e responde "não confere" | `legacy/api/src/auth/senhas.ts:48-58` |
| Custo nos testes automatizados | logN 10, r 8, p 1 (o formato guarda o custo, então hashes de custos diferentes convivem) | `legacy/api/src/auth/senhas.ts:23-27` |

Na reconstrução, o `SCryptPasswordEncoder` do Spring guarda o hash em outro formato (o dele); para replicar exatamente
este formato e aceitar as senhas já guardadas, o codificador do Java precisa ler e gravar
`scrypt$15$8$1$<sal>$<hash>` com base64url sem preenchimento. Ver `06-RISCOS-E-DECISOES.md`.

### 1.2 Regras da senha nova (criar, redefinir ou trocar)

Validação única em `validarSenhaNova` (`legacy/core/src/usuario.ts:70-82`), na ordem:

| Regra | Mensagem | Fonte |
|---|---|---|
| Menos de 8 caracteres (ou não é texto) | "A senha precisa ter pelo menos 8 caracteres." | `legacy/core/src/usuario.ts:21,72` |
| Mais de 128 caracteres | "A senha pode ter até 128 caracteres." | `legacy/core/src/usuario.ts:21,73` |
| Está na lista das senhas comuns (comparação em minúsculas) ou é um caractere repetido (`aaaaaaaa`) | "Esta senha é fácil de adivinhar. Escolha outra." | `legacy/core/src/usuario.ts:33-64,74-75` |
| Contém o login (se o login tem 4 ou mais caracteres) ou o nome sem espaços (se tem 4 ou mais), comparando em minúsculas | "A senha não pode ter o seu usuário ou o seu nome." | `legacy/core/src/usuario.ts:76-80` |

Não há exigência de maiúscula, número ou símbolo (`legacy/core/src/usuario.ts:66-69`). A lista de senhas comuns tem
30 entradas (`legacy/core/src/usuario.ts:33-64`): `12345678`, `123456789`, `1234567890`, `87654321`, `11111111`,
`00000000`, `12341234`, `11223344`, `123123123`, `abcd1234`, `abc12345`, `password`, `password1`, `senha123`,
`senha1234`, `senhasenha`, `mudar123`, `trocar123`, `qwerty123`, `qwertyui`, `asdfghjk`, `iloveyou`, `brasil123`,
`flamengo`, `corinthians`, `palmeiras`, `admin123`, `administrador`, `vendedor`, `petshop123`.

### 1.3 Login (usuário)

| Item | Regra | Fonte |
|---|---|---|
| Formato | `^[a-z0-9][a-z0-9._-]{1,39}$`: de 2 a 40 caracteres, minúsculas, números, ponto, hífen e sublinhado, começando por letra ou número | `legacy/core/src/usuario.ts:21,23-24` |
| Normalização | `trim()` e minúsculas antes de guardar e de comparar | `legacy/core/src/usuario.ts:26-27`; `legacy/api/src/auth/sessao.service.ts:157` |
| Único | por loja (chave `lojaId_usuario`) | `legacy/api/src/auth/sessao.service.ts:174` |

### 1.4 Entrar (POST `/sessao`)

Rota pública (`@Publico`), corpo `{ loja?, usuario, senha }`, resposta 200 com o cookie
(`legacy/api/src/auth/sessao.controller.ts:2-3,29-36`). Passos, na ordem
(`legacy/api/src/auth/sessao.service.ts:4-13,145-237`):

1. `usuario` e `senha` precisam ser textos não vazios; cada um é cortado em 1024 caracteres (só para não travar o
   scrypt). Senão, 400 "Informe o usuário e a senha." (`sessao.service.ts:89-99,146-147`).
2. IP bloqueado (5 logins errados em 1 minuto bloqueiam o IP por 5 minutos) → 429 "Muitas tentativas de login erradas
   a partir desta rede. Tente de novo em N min." (ou "N s" abaixo de 1 minuto), com o cabeçalho `Retry-After` em
   segundos (`legacy/api/src/auth/limites.ts:3-4,12`; `sessao.service.ts:84-87,135-138`;
   `legacy/api/src/http/filtro-erros.ts:19-27,68`). O limitador guarda no máximo 50.000 IPs na memória
   (`limites.ts:14-15,35`).
3. A loja vem do **endereço acessado** quando há `DOMINIO_BASE` (`lojaa.dominio`); sem ele (desenvolvimento), vem do
   campo `loja` do corpo. Loja que não existe ou está inativa → conta como falha do IP e responde 404 "Loja não
   encontrada. Confira o endereço." (`codigo: loja_nao_encontrada`) (`sessao.service.ts:114-125,151-155`).
4. Uma tentativa por vez para o mesmo `loja:login` (fila na memória), sem segurar conexão do banco; o IP é conferido de
   novo ao sair da fila (`limites.ts:55-79`; `sessao.service.ts:159,169`).
5. Login fora do formato não é procurado no banco (`sessao.service.ts:171-178`).
6. Ninguém da loja com esse login → procura o Adm. Sup pela função `app_suporte_para_login(login)` (ver 1.8)
   (`sessao.service.ts:179-183,240-243`).
7. Login que não existe (nem como Adm. Sup): mesma resposta, mesmo tempo (scrypt de mentira) e mesmo bloqueio que um
   usuário de verdade: 5 erradas bloqueiam aquele `loja:login` por 5 minutos, na memória
   (`sessao.service.ts:185,296-304`; `limites.ts:5-6,39-53`).
8. Usuário bloqueado → 429 "Muitas tentativas erradas. Tente de novo em N min ou peça ao dono para trocar sua senha."
   (ou "N s"), **sem conferir a senha** (`sessao.service.ts:187-188`; `legacy/core/src/tentativas.ts:39-43`).
9. A senha é conferida **fora** da transação do banco (`sessao.service.ts:9,190`).
10. Senha errada: conta como falha do IP e, com a linha do usuário travada (`SELECT ... FOR UPDATE`), soma uma
    tentativa e grava no histórico `sessao.senha_errada` (ou `sessao.bloqueado` na quinta). Resposta 401 "Usuário ou
    senha incorretos." (`codigo: credenciais`); na quinta, 429 "Muitas tentativas erradas. Este usuário ficou bloqueado
    por 5 minutos." (`sessao.service.ts:82,190-203`; `legacy/api/src/auth/sessoes.ts:14-22`;
    `legacy/core/src/tentativas.ts:8-11,28-37`).
11. Senha certa, mas o usuário está desativado → 403 "Seu acesso a esta loja está desativado. Fale com o Dono da loja."
    (`codigo: usuario_desativado`): só quem sabe a senha descobre (`sessao.service.ts:12,205`).
12. Senha certa e ativo: numa transação (com a linha travada e o bloqueio conferido de novo), zera as tentativas, grava
    `ultimoAcessoEm`, encerra a sessão anterior **deste navegador** se o cookie antigo era da mesma loja, cria a sessão
    nova (segredo novo a cada login) e grava `sessao.entrou` no histórico (`sessao.service.ts:207-226`).
13. Resposta: `{ usuario: { id, nome, usuario, papel, permissoes }, loja: { nome, subdominio }, senhaProvisoria,
    inatividadeMin }`; `permissoes` só no papel Personalizado (`sessao.service.ts:51-58,228-236`).

Bloqueio do usuário (`legacy/core/src/tentativas.ts`):
- 5 senhas erradas seguidas bloqueiam por 5 minutos; ao bloquear, a contagem volta a zero (`:8-9,28-35`).
- O tempo que falta é arredondado para cima em segundos (`:22-26`).
- Vale também para a senha de quem autoriza um desconto, brinde, cancelamento ou devolução (`:4`).

### 1.5 Cookie e sessão

| Item | Valor | Fonte |
|---|---|---|
| Nome | `__Host-sessao` com cookie seguro ligado (padrão); `sessao` com ele desligado | `legacy/api/src/auth/cookies.ts:16` |
| Valor | `<id da loja>.<segredo>`; o segredo são 32 bytes aleatórios em base64url (43 caracteres) | `cookies.ts:2-4,18-19,23` |
| No banco | só o SHA-256 (hex, 64 caracteres) do segredo, em `sessoes.token_hash` (único) | `cookies.ts:21`; `legacy/api/prisma/migrations/20261118120000_login_proprio_sessoes_auditoria/migration.sql:95-109` |
| Atributos | `Path=/; HttpOnly; SameSite=Strict`, mais `Secure` com cookie seguro | `cookies.ts:5-9,45-47` |
| Duração do cookie | sem `Max-Age`: some ao fechar o navegador | `cookies.ts:9` |
| Apagar | mesmo cookie com valor vazio e `Max-Age=0` | `cookies.ts:49-51` |
| Leitura | valor com até 200 caracteres; id da loja no formato UUID; segredo com 43 caracteres `[A-Za-z0-9_-]`; com cookie repetido, vale o primeiro | `cookies.ts:13-14,25-43` |
| Inatividade | 30 minutos sem uso encerram a sessão (`SESSAO_INATIVIDADE_MIN`, de 5 a 1440) | `legacy/api/src/config/ambiente.ts:23-24,65` |
| Duração máxima | 12 horas (`SESSAO_MAXIMA_HORAS`, de 1 a 72) | `ambiente.ts:25-26,66`; `sessao.service.ts:220` |
| Cookie seguro | `COOKIE_SEGURO`, padrão `true`; só `true` ou `false` são aceitos | `ambiente.ts:13-17,53-54,63` |

A cada pedido (`legacy/api/src/auth/sessao.service.ts:308-365`), a sessão vale se: existe pelo hash do segredo, é da
loja do cookie, não foi encerrada, não passou das 12 horas, foi usada nos últimos 30 minutos, a pessoa existe, está
ativa e tem papel válido, a loja está ativa e, com `DOMINIO_BASE`, o endereço é o da própria loja. Se falha, a sessão é
encerrada no banco (`:341-348`). O último uso é gravado no máximo uma vez por minuto (`:349-351`).

Guarda de toda rota (`legacy/api/src/auth/guarda-autenticacao.ts:1-60`): toda rota nasce protegida.
- Sem sessão válida → 401: "Sua sessão terminou. Entre de novo." (`codigo: sessao_encerrada`) se havia cookie, que é
  apagado; ou "Faça login para continuar." (`codigo: sem_sessao`) se não havia (`guarda-autenticacao.ts:41-48`).
- Com senha provisória, só passam as rotas liberadas (ver a sessão, trocar a senha, sair); as outras dão 403 "Crie a
  sua senha antes de continuar." (`codigo: senha_provisoria`) (`guarda-autenticacao.ts:51-53`;
  `legacy/api/src/auth/decoradores.ts:15-17`).
- Rota que exige uma permissão que o papel não tem → 403 com a mensagem de `mensagemSemPermissao` (`codigo:
  sem_permissao`) (`guarda-autenticacao.ts:54-57`).

Na tela (`legacy/web/src/usarInatividade.ts:7-35`; `legacy/web/src/App.tsx:130-131`): sem tecla, clique, movimento do
mouse, toque, rolagem ou roda do mouse por `inatividadeMin` minutos (conferido a cada 15 segundos e ao voltar para a
aba), a tela sai sozinha com a mensagem "Sua sessão terminou depois de 30 minutos sem uso. Entre de novo." (o número é
o `inatividadeMin` da sessão).

### 1.6 Ver a sessão, trocar a senha e sair

| Rota | Comportamento | Fonte |
|---|---|---|
| `GET /sessao/loja` (pública) | o nome e o subdomínio da loja do endereço para a tela de entrada, e se a tela precisa pedir a loja (`informarLoja` = sem `DOMINIO_BASE`) | `legacy/api/src/auth/sessao.controller.ts:2,23-27`; `sessao.service.ts:127-131` |
| `GET /sessao` | quem está logado (liberada com senha provisória) | `sessao.controller.ts:4,38-42` |
| `POST /sessao/senha` | `{ senhaAtual, senhaNova }`: troca a própria senha (também cria a primeira, no primeiro acesso) | `sessao.controller.ts:5,44-55` |
| `POST /sessao/sair` (pública) | encerra a sessão deste navegador, grava `sessao.saiu` e apaga o cookie; resposta 204 | `sessao.controller.ts:6,57-63`; `sessao.service.ts:378-387` |

Trocar a senha (`legacy/api/src/auth/sessao.service.ts:389-449`):
1. Sem `senhaAtual` e `senhaNova` → 400 "Informe a senha atual e a senha nova." (`:395-396`).
2. O Adm. Sup não troca a senha pela loja → 403 "A senha do suporte é trocada pelo script db:suporte, não pela loja."
   (`:397-399`).
3. Usuário bloqueado → 429 com a mensagem de bloqueio (`:405-406`).
4. Senha atual errada conta como tentativa errada; na quinta, bloqueia, **encerra todas as sessões** da pessoa e o
   cookie é apagado → 429; antes disso, 400 "A senha atual não confere." com o campo `senhaAtual`: "Senha atual
   errada." (`:408-426`; `sessao.controller.ts:48-54`).
5. A senha nova passa pelas regras de 1.2 (erro no campo `senhaNova`) e precisa ser diferente da atual: "A senha nova
   precisa ser diferente da atual." (campo `senhaNova`: "Igual à atual.") (`:428-432`).
6. Grava o hash novo, tira a senha provisória, zera as tentativas, **encerra as outras sessões** da pessoa (fica só a
   atual) e grava `usuario.senha_trocada` (`:434-447`).

"Esqueceu a senha?" não recupera a senha: na tela de entrada, o botão mostra "Solicite uma nova senha ao responsável
pela loja. Por segurança, as senhas não são enviadas por e-mail." (`legacy/web/src/telas/TelaEntrada.tsx:2-4,164-169`).
A senha nova é a provisória que o Dono ou o Administrador redefine na aba Usuários (ver o módulo Usuários).

### 1.7 Formato dos erros

Todo erro sai como `{ status, mensagem, codigo?, erros? }`, com `erros` = `[{ campo, mensagem }]`
(`legacy/api/src/http/filtro-erros.ts:1-17`). Mensagens trocadas pelo servidor: "JSON inválido.", "Endereço
inválido.", "Requisição grande demais." (413), "Rota não encontrada." (404 sem rota) (`:60-67`). Erro inesperado:
500 "Erro interno. Tente novamente."; permissão negada pelo próprio banco: 403 "Você não tem permissão para fazer
isso." (`:47-51,73-87`). O log registra só o id da requisição, o método, a rota, o nome e o código do erro e a loja,
nunca corpo, cookie ou senha (`:4-5,75-82`).

### 1.8 O Adm. Sup (super_admin)

O Adm. Sup é o usuário mestre do suporte: não pertence a nenhuma loja e entra em qualquer loja com o login dele
(`legacy/api/src/auth/sessao.service.ts:14-15`). No banco, o papel `super_admin` é o único sem loja: a restrição
`usuarios_super_admin_sem_loja` exige `(papel = 'super_admin') = (loja_id IS NULL)`
(`legacy/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/migration.sql:94-96`). Como a linha dele não tem
loja, o RLS a esconde da API; o login usa funções do banco feitas só para isso
(`legacy/api/prisma/migrations/20261123210000_adm_sup_e_personalizado/migration.sql:35-69`):
- `app_suporte_para_login(login)`: a linha do suporte para conferir a senha;
- `app_suporte_por_id(id)`: os dados do suporte a cada pedido;
- `app_suporte_registrar(id, tentativas, bloqueado_ate, ultimo_acesso)`: grava as tentativas e o último acesso.

Regras (`sessao.service.ts:245-294`): as mesmas de senha errada e bloqueio de todos; suporte desativado → 403 "Este
acesso de suporte está desativado." (`codigo: usuario_desativado`); a sessão é aberta na loja do endereço, com o nome
`NOME_SUPORTE`, papel `super_admin`, sem permissões avulsas e nunca com senha provisória.

---

## 2. Isolamento de dados (obrigatório em toda tabela de loja)

### 2.1 Como o sistema antigo isola uma loja da outra

1. **A loja vem só da sessão**, nunca do corpo, da URL ou de um cabeçalho escolhido pela tela
   (`legacy/api/src/auth/contexto.ts:1-3`). O contexto `{ lojaId, usuarioId, papel, permissoes, ... }` é montado pela
   guarda a partir da sessão conferida no banco (`contexto.ts:8-22`; `legacy/api/src/auth/guarda-autenticacao.ts:113`).
2. **Uma transação por operação**, com a loja fixada só dentro dela:
   `SELECT set_config('app.loja_id', <loja>, true), set_config('app.usuario_id', <pessoa ou ''>, true)`. O `true` faz
   o valor valer só até o `COMMIT`/`ROLLBACK`, para não vazar pelo pool de conexões
   (`legacy/api/src/banco/banco.service.ts:1-15,71-78`). Id de loja ou de pessoa fora do formato UUID é recusado antes
   (`:72-73`). O acesso ao banco só existe por esse caminho (`:13-15`).
3. **RLS em toda tabela com `loja_id`**, ligado e forçado (`FORCE`, que vale até para a role dona das tabelas), com uma
   policy que compara a loja da linha com a loja da transação. A função que lê a loja
   (`legacy/api/prisma/migrations/20261111180000_fase_menos_1_esqueleto/migration.sql:87-92`):

   ```sql
   CREATE FUNCTION "app_loja_atual"() RETURNS UUID
     LANGUAGE sql STABLE PARALLEL SAFE
     AS $$ SELECT NULLIF(current_setting('app.loja_id', true), '')::uuid $$;
   ```

   Sem a loja definida, a função devolve `NULL`, a comparação nunca é verdadeira e a consulta devolve zero linhas
   (falha fechada). Exemplo de policy (`produtos`, `migration.sql:101-106`):

   ```sql
   ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "produtos" FORCE ROW LEVEL SECURITY;
   CREATE POLICY "produtos_isolamento_loja" ON "produtos"
     FOR ALL
     USING ("loja_id" = "app_loja_atual"())
     WITH CHECK ("loja_id" = "app_loja_atual"());
   ```

   O mesmo vale para `usuarios` (`migration.sql:110-115`), `sessoes` e `auditoria`
   (`legacy/api/prisma/migrations/20261118120000_login_proprio_sessoes_auditoria/migration.sql:146-158`). O catálogo
   completo das policies, com o SQL exato, está em `00-VISAO-GERAL.md`.
4. **Role da API sem poderes especiais**: `saas_app` é `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
   NOINHERIT`, não é dona das tabelas e só tem os privilégios mínimos (`migration.sql:76-85,117-122`). A tabela `lojas`
   não tem RLS, e a API só pode lê-la (`legacy/api/src/banco/banco.service.ts:4`; `migration.sql:119`).
5. **A API se recusa a subir** se: a role da conexão (ou qualquer role de que ela faça parte) for superusuário ou tiver
   `BYPASSRLS`; ela for dona de alguma tabela; alguma tabela com `loja_id` estiver sem RLS ligado e forçado ou sem
   policy; ou o banco ou a conexão não estiverem em UTF-8 (`legacy/api/src/banco/conferencia.ts:1-63`). As mensagens
   citam só nomes de roles e de tabelas (`:9`).

Na demonstração, sem servidor, cada assunto é guardado no navegador por loja, numa chave por assunto com um objeto
`loja → dados` (`legacy/web/src/demo/apiLocal.ts:296-331`); o que é do suporte fica em chaves à parte (`apiLocal.ts:333-349`).

### 2.2 Como fica na reconstrução

A regra 1.5 do prompt mestre pede a mesma ideia em duas camadas: `tenantId` em toda entidade e consulta, e RLS em toda
tabela de negócio, com `SET LOCAL app.tenant_id` no início de cada transação e a policy
`USING (tenant_id = current_setting('app.tenant_id')::uuid)`. Equivalências com o sistema antigo:

| Sistema antigo | Reconstrução |
|---|---|
| coluna `loja_id` | coluna `tenant_id` |
| `set_config('app.loja_id', ..., true)` por transação | `SET LOCAL app.tenant_id = ...` por transação |
| `app_loja_atual()` com `current_setting('app.loja_id', true)`: sem a loja, zero linhas | `current_setting('app.tenant_id')` sem o segundo argumento: sem a loja, a consulta dá erro. As duas formas falham fechadas; a diferença está registrada em `06-RISCOS-E-DECISOES.md` |
| `app.usuario_id` (quem fez) | o usuário da auditoria (`criadoPor`, `atualizadoPor`) |
| Adm. Sup sem loja, lido só por funções do banco | precisa de um caminho equivalente: a entidade base exige `tenantId`, e o Adm. Sup não tem loja. Decisão da Fase 2, registrada em `06-RISCOS-E-DECISOES.md` |

---

## 3. Usuários (aba Usuários)

Quem pode: `usuarios` (Dono, Administrador e Adm. Sup; ver `05-MATRIZ-PERMISSOES.md`). No servidor antigo as rotas são
`GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/senha` e
`POST /usuarios/:id/excluir-dados`, todas com `@Exige('usuarios')`
(`legacy/api/src/usuarios/usuarios.controller.ts:2,13-40`).

### 3.1 Campos e validação

| Campo | Regra | Mensagem | Fonte |
|---|---|---|---|
| nome | NFC, espaços repetidos viram um, sem espaço nas pontas; de 2 a 120 caracteres; sem caractere de controle | "Informe o nome da pessoa." · "O nome pode ter até 120 caracteres." · "O nome contém caracteres inválidos." | `legacy/core/src/usuario.ts:21,102-108` |
| usuario (login) | ver 1.3 | "O usuário (login) tem de 2 a 40 letras minúsculas ou números, sem espaço (pode ter ponto, hífen e _)." | `usuario.ts:141-150` |
| papel | `dono`, `administrador`, `vendedor` ou `personalizado` | "Escolha o papel: Dono, Administrador, Vendedor, Personalizado." | `usuario.ts:110-113`; `legacy/core/src/papeis.ts:16,24` |
| permissoes (só Personalizado) | pelo menos uma; só das que se podem dar; o extra de uma tela exige o acesso dela; guardadas na ordem da lista de permissões | "Marque pelo menos uma função para o Personalizado." · "Esta função não pode ser dada a um Personalizado: <função>." · "Para “<texto do extra>”, marque também a tela “<tela>”." | `usuario.ts:115-135` |
| permissoes em outro papel | lista vazia ou ausente | "Funções escolhidas só no papel Personalizado." | `usuario.ts:160-164` |
| senha (provisória, ao criar) | as regras de 1.2, com o login e o nome da pessoa | ver 1.2 | `usuario.ts:165-166` |
| ativo (ao alterar) | `true` ou `false` | "Informe se o usuário fica ativo (true ou false)." | `usuario.ts:179-182` |
| qualquer outro campo | recusado | "Campo não permitido." | `usuario.ts:137-139,155,174` |
| corpo que não é objeto | recusado | "Envie um objeto com os dados do usuário." · "Envie um objeto com o que muda." | `usuario.ts:153,172` |
| alteração sem nenhum campo | recusada | "Nada para alterar." | `usuario.ts:183` |

Erro de validação no servidor: 400 "Dados do usuário inválidos." com a lista `erros`
(`legacy/api/src/usuarios/usuarios.service.ts:96-97,121-122`). Login repetido na loja, ou igual ao login do Adm. Sup:
409 "Já existe o usuário "<login>" nesta loja. Escolha outro login." (campo `usuario`: "Já usado nesta loja.")
(`usuarios.service.ts:103-106,201-206`; na demonstração, o login do Adm. Sup é `suporte`:
`legacy/web/src/demo/usuariosDemo.ts:62,436-437`).

### 3.2 Quem cadastra e altera quem

Regra única em `conferirGestaoDeUsuario` (`legacy/core/src/usuario.ts:216-279`), que recusa com 403 e
`codigo: regra_usuarios` no servidor (`usuarios.service.ts:48-50,90-93`):

1. Quem faz precisa estar ativo e ter `usuarios`; senão, a mensagem de `mensagemSemPermissao('usuarios')` (`:226`).
2. **Criar**: o Dono e o Administrador cadastram só Vendedor e Personalizado; o Adm. Sup cadastra qualquer papel
   (`usuario.ts:196-204`). Dono ou Administrador criado por outra pessoa: "O Dono e o Administrador só são cadastrados
   pelo suporte (Adm. Sup), na implantação do sistema." (`usuario.ts:206,232`). Personalizado sem função: "Marque pelo
   menos uma função para o Personalizado." (`:233`).
3. Só se dá ao Personalizado o que se tem: "Você só pode dar ao Personalizado as funções que você mesmo tem."
   (`usuario.ts:227-229`).
4. O alvo precisa existir na loja; o Adm. Sup não é da loja: "Usuário não encontrado." (`usuario.ts:236-237`;
   `usuarios.service.ts:46,83-88`).
5. Mexer num Dono (ou dar o papel de Dono) exige `usuarios.donos`: "Só um Dono altera, desativa ou redefine a senha de
   outro Dono, ou dá o papel de Dono." (`usuario.ts:239-241`).
6. **Redefinir a senha** da própria pessoa: "Para a sua própria senha, use “Trocar minha senha”." (`usuario.ts:243-246`).
7. **Excluir os dados** (LGPD): exige `usuarios.excluir_dados` (só o Dono); não vale para si mesmo ("Você não pode
   excluir os seus próprios dados por aqui.") e o usuário precisa estar desativado ("Desative o usuário antes de excluir
   os dados dele.") (`usuario.ts:248-253`).
8. **Alterar**: ninguém se desativa ("Você não pode desativar o seu próprio usuário.", campo `ativo`) nem muda o próprio
   papel ou as próprias funções ("Você não pode mudar o seu próprio papel nem as suas funções. Peça a outro Dono.");
   dar o papel de Dono ou de Administrador é só do Adm. Sup ("Só o suporte (Adm. Sup) dá o papel de Dono ou de
   Administrador."); funções só no Personalizado; virar Personalizado exige pelo menos uma função
   (`usuario.ts:255-271`).
9. **A loja nunca fica sem um Dono ativo**: "Mantenha pelo menos um Dono ativo na loja." (`usuario.ts:273-277`).

Toda alteração roda com uma trava por loja (`pg_advisory_xact_lock(hashtextextended('usuarios:<loja>', 0))`), e quem
faz é relido do banco: o papel pode ter mudado depois do login. Sem quem faz: 403 "Seu acesso a esta loja está
desativado." (`usuarios.service.ts:6-7,66-81`).

### 3.3 Efeitos de cada operação

| Operação | Efeito | Histórico | Fonte |
|---|---|---|---|
| Criar | grava com a senha provisória (o hash), `senhaProvisoria = true`; no primeiro acesso a pessoa cria a dela | `usuario.criado` com o papel e, no Personalizado, as funções | `usuarios.service.ts:95-118`; `legacy/core/src/usuario.ts:8-9` |
| Alterar | grava só os campos que mudaram; quem deixa de ser Personalizado perde as funções; desativar encerra as sessões da pessoa | `usuario.desativado` ou `usuario.reativado`; `usuario.alterado` com os nomes dos campos (sem os valores pessoais) e, se mudou, o papel de antes e o de depois e as funções | `usuarios.service.ts:120-153` |
| Redefinir a senha | nova senha provisória (regras de 1.2), zera as tentativas e o bloqueio, encerra as sessões da pessoa | `usuario.senha_redefinida` | `usuarios.service.ts:155-171` |
| Excluir os dados (LGPD) | a linha fica, com o nome "Usuário removido", o login `removido-<24 últimos caracteres do id sem hífens>`, sem senha, sem último acesso e (na demonstração) sem foto; encerra as sessões | `usuario.dados_excluidos` | `usuarios.service.ts:173-198`; `legacy/core/src/usuario.ts:29-30`; `legacy/web/src/demo/usuariosDemo.ts:510-530` |

Lista: ativos primeiro e, depois, em ordem de nome (`usuarios.service.ts:56-64`; na demonstração, comparação de nomes
em português: `usuariosDemo.ts:425-428`). A situação de cada um na lista: "Desativado", "Bloqueado (senhas erradas)",
"Senha provisória" ou "Ativo", nessa ordem de prioridade (`legacy/core/src/usuario.ts:281-287`).

Limite de usuários ativos que o suporte deu à loja (Adm. Sup → Ajustes desta loja): criar ou reativar acima dele dá 409
com a mensagem do limite (`codigo: limite_da_loja`); o Adm. Sup não conta (`usuariosDemo.ts:418-422`; regras do limite
no módulo Ajustes da loja).

### 3.4 Trava no banco (`usuarios_trava_api`)

O servidor antigo tem uma segunda barreira, no próprio banco, para o que é mais grave
(`legacy/api/prisma/migrations/20261123210000_adm_sup_e_personalizado/migration.sql:71-138`). Vale só para a role da API
(`:79-81`) e usa a pessoa logada de `app.usuario_id` (`:76`):
- o login (tentativas, bloqueio, último acesso) e a troca da própria senha passam sem conferência (`:83-99`);
- sem ninguém logado, cadastro ou alteração é negado (`:90-92,101-103`);
- só Dono, Administrador ou o Adm. Sup cadastram e alteram (`:104-111`);
- só o Adm. Sup cadastra ou dá o papel de Dono ou de Administrador (`:112-118`);
- só um Dono (ou o Adm. Sup) mexe em outro Dono (`:119-121`);
- ninguém desativa, muda o próprio papel ou as próprias funções (`:122-125`);
- o Personalizado precisa de pelo menos uma função (`:126-128`);
- a loja precisa de pelo menos um Dono ativo, com a mesma trava por loja da API (`:129-135`).

A negação do banco chega à pessoa como 403 "Você não tem permissão para fazer isso."
(`legacy/api/src/http/filtro-erros.ts:47-51,83-86`).

---

## 4. Meu usuário (a própria pessoa, todos os papéis)

| Item | Regra | Fonte |
|---|---|---|
| Foto do perfil | PNG, JPEG ou WebP em data URL base64 (`^data:image/(png\|jpeg\|webp);base64,...$`), com até 150.000 caracteres; vazia = tirar a foto | `legacy/core/src/perfil.ts:4,11-29` |
| Mensagens da foto | "A foto precisa ser uma imagem PNG, JPEG ou WebP." · "A foto é grande demais. Use uma imagem menor (até 100 KB)." | `perfil.ts:18-21` |
| Quem troca | cada pessoa só a própria foto; foto igual à atual não grava nada | `perfil.ts:4`; `legacy/web/src/demo/usuariosDemo.ts:588-601` |
| Histórico | `usuario.foto_alterada` (com `tirou: true` quando tira) | `usuariosDemo.ts:597` |
| Entradas e saídas | montadas do histórico da pessoa: cada "Entrou no sistema" com o "Saiu do sistema" seguinte; a saída diz se foi pelo botão Sair ou por falta de uso (`motivo: inatividade`); duas entradas seguidas = a primeira ficou sem saída; a última entrada sem saída é a sessão de agora; da mais recente para a mais antiga, no máximo 30 | `perfil.ts:5-7,32-80`; `usuariosDemo.ts:603-606` |
| Duração | minutos inteiros entre a entrada e a saída (a de agora conta até agora); "menos de 1 min", "45 min", "2 h", "2 h 05 min" | `perfil.ts:82-98` |
| Trocar a senha | a troca da própria senha de 1.6 | `legacy/api/src/auth/sessao.service.ts:389-449` |

A foto, as entradas e saídas e a troca de senha da aba "Meu usuário" existem só na demonstração; no servidor antigo,
só a troca de senha (`POST /sessao/senha`) existe (as outras partes respondem 501 pela API do sistema real, com a mensagem
`MENSAGEM_SEM_SERVIDOR`: `legacy/web/src/api.ts:956,1036`).

---

## 5. Loja: endereço, dados, regras e ajustes do suporte

### 5.1 Endereço da loja (subdomínio)

- Formato `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`, depois de `trim()` e minúsculas; fora dele: "O endereço da loja tem
  até 63 letras minúsculas, números ou hífen (sem acento, sem espaço, sem hífen nas pontas)." (campo `loja`)
  (`legacy/core/src/loja.ts:7,12-24`).
- Reservados: `www`, `app`, `api`, `login`, `admin` → ""<endereço>" é reservado. Escolha outro endereço."
  (`loja.ts:10,25`).
- A loja do endereço acessado: o cabeçalho Host em minúsculas, sem a porta e sem o ponto final, precisa terminar em
  `.<DOMINIO_BASE>`; o resto precisa ser um subdomínio válido de um nível só ("LojaA.NomeDaEmpresa.com.br:443" →
  `lojaa`; "a.b.nomedaempresa.com.br" → nenhuma) (`loja.ts:29-43`).
- Na demonstração, as lojas são fixas: `loja-a` (subdomínio `lojaa`, "Loja A", "Rações, petiscos e acessórios") e
  `loja-b` (`lojab`, "Loja B", "Pet shop e banho e tosa") (`legacy/web/src/demo/usuariosDemo.ts:42-44`).

### 5.2 Dados da loja (nome, descrição e logo)

Quem altera: `loja.configurar`; todos os logados leem (`legacy/core/src/configuracao.ts:11`).

| Campo | Regra | Mensagem | Fonte |
|---|---|---|---|
| nome | uma linha (NFC, sem espaço sobrando); de 2 a 80 caracteres; sem caractere de controle | "Informe o nome da loja." · "O nome da loja pode ter até 80 caracteres." · "O nome contém caracteres inválidos." | `configuracao.ts:18-21,53-61` |
| descricao | opcional; texto de até 160 caracteres; vazia = sem descrição | "A descrição deve ser um texto." · "A descrição pode ter até 160 caracteres." | `configuracao.ts:22-23,63-72` |
| logo | opcional; PNG, JPEG ou WebP em data URL base64, até 280.000 caracteres; sem logo, a barra mostra as iniciais do nome | "O logo precisa ser uma imagem PNG, JPEG ou WebP." · "O logo é grande demais. Use uma imagem menor (até 200 KB)." | `configuracao.ts:31-32,41-42,47,74-83` |
| outro campo | recusado | "Campo não permitido." | `configuracao.ts:94` |

Mudança vazia: "Nada para alterar." (`configuracao.ts:99`). Só os campos que mudaram são gravados e vão para o
histórico (`loja.dados_alterados` com os nomes dos campos) (`configuracao.ts:91-104`;
`legacy/web/src/demo/apiLocal.ts:3557-3570`). Dados guardados de outra versão são completados com o padrão, nunca
recusados (`configuracao.ts:9-10,106-118`).

### 5.3 Regras da loja

Estrutura e padrões (os do DaniPets V9.3.3) (`legacy/core/src/configuracao.ts:123-191`):

| Parte | Campo | Padrão | Limites | Fonte |
|---|---|---|---|---|
| venda | `descontoSemSenhaPct`: desconto que o Vendedor dá sem senha (%) | 10 | 0 a 50, até 2 casas | `configuracao.ts:124-125,180,195`; `legacy/core/src/venda.ts:89` |
| caixa | `toleranciaCentavos`: diferença aceita no fechamento | 1000 (R$ 10,00) | 0 a 100.000, inteiro | `configuracao.ts:126-127,181,196` |
| fiado | `prazoDias`: prazo para pagar | 30 | 1 a 365, inteiro | `configuracao.ts:128-129,182,197`; `legacy/core/src/financeiro.ts:80` |
| fiado | `vencidoPedeDono`: fiado vencido só sai com a liberação do Dono | sim | sim ou não | `configuracao.ts:128-129,182,325` |
| cashback | `percentual` | 3,5 | 0 a 20, até 2 casas | `configuracao.ts:130-131,183,198` |
| cashback | `validadeDias`: prazo para usar | 31 | 1 a 3650, inteiro | `configuracao.ts:183,199` |
| cashback | `avisoDias`: aviso de cashback vencendo (dias antes) | 7 | 0 a 365, inteiro | `configuracao.ts:183,200` |
| retorno | `diasSemComprar`: dias sem comprar para lembrar | 30 | 1 a 3650, inteiro | `configuracao.ts:132-133,184,201` |
| retorno | `cupomPct`: desconto do cupom de retorno (%) | 5 | 0 a 50, até 2 casas | `configuracao.ts:184,202` |
| retorno | `cupomValidadeDias`: validade do cupom | 7 | 1 a 365, inteiro | `configuracao.ts:184,203` |
| mensagens | `retorno`, `cashback`, `cobranca` (WhatsApp) | os textos abaixo | até 1000 caracteres | `configuracao.ts:134-135,157-170` |
| estoque | `motivosAjuste` | "Perda ou avaria", "Produto vencido", "Correção de contagem", "Outro" | 1 a 30 itens de 2 a 60 caracteres, sem repetir | `configuracao.ts:136,172-173,243-266` |
| financeiro | `categoriasDespesa` | "Aluguel", "Energia e água", "Funcionários", "Impostos e taxas", "Fornecedores", "Transporte", "Outras despesas" | como a lista acima | `configuracao.ts:137-138,174-175` |
| financeiro | `nomesContas` | `caixa`: "Caixa físico"; `banco`: "Conta bancária" | de 2 a 30 caracteres; vazio volta ao padrão; as duas não podem ter o mesmo nome (sem diferença de maiúsculas) | `configuracao.ts:277-302`; `legacy/core/src/financeiro.ts:35,39,46` |
| produtos | `unidades`: como os produtos podem ser vendidos | `un` e `kg` | pelo menos uma, sem repetir | `configuracao.ts:139-140,268-275`; `legacy/core/src/quantidade.ts:9` |
| clientes | `campoExtra`: `{ ativo, rotulo }` | desligado, "Pet" | rótulo de 2 a 30 caracteres | `configuracao.ts:141-142,189,304-310,330-341` |

Mensagens padrão (`configuracao.ts:156-163`), com as variáveis que cada uma aceita (`:165-170`):
- retorno (`{nome}`, `{loja}`, `{dias}`, `{desconto}`, `{validade}`): "Olá, {nome}! Aqui é da {loja}. Faz {dias} dias desde a
  sua última compra e sentimos sua falta. Separamos {desconto}% de desconto para você, válido até {validade}. É só
  informar seu CPF no caixa."
- cashback (`{nome}`, `{loja}`, `{valor}`, `{validade}`): "Olá, {nome}! Aqui é da {loja}. Você tem {valor} de cashback para
  usar até {validade}. Aproveite na sua próxima compra!"
- cobrança (`{nome}`, `{loja}`, `{valor}`, `{vencimento}`): "Olá, {nome}, tudo bem? Aqui é da {loja}. Passando para lembrar que
  há {valor} em aberto na sua conta, com vencimento em {vencimento}. Se já pagou, por favor desconsidere. Qualquer
  dúvida, estamos à disposição."

Validação das regras (`legacy/core/src/configuracao.ts:193-366`):
- número fora do limite: "<rótulo>: de <min> a <max>, com até 2 casas." ou "..., sem casas decimais." (com vírgula
  decimal no texto) (`:206-219`); com 2 casas, o valor é arredondado para 2 casas (`:218`);
- sim ou não: "Informe sim ou não (true ou false)." (`:221-224`);
- mensagem: NFC, quebra de linha `\r\n` vira `\n`, sem espaço nas pontas; vazia: "A mensagem não pode ficar vazia.";
  mais de 1000: "A mensagem pode ter até 1000 caracteres."; caractere de controle (fora a quebra de linha): "A mensagem
  contém caracteres inválidos."; variável que não existe: "Use só {nome}, {loja}, ... (não existe {x})."
  (`:226-241`);
- lista: "Envie uma lista." · "A lista precisa de pelo menos um item." · "A lista pode ter até 30 itens." · "Cada item
  tem de 2 a 60 caracteres." · ""<item>" aparece mais de uma vez." (`:243-266`);
- unidades: "Escolha pelo menos uma unidade de venda: un (unidade) ou kg (quilo)." (`:268-275`);
- nomes das contas: "Envie { caixa, banco } com os nomes das contas." · "Conta desconhecida." · "O nome da conta tem de 2
  a 30 caracteres." · "As duas contas precisam de nomes diferentes." (`:277-302`);
- campo extra: "Envie { ativo, rotulo }." · "O nome do campo tem de 2 a 30 caracteres." (`:304-310,330-341`);
- parte que não existe: "Parte das regras desconhecida."; parte que não é objeto: "Envie um objeto com o que muda nesta
  parte."; campo que não existe na parte: "Campo não permitido."; nada: "Nada para alterar." (`:312-362`).

Só as partes que mudaram de fato são gravadas e vão para o histórico (`loja.regras_alteradas` com os nomes das partes)
(`configuracao.ts:346-366`; `legacy/web/src/demo/apiLocal.ts:3572-3585`). Regras guardadas de outra versão: cada campo
inválido ou ausente volta ao padrão (`configuracao.ts:368-383`). As variáveis das mensagens são trocadas pelos valores;
variável sem valor fica escrita como está (`configuracao.ts:385-388`).

### 5.4 Ajustes da loja (Adm. Sup): recursos ligados e limites

Regras em `legacy/core/src/recursosDaLoja.ts`. Só o Adm. Sup muda (`suporte.ferramentas`); todos da loja leem
(`recursosDaLoja.ts:1-13`; `legacy/web/src/demo/apiLocal.ts:3528-3555`).

| Recurso | Quando desligado | Fonte |
|---|---|---|
| Compras | a aba Compras some; a compra nova e a importação de fornecedores são recusadas | `recursosDaLoja.ts:19`; `apiLocal.ts:1287,2967` |
| Financeiro | a aba Financeiro some; os lançamentos à mão são recusados (lançar, saldo inicial, conta a pagar avulsa, confirmar o recebimento do cartão); as vendas e o caixa continuam movimentando as contas | `recursosDaLoja.ts:20-23`; `apiLocal.ts:2631,2659,2679,2700,3096` |
| Relatórios | a aba some; importar vendas antigas é recusado | `recursosDaLoja.ts:24`; `apiLocal.ts:1366` |
| Fiado | a venda fiado é recusada; o fiado que já existe continua podendo ser recebido | `recursosDaLoja.ts:25`; `apiLocal.ts:1576` |
| Fidelidade | a compra não gera cashback; os lembretes de retorno e de cashback são recusados e somem da Visão geral; o saldo e os cupons que os clientes já têm continuam valendo | `recursosDaLoja.ts:26-29`; `apiLocal.ts:1650,2432,2537` |
| Vale-troca | a devolução como vale-troca é recusada; os vales que já existem continuam podendo ser usados | `recursosDaLoja.ts:30`; `apiLocal.ts:1770` |

- Recusa: 403 "<Recurso>: este recurso está desligado nesta loja. Fale com o suporte." (`codigo: recurso_desligado`)
  (`recursosDaLoja.ts:68`; `apiLocal.ts:1383-1386`). Sem ajustes guardados, tudo está ligado (`recursosDaLoja.ts:57-66`).
- Limites: usuários ativos (1 a 1.000) e produtos ativos (1 a 100.000); vazio = sem limite; fora disso: "<Nome>: use um
  número inteiro de <min> a <max>, ou deixe em branco para não ter limite." (`recursosDaLoja.ts:40-43,86-99`).
- Acima do limite (409, `codigo: limite_da_loja`): "Esta loja pode ter até <N> usuários ativos (hoje: <ativos>). Desative
  um usuário ou fale com o suporte para aumentar o limite."; "Esta loja pode ter até <N> produtos ativos (hoje: <ativos>).
  Inative um produto ou fale com o suporte para aumentar o limite."; na importação: "A planilha traz <novos> produtos
  novos, e esta loja pode ter até <N> produtos ativos (hoje: <ativos>). Fale com o suporte para aumentar o limite."
  Os números saem com separador de milhar (`recursosDaLoja.ts:101-116`).
- Onde o limite de produtos vale: cadastrar, reativar e importar (já na prévia) (`apiLocal.ts:1388-1392,1440,1525,
  3284,3300`). Baixar o limite não desativa ninguém nem inativa produto (`recursosDaLoja.ts:9-10`).
- Validação dos ajustes: "Envie os recursos desligados e os limites da loja." · "Recurso desconhecido: <x>." · "Campo
  não permitido." · "Envie a lista dos recursos desligados." · "Envie os limites da loja." · "Limite desconhecido."
  (`recursosDaLoja.ts:70-100`).
- Histórico `suporte.ajustes_alterados`, com o que ligou, o que desligou e os limites novos (ex.: "desligou Fiado e
  Vale-troca • ligou Compras • usuários: até 5 • produtos: sem limite"); salvar igual não grava (`recursosDaLoja.ts:
  118-143`; `apiLocal.ts:3534-3550`).
- Os ajustes não vão na cópia de segurança da loja (`recursosDaLoja.ts:11`; `apiLocal.ts:333-349`).

---

## 6. Dinheiro, quantidade, texto e datas (regras de base)

### 6.1 Dinheiro

- Sempre inteiro em centavos, nunca número quebrado (`legacy/core/src/dinheiro.ts:2`). Teto técnico: 2.147.483.647
  centavos (o maior INTEGER do Postgres) (`dinheiro.ts:4-5`). Na reconstrução: `long` ou `int` em centavos, nunca
  `double`/`float` nem `BigDecimal` com casas soltas.
- Mostrar: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, ou seja, "R$ 12,50" com espaço não
  separável (U+00A0) depois do "R$"; -0 aparece "R$ 0,00" (`dinheiro.ts:7-16`). Valor não inteiro é erro de programa
  (`dinheiro.ts:11-13`).
- Ler o que a pessoa digitou (`reaisParaCentavos`, `dinheiro.ts:18-57`): tira "R$" e os espaços; aceita "12", "12,5",
  "12,50", "1.234,56", "R$ 1.234,56" e "12.50"; ponto sem vírgula com 1 ou 2 dígitos depois é decimal ("12.50"), com grupos
  de 3 é milhar ("1.234" = R$ 1.234,00); recusa vazio, negativo, mais de 2 casas, letras e valor acima do teto.
- Percentual de cartão: `taxa = round(valor × round(pct × 100) / 10000)` (`legacy/core/src/financeiro.ts:232-235`).

### 6.2 Quantidade

- Inteira sempre, na unidade do produto: `un` = unidades; `kg` = gramas (1250 = 1,25 kg); o preço do produto por kg é o
  preço do quilo (`legacy/core/src/quantidade.ts:1-9`). Dado sem unidade vale `un` (`quantidade.ts:16-17`).
- Nomes: "Unidade (un)" e "Quilo (kg, a granel)" (`quantidade.ts:12`).
- Máximo numa venda: 9999 un ou 999,999 kg; passo dos botões + e − da Frente de caixa: 1 un ou 0,5 kg
  (`quantidade.ts:19-23`).
- Mostrar: "3 un"; "1,25 kg"; "0,5 kg"; "-2 kg" (sem zeros à direita na fração) (`quantidade.ts:27-41`).
- Ler: un só dígitos; kg com até 3 casas, vírgula ou ponto ("1,25" → 1250); aceita "un"/"kg" no fim
  (`quantidade.ts:43-53`).
- Valor de uma quantidade: un = preço × quantidade; kg = `round(preço × gramas / 1000)` (`quantidade.ts:55-58`).

### 6.3 Texto

- Texto digitado é guardado em NFC (o "ç" do Mac vira o do Windows) (`legacy/core/src/texto.ts:2-3`).
- Busca sem acento: NFD, tira os acentos, minúsculas e `trim()` ("racao" acha "Ração") (`texto.ts:4-11`).
- Caracteres de controle (U+0000 a U+001F e U+007F, o que inclui quebra de linha e tab) são recusados em nomes, motivos e
  descrições (`legacy/core/src/interno.ts:4-5`). CPF, CNPJ e telefone: só os dígitos (`interno.ts:9-10`).
- Erro de validação: lista de `{ campo, mensagem }`; a primeira mensagem vai para o topo da resposta
  (`legacy/core/src/resultado.ts:1-10`; ex.: `legacy/web/src/demo/apiLocal.ts:1430`).

### 6.4 Datas e fuso

- Fuso padrão da loja: `America/Sao_Paulo` (`legacy/core/src/venda.ts:95`). "Hoje" e o dia de cada venda, movimento e
  lançamento são calculados nesse fuso (`venda.ts:977-985`); período "de/até" é inclusivo nas duas pontas
  (`venda.ts:987-997`).
- Dia guardado como AAAA-MM-DD; data válida = existe no calendário (sem 30/02) (`legacy/core/src/compra.ts:119-127`); o
  movimento de estoque com data também exige o ano 2000 em diante (`legacy/core/src/estoque.ts:159-165`). Mostrar:
  "19/11/2026" (`compra.ts:129-130`). Somar dias em UTC (`legacy/core/src/financeiro.ts:237-241`).

---

## 7. Produtos e estoque

### 7.1 Cadastro de produto

Regras confirmadas pelo Luan em 11/11/2026, iguais ao DaniPets V9.2 (`legacy/core/src/produto.ts:5-16`).

| Campo | Regra | Mensagem | Fonte |
|---|---|---|---|
| nome | NFC, `trim()`; 1 a 120 caracteres; sem caractere de controle | "Informe o nome do produto." · "O nome pode ter até 120 caracteres." · "O nome contém caracteres inválidos." | `produto.ts:53-54,89-99` |
| codigoBarras | opcional; só dígitos (zeros à esquerda ficam), até 64; o `trim()` tira o `\r\n` do leitor | "O código de barras deve ser enviado como texto." · "O código de barras deve ter só números." · "O código de barras pode ter até 64 dígitos." | `produto.ts:55,70-72,101-114` |
| precoCentavos | inteiro, maior que zero, até o teto; no kg é o preço do quilo | "O preço deve ser um número inteiro de centavos." · "O preço de venda deve ser maior que zero. Brinde é lançado na venda (100% de desconto, com autorização do Dono)." · "Preço acima do limite permitido." | `produto.ts:74-75,116-122` |
| marca | opcional; NFC, espaços juntados; até 60 | "A marca deve ser um texto." · "A marca pode ter até 60 caracteres." · "A marca contém caracteres inválidos." | `produto.ts:60,124-134` |
| pesoGramas | opcional (0 = sem peso); inteiro de 0 a 1.000.000 g; só descreve o produto | "O peso vai de 0 a 1.000 kg, com até 3 casas (gramas)." | `produto.ts:30-31,61-62,136-143` |
| unidade | `un` (padrão) ou `kg`; precisa estar ligada nas regras da loja | "Escolha como o produto é vendido: por unidade (un) ou por quilo (kg)." · "Esta loja não vende por quilo. Ligue o kg em Produtos e estoque → Regras do estoque." · "Esta loja não vende por unidade." | `produto.ts:154-158`; `legacy/web/src/demo/apiLocal.ts:1003-1010` |
| estoqueInicial | opcional; inteiro de 0 a 9.999.999 na unidade do produto | "O estoque inicial é um número inteiro de unidades, de 0 em diante." (no kg: "O estoque inicial é um peso de 0 em diante (até 3 casas).") | `produto.ts:63-64,189-198` |
| custoInicialCentavos | opcional; inteiro ≥ 0 (0 = sem custo); só com estoque inicial; só Dono e Administrador (quem tem `produtos.alterar`) | "O custo do estoque inicial não pode ser negativo." · "Informe o custo só quando houver estoque inicial." · 403 "Custo do estoque inicial: só o Dono ou o Administrador." | `produto.ts:199-208`; `apiLocal.ts:1434-1437` |
| fornecedorId | opcional; fornecedor da loja e ativo | "Escolha o fornecedor na lista." · "Fornecedor não encontrado ou desativado. Escolha outro na lista." | `produto.ts:145-152`; `apiLocal.ts:1014-1020` |
| codigoInterno | nunca vem da tela | "O código interno é gerado pelo sistema." | `produto.ts:160-167` |
| outro campo | recusado | "Campo não permitido." | `produto.ts:160-167` |

Corpo que não é objeto: "Envie um objeto com os dados do produto." (`produto.ts:174`). O servidor antigo só aceitava
nome, código de barras e preço (o cadastro completo existia só na demonstração) (`produto.ts:12-15,169-183`;
`legacy/api/src/produtos/produtos.controller.ts:18-24`).

Ao cadastrar (`legacy/web/src/demo/apiLocal.ts:1425-1473`):
1. permissão `produtos.cadastrar` (Vendedor tem); valida; confere a unidade, o custo, o fornecedor e o limite de produtos
   ativos da loja (§5.4);
2. **código de barras** único na loja e diferente de qualquer código interno, porque o leitor da Frente de caixa aceita os
   dois: 409 "Código de barras repetido: <código> já está vinculado ao produto "<nome>"." (`apiLocal.ts:1021-1028`; a
   mesma mensagem no servidor, `legacy/api/src/produtos/produtos.service.ts:79-83`);
3. **produto parecido** (mesmo nome, mesma marca e mesmo peso, sem diferença de maiúsculas, de espaços ou de NFC): 409
   `produto_parecido` "Já existe produto com o mesmo nome, marca e peso: "<nome>" (código <código>)."; a tela pergunta e
   reenvia com `mesmoAssim` (`legacy/core/src/produto.ts:230-248`; `apiLocal.ts:1443-1446`);
4. **código interno**: o maior da loja + 1, com pelo menos 4 dígitos (0001, 0002, …, 9999, 10000), até 18 dígitos;
   pula o número que já é código interno ou de barras de outro produto, e o código de barras do próprio produto novo
   (`produto.ts:56-59,77-87`; `apiLocal.ts:458-472`). No servidor antigo, uma trava por loja
   (`pg_advisory_xact_lock(hashtextextended('produtos:codigos:<lojaId>', 0))`) dentro da transação evita dois
   cadastros com o mesmo código; colisão que escapa: 409 "Código já cadastrado nesta loja. Tente de novo."
   (`legacy/api/src/produtos/codigos.ts:9-48`; `produtos.service.ts:72`);
5. grava o produto ativo; se há estoque inicial, um movimento `inicial` com o custo (§7.3);
6. histórico `produto.criado` (`codigoInterno`, e `estoqueInicial`/`unidade` quando há).

Lista: em ordem de nome (pt-BR), com `temHistorico` (§7.4) (`apiLocal.ts:1416-1423`).

### 7.2 Alterar, inativar, reativar e excluir (`produtos.alterar`)

- **Alterar** (`legacy/core/src/produto.ts:42-51,213-228`; `legacy/web/src/demo/apiLocal.ts:1475-1514`): só os campos
  enviados (nome, código de barras, preço, marca, peso, unidade, fornecedor); o código interno nunca muda. Sem campo:
  "Nada para alterar."; corpo que não é objeto: "Envie um objeto com o que muda.". O que ficou igual não grava. Confere
  o fornecedor (se mudou), o código de barras (se mudou), a unidade (se mudou: precisa estar ligada e o produto não pode ter
  história, senão 409 "<nome> já tem vendas ou movimentos de estoque: a unidade não pode mudar (o saldo e as vendas estão
  em <kg|unidades>). Para vender de outro jeito, cadastre um produto novo e inative este.") e o produto parecido (se mudou
  nome, marca ou peso). Histórico: `produto.preco_alterado` (`de`, `para`) e/ou `produto.alterado` (`campos`).
- **Inativar/reativar** (`apiLocal.ts:1516-1532`): o inativo sai da Frente de caixa; reativar confere o limite de produtos
  ativos (§5.4); pedir o estado que já está não grava. Histórico `produto.inativado` / `produto.reativado`.
- **Excluir** (`apiLocal.ts:1534-1549`): só sem história; com história: 409 "<nome> tem vendas ou movimentos de estoque e
  não pode ser excluído. Use “Inativar”." (com as aspas curvas). Apaga junto o estoque inicial e o estoque mínimo.
  Histórico `produto.excluido` (`nome`, `codigo` = código de barras ou interno), sem alvo.
- Produto que não existe: 404 "Produto não encontrado." (`apiLocal.ts:998-1002,1483`).

### 7.3 Estoque por movimentos

O saldo é a soma dos movimentos; nada se apaga, corrige-se com ajuste (`legacy/core/src/estoque.ts:1-11,62-66`).

| Tipo | Nome na tela | Sinal | Quando | Fonte |
|---|---|---|---|---|
| `inicial` | Estoque inicial | + | cadastro com estoque inicial (motivo "Estoque inicial", com o custo) | `estoque.ts:184-200` |
| `entrada` | Entrada | + | lançada à mão | `estoque.ts:113-182` |
| `compra` | Compra | + | compra registrada (motivo "NF <nº>" ou "Compra", com o custo e o dia da compra) | `legacy/core/src/compra.ts:279-292` |
| `estorno_compra` | Compra estornada | − | estorno de item da compra | `compra.ts:358-369` |
| `ajuste` | Ajuste | ± | lançado à mão, ou baixa de lote vencido (motivo "Produto vencido") | `estoque.ts:113-182`; `compra.ts:597-611` |
| `venda` | Venda | − | cada item vendido, por quem vendeu | `estoque.ts:96-99` |
| `cancelamento` | Venda cancelada | + | volta tudo o que a venda tirou | `estoque.ts:101-104` |
| `devolucao` | Devolução | + | volta o item marcado "volta para a prateleira" (sem a marcação, volta) | `estoque.ts:106-111` |

Nomes em `estoque.ts:17-28`. Limites: quantidade e mínimo até 9.999.999; motivo até 200; observação até 300
(`estoque.ts:59-60`).

**Situação** (`estoque.ts:68-74`): negativo (< 0), zerado (= 0), baixo (no mínimo ou abaixo, com mínimo > 0), ok. Sem
mínimo, só zerado e negativo avisam.

**Venda sem estoque** (`estoque.ts:76-92`): soma as quantidades do mesmo produto na venda; faltando: "Estoque insuficiente
para <nome>. Disponível: <saldo, nunca abaixo de 0, com a unidade>.".

**Entrada e ajuste à mão** (`estoque.estoque.lancar`: Dono e Administrador) (`estoque.ts:113-157`;
`legacy/web/src/demo/apiLocal.ts:1874-1904`):
- campos: `produtoId`, `tipo` (`entrada` | `ajuste`), `quantidade`, `motivo`, `observacao`, `dia`; outro campo: "Campo não
  permitido."; corpo que não é objeto: "Envie um objeto com o movimento.";
- "Escolha o produto." · "Escolha entrada ou ajuste." · quantidade inteira, diferente de zero, até 9.999.999 em valor
  absoluto: "Informe uma quantidade inteira diferente de zero." · entrada negativa: "Entrada é sempre positiva. Para tirar
  do estoque, use ajuste.";
- ajuste exige motivo: "Informe o motivo do ajuste (ex.: perda, avaria, contagem)."; e o motivo tem de estar na lista da
  loja (§5.3): "Escolha o motivo do ajuste: <motivos separados por vírgula>." (`apiLocal.ts:1886-1888`); motivo até 200,
  sem controle: "O motivo pode ter até 200 caracteres." · "O motivo contém caracteres inválidos.";
- observação: texto, espaços juntados, até 300: "A observação deve ser um texto." · "A observação pode ter até 300
  caracteres." · "A observação contém caracteres inválidos.";
- dia: hoje ou antes: "Data inválida." · "Data no futuro não é permitida."; dia com o caixa já fechado pede a liberação de
  um Dono (§11); só grava o `dia` quando não é hoje (`estoque.ts:167-182`);
- o resultado não pode deixar o saldo negativo: 409 "O ajuste deixaria o saldo de <nome> negativo (saldo atual <saldo>)."
  (vale também para entrada, que nunca deixa);
- histórico `estoque.entrada` ou `estoque.ajuste` (`quantidade`, `unidade`, `motivo`, `observacao`, `dia` quando não é
  hoje); devolve o saldo novo.

**Estoque mínimo** (`estoque.lancar`) (`estoque.ts:243-250`; `apiLocal.ts:1906-1919`): inteiro de 0 a 9.999.999 na
unidade do produto; 0 ou vazio = sem aviso; fora disso: "O estoque mínimo deve ser um número de 0 em diante.". Histórico
`estoque.minimo` (`minimo`, `unidade`).

**Composição do saldo** ("Como o saldo é calculado", DaniPets PRD-09) (`estoque.ts:202-233`): inicial + compras (menos as
estornadas) + entradas − vendas + cancelamentos + devoluções ± ajustes.

**Lista do estoque** (`apiLocal.ts:1846-1866`): saldo, mínimo e situação de cada produto; o **custo médio** só vai para
quem tem a permissão `compras` (o Vendedor não vê custo), arredondado para centavos inteiros.

**Movimentos** (`apiLocal.ts:1868-1872`): qualquer logado; filtro por produto e período (pelo `dia`, ou pelo dia de
`criadoEm` no fuso); mais novos primeiro.

### 7.4 Produto com história

Tem história quem tem qualquer movimento que não seja o `inicial`, ou aparece em alguma venda. Com história: não exclui
(só inativa) e não muda de unidade (`legacy/core/src/estoque.ts:235-241`).

### 7.5 Custo médio móvel (DaniPets replayCosts)

Refaz os movimentos em ordem de `criadoEm`: compra e estoque inicial com custo > 0 e quantidade > 0 mexem na média
(`(q × média + quantidade × custo) / (q + quantidade)`; sem média ou com q ≤ 0, a média vira o custo); os outros
movimentos só mexem na quantidade; o item de compra estornado sai da conta (a compra e o estorno dela são ignorados).
Resultado em centavos com fração por unidade ou por kg; null = nunca teve custo (`legacy/core/src/compra.ts:511-531`).

---

## 8. Fornecedores

Cadastro simples por loja (decisão P9 do Luan; no DaniPets era texto livre) (`legacy/core/src/fornecedor.ts:1-8`).
Quem cuida: permissão `compras` (Dono e Administrador) (`fornecedor.ts:8`;
`legacy/web/src/demo/apiLocal.ts:3164-3223`).

| Campo | Regra | Mensagem | Fonte |
|---|---|---|---|
| nome | NFC, espaços juntados; 2 a 120; sem controle | "Informe o nome do fornecedor." · "O nome pode ter até 120 caracteres." · "O nome contém caracteres inválidos." | `fornecedor.ts:31,54,72-75` |
| documento | opcional; CNPJ (14 dígitos) ou CPF (11), dígitos verificadores certos, não todos iguais; guardado só com os dígitos | "Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números)." | `fornecedor.ts:33-44,77-83` |
| telefone | opcional; com DDD, 10 ou 11 dígitos (§12) | "Telefone com DDD: 10 ou 11 números." | `fornecedor.ts:84-89` |
| contato | opcional; até 80 | "Envie um texto." · "Use até 80 caracteres." · "O texto contém caracteres inválidos." | `fornecedor.ts:56-66,90` |
| observacao | opcional; até 300 | as mesmas | `fornecedor.ts:91` |
| outro campo | recusado | "Campo não permitido." | `fornecedor.ts:71` |

- Corpo que não é objeto: "Envie um objeto com os dados do fornecedor." (`fornecedor.ts:69`).
- O mesmo documento não se repete na loja: 409 "Este documento já é do fornecedor "<nome>"." (`fornecedor.ts:95-102`).
- CNPJ: pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,3,2,9,8,7,6,5,4,3,2; resto < 2 → 0, senão 11 − resto
  (`fornecedor.ts:37-43`). Mostrar: "12.345.678/0001-95" ou "529.982.247-25" (`fornecedor.ts:46-52`).
- Alterar envia o cadastro inteiro (a mesma validação); só grava se algo mudou; histórico `fornecedor.alterado`
  (`campos`). Cadastrar: `fornecedor.cadastrado`. Desativar/reativar: `fornecedor.desativado` / `fornecedor.reativado`;
  o desativado some das listas de escolha (compra e produto), e o que já aponta para ele continua
  (`fornecedor.ts:7`; `apiLocal.ts:3170-3223`). Não existe: 404 "Fornecedor não encontrado.".
- Lista: ativos primeiro, depois por nome (pt-BR) (`apiLocal.ts:3164-3168`).

---

## 9. Compras e contas a pagar

Regras do DaniPets V9.3.3, CMP-01 a 09, PRD-10 e 11 (`legacy/core/src/compra.ts:1-18`). Quem: permissão `compras`; a
compra nova exige o recurso Compras ligado (§5.4) (`legacy/web/src/demo/apiLocal.ts:2963-2967`).

### 9.1 Registrar a compra (por nota fiscal)

Campos (`compra.ts:134-200`):

| Campo | Regra | Mensagem |
|---|---|---|
| fornecedorId | opcional; fornecedor da loja e ativo | "Fornecedor não encontrado ou desativado. Escolha outro na lista." (`apiLocal.ts:2972-2976`) |
| notaFiscal | opcional; espaços juntados; até 60, sem controle | "O número da nota pode ter até 60 caracteres." · "O número da nota contém caracteres inválidos." |
| data | AAAA-MM-DD válida, hoje ou antes | "Informe a data da compra." · "A data da compra não pode ser depois de hoje." |
| itens | 1 a 200 | "Inclua pelo menos um produto na compra." · "Uma nota pode ter até 200 itens." · "Item inválido." |
| itens.N.produtoId | obrigatório; produto ativo da loja | "Item N: escolha o produto." · "Item N: produto não encontrado ou inativo." |
| itens.N.quantidade | inteira, > 0, até 10 × o máximo da venda na unidade (99.990 un ou 9.999,99 kg) | "Item N: informe a quantidade." · "<nome>: quantidade acima do limite (<máximo>)." |
| itens.N.custoCentavos | inteiro > 0 por unidade ou por kg | "Item N: informe o custo unitário (maior que zero). Mercadoria de bonificação: lance como entrada de estoque (Produtos e estoque)." |
| itens.N.validade | opcional; data válida | "Item N: validade inválida." |
| pagamento | `{ tipo: 'avista', conta: 'caixa' \| 'banco' }` ou `{ tipo: 'aprazo', vencimento }` | "Escolha à vista ou a prazo." · "Escolha a conta de pagamento." · "Informe o vencimento da compra a prazo." |
| precos | opcional; `{ produtoId: novo preço }`, só de produto da compra, > 0 | "Envie os preços novos por produto." · "Só muda o preço de produto que está na compra." · "Informe o novo preço de venda (maior que zero)." |
| outro campo | recusado | "Campo não permitido." (também dentro do item) |

Corpo que não é objeto: "Envie um objeto com a compra.". Total do item = valor da quantidade ao custo (§6.2); total da
nota acima do teto: "Total da compra acima do limite permitido." (`compra.ts:202-232`). "Item N" numera a partir de 1.

Passos (`apiLocal.ts:2963-3037`):
1. valida; monta os itens; data de um dia com o caixa já fechado pede a liberação de um Dono (§11), com a frase "compra de
   <nome>" (1 item) ou "compra de <n> itens"; à vista com a data de hoje exige o caixa de hoje não fechado (§11);
2. **nota repetida**: a mesma nota (sem diferença de maiúsculas) do mesmo fornecedor (ou das duas sem fornecedor), com
   algum item ainda valendo: 409 `nf_repetida` "Já existe a NF <nº> de <fornecedor> (compra nº <n>)." (sem fornecedor, sem
   o " de ..."); a tela pergunta e reenvia com `mesmoAssim` (`compra.ts:240-245`);
3. número sequencial da loja (o maior + 1);
4. efeitos (`compra.ts:273-334`): cada item entra no estoque como `compra` (dia = data da compra, motivo "NF <nº>" ou
   "Compra", custo, compra e linha); **à vista**: lançamento `pagamento_compra` negativo na conta escolhida, no dia da
   compra; **a prazo**: uma conta a pagar aberta com o total e o vencimento;
5. à vista: a saída não pode passar do saldo da conta, e, com a data de hoje pelo Caixa físico com o caixa aberto, não pode
   passar do dinheiro esperado na gaveta (§15) (`apiLocal.ts:3004-3009`);
6. **preço novo junto** (custo mudou, DaniPets CMP-04): exige também `produtos.alterar`; muda o preço dos produtos
   indicados (se diferente) e registra `produto.preco_alterado` (`de`, `para`, `compra`) para cada um
   (`apiLocal.ts:3013-3026`). A tela mostra custo, preço e margem; o preço sugerido mantém a margem: `max(1, round(preço ×
   custo novo / custo antigo))`; margem = (preço − custo) / preço × 100 (`compra.ts:260-265`); custo antigo = o da última
   compra valendo do produto (`compra.ts:247-258`);
7. histórico `compra.registrada` (`numero`, `notaFiscal`, `totalCentavos`, `pagamento`, `dia` quando não é hoje) e, com
   liberação, `dia_fechado.liberado`.

Descrição usada no lançamento e na conta a pagar (até 120 caracteres): 1 item = "Compra <produto> • NF <nº> •
<fornecedor>" (sem nota, sem o trecho da NF); vários = "Compra NF <nº ou 'sem número'> • <n> itens • <fornecedor>"; sem
fornecedor = "sem fornecedor" (`compra.ts:267-271`).

Lista: filtro de/até pela data; mais nova primeiro, depois maior número (`apiLocal.ts:2955-2961`).

### 9.2 Estornar um item (compra lançada errada)

(`legacy/core/src/compra.ts:336-403`; `legacy/web/src/demo/apiLocal.ts:3039-3069`)
- "Compra não encontrada." (404) · "Item da compra não encontrado." · "Este item já foi estornado." · motivo obrigatório
  ("Informe o motivo do estorno."), até 200 sem controle ("O motivo pode ter até 200 caracteres.").
- Não pode deixar o estoque negativo: "O estorno deixaria o estoque de <nome> negativo (saldo atual <saldo>). Se parte da
  mercadoria já foi vendida, corrija com um ajuste de estoque.".
- Efeitos: movimento `estorno_compra` com a quantidade do item; o dinheiro: à vista → volta para a conta de onde saiu
  (lançamento `estorno_compra`, "Estorno da compra <produto> • NF <nº>"); a prazo já paga → volta para a conta do
  pagamento; a prazo aberta → a conta a pagar diminui o total do item (com o ajuste "Estorno do item <produto> •
  <motivo>") e fica cancelada se zerar; a prazo cancelada → nada.
- Se o dinheiro volta (há lançamento), o caixa de hoje não pode estar fechado (§11).
- Histórico `compra.estornada` (alvo: o produto; `numero`, `valorCentavos`).

### 9.3 Lotes e validade

- Regra "o mais antigo sai primeiro": o saldo de hoje pertence às compras mais novas; o saldo é repartido da compra mais
  recente para a mais antiga (por data, depois `criadaEm`, depois linha), só itens valendo (`compra.ts:533-551`).
- Vencendo = validade até hoje + 30 dias (`DIAS_AVISO_VALIDADE`, DaniPets: 30), sem baixa e com algo do lote ainda no
  estoque; vencido = validade antes de hoje; em ordem de validade (`compra.ts:29-30,553-575`;
  `apiLocal.ts:3130-3135`).
- **Dar baixa no lote** (`compra.ts:577-615`; `apiLocal.ts:3137-3161`): "Lote não encontrado." · "Este lote já teve
  baixa." · quantidade inteira ≥ 0 ("Quantidade inválida."), até o saldo do produto ("O saldo de <nome> é <saldo>: não dá
  para baixar <quantidade>.") · observação até 300 ("A observação pode ter até 300 caracteres."). Com quantidade > 0, sai
  do estoque como `ajuste` "Produto vencido", observação "baixa do lote de <dd/mm/aaaa> (validade <dd/mm/aaaa>) •
  <observação>". Quantidade 0 marca a baixa sem movimento. Histórico `compra.lote_baixado` (`quantidade`, `unidade`).

### 9.4 Contas a pagar

- Situações: `aberta`, `paga`, `cancelada` (`compra.ts:99-117`). Vêm da compra a prazo ou são avulsas.
- **Conta avulsa** (Financeiro: aluguel, energia, boleto) — permissão `financeiro` e recurso Financeiro ligado
  (`compra.ts:449-496`; `apiLocal.ts:3091-3104`): descrição de 2 a 120 ("Descreva a conta (ex.: Aluguel de dezembro)." ·
  "Use até 120 caracteres."); valor > 0 ("Informe um valor maior que zero."); vencimento válido ("Informe o
  vencimento.") de um ano atrás a dez anos à frente ("Vencimento fora do prazo aceito (de um ano atrás a dez anos à
  frente)."); categoria opcional, até o limite das categorias (§15) ("Use até <n> caracteres."); outro campo: "Campo não
  permitido."; corpo que não é objeto: "Envie um objeto com a conta a pagar.". Histórico `conta_pagar.criada`
  (`valorCentavos`, `vencimento`, `categoria`).
- **Pagar** — permissão `financeiro`; o caixa de hoje não pode estar fechado (§11) (`compra.ts:405-447`;
  `apiLocal.ts:3106-3128`): "Conta a pagar não encontrada." (404) · "Esta conta já foi paga." · "Esta conta foi cancelada
  (compra estornada)." · "Escolha a conta de pagamento."; pelo Caixa físico com o caixa aberto, não passa do esperado na
  gaveta (mensagem da gaveta, §15); sem caixa aberto, não passa do saldo do Caixa físico: "O valor (<valor>) é maior que o
  saldo do <nome do caixa> (<saldo, nunca abaixo de 0>)." (com o nome que a loja deu à conta). Lançamento
  `pagamento_conta` negativo com a descrição e a categoria da conta. Histórico `conta_pagar.paga` (`valorCentavos`,
  `conta`).
- Resumo: total em aberto, quantas, total e quantidade das vencidas (vencimento antes de hoje) (`compra.ts:498-508`).
- Lista: filtro por situação; ordem de vencimento, depois `criadoEm` (`apiLocal.ts:3071-3077`).
