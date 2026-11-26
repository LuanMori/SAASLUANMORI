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

**Entrada e ajuste à mão** (`estoque.lancar`: Dono e Administrador) (`estoque.ts:113-157`;
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

---

## 10. Vendas (Frente de caixa)

Regras do DaniPets V9.3.3 (`legacy/core/src/venda.ts:1-25`). Venda só na demonstração: o servidor antigo não tinha
vendas (§2 de `02-MAPA-DE-FUNCIONALIDADES.md`).

### 10.1 Formas de pagamento

| Forma | Nome | Como entra | Fonte |
|---|---|---|---|
| `dinheiro` | Dinheiro | botão; pede o valor recebido e calcula o troco | `venda.ts:36-48` |
| `pix` | Pix | botão | idem |
| `debito` | Cartão de débito | botão | idem |
| `credito` | Cartão de crédito | botão | idem |
| `vale` | Vale-troca | botão "Usar vale-troca"; cada vale é uma parte; vale com ou sem cliente | `venda.ts:50-58,128-131` |
| `cashback` | Cashback | botão "Usar cashback"; só com cliente identificado | `venda.ts:50-61` |
| `fiado` | Fiado | botão; só com cliente identificado e o recurso Fiado ligado | `venda.ts:60-65`; `legacy/web/src/demo/apiLocal.ts:1575-1576` |

- Ordem fixa (a do DaniPets): dinheiro, pix, débito, crédito, vale, cashback, fiado; a venda grava os pagamentos nessa
  ordem, não na digitada; partes na mesma forma se somam; o mesmo vale duas vezes soma (`venda.ts:35-36,469-508,545-549`).
- Sem cliente: "Venda no fiado precisa de cliente identificado. Identifique o cliente (F6)." · "O cashback precisa de
  cliente identificado. Identifique o cliente (F6)." (`venda.ts:63-65`).
- Descrição: "Pix" numa forma só; "Dinheiro R$ 10,00 + Pix R$ 22,40" no dividido; "Vale-troca VT-0001-ABC" no vale; sem
  pagamento: "Sem pagamento (brinde)" (`venda.ts:300-308`). Número da venda: "#00012" (`venda.ts:295-298`).

### 10.2 O pedido da Frente de caixa (`validarNovaVenda`, `venda.ts:376-553`)

- Campos: `itens`, `pagamentos`, `recebidoDinheiroCentavos`, `clienteId`, `liberacaoFiado`. Recusas próprias:
  `vendedor` → "Quem vendeu é sempre quem está logado."; campo que começa com `cliente` → "O cliente vem do cadastro: envie
  só o clienteId."; outro → "Campo não permitido."; no item, campo com "preco" → "O preço vem do cadastro do produto."
  (`venda.ts:18-23,377-380,392-394,407-409`). Corpo que não é objeto: "Envie um objeto com os dados da venda.".
- Itens: "Adicione pelo menos um produto à venda." · "Item inválido." · "Produto inválido." (vazio ou id > 64) · "A
  quantidade deve ser um número inteiro maior que zero.". O mesmo produto repetido sem desconto nem cupom soma numa linha
  (o leitor bipa várias vezes); repetido com desconto ou cupom: "Produto repetido na venda: junte as quantidades numa
  linha só.". Soma acima de 999.999: "Quantidade acima do limite num mesmo produto (<id>).". Mais de 200 produtos
  diferentes: "Uma venda pode ter até 200 produtos diferentes." (`venda.ts:75-86,396-467`).
- Desconto do item `{ precoFinalCentavos, motivo, autorizacao? }`: "Desconto inválido." · "O preço final deve ser em
  centavos, zero ou mais." · "Informe o motivo do desconto." · "O motivo pode ter até 200 caracteres." · "O motivo contém
  caracteres inválidos." · "Autorização inválida." (texto > 100 ou com controle) (`venda.ts:310-328,420-434`).
- Cupom do item (id do cupom de retorno): "Cupom inválido." · com desconto no mesmo item: "Use o cupom de retorno ou o
  desconto manual, não os dois no mesmo item." (`venda.ts:435-447`).
- Pagamentos: lista obrigatória ("Informe a forma de pagamento."), até 8 partes ("O pagamento pode ser dividido em até 8
  partes."); "Pagamento inválido." · "Escolha a forma de pagamento." · "O valor de cada parte deve ser maior que zero." ·
  vale sem `valeId`: "Escolha o vale-troca." · `valeId` em outra forma: "Só o vale-troca leva o vale."
  (`venda.ts:469-508`).
- `recebidoDinheiroCentavos`: inteiro de 0 ao teto ("Valor recebido inválido."); `clienteId`: texto até 64 sem controle
  ("Cliente inválido."); `liberacaoFiado` `{ autorizacao, motivo }`: motivo NFC, espaços juntados, 1 a 200 ("Liberação do
  fiado inválida: informe o motivo.") (`venda.ts:510-536`).
- Erro de validação na demonstração: 400 "Dados da venda inválidos." com a lista (`apiLocal.ts:1573-1574`).

### 10.3 O cálculo (`calcularVenda`, `venda.ts:555-763`)

1. Cada item sai do cadastro: nome, código interno, preço de tabela e unidade da hora da venda; produto que não existe ou
   está inativo: "Produto não encontrado ou desativado."; acima do máximo da unidade: "Quantidade acima de 9999 unidades num
   mesmo produto (<nome>)." ou "Quantidade acima de 999,999 kg de <nome> numa venda." (`venda.ts:607-620`).
2. **Cupom de retorno**: vale só o cupom ativo do cliente identificado desta venda; preço = `round(preço × (10000 −
   round(pct × 100)) / 10000)`; precisa ficar menor que o de tabela; senão: "O cupom de retorno de <nome> não vale para esta
   venda. Identifique o cliente de novo."; motivo gravado "Cupom de retorno <pct com vírgula>%", responsável = quem vende
   (`venda.ts:67-73,623-633`).
3. **Desconto manual** (`venda.ts:336-374,634-666`): classificação pelo preço final:
   - igual ao de tabela, maior, negativo ou não inteiro → "O preço final de <nome> deve ser menor que o preço de tabela (0
     para brinde).";
   - 0 → **brinde** (100%): quem não tem a permissão `brinde` (só Dono e Adm. Sup) precisa da autorização de um Dono;
   - % = (tabela − final) / tabela × 100; até o limite da loja (regra `venda.descontoSemSenhaPct`, padrão 10, com folga de
     1e-9) → **dentro do limite**, sem senha;
   - acima → quem não tem `desconto.acima_do_limite` precisa da autorização do Dono ou do Administrador;
   - a autorização serve se: existe, é desta loja, tem até 4 horas (`VALIDADE_AUTORIZACAO_HORAS`), quem autorizou
     "atende" (para brinde, pode `brinde`; para acima do limite, pode `desconto.acima_do_limite` e `estorno`), é do tipo
     `desconto`, do mesmo produto e com preço final autorizado ≤ o pedido (no brinde, exatamente 0); senão: "O brinde de
     <nome> precisa da autorização de um Dono. Aplique o desconto de novo." ou "O desconto de <nome> passa de <limite com
     vírgula>% e precisa da autorização do Dono ou do Administrador. Aplique o desconto de novo.";
   - grava o motivo, o responsável (quem autorizou, ou a própria pessoa) e se foi com senha.
4. Subtotal = valor da quantidade ao preço cobrado (§6.2); desconto da venda = soma de (valor ao preço de tabela −
   subtotal); total acima do teto: "Total da venda acima do limite permitido."; o item guarda o custo médio da hora
   (arredondado), para o lucro (`venda.ts:667-686`).
5. Estoque para todos os itens (§7.3) (`venda.ts:689-693`).
6. Cliente: do cadastro, ativo; senão "Cliente não encontrado. Identifique o cliente de novo (F6) ou tire o cliente da
   venda." (`venda.ts:695-703`).
7. Fiado/cashback sem cliente: as mensagens de 10.1. Cashback acima do saldo do cliente hoje: "O cashback disponível de
   <cliente> é <valor>." (`venda.ts:704-712`).
8. Vale: em aberto e com saldo: "Vale-troca inválido ou já usado. Remova o vale do pagamento." · "O vale <código> tem
   saldo de <saldo>." (`venda.ts:713-721`).
9. Pagamentos: total > 0 sem pagamento: "Informe a forma de pagamento."; soma diferente do total: "Os pagamentos somam
   <pago>, e a venda é <total>."; com parte em dinheiro, o recebido precisa ser ≥ a parte: "Informe o valor recebido em
   dinheiro (igual ou maior que <parte>)."; troco = recebido − parte em dinheiro (`venda.ts:723-747`). Venda de brinde
   (total 0) passa sem pagamento.
10. Na demonstração, os erros do cálculo saem como 409 com a primeira mensagem (`apiLocal.ts:1597`).

### 10.4 Registrar a venda (`legacy/web/src/demo/apiLocal.ts:1566-1699`)

1. Qualquer logado (sem permissão própria além do acesso à Frente de caixa); o caixa de hoje precisa estar aberto, com
   responsável (§11) — 409 `caixa`.
2. Valida (10.2); fiado exige o recurso Fiado ligado (§5.4).
3. Busca o cupom ativo do cliente, o saldo de cashback, os vales e os custos; calcula (10.3).
4. **Fiado** (§12): exige o cadastro completo do cliente (nome, telefone e CPF): 409 "Fiado só com o cadastro completo do
   cliente (nome, telefone e CPF)."; acima do limite ou com fiado vencido (quando a regra pede o Dono): 409
   `fiado_liberacao`, que só passa com a liberação de um Dono para este cliente e este valor.
5. As autorizações usadas são apagadas (uso único), inclusive a do fiado.
6. Número sequencial da loja (o maior + 1); grava quem vendeu (a pessoa logada), o cliente, os itens, total, desconto,
   pagamentos, recebido, troco, `status: 'finalizada'`, o caixa do dia e a liberação do fiado.
7. Efeitos (tudo na mesma gravação): cashback usado sai dos lotes do cliente (o que vence antes primeiro) e a compra gera
   o cashback dela se a Fidelidade estiver ligada (§13); cupom usado fica marcado (`cliente.cupom_usado`); saldo dos vales
   usados diminui (§14); estoque sai (`venda`); lançamentos e recebíveis do financeiro (§15), com a baixa automática do
   cartão quando o Dono escolheu.
8. Histórico: `venda.fiado_liberado` (`numero`, `valorCentavos`, `autorizadoPor`) e, com desconto, `venda.desconto`
   (`numero`, `descontoCentavos`, `brinde`, `autorizadoPor`).

Listar vendas (`apiLocal.ts:962-968,1552-1556`): período de/até no fuso; quem não tem `relatorios` (o Vendedor) só pede
hoje: 403 "Vendas de outros dias: só o Dono ou o Administrador (Relatórios)."; mais novas primeiro. Buscar pelo número:
404 "Venda não encontrada." (`apiLocal.ts:1558-1564`).

### 10.5 Autorização com senha (desconto, brinde, cancelamento, devolução e as liberações do Dono)

- Quem aparece para autorizar: usuários ativos da loja (fora o Adm. Sup) que têm `desconto.acima_do_limite`
  (`legacy/web/src/demo/usuariosDemo.ts:332-339`).
- Conferir (`usuariosDemo.ts:341-366`; `apiLocal.ts:1707-1725`): escolhido inválido: 403 "Escolha quem vai autorizar (Dono
  ou Administrador ativo)."; bloqueado: 429 com a mensagem de bloqueio do login; senha errada: 403 "Senha incorreta.", e
  conta como tentativa errada do login dele (5 erradas bloqueiam por 5 minutos, com `sessao.senha_errada` /
  `sessao.bloqueado` no histórico) (§1.4); a senha certa zera as tentativas.
- Recusas por ação: brinde (preço final 0) sem `brinde`: 403 "Brinde só com a autorização de um Dono."; `dia_fechado` sem
  `dia_fechado.liberar`: 403 "Lançamento em dia com o caixa já fechado: só com a liberação de um Dono."; `fiado` sem
  `fiado.liberar`: 403 "Fiado acima do limite ou vencido: só com a liberação de um Dono."; `excluir_dados_cliente` sem
  `clientes.excluir_dados`: 403 "Excluir os dados de um cliente: só com a liberação de um Dono.".
- A autorização guarda quem autorizou, a ação exata (`desconto` com produto e preço final; `cancelamento`/`devolucao`
  com a venda; `retirada` com o valor; `fechamento` com o dia e o contado; `dia_fechado` com o dia; `fiado` com o cliente
  e o valor; `excluir_dados_cliente` com o cliente) e quando (`legacy/core/src/venda.ts:262-288`). Fica só na memória
  (recarregar a página perde), por loja; vale 4 horas; é gasta no uso (`apiLocal.ts:568-570,986`; `venda.ts:91-92`).
  Na reconstrução: guardar no servidor (tabela com loja, expiração e uso único) — decisão para o
  `06-RISCOS-E-DECISOES.md`.

### 10.6 Cancelar a venda inteira

(`legacy/core/src/venda.ts:765-774,831-838,888-927`; `legacy/web/src/demo/apiLocal.ts:1727-1762`)
- Pedido `{ motivo, autorizacao? }`: "Envie um objeto com o motivo." · "Informe o motivo do cancelamento." (até 200, sem
  controle).
- "Esta venda já foi cancelada."; só no mesmo dia (no fuso) e sem devolução: "Cancelar a venda inteira só é possível no
  mesmo dia e sem devoluções. Use "Devolver itens"."; só com o caixa daquela venda aberto (venda sem caixa: basta o de hoje
  aberto): "Cancelar a venda inteira só com o caixa daquela venda aberto. Use "Devolver itens"." (DaniPets canCancelSale).
- Quem não tem `estorno` (o Vendedor) precisa da autorização do Dono ou do Administrador para esta venda: "O cancelamento
  precisa da autorização do Dono ou do Administrador.".
- Tudo volta pelas mesmas formas da venda; o que foi pago com vale volta para o mesmo vale; estoque volta
  (`cancelamento`); financeiro desfeito (§15); cashback usado volta como lote novo e o gerado sai; o cupom usado volta a
  valer (§13).
- Grava `status: 'cancelada'` e o cancelamento (quando, quem, quem autorizou, motivo, estornos). Histórico
  `venda.cancelada` (`numero`, `valorCentavos`, `autorizadoPor`).

### 10.7 Devolver itens

(`legacy/core/src/venda.ts:776-810,817-874,929-974`; `legacy/web/src/demo/apiLocal.ts:1764-1837`)
- Pedido `{ itens: [{ linha, quantidade, voltaAoEstoque? }], motivo, autorizacao?, modo?, clienteDoVale? }`: "Envie um
  objeto com os itens e o motivo." · "Escolha o que vai ser devolvido." · "Item inválido." · "Marque se o item volta para o
  estoque." · nenhuma quantidade > 0: "Informe a quantidade de pelo menos um item." · "Informe o motivo da devolução." ·
  `modo` `mesma` (padrão) ou `vale`: "Escolha como o valor volta para o cliente." · "Cliente inválido." · cliente do vale
  fora do modo vale: "O cliente do vale só vale na devolução como vale-troca.".
- Modo vale exige o recurso Vale-troca ligado (§5.4); o caixa de hoje não pode estar fechado (§11).
- "Esta venda foi cancelada." · "Item da venda não encontrado." · "Item repetido na devolução." · acima do que resta: "De
  <nome> ainda dá para devolver no máximo <quantidade>.".
- Valor de cada item: pelo preço cobrado; no kg, a diferença entre o já devolvido com e sem esta parte (devolver tudo aos
  poucos dá o subtotal exato).
- Quem não tem `estorno` precisa da autorização: "A devolução precisa da autorização do Dono ou do Administrador.".
- **Pelas mesmas formas**: reparte o valor na proporção do que cada forma ainda pode devolver (pago menos já devolvido),
  arredondando para baixo e completando pelas maiores; acima do disponível: "Só <valor> desta venda ainda pode voltar pela
  mesma forma de pagamento.". Em dinheiro, o caixa de hoje precisa estar aberto ("Devolução em dinheiro", §11) e não passar
  do esperado na gaveta (§15).
- **Como vale-troca** (DaniPets planRefund/DEV-03): abate antes o fiado desta venda ainda em aberto (até o que o fiado
  ainda pode devolver); o resto vira um vale novo. Dono do vale: o cliente escolhido (ativo, não excluído: senão 404
  "Cliente do vale não encontrado. Escolha outro ou deixe o da venda."), ou o da venda, ou ninguém (vale para quem tiver o
  código) (§14).
- Número da devolução: sequencial da loja (o maior entre todas as vendas + 1); grava itens, total, estornos, vale, motivo,
  quem fez e quem autorizou. Estoque volta só do que volta para a prateleira (`devolucao`). Histórico `venda.devolucao`
  (`numero`, `devolucao`, `valorCentavos`, `autorizadoPor`) e `vale.emitido` (alvo: o cliente do vale; `codigo`,
  `valorCentavos`, `numero`).

### 10.8 Resumos de vendas (Visão geral e Relatórios)

(`legacy/core/src/venda.ts:999-1091`)
- Só finalizadas entram no total; canceladas só contam em "canceladas". Itens vendidos em unidades e em gramas separados
  ("un + kg"); ticket médio = `round(total / quantidade)` (0 sem vendas).
- Por forma: só as formas usadas, na ordem fixa; no dividido, cada parte na sua forma; a quantidade conta a venda uma vez
  por forma. Por vendedor: do maior total para o menor, empate por nome (pt-BR).
- Devoluções de um período: pela data da devolução, com o número da venda, quem vendeu, o cliente e as formas da venda
  (`apiLocal.ts:1839-1843`, mesma regra do Vendedor só hoje).

---

## 11. Caixa do dia

Regras do DaniPets V9.3.3, CX-01 a 08, PDV-12 e DEV-05 (`legacy/core/src/caixa.ts:1-24`). Só na demonstração (o servidor
antigo não tinha caixa).

### 11.1 Situação

- Um caixa por loja por dia (no fuso da loja); estados do dia de hoje: `nao_aberto`, `aberto`, `fechado`; "atrasado" = o
  dia mais antigo antes de hoje ainda aberto; "último dia fechado" = o maior dia com fechamento (`caixa.ts:123-146,
  170-179`).
- **Dia travado** (DaniPets lockedDay): antes de hoje e até o último dia fechado (`caixa.ts:181-185`).
- Travas usadas pelas outras operações:
  - vender (PDV-12) — fechado: "O caixa de hoje já foi fechado. Para vender hoje, o Dono ou o Administrador pode desfazer
    o fechamento em Caixa do dia."; não aberto: "Abra o caixa de hoje (Caixa do dia) antes de vender." (`caixa.ts:187-192`);
  - lançar hoje (pagar conta, devolver, lançamento do Financeiro, estorno de compra que devolve dinheiro, compra à vista com
    a data de hoje, receber fiado) — fechado: "O caixa de hoje já foi fechado: não é possível lançar hoje. O Dono ou o
    Administrador pode desfazer o fechamento em Caixa do dia." (DaniPets assertOpen) (`caixa.ts:194-200`);
  - dinheiro que entra ou sai da gaveta pela tela (devolver em dinheiro, receber em dinheiro): a trava acima e, sem caixa
    aberto, "<O que>: abra o caixa de hoje (Caixa do dia) primeiro." (ex.: "Devolução em dinheiro: …") (`caixa.ts:202-208`).
  Todas saem como 409 com `codigo: caixa` (`legacy/web/src/demo/apiLocal.ts:1054-1059,1571`).

### 11.2 Abrir (`caixa`)

(`caixa.ts:210-233`; `apiLocal.ts:2814-2827`)
- Campos `fundoCentavos` (inteiro ≥ 0: todo o dinheiro que está na gaveta agora) e `observacao` (opcional, até 200,
  espaços juntados); outro campo: "Campo não permitido."; corpo que não é objeto: "Envie um objeto com a abertura.".
- "O caixa de hoje já está aberto." · "O caixa de hoje já foi fechado. O Dono ou o Administrador pode desfazer o
  fechamento." · "Feche o caixa de <dd/mm/aaaa> antes de abrir o de hoje." (409) · "Informe o fundo de troco (todo o
  dinheiro que está na gaveta agora)." · "A observação deve ser um texto." / "A observação pode ter até 200
  caracteres." / "A observação contém caracteres inválidos." (400).
- Quem abre é o responsável. Histórico `caixa.aberto` (`dia`, `fundoCentavos`).

### 11.3 Gaveta e resumo do dia

- **Esperado na gaveta** = fundo + entradas − saídas do Caixa físico no dia do caixa, lançadas depois da abertura; ficam
  fora o saldo inicial de implantação (`saldo_inicial`) e o ajuste do fechamento (`ajuste_caixa`) (`caixa.ts:235-260`).
- Resumo guardado no fechamento: vendas do dia por forma (sem as canceladas), entradas, saídas, sangrias, retiradas,
  suprimentos e dinheiro devolvido a clientes (`estorno_venda`) (`caixa.ts:57-69,262-286`).
- **Ninguém tira da gaveta mais do que o esperado** (DaniPets CX-07): "O valor (<valor>) é maior que o dinheiro esperado na
  gaveta (<esperado, nunca abaixo de 0>). Confira o valor digitado. Se entrou dinheiro sem registro, lance um suprimento
  antes."; sem caixa aberto, a saída do Caixa físico não passa do saldo dele: "O valor (<valor>) é maior que o saldo do
  <nome do caixa> (<saldo>). Confira o valor digitado." (o Banco pode ficar negativo) (`legacy/core/src/financeiro.ts:
  614-642`).

### 11.4 Sangria, retirada do dono e suprimento (`caixa`)

(`caixa.ts:288-344`; `apiLocal.ts:2829-2858`)

| Tipo | Nome | Lançamentos | Descrição |
|---|---|---|---|
| `sangria` | Sangria (depositar no banco) | − no Caixa físico (`sangria`) e + na Conta bancária (`deposito_sangria`) | "Sangria • <descrição>" / "Sangria do caixa • <descrição>" |
| `retirada` | Retirada do dono (levou para casa) | − no Caixa físico (`retirada`), com quem autorizou | "Retirada do dono (gaveta) • <descrição>" |
| `suprimento` | Suprimento (pôr na gaveta) | + no Caixa físico (`suprimento`) | "Suprimento • <descrição>" |

- Campos `tipo`, `valorCentavos` (> 0), `descricao` (obrigatória, até 120), `autorizacao`: "Escolha sangria, retirada do
  dono ou suprimento." · "Informe o valor." · "Descreva a operação (ex.: levou ao banco)." · "Autorização inválida." ·
  "Envie um objeto com a operação.".
- Exige o caixa de hoje aberto: fechado → a trava de 11.1; não aberto → 409 "Abra o caixa de hoje primeiro.".
- Retirada por quem não tem `caixa.retirada` (o Vendedor): precisa da autorização do Dono ou do Administrador para
  `retirada` deste mesmo valor: 403 `precisa_autorizacao` "Retirada do dono: precisa da senha do Dono ou do
  Administrador.".
- Não passa do esperado na gaveta (11.3). Lançamentos no dia do caixa, com o caixa. Histórico `caixa.sangria`,
  `caixa.retirada` (com `autorizadoPor`) ou `caixa.suprimento` (`valorCentavos`).

### 11.5 Fechar (`caixa`)

(`caixa.ts:346-473`; `apiLocal.ts:2860-2906`)
- Campos `dia`, `contadoCentavos` (≥ 0), `justificativa` (opcional, até 300), `autorizacao`: "Dia do caixa inválido." ·
  "Informe o dinheiro contado na gaveta." · "Envie um objeto com o fechamento.".
- "Este dia não tem caixa aberto." · "Este dia já foi fechado." · "Data no futuro não é permitida." · fecha sempre o dia
  mais antigo em aberto: "Feche primeiro o caixa de <dd/mm/aaaa>." (409).
- Diferença = contado − esperado; diferente de zero exige justificativa: 400 "Há <falta|sobra> de <valor> na gaveta.
  Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).".
- Acima da tolerância da loja (§5.3, padrão R$ 10,00), quem não tem `caixa.diferenca` precisa da autorização do Dono ou do
  Administrador para `fechamento` deste dia e deste valor contado: 403 `precisa_autorizacao` "Diferença acima de <tolerância>:
  o fechamento precisa da autorização do Dono ou do Administrador.".
- Grava o fechamento (quem, quando, fundo, esperado, contado, diferença, ajuste = diferença, justificativa, quem autorizou,
  resumo e a tolerância daquele momento). Diferença ≠ 0 vira lançamento `ajuste_caixa` no Caixa físico, no dia do caixa:
  "<Falta|Sobra> no fechamento de <dd/mm/aaaa> • <justificativa>".
- Se quem fechou ou quem autorizou tem `caixa.ciencia` (o Dono), a diferença acima da tolerância já entra com a ciência
  dele. Histórico `caixa.fechado` (`dia`, `esperadoCentavos`, `contadoCentavos`, `diferencaCentavos`, `autorizadoPor`).

### 11.6 Fechamento automático à meia-noite (DaniPets CX-06)

- O caixa de um dia anterior ainda aberto fecha sozinho, sem contagem e sem ajuste: `por` = Sistema (null), contado e
  diferença null, ajuste 0, justificativa "Fechamento automático à meia-noite: sem valor contado e sem ajuste no saldo."
  (`caixa.ts:44-45,475-513`).
- Exceção: o dia reaberto HOJE com "Desfazer fechamento" fica aberto até a próxima meia-noite (`caixa.ts:475-482`).
- Quando: antes de toda operação que grava e nas leituras do caixa e da situação (`apiLocal.ts:925-933,1040-1053,2755,
  2784`); a tela confere a virada do dia a cada 10 segundos e quando volta a ficar visível, mas o fechamento não depende
  dela (`legacy/web/src/painel/usarViradaDoDia.ts:1-30`). Histórico `caixa.fechamento_automatico` (`dia`,
  `esperadoCentavos`), sem autor.
- Fica como pendência "Deseja verificar?" para quem tem `caixa.desfazer`, do mais antigo (`caixa.ts:515-519`;
  `apiLocal.ts:2793-2796`). **Verificar** (`caixa.desfazer`): observação opcional (até 300); "Caixa não encontrado." (404) ·
  "Este caixa não está fechado." · "Só o fechamento automático precisa ser verificado." · "Este fechamento já foi verificado
  por <nome>." (409); nada mais muda; histórico `caixa.fechamento_verificado` (`dia`, `esperadoCentavos`, `comObservacao`)
  (`caixa.ts:521-544`; `apiLocal.ts:2908-2921`).

### 11.7 Diferença acima da tolerância (pendência 3)

- Fechamento contado (não automático) com |diferença| acima da tolerância guardada nele (o antigo, sem ela, usa a de agora)
  fica como pendência do Dono (`caixa.ciencia`) até ele dar ciência (`caixa.ts:546-573`; `apiLocal.ts:2797-2810`).
- **Dar ciência**: "Caixa não encontrado." (404) · "Este caixa não está fechado." · "Este fechamento não tem diferença acima
  da tolerância." · "<nome> já está ciente deste fechamento." (409); histórico `caixa.diferenca_ciente` (`dia`,
  `diferencaCentavos`) (`apiLocal.ts:2923-2935`).

### 11.8 Desfazer o fechamento (`caixa.desfazer`)

(`caixa.ts:575-627`; `apiLocal.ts:2937-2952`)
- Campos `motivo` (obrigatório, até 200: "Informe o motivo.") e `explicacao` (até 300); "Envie um objeto com o motivo.".
- "Caixa não encontrado." (404) · "Este caixa não está fechado." · "Só é possível desfazer o último fechamento." · "Há caixa
  aberto depois deste dia. Não é possível desfazer." (409) · fechamento automático exige a explicação: 400 "Explique por que
  o fechamento automático precisa ser ajustado.".
- Reabre o dia; o fechamento fica guardado como desfeito (quando, quem, motivo, explicação); o ajuste, se houve, é
  estornado com um `ajuste_caixa` contrário: "Estorno do ajuste do fechamento de <dd/mm/aaaa> (fechamento desfeito)".
  Histórico `caixa.fechamento_desfeito` (`dia`, `automatico`).

### 11.9 Liberação do Dono para um dia travado (DaniPets assertRetro)

(`caixa.ts:629-684`; `apiLocal.ts:1060-1075`)
- Compra com data, entrada ou ajuste de estoque com data e lançamento do Financeiro com data num dia travado só passam com
  `liberacao: { autorizacao, motivo }`: a autorização de quem tem `dia_fechado.liberar` (o Dono), do tipo `dia_fechado`
  para aquele dia, dentro de 4 horas, e um motivo (até 200).
- "Liberação inválida." · "Informe o motivo da liberação." (400); sem liberação válida: 409 `dia_fechado` "<motivo da
  trava>: <o que> nesse dia precisa da liberação de um Dono.", com o motivo "O caixa de <dd/mm/aaaa> já foi fechado" ou
  "<dd/mm/aaaa> fica antes do último caixa fechado (<dd/mm/aaaa>)".
- A operação guarda a liberação (quem, motivo, quando); a autorização é gasta no fim; histórico `dia_fechado.liberado`
  (`oque`: compra | ajuste | entrada | financeiro, `dia`, `autorizadoPor`).

### 11.10 Leituras

- **Caixa do dia** (`caixa`) (`apiLocal.ts:2752-2779`): hoje, estado, o caixa de hoje, o atrasado, o dia a fechar (o mais
  antigo em aberto) com a gaveta, as vendas de hoje por forma, os movimentos do Caixa físico (com o caixa aberto: os da
  gaveta; senão, os de hoje), o histórico de caixas (mais novo primeiro), o saldo do Caixa físico só para quem tem
  `financeiro`, a tolerância e o último dia fechado.
- **Situação** (qualquer logado, para o cabeçalho e a Frente de caixa) (`apiLocal.ts:2781-2812`): hoje, estado, aberto em,
  fechado em, responsável, dia atrasado, e as pendências (a verificar, para `caixa.desfazer`; diferenças, para
  `caixa.ciencia`).

---

## 12. Clientes e fiado

Regras do DaniPets V9.3.3 (`legacy/core/src/cliente.ts:1-12`; `legacy/core/src/fiado.ts:1-12`). Só na demonstração.

### 12.1 Cadastro

| Campo | Regra | Mensagem | Fonte |
|---|---|---|---|
| nome | NFC, espaços juntados; 3 a 120; sem controle; com pelo menos uma letra | "Informe o nome completo do cliente (pelo menos 3 letras)." · "O nome pode ter até 120 caracteres." · "O nome contém caracteres inválidos." · "O nome precisa ter letras." | `cliente.ts:76-78,162-166` |
| telefone | só dígitos; 10 (fixo) ou 11 com 9 depois do DDD (celular); DDD sem zero | "Telefone inválido. Use o DDD e o número, por exemplo (41) 99999-9999." | `cliente.ts:112-118,169-170` |
| cpf | 11 dígitos, verificadores certos, não todos iguais | 11 dígitos errados: "CPF inválido. Confira os números."; outro tamanho: "Informe os 11 números do CPF." | `cliente.ts:99-110,172-173` |
| extra | opcional (o "Pet" do DaniPets, com o rótulo da loja, §5.3); até 160 | "O campo extra deve ser um texto." · "O campo extra pode ter até 160 caracteres." · "O campo extra contém caracteres inválidos." | `cliente.ts:176` |
| endereco | opcional; até 160 | "O endereço …" (as mesmas três) | `cliente.ts:177` |
| observacoes | opcional; até 300 | "As observações …" | `cliente.ts:178` |
| nascimento | opcional; AAAA-MM-DD real, de 1900-01-01 até hoje | "Data de nascimento inválida." | `cliente.ts:179-185` |
| limiteFiadoCentavos | inteiro ≥ 0, até R$ 100.000,00; 0 = não compra no fiado sem a liberação do Dono; mudar exige `clientes.limite` | "O limite de fiado não pode ser negativo." · "O limite de fiado pode ser no máximo R$ 100.000,00." | `cliente.ts:38-39,83,186-191`; `legacy/web/src/demo/apiLocal.ts:1967-1968,2008-2010` |
| whatsapp | sim/não; sem informar, sim para celular | "Marque sim ou não." | `cliente.ts:96-97,192-196` |
| autorizaMensagens | sim/não; a demonstração guarda quando e quem registrou | "Marque sim ou não." | `cliente.ts:42-43`; `apiLocal.ts:1979,2017` |
| naoIncomodar | sim/não; fora das listas de lembrete | "Marque sim ou não." | `cliente.ts:44-45` |
| outro campo | recusado | "Campo não permitido." | `cliente.ts:134,160` |

- Corpo que não é objeto: "Envie um objeto com os dados do cliente." (`cliente.ts:157`). Na importação de planilha,
  telefone e CPF podem vir vazios (cadastro incompleto) (`cliente.ts:151-156,168`).
- CPF único entre os clientes **ativos** da loja: 409 "Este CPF já está no cadastro de <nome>." (`cliente.ts:202-206`).
- **Cadastro completo** = nome com 3+ letras (e não "Cliente removido"), telefone válido e CPF válido; sem isso, não
  compra no fiado (`cliente.ts:89-91`).
- Mostrar: telefone "(11) 98765-4321" / "(11) 3456-7890"; CPF mascarado "***.456.789-**" (LGPD; o inteiro fica só no
  cadastro) (`cliente.ts:9,120-132`). Primeiro nome para mensagens (`cliente.ts:93-94`).
- **Cadastrar** (qualquer logado) (`apiLocal.ts:1960-1991`): limite > 0 exige `clientes.limite`; histórico
  `cliente.cadastrado`, `cliente.mensagens` (`autorizou: true`) e `cliente.limite` (`de: 0`, `para`).
- **Alterar** (qualquer logado) (`apiLocal.ts:1993-2034`): a tela não tem o CPF inteiro: sem CPF no pedido, fica o do
  cadastro; mudar o limite exige `clientes.limite`; marcar a autorização de novo mantém a data antiga; nada mudou → não
  grava; histórico `cliente.alterado` (`campos`), `cliente.limite` (`de`, `para`), `cliente.mensagens` (`autorizou`),
  `cliente.nao_incomodar` (`ativo`). Não existe: 404 "Cliente não encontrado.".
- **Desativar/reativar** (`clientes.desativar`) (`apiLocal.ts:2036-2054`): reativar confere o CPF único; histórico
  `cliente.desativado` / `cliente.reativado`.
- **Excluir** (permissão `clientes`) (`apiLocal.ts:2190-2211`): motivo obrigatório (até 200): "Informe o motivo da
  exclusão." · "O motivo pode ter até 200 caracteres."; com compra, fiado ou vale-troca: 409 "Cliente com compras, fiado ou
  vale-troca não pode ser excluído. Um Dono pode excluir os dados (LGPD) na conta do cliente." (`cliente.ts:299-308`);
  histórico `cliente.excluido`. Feito por quem não tem `clientes.desativar` (o Vendedor): vira um **aviso** para o Dono e o
  Administrador (nome, telefone, motivo, quem, quando) (DaniPets avisosClientes); listar e conferir avisos exige
  `clientes.desativar`: "Aviso não encontrado." (404) · "Este aviso já foi conferido." (409); histórico
  `cliente.aviso_conferido` (`apiLocal.ts:2213-2232`).
- **Ver o CPF inteiro** (`clientes.cpf`): histórico `cliente.cpf_visto` (`apiLocal.ts:2179-2188`).

### 12.2 Busca (F6) e lista

- Busca da Frente de caixa (qualquer logado; termo vazio devolve nada) (`cliente.ts:208-225`; `apiLocal.ts:1922-1952`):
  termo até 80, sem acento; 3+ dígitos procuram no CPF e no telefone; 2+ letras (e não só números/pontuação) procuram no
  nome; só ativos; ordem alfabética (pt-BR); até 8 resultados. Cada resultado traz CPF mascarado, telefone, fiado em
  aberto, limite, vencido e dias, cashback e o próximo vencimento, cupom ativo, se o cadastro está completo e o saldo de
  vale-troca.
- O que foi digitado preenche o cadastro novo: CPF válido → CPF; 10+ dígitos → telefone; sem dígito → nome
  (`cliente.ts:227-235`).
- Lista da aba Clientes (`apiLocal.ts:2067-2135`): sem os excluídos pela LGPD; filtros `todos`, `fiado` e `vencido`
  (exigem `clientes.fiado`), `desativados` (exige `clientes.desativar`), `incompleto`, `nao_incomodar`, `cashback`, `vale`,
  `sumidos` (sem comprar há "dias sem comprar" da regra de retorno ou mais); busca no nome, no campo extra e, com 3+
  dígitos, no CPF e no telefone; o fiado de cada linha só vai para quem tem `clientes.fiado`; ordem alfabética; até 300
  linhas, com o total. Recusa de filtro: a mensagem de permissão (§3 de `05-MATRIZ-PERMISSOES.md`).
- Resumo do cliente: compras finalizadas, total (menos o devolvido), ticket médio e última compra (`cliente.ts:237-251`).

### 12.3 Conta do cliente e extrato

(`apiLocal.ts:2137-2177`; `cliente.ts:310-399`)
- Qualquer logado; cliente excluído pela LGPD: 404. Devolve o cadastro sem o CPF (só o mascarado), o resumo, o extrato
  completo, a fidelidade (saldo, vencendo, próximo vencimento, vencido, cupom, se está sumido), o fiado (devendo, vencido,
  dias, compras em aberto com o que falta de cada), o limite, se tem história e os vales com saldo.
- Extrato (DaniPets cliExtrato), do mais novo para o mais antigo (desempate pela hora e pela ordem do tipo): "Compra
  #00012" (com " (cancelada)" riscada), detalhe "<itens> • <formas> • desconto <valor>" (itens: "2 Areia", "1,5 kg Granel",
  "Ração" para uma unidade); "Devolução nº N" (−); "Fiado estornado" (−); "Fiado pago" (−, com a forma ou a conta, a compra
  e quem recebeu); "Compra no fiado" (+, "compra #00012 • vence dd/mm/aaaa", somando as partes da mesma venda). A
  fidelidade e o vale-troca entram no extrato completo (§13, §14).

### 12.4 Fiado

- Cada compra no fiado é um a receber na conta do cliente, com vencimento = dia da venda + prazo da loja (padrão 30 dias)
  (`fiado.ts:2-3`; §15).
- **Fiado do cliente hoje** (`fiado.ts:32-55`): em aberto = recebíveis de fiado do cliente com algo a receber, da que vence
  primeiro (desempate pelo número da venda e `criadoEm`); devendo; vencido (vence antes de hoje); dias de atraso da mais
  antiga vencida.
- **Na venda** (DaniPets PDV-10) (`fiado.ts:57-88`; `apiLocal.ts:1598-1616`): cadastro completo obrigatório; motivos que
  pedem o Dono: devendo + valor no fiado > limite → "passa do limite de <limite> em <excesso>" (limite 0 → "o cliente não tem
  limite de fiado no cadastro"); com a regra `fiado.vencidoPedeDono` ligada e algo vencido → "tem <valor> vencido há <n>
  dia(s)". Sem liberação: 409 `fiado_liberacao` "Venda no fiado para <nome>: <motivos separados por "; ">. Precisa da
  liberação de um Dono.". A liberação serve se é de quem tem `fiado.liberar`, do tipo `fiado`, para este cliente e
  exatamente este valor, dentro de 4 horas; a venda guarda quem liberou, o motivo e os motivos.
- **Receber pela conta do cliente** (permissão `vender`) (`fiado.ts:90-267`; `apiLocal.ts:2241-2322`) — arquivo do Luan de
  23/11/2026:
  - o caixa de hoje não pode estar fechado; em dinheiro, precisa estar aberto ("Receber em dinheiro: abra o caixa de hoje
    (Caixa do dia) primeiro.");
  - formas: dinheiro, Pix, débito, crédito ("Escolha a forma de pagamento.");
  - **cotação**: valor que abate > 0 e até o teto ("Informe um valor válido para a baixa."); no cartão a taxa da maquininha
    é **repassada ao cliente**: bruto = `round(principal × 10000 / (10000 − round(taxa × 100)))`, conferido para que bruto −
    taxa(bruto) = principal ("Não foi possível calcular a taxa deste valor. Tente outro valor."; taxa fora de 0 a 99,99%:
    "A taxa da maquininha está inválida. Confira as taxas."; bruto acima do teto: "O valor a cobrar passa do limite de um
    recebimento."); em dinheiro, o entregue (sem: o valor certo) ≥ principal ("O dinheiro entregue é menor que o valor da
    baixa.") e o troco = entregue − principal (o troco não entra na gaveta);
  - se a tela mandou o bruto ou a taxa previstos e mudaram: 409 `taxa_mudou` "A taxa da maquininha mudou. Confira o novo
    valor antes de confirmar.";
  - opcional `vencimento`: só as compras desse vencimento ("Vencimento inválido."; sem nada nele: 409 "<nome> não tem fiado
    em aberto com vencimento em dd/mm/aaaa.");
  - "<nome> não tem fiado em aberto." · "Informe o valor recebido." · acima do devido: "<nome> deve <valor>. Informe um valor
    até esse.";
  - abate da compra que vence primeiro; a compra paga por inteiro fica "recebido"; a paga em parte continua com o que falta
    e a parte paga vira um recebido separado (a devolução sabe de onde voltar);
  - dinheiro → lançamento `recebimento_fiado` no Caixa físico; Pix → na Conta bancária ("Fiado • <nome> • <forma>"); cartão →
    um recebível da operadora (bruto e taxa repassados, vence em hoje + prazo da maquininha), que entra no banco na hora se
    o Dono escolheu a baixa automática (a descrição ganha " • cobrado <bruto> • taxa <taxa>") (§15);
  - **pedido repetido** (`chave` de 8 a 96 caracteres, "Identificador do recebimento inválido."): o mesmo pedido devolve o
    mesmo resultado; a mesma chave com outro pagamento: 409 "Este pedido de recebimento já foi usado para outro
    pagamento.";
  - pagar fiado não gera cashback; histórico `cliente.fiado_recebido` (`valorCentavos`, `forma`, `brutoCentavos`,
    `taxaCentavos`, `trocoCentavos`, `vencimento`); devolve o que foi abatido de cada compra, quanto fica devendo e a
    cotação.
- Prévia antes de confirmar: o que o valor abate de cada compra e quanto fica devendo (`fiado.ts:180-199`); texto
  "#00012 (R$ 30,00), #00015 (R$ 20,00)" (`fiado.ts:269-271`).
- Situação na lista: "vencido há N dia(s)" (vencido) · "vence hoje" · "vence amanhã" · "vence em N dias (dd/mm/aaaa)"; até 3
  dias = perto (`fiado.ts:273-280`).
- **Aba Fiado** (`clientes.fiado`) (`apiLocal.ts:2324-2347`): clientes com fiado (fora os excluídos pela LGPD), do mais
  atrasado para o menos, depois do maior devido; com a compra mais antiga e a soma dos limites dos clientes ativos.
- Lembrete de cobrança por vencimento: referência "fiado:AAAA-MM-DD" (`fiado.ts:102-110`; §13).

### 12.5 LGPD: excluir os dados do cliente

(`cliente.ts:253-297`; `apiLocal.ts:2349-2391`) — DaniPets cliAnonimizar.
- Só quem tem `clientes.excluir_dados` (o Dono): 403 com a mensagem de permissão; não existe ou já removido: 404 "Cliente
  não encontrado."; com fiado em aberto: 403 "<nome> tem <valor> de fiado em aberto. Os dados ficam guardados até a conta
  ser paga.".
- Precisa ainda da **liberação de um Dono** (autorização `excluir_dados_cliente` deste cliente, dentro de 4 horas, com
  motivo): 403 `precisa_liberacao` "A exclusão precisa da liberação de um Dono.".
- Efeito: nome vira "Cliente removido"; telefone e CPF vazios; inativo; campo extra, nascimento, endereço e observações
  nulos; limite 0; sem WhatsApp; sem autorização de mensagens; sem adiamento; "não incomodar"; guarda quando, quem liberou
  e o motivo. O cashback que sobrou é zerado (uso "Exclusão dos dados"). O nome sai também das vendas, dos recebíveis, dos
  vales (que continuam valendo para quem tem o código) e da descrição dos lançamentos. As vendas continuam no histórico
  (obrigação fiscal). Histórico `cliente.dados_excluidos` (`autorizadoPor`).

---

## 13. Fidelidade: cashback, cupom de retorno e lembretes

Regras do DaniPets V9.3.3, CLI-10 a 14, 17 e 18, PDV-04, 08 e 18, DEV-07 (`legacy/core/src/fidelidade.ts:1-20`). Com o
recurso Fidelidade desligado (§5.4), a compra não gera cashback e os lembretes de retorno e de cashback são recusados e
somem da Visão geral; o saldo e os cupons que já existem continuam valendo (`legacy/web/src/demo/apiLocal.ts:1649-1650,
2431-2437,2537`).

### 13.1 Cashback

- **Gera** (DaniPets cbGerar) (`fidelidade.ts:185-232`): cliente identificado com cadastro completo, percentual da loja >
  0 (§5.3, padrão 3,5%); base = o pago em dinheiro, Pix, débito ou crédito (cashback, vale-troca e fiado não geram, nem o
  fiado quando é pago); valor = `round(base × round(pct × 100) / 10000)`; menos de 1 centavo não gera. Cada compra vira
  um **lote** ("Compra #00012", com o percentual) que vence em dia da compra + prazo da loja (padrão 31 dias). A venda
  guarda o cashback gerado.
- **Saldo** (DaniPets saldoCb) (`fidelidade.ts:147-183`): soma do restante dos lotes do cliente no prazo (vence hoje ou
  depois); cadastro incompleto tem saldo 0. Vencendo = vence em até N dias (regra `cashback.avisoDias`, padrão 7). Próximo
  vencimento = o primeiro dia de vencimento e quanto vence nele. Vencido = restante de lotes já vencidos.
- **Usar na venda** (DaniPets cbConsumir) (`fidelidade.ts:250-263`): até o saldo ("O cashback disponível de <nome> é
  <saldo>."); tira primeiro do lote que vence antes (desempate pelo dia e por `criadoEm`); fica registrado um uso do tipo
  `venda` com os lotes de onde saiu.
- **Devolução e cancelamento** (DEV-07) (`fidelidade.ts:265-326`; `apiLocal.ts:1205-1256`):
  - o cashback **usado** na compra que voltou para o cliente vira lote novo `estorno`, com prazo novo ("Cancelamento • venda
    #00012" ou "Devolução nº N • venda #00012"); sem o cliente (excluído): 409 "O cliente desta venda não foi encontrado para
    devolver o cashback.";
  - o cashback **gerado** sai: no cancelamento, tudo o que falta retirar; na devolução, `round(gerado × devolvido agora /
    total da venda)`, e a devolução que completa a venda leva o resto; nunca mais que o que falta;
  - sai primeiro do lote da própria compra (mesmo vencido), depois dos outros lotes válidos do cliente (do que vence
    antes); fica registrado um uso `retirada` com o rótulo; o que não deu para tirar (já usado ou vencido) vai para o
    histórico como `cliente.cashback_nao_recuperado` (`rotulo`, `numero`, `valorCentavos`);
  - no cancelamento, o cupom de retorno usado volta a valer (até a validade dele).
- Exclusão dos dados (LGPD): o cliente perde todo o restante, válido ou vencido (uso `retirada`, "Exclusão dos dados")
  (`fidelidade.ts:328-340`).

### 13.2 Cupom de retorno

- Dado pela mensagem de **retorno enviada pelo WhatsApp** a cliente com cadastro completo, com o cupom ligado (regra
  `retorno.cupomPct` > 0, padrão 5%) e validade (padrão 7 dias); se o cliente já tem um cupom valendo, a mensagem fala desse
  mesmo e não cria outro (`fidelidade.ts:360-383`).
- **Ativo hoje** (DaniPets cupomAtivo): cadastro completo, cupom ligado nas regras, não usado, no prazo e com % > 0
  (`fidelidade.ts:342-351`).
- Na Frente de caixa, identificado o cliente, o desconto entra sozinho nos itens sem desconto manual (§10.3); a venda
  marca o cupom como usado (`cliente.cupom_usado`, `pct`, `numero`).

### 13.3 Lembretes e mensagens (WhatsApp)

- Tipos: `retorno` "Lembrete de retorno" (`cliente.lembrete_retorno`), `cashback` "Aviso de cashback"
  (`cliente.aviso_cashback`), `cobranca` "Lembrete de pagamento" (`cliente.lembrete_pagamento`); canal `whatsapp`
  (mensagem aberta pelo sistema) ou `outro` ("Já falei", pessoalmente ou por telefone) (`fidelidade.ts:113-140`).
- **Quem pode receber** (DaniPets podeMensagem) (`fidelidade.ts:442-457`): ativo, com WhatsApp e telefone válido; oferta e
  retorno exigem também a autorização de mensagens; a cobrança só pede o WhatsApp. Motivo do botão desligado: "Cliente
  desativado." · "O cliente não tem WhatsApp no cadastro." · "O cliente não autorizou mensagens da loja pelo WhatsApp.".
- **Montar a mensagem** (DaniPets cliMensagem) (`fidelidade.ts:459-496`; `apiLocal.ts:2500-2527`): usa o modelo da loja
  (§5.3) com `{nome}` = primeiro nome, `{loja}` = nome da loja, `{dias}` = dias desde a última compra, `{desconto}` = % do
  cupom (o que o cliente já tem ou o da regra, com vírgula), `{validade}` = validade do cupom (retorno) ou o próximo
  vencimento do cashback, `{valor}` = valor que vence (cashback) ou o devido (cobrança), `{vencimento}` = vencimento do
  fiado (o do lembrete, ou o da compra mais antiga em aberto). Dinheiro com espaço comum ("R$ 12,50"). Link
  `https://wa.me/55<telefone>?text=<texto codificado>`. Tipo inválido: 400 "Escolha o tipo de lembrete."; cobrança sem
  `clientes.fiado`: 403 com a mensagem de permissão; cliente excluído: 404 "Cliente não encontrado."; referência de
  vencimento inválida: 400 "Vencimento do lembrete inválido."; vencimento já pago: 409 "Este fiado já foi recebido ou mudou.
  Atualize a lista.".
- **Registrar o contato** (`apiLocal.ts:2529-2557`): "Lembrete inválido." (400); cobrança exige `clientes.fiado`; retorno
  e cashback exigem a Fidelidade ligada; pelo WhatsApp, o motivo de bloqueio vira 409 (o "não incomodar" não bloqueia aqui:
  só tira das listas, decisão do Luan de 23/11/2026); lembrete de um vencimento vale uma vez: 409 "O lembrete deste
  vencimento já foi registrado."; grava o contato e, no retorno pelo WhatsApp, o cupom novo; histórico com `canal`, o cupom
  (`cupomPct`, `cupomVenceEm`) e o `vencimento`.
- **Adiar** (`apiLocal.ts:2559-2569`): tira o cliente das listas por 7 dias (`DIAS_ADIAR_LEMBRETE`); histórico
  `cliente.lembrete_adiado` (`ate`). **Não incomodar**: marca e registra `cliente.nao_incomodar` (`ativo: true`); já
  marcado não grava (`apiLocal.ts:2571-2580`).

### 13.4 Lista de retorno (aba Retorno) e resultado

- **Quem lembrar hoje** (DaniPets cliAnaliseRetorno) (`fidelidade.ts:526-576`; `apiLocal.ts:1150-1191`): só ativos e não
  excluídos; "sumido" = cadastro completo e sem comprar há N dias ou mais (regra `retorno.diasSemComprar`, padrão 30; conta
  a última compra não cancelada); "cashback vencendo" = algo vence em até `avisoDias`. Ficam de fora: "Pediu para não
  receber lembretes" (não incomodar), "Adiado até dd/mm/aaaa", "Já lembrado em dd/mm/aaaa (cupom até dd/mm/aaaa)" (um
  lembrete de retorno por ciclo: depois da última compra, uma vez só) e "Cashback já avisado em dd/mm/aaaa" (aviso de
  cashback há menos de max(avisoDias, 1) dias). Retorno do mais sumido para o menos; cashback do que vence antes. Cada
  linha traz o telefone, o motivo de bloqueio, a última compra com os itens ("Ração, Areia") e o cashback.
- **Resultado dos lembretes** (DaniPets cliResultadoRetorno) (`fidelidade.ts:578-614`): para cada lembrete de retorno
  (mais novo primeiro), "voltou" se o cliente comprou em até 15 dias (`DIAS_PARA_VOLTAR`); "não voltou" passado esse
  prazo; senão "aguardando"; taxa = `round(voltaram / enviados × 100)`; a tela mostra até 100 linhas.
- **Pendências de clientes da Visão geral** (arquivo do Luan de 23/11/2026) (`apiLocal.ts:2418-2439`): fiado a vencer
  (só para `clientes.fiado`), cashback a vencer e promoções exclusivas (clientes sumidos que podem receber a mensagem, com
  o % do cupom), as duas últimas só para quem tem `clientes` e com a Fidelidade ligada; promoções só com o cupom ligado.
- **Fiado a vencer** (`fidelidade.ts:385-440`): fiado em aberto que vence de hoje até daqui a 7 dias
  (`DIAS_FIADO_A_VENCER`), por cliente e vencimento; fora quem está desativado, pediu "não incomodar" ou adiou; marca se o
  lembrete daquele vencimento já foi mandado; do que vence antes, empate por nome.

### 13.5 Resumo do cashback (Relatórios) e regulamento

- Resumo (qualquer logado) (`apiLocal.ts:2441-2498`): por cliente ativo com cashback ganho ou devolvido: gerado
  (ganho + devolvido), usado (usado + retirado), vencido, em aberto e o próximo vencimento; totais; quantos têm saldo; os
  lotes que vencem em até `avisoDias`; ordem do maior saldo, empate por nome.
- Regulamento para deixar na loja (DaniPets cliRegulamento) (`fidelidade.ts:616-637`), texto exato com o nome e as regras
  da loja:

```
Programa de cashback <nome da loja>

1. Participa quem se cadastra com nome, telefone e CPF. A participação é voluntária.
2. A cada compra, o cliente recebe <pct>% do valor pago como cashback.
   (com 0%: "2. No momento, as compras não geram cashback.")
3. O cashback pode ser usado em compras na loja em até <N dia|dias> a partir da data da compra. Depois desse prazo, ele vence.
4. Não há valor mínimo de compra nem limite de uso por compra.
5. A parte da compra paga com cashback, vale-troca ou fiado não gera cashback.
6. Em devoluções e cancelamentos, o cashback daquela compra é retirado.
7. O cashback não pode ser trocado por dinheiro.
8. Os dados do cadastro são usados só para o programa e, se o cliente autorizar, para mensagens da loja. O cliente pode pedir a exclusão dos dados quando quiser.
```

### 13.6 Extrato da fidelidade (na conta do cliente)

(`fidelidade.ts:639-718`) "Cashback ganho" / "Cashback devolvido" (+, "<origem> • usar até dd/mm/aaaa"); "Cashback
vencido" (−, no dia seguinte ao vencimento, "Ganho em dd/mm/aaaa e não usado até dd/mm/aaaa"); "Cashback usado" (−, "Na
compra #00012") / "Cashback retirado" (−, "<rótulo> da compra #00012" ou o rótulo); "Cupom de retorno" ("<pct> até
dd/mm/aaaa • usado na compra #N | venceu sem uso | ainda não usado"); os contatos ("Mensagem pelo WhatsApp" ou "Contato
sem mensagem" • quem). Junto com compras, fiado e vale-troca, do mais novo para o mais antigo.

---

## 14. Vale-troca

Regras do DaniPets V9.3.3, DEV-03, DEV-10, PDV-09 e FIN-09 (`legacy/core/src/vale.ts:1-12`). Com o recurso Vale-troca
desligado (§5.4), a devolução como vale é recusada; os vales que já existem continuam valendo
(`legacy/web/src/demo/apiLocal.ts:1770`).

- **Emissão**: só pela devolução como vale-troca (§10.7) (DaniPets issueVoucher). Número sequencial da loja; código
  "VT-0001-ABC" = número com 4 dígitos + 3 caracteres sorteados de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem 0, O, 1 e I),
  sorteio com `crypto.getRandomValues` (`vale.ts:19-20,55-85`; `apiLocal.ts:1096-1097`). Guarda valor, saldo, situação
  (`aberto` | `usado`), o cliente (o nome da hora, ou nenhum), a origem (venda e devolução), dia, quem emitiu e os usos
  (`vale.ts:22-53`). Na reconstrução: `SecureRandom`.
- **Não mexe em conta nenhuma** até ser usado; é crédito do cliente na loja e vale para quem estiver com o código, com ou
  sem cliente identificado (`vale.ts:6-7`).
- **Usar na venda** (DaniPets useVoucher) (`vale.ts:95-106`): cada vale é uma parte do pagamento, depois do cashback; não
  passa do saldo ("O vale <código> tem saldo de <saldo>."); vale usado ou zerado: "Vale-troca inválido ou já usado. Remova o
  vale do pagamento."; o saldo diminui e, zerado, o vale fica "usado"; a sobra fica para a próxima compra.
- **Volta** (DaniPets refundPayment VOUCHER) (`vale.ts:108-148`; `apiLocal.ts:1098-1122`): no cancelamento ou na
  devolução de uma compra paga com vale, o que volta pela forma "vale-troca" vai para os mesmos vales, na ordem do
  pagamento, cada um até o que pagou naquela venda (correção de um defeito do DaniPets, que podia devolver demais num vale
  quando a venda usava dois); o vale volta a ficar aberto; uso `estorno` com o rótulo ("Cancelamento" ou "Devolução nº N").
  Sem o vale: "O vale-troca usado nesta venda não foi encontrado.".
- **Buscar pelo código** (qualquer logado): o código digitado vira maiúsculas, sem espaços ("vt-0001-abc " →
  "VT-0001-ABC"); não achou: 404 "Vale não encontrado. Confira o código." (`vale.ts:61-62`; `apiLocal.ts:2402-2409`).
- **Listas** (qualquer logado) (`apiLocal.ts:2394-2400`; `vale.ts:150-158`): em aberto (padrão) = com saldo, do mais novo
  para o mais antigo; `todos` = todos, do mais novo. Vales do cliente = os abertos dele e a soma. Linha da escolha na Frente
  de caixa: "VT-0001-ABC • R$ 30,00 • Maria • 20/11/2026" (`vale.ts:191-193`).
- **Extrato do cliente** (`vale.ts:160-189`): "Vale-troca VT-0001-ABC" (+, "Devolução nº N • compra #00012"); "Vale-troca
  usado" (−) / "Vale-troca devolvido" (+), "<código> • compra #00012 • <rótulo>".
- **LGPD**: na exclusão dos dados do cliente, o vale continua valendo para quem tem o código; só o nome sai (`vale.ts:11`).
- Histórico: `vale.emitido` (na devolução, §10.7).

---

## 15. Financeiro

Regras do DaniPets V9.3.3 (`legacy/core/src/financeiro.ts:1-17`). Quem: permissão `financeiro` (Dono e Administrador);
os lançamentos à mão exigem também o recurso Financeiro ligado (§5.4). Só na demonstração.

### 15.1 Contas e nomes

- Duas contas: `caixa` "Caixa físico" e `banco` "Conta bancária"; saldo = soma dos lançamentos; nada é apagado
  (`financeiro.ts:35-41`).
- A loja pode dar nome às contas (§5.3); nome vazio = o padrão (`financeiro.ts:43-49`). No meio de uma frase: com o nome
  padrão, com o artigo ("no Caixa físico", "da Conta bancária", "para o …", "o …"); com o nome da loja, entre aspas curvas e
  sem artigo ("em “Banco Itaú”", "de “Banco Itaú”") (`financeiro.ts:51-64`).

### 15.2 Tipos de lançamento

| Tipo | Nome na tela | Fonte |
|---|---|---|
| `saldo_inicial` | Saldo inicial | `financeiro.ts:82-119` |
| `venda` | Venda recebida | idem |
| `estorno_venda` | Estorno de venda | idem |
| `recebimento_cartao` | Recebimento de cartão | idem |
| `recebimento_fiado` | Recebimento de fiado | idem |
| `entrada` | Entrada | idem |
| `despesa` | Despesa | idem |
| `retirada` | Retirada do dono | idem |
| `transferencia_saida` | Transferência (saída) | idem |
| `transferencia_entrada` | Transferência (entrada) | idem |
| `pagamento_compra` | Pagamento de compra | idem |
| `estorno_compra` | Estorno de compra | idem |
| `pagamento_conta` | Conta paga | idem |
| `sangria` | Sangria | idem |
| `deposito_sangria` | Depósito da sangria | idem |
| `suprimento` | Suprimento | idem |
| `ajuste_caixa` | Ajuste do fechamento | idem |

Cada lançamento guarda conta, tipo, valor (positivo entra, negativo sai), descrição, quando, venda, recebível, categoria
(despesas e contas pagas), quem lançou, compra e conta a pagar de origem, o `dia` quando não é o de `criadoEm`, o caixa do
dia e quem autorizou (`financeiro.ts:121-155`). Dia do lançamento = `dia` gravado ou o dia de `criadoEm` no fuso.

### 15.3 A venda no financeiro

(`financeiro.ts:371-434`)
- Dinheiro → `venda` no Caixa físico; Pix → `venda` na Conta bancária ("Venda #00012 • <forma>").
- Cartão → um **recebível** da operadora: vence em dia da venda + dias da maquininha, com a taxa
  (`round(valor × round(pct × 100) / 10000)`); fica pendente até a operadora depositar (baixa manual) ou entra no banco na
  hora (baixa automática, 15.6).
- Fiado → um recebível na conta do cliente, sem taxa, vencendo em dia da venda + prazo da loja (padrão 30).
- Cashback e vale-troca não entram em conta nenhuma (o cashback é desconto da loja, controlado nos lotes; o vale é crédito
  do cliente).

### 15.4 Estorno no financeiro (cancelamento e devolução)

(`financeiro.ts:436-509`; `legacy/web/src/demo/apiLocal.ts:1258-1278`)
- Dinheiro: `estorno_venda` negativo no Caixa físico; com o caixa de hoje aberto não passa do esperado na gaveta (mensagem
  da gaveta, §11.3); sem caixa aberto não passa do saldo do Caixa físico: "A devolução em dinheiro (<valor>) é maior que o
  saldo do <caixa> (<saldo>). Confira o caixa ou lance uma entrada no Financeiro antes.".
- Pix: `estorno_venda` negativo na Conta bancária ("<rótulo> • venda #00012 • <forma>"; rótulo "Cancelamento" ou
  "Devolução nº N").
- Cartão e fiado: abatem dos recebíveis da venda daquela forma; taxa estornada proporcional (`round(bruto × taxa /
  bruto total)`), e o último estorno leva o que sobrou da taxa; recebível já recebido → o líquido sai da conta onde entrou
  ("… • estorno no <forma>"); pendente estornado por inteiro → `cancelado`. Faltando valor: "Não há valor em <forma>
  suficiente nesta venda para estornar.".
- Recebível a receber = bruto − estornado − (taxa − taxa estornada), 0 se não está pendente (`financeiro.ts:243-250`).

### 15.5 Receber cartão (confirmar o depósito, baixa manual)

(`financeiro.ts:511-541`; `apiLocal.ts:2626-2673`)
- Exige `financeiro`, o recurso Financeiro ligado e o caixa de hoje não fechado; para o Caixa físico, o caixa aberto
  ("Receber em dinheiro: abra o caixa de hoje (Caixa do dia) primeiro.").
- "Recebimento não encontrado." (404) · "Este recebimento já foi confirmado." · "Este recebimento foi cancelado (venda
  cancelada ou devolvida)." · "Escolha a conta onde o dinheiro entrou." · fiado por aqui: 409 "O fiado é recebido na conta
  do cliente (Clientes → Fiado).".
- Vários de uma vez (DaniPets "confirmar todos os vencidos"): 1 a 500 ids sem repetir ("Escolha os recebimentos a
  confirmar."), tudo ou nada.
- Entra o líquido; lançamento `recebimento_cartao` ("<forma> • venda #00012", ou "<forma> • fiado de <cliente>" no cartão
  que pagou fiado). Histórico `financeiro.recebimento` (`valorCentavos`, `conta`) para cada um.

### 15.6 Taxas da maquininha e baixa do cartão

(`financeiro.ts:157-174,659-692`; `apiLocal.ts:2723-2749`)
- Padrão do DaniPets: débito 1,5% em 1 dia, crédito 3% em 30 dias; baixa automática (pedido do Luan de 23/11/2026).
- Validação: "Informe a taxa e os dias do débito e do crédito." · taxa de 0 a 99,99% com até 2 casas ("A taxa vai de 0 a
  99,99%, com até 2 casas.") · dias de 0 a 365 ("Os dias vão de 0 a 365.") · "Escolha se a baixa do cartão é automática ou
  manual." · "Campo não permitido.".
- Mudar as taxas: `financeiro`; mudar a baixa: só quem tem `financeiro.baixa_cartao` (o Dono) — 403 com a mensagem de
  permissão; sem `baixaAutomatica` no pedido, fica como está. Histórico `financeiro.taxas` (`debitoPct`, `creditoPct`,
  `baixaAutomatica`).
- **Baixa automática**: o cartão da venda ou do fiado entra na Conta bancária na hora, já sem a taxa (a mesma confirmação
  da baixa manual, feita no pagamento). **Manual**: fica a receber até alguém confirmar.
- Para receber fiado na Frente de caixa, as taxas são lidas com a permissão `vender` (`apiLocal.ts:2234-2239`).

### 15.7 Lançamentos à mão e saldo inicial

(`financeiro.ts:543-612,644-657`; `apiLocal.ts:2675-2721`)
- Tipos: `entrada`, `despesa` (categoria; vazia vira "Outras despesas"), `retirada` ("Retirada do dono • <descrição>"),
  `transferencia` (saída numa conta, entrada na outra).
- "Envie um objeto com o lançamento." · "Escolha entrada, despesa, retirada ou transferência." · "Escolha a conta." ·
  "Escolha contas diferentes para a transferência." · "Conta de destino só na transferência." · "Informe um valor maior que
  zero." · "Descreva o lançamento." · descrição até 120 e categoria até 60 ("Use até <n> caracteres.") · "Texto com
  caracteres inválidos." · "Campo não permitido.".
- Exige o caixa de hoje não fechado; a saída do Caixa físico não passa do esperado na gaveta (caixa aberto) ou do saldo
  (§11.3); o Banco pode ficar negativo. Histórico `financeiro.entrada` / `financeiro.despesa` / `financeiro.retirada`
  (`valorCentavos`, `conta`, `categoria`) ou `financeiro.transferencia` (`valorCentavos`, `de`, `para`).
- **Saldo inicial** (implantação), uma vez por conta: "Envie um objeto com a conta e o valor." · "Escolha a conta." · "O
  saldo inicial desta conta já foi definido." · Caixa ≥ 0 ("Informe quanto dinheiro há no caixa (zero ou mais).") · Banco
  pode ser negativo ("Informe o saldo da conta."); descrição "Saldo inicial (implantação)"; histórico
  `financeiro.saldo_inicial` (`valorCentavos`, `conta`).

### 15.8 Leituras

- **Resumo** (`apiLocal.ts:2583-2599`): cada conta com nome, saldo e se já tem saldo inicial; total; a receber do cartão
  (líquido, quantos, vencidos = vence até hoje); fiado (vencido = venceu antes de hoje); contas a pagar (§9.4); se a baixa é
  automática.
- **Lançamentos**: filtro por conta e período (pelo dia do lançamento); mais novos primeiro (`apiLocal.ts:2601-2605`).
- **Recebíveis**: filtro por situação; ordem de vencimento, depois `criadoEm` (`apiLocal.ts:2607-2613`).
- **Extrato da conta** (DaniPets FIN-08) (`financeiro.ts:263-330`; `apiLocal.ts:2615-2624`): "Escolha a conta do extrato." ·
  "Escolha o período do extrato (de e até)." · "A data inicial é depois da final." · período de até um ano ("Escolha um
  período de até um ano."). Saldo anterior (até o dia antes de "de"), cada lançamento do período na ordem do dia e da hora
  gravada com o saldo depois dele, entradas, saídas e saldo final; lançamento com data de um dia anterior entra naquele dia.

---

## 16. Visão geral e Relatórios

### 16.1 Visão geral

(`legacy/web/src/painel/TelaVisaoGeral.tsx:1-15`)
- Só o essencial, no formato do DaniPets: **Vendas de hoje** (cartão grande; ao clicar, abre embaixo o relatório do dia:
  por forma de pagamento, por quem vendeu e venda por venda), **Produtos ativos** (leva a Produtos e estoque) e **Saldo das
  contas** (Caixa físico + Conta bancária e o que ainda cai de cartão; só para quem tem `financeiro`; leva ao Financeiro).
  "Hoje" é o dia no fuso da loja: à meia-noite os números voltam a zero sozinhos, sem apagar nada.
- **Card Pendências** (`legacy/web/src/painel/pendencias.ts:1-43`; `docs/PENDENCIAS.md`): urgentes primeiro (alta, ícone
  vermelho), depois atenção (média, ícone amarelo), na ordem de chegada dentro de cada grupo; botão opcional que leva à aba
  onde se resolve (some para quem não pode abrir a aba) ou abre uma janela na própria Visão geral; "só gestor" some para
  quem não é Dono, Administrador ou Adm. Sup; "só Dono" some para quem não é Dono ou Adm. Sup.
- **Status das pendências: A DEFINIR** (`docs/PENDENCIAS.md:3-11`). Ligadas pelo Luan:

| Nº | Pendência | Quem vê | Gravidade | Texto | Botão | Fonte |
|---|---|---|---|---|---|---|
| 3 | fechamento com diferença acima da tolerância, até o Dono dar ciência | só Dono | alta | "Fechamento de dd/mm/aaaa com <falta\|sobra> de <valor>, acima da tolerância de <valor> (fechou: <nome> • autorizou: <nome>)." | Conferir (Caixa do dia) | `legacy/web/src/painel/regrasPendencias.ts:113-121` |
| 16 | caixa fechado sozinho à meia-noite | só gestor | média | "O caixa de dd/mm/aaaa fechou sozinho à meia-noite, sem contagem da gaveta (esperado <valor>). Deseja verificar?" | Verificar (Caixa do dia) | `regrasPendencias.ts:122-130` |
| 2 | dia anterior com caixa aberto | todos | média | "Dia com caixa aberto e sem fechamento: dd/mm/aaaa. Feche esse dia para abrir o caixa de hoje." | Ir ao caixa | `regrasPendencias.ts:131-137` |
| 1 | caixa de hoje não aberto (só quando não há o 2) | todos | média | "O caixa de hoje não foi aberto: vendas ficam bloqueadas." | Abrir caixa | `regrasPendencias.ts:138-145` |
| 17 | fiado a vencer (hoje a 7 dias) | `clientes.fiado` | — | "Fiado a vencer · N" | Ver lista | `legacy/web/src/painel/PendenciasDoInicio.tsx:1-60` |
| 18 | cashback a vencer | `clientes` e Fidelidade ligada | — | "Cashback a vencer · N" | Ver lista | idem |
| 19 | promoções exclusivas (sumidos com o cupom) | `clientes`, Fidelidade e cupom ligados | — | "Promoções exclusivas · N" | Ver lista | idem |

  Prontas e **desligadas** (não aparecem até o Luan escolher): 6 estoque baixo, 7 estoque negativo, 10 cartão vencido sem
  confirmar, 11 fiado vencido, 12 clientes para lembrar hoje (`regrasPendencias.ts:1-19,25-101`). Sem nenhuma pendência, o
  card diz "Nada pendente. Tudo em ordem." e a nota "Por enquanto, estão ligados os avisos do caixa e dos clientes (fiado a
  vencer, cashback a vencer e promoções). Os outros (estoque, validade, contas…) ainda vamos escolher."
  (`pendencias.ts:41-43`; `docs/PENDENCIAS.md:10-11`). A reconstrução liga e desliga exatamente as mesmas.

### 16.2 Relatórios (`relatorios`; recurso Relatórios ligado)

(`legacy/web/src/painel/TelaRelatorios.tsx:1-60`; `legacy/web/src/relatorios/planilhas.ts:1-12`)
- Período no topo, para todas as abas; atalhos "Todas" (sem período), "Hoje", "Ontem", "Últimos 7 dias" (hoje − 6 até
  hoje), "Este mês" (dia 1 até hoje) e as datas (`TelaRelatorios.tsx:38-60`).
- Abas: Tudo (resumo de cada assunto), Vendas, Produtos, Estoque, Clientes, Financeiro, Caixa, Compras, Histórico; "Vendas
  antigas" só quando a loja importou (§18.4); "Visões" só quando o suporte montou alguma (§19.3). Cada aba tem os filtros
  dela e "Exportar esta aba (Excel)" (leva o que a tabela mostra); "Exportar tudo (Excel)" gera um arquivo com uma aba
  "Resumo" e uma aba por assunto. Parte que falha ao carregar fica vazia e a aba avisa; o resto continua
  (`planilhas.ts:94-137`). As colunas de cada planilha estão em `planilhas.ts:149-813` (ver `02-MAPA-DE-FUNCIONALIDADES.md`).
- **Produtos e lucro estimado** (`planilhas.ts:273-369`): por produto, nas vendas finalizadas, quantidade e valor sem o
  devolvido e custo = custo médio guardado no item × quantidade (um item vendido sem custo deixa o custo do produto vazio);
  ordem do maior valor, empate por nome. Lucro estimado = vendas dos produtos com custo − custo − taxas de cartão das vendas
  − cashback usado; os produtos sem custo ficam de fora (e são contados). Margem = lucro / vendas, com 1 casa.
- **Posição de estoque** (DaniPets REL-08) (`planilhas.ts:371-414`): no início (movimentos antes de "de"), entradas
  (inicial, entrada, compra), ajustes (ajuste e estorno de compra), vendido, devolvido (devolução e cancelamento) e no fim;
  situação "Negativo", "Zerado", "Baixo" (no mínimo ou abaixo) ou "Normal"; por nome.
- **Resumo do "Exportar tudo"** (`planilhas.ts:814-862`): Período ("dd/mm/aaaa a dd/mm/aaaa", "início"/"hoje" nas pontas
  abertas, ou "todo o período"), Gerado em, Total vendido, Devoluções, Vendas líquidas, Ticket médio, Custo das mercadorias
  ("custo médio guardado em cada venda"), Taxas de cartão, Cashback usado, Lucro estimado (sem custo: "sem custo registrado
  (registre as compras para ter o custo)"; com produtos sem custo: "<n> produto(s) sem custo ficam de fora"), Entradas e
  Saídas no financeiro.
- **Arquivo**: `relatorio-<assunto sem acento, minúsculo, com hífens>-<de>-a-<até>.xlsx` (sem "de":
  `relatorio-<assunto>-ate-<até ou hoje>.xlsx`) (`planilhas.ts:864-873`). Dinheiro como número com formato "R$ #.##0,00",
  data como data (dd/mm/aaaa), quantidade com até 3 casas, percentual como %; texto sempre como texto (um "=SOMA(...)"
  digitado nunca vira fórmula, DaniPets REL-10); primeira linha em negrito, congelada e com filtro; nome da aba até 31
  caracteres (`legacy/web/src/relatorios/xlsx.ts:1-31`). LGPD: CPF mascarado nas planilhas (`planilhas.ts:12`).
- Exportar registra no histórico `relatorios.exportado` (`assunto` até 40, `de`, `ate`, `abas`) — permissão
  `relatorios`; sem assunto: 400 "Diga o que foi exportado." (`legacy/web/src/demo/apiLocal.ts:3079-3089`).
- A aba Histórico lê até 2000 linhas (`planilhas.ts:91-92`) pela leitura do histórico, que exige `usuarios` (§17).

---

## 17. Histórico (auditoria)

(`legacy/core/src/auditoria.ts:1-7`) Só acrescenta (nada é alterado nem apagado), gravado junto com a operação (tudo ou
nada); **sem dado pessoal nos detalhes** (só números, valores e ids): os nomes de quem fez, do cliente, do produto, do
fornecedor e da visão são buscados na hora de mostrar, e a exclusão da LGPD vale também para o histórico.

- Registro: `id`, `acao`, `usuarioId` (null = sistema ou tentativa sem login), `alvoTipo`/`alvoId`, `detalhes`, `criadoEm`
  (`legacy/web/src/demo/usuariosDemo.ts:221-233`; `legacy/api/src/auditoria/auditoria.ts:10-15`).
- Leitura (`usuarios`: Dono, Administrador e Adm. Sup): do mais novo para o mais antigo (desempate pelo id); no servidor
  antigo, `limite` de 1 a 200 (padrão 40; fora: 400 "limite deve ser um número de 1 a 200.") (`legacy/api/src/auditoria/
  auditoria.controller.ts:1-82`); na demonstração, padrão 40 e os Relatórios pedem 2000 (`usuariosDemo.ts:534-555`). Cada
  item: texto da ação, quem (o Adm. Sup aparece como "Suporte", `legacy/core/src/papeis.ts:29`), alvo com o nome de hoje,
  detalhes e o resumo. A demonstração guarda só as últimas 2000 linhas por loja (`usuariosDemo.ts:65,232`); o servidor
  guarda tudo (decisão em `06-RISCOS-E-DECISOES.md`).
- **Textos das ações** (`auditoria.ts:16-119`) e **resumo** (partes separadas por " • ", sem as vazias; com quem autorizou,
  " • autorizado por <nome>" no fim, menos onde diz "liberado por") (`auditoria.ts:184-471`):

| Ação | Texto | Resumo |
|---|---|---|
| `sessao.entrou` | Entrou no sistema | — |
| `sessao.saiu` | Saiu do sistema | "por falta de uso" (motivo inatividade) |
| `sessao.senha_errada` | Senha errada | — |
| `sessao.bloqueado` | Bloqueado por senhas erradas | — |
| `usuario.criado` | Usuário criado | papel • "<n> função(ões)" (Personalizado) |
| `usuario.alterado` | Usuário alterado | "papel: A → B" • "funções do Personalizado: <n>" |
| `usuario.desativado` / `usuario.reativado` | Usuário desativado / Usuário reativado | — |
| `usuario.senha_redefinida` | Senha redefinida pelo Dono ou Administrador | — |
| `usuario.senha_trocada` | Trocou a própria senha | — |
| `usuario.dados_excluidos` | Dados do usuário excluídos (LGPD) | — |
| `usuario.foto_alterada` | Foto do perfil alterada | "tirou a foto" |
| `loja.dados_alterados` | Dados da loja alterados | campos (nome, descrição, logo) |
| `loja.regras_alteradas` | Regras da loja alteradas | partes (desconto sem senha, caixa, fiado, cashback, cupom de retorno, mensagens, motivos de ajuste, categorias de despesa e nomes das contas, unidades de venda, campo extra do cliente) |
| `venda.desconto` | Desconto na venda | "venda nº 00012" • "<valor> de desconto" • "com brinde" |
| `venda.cancelada` / `venda.devolucao` | Venda cancelada / Devolução de venda | "venda nº 00012" • valor |
| `venda.fiado_liberado` | Fiado liberado pelo Dono | "venda nº 00012" • "<valor> no fiado" • "liberado por <nome>" |
| `produto.criado` | Produto cadastrado | "código 0001" |
| `produto.alterado` | Produto alterado | campos (nome, código de barras, preço, marca, peso, unidade, fornecedor) |
| `produto.preco_alterado` | Preço alterado | "R$ A → R$ B" |
| `produto.inativado` / `produto.reativado` | Produto inativado / Produto reativado | — |
| `produto.excluido` | Produto excluído | nome • "código <código>" |
| `estoque.entrada` / `estoque.ajuste` | Entrada de estoque / Ajuste de estoque | "+3 un" ou "-1,5 kg" • motivo • observação |
| `estoque.minimo` | Estoque mínimo alterado | "mínimo <quantidade>" ou "sem aviso de estoque baixo" |
| `compra.registrada` | Compra registrada | "compra nº N" • "NF <nº>" • valor • "à vista"/"a prazo" |
| `compra.estornada` | Compra estornada | "compra nº N" • valor |
| `compra.lote_baixado` | Baixa de lote (validade) | "-<quantidade> vencido" ou "o lote já tinha acabado" |
| `conta_pagar.criada` | Conta a pagar lançada | valor • "vence dd/mm/aaaa" • categoria |
| `conta_pagar.paga` | Conta paga | valor • nome da conta |
| `relatorios.exportado` | Relatório exportado para Excel | assunto • período ("dd/mm/aaaa a dd/mm/aaaa", "início"/"hoje", ou "todo o período") • "<n> aba(s)" |
| `dados.planilha_exportada` | Planilha exportada (Dados e backup) | assunto • "<n> linha(s)" |
| `dados.importados` | Planilha importada (Dados e backup) | assunto • "<n> cadastro(s) novo(s)" • "<n> já existia(m)" |
| `dados.vendas_importadas` | Vendas antigas importadas | "<n> venda(s)" • total • período |
| `dados.copia_gerada` | Cópia de segurança baixada | "<n> registro(s)" |
| `dados.copia_restaurada` | Cópia de segurança restaurada | "cópia de dd/mm/aaaa" • "<n> registro(s)" |
| `suporte.atualizacao_publicada` | Atualização do sistema publicada | versão • "<n> novidade(s)" |
| `suporte.aviso_publicado` | Aviso para a equipe publicado | "atenção"/"informação" • "até dd/mm/aaaa" |
| `suporte.aviso_encerrado` | Aviso para a equipe encerrado | — |
| `suporte.ajustes_alterados` | Ajustes da loja alterados (recursos e limites) | o resumo dos ajustes (§5.4) |
| `suporte.visao_salva` / `suporte.visao_excluida` | Visão sob medida salva (Relatórios) / Visão sob medida excluída (Relatórios) | base da visão • "nova"/"alterada" (salva) |
| `suporte.estoque_zerado` | Saldo negativo zerado (manutenção do suporte) | "+<quantidade>" |
| `suporte.erros_limpos` | Registro de erros limpo | "<n> erro(s)" |
| `caixa.aberto` | Abertura de caixa | dd/mm/aaaa • "fundo de troco <valor>" |
| `caixa.sangria` | Sangria | "<valor> da gaveta para a Conta bancária" (com o nome da conta) |
| `caixa.retirada` | Retirada do dono (gaveta) | "<valor> da gaveta" |
| `caixa.suprimento` | Suprimento | "<valor> na gaveta" |
| `caixa.fechado` | Fechamento de caixa | dd/mm/aaaa • "esperado <valor>" • "contado <valor>" • "sem diferença" ou "<falta\|sobra> de <valor> (ajuste no Caixa físico)" |
| `caixa.fechamento_automatico` | Fechamento automático | dd/mm/aaaa • "sem contagem e sem ajuste" |
| `caixa.fechamento_verificado` | Fechamento automático verificado | dd/mm/aaaa • "esperado <valor>" • "com observação" |
| `caixa.diferenca_ciente` | Ciência de diferença no fechamento | dd/mm/aaaa • "<falta\|sobra> de <valor>" |
| `caixa.fechamento_desfeito` | Fechamento desfeito | dd/mm/aaaa • "era automático" |
| `dia_fechado.liberado` | Lançamento retroativo liberado | compra / ajuste de estoque / entrada de estoque / lançamento financeiro • "data dd/mm/aaaa" • "liberado por <nome>" |
| `fornecedor.cadastrado` / `.alterado` / `.desativado` / `.reativado` | Fornecedor cadastrado / alterado / desativado / reativado | alterado: campos (nome, documento, telefone, contato, observação) |
| `cliente.cadastrado` | Cliente cadastrado | — |
| `cliente.alterado` | Cadastro do cliente alterado | campos (nome, telefone, CPF, campo extra, nascimento, endereço, observações, WhatsApp) |
| `cliente.desativado` / `cliente.reativado` | Cliente desativado / Cliente reativado | — |
| `cliente.dados_excluidos` | Dados do cliente excluídos (LGPD) | — |
| `cliente.excluido` | Cliente excluído | — |
| `cliente.aviso_conferido` | Exclusão de cliente conferida | — |
| `cliente.limite` | Limite de fiado alterado | "R$ A → R$ B" |
| `cliente.mensagens` | Autorização de mensagens | "autorizou mensagens da loja" / "cancelou a autorização de mensagens" |
| `cliente.nao_incomodar` | Não incomodar | "saiu das listas de lembrete" / "voltou para as listas de lembrete" |
| `cliente.cpf_visto` | CPF completo visto | — |
| `cliente.fiado_recebido` | Fiado recebido | valor • "em <forma>" • "cobrado <bruto> (taxa <taxa>)" • "troco <valor>" • "vencimento dd/mm/aaaa" |
| `cliente.lembrete_retorno` / `cliente.aviso_cashback` / `cliente.lembrete_pagamento` | Lembrete de retorno / Aviso de cashback / Lembrete de pagamento | "Mensagem pelo WhatsApp" ou "Contato registrado sem mensagem" • "cupom de <pct> até dd/mm/aaaa" |
| `cliente.lembrete_adiado` | Lembrete adiado | "volta para a lista em dd/mm/aaaa" |
| `cliente.cupom_usado` | Cupom de retorno usado | pct • "na venda nº 00012" |
| `cliente.cashback_nao_recuperado` | Cashback não recuperado | "Cancelamento"/"Devolução" • "venda nº 00012" • "<valor> do cashback desta compra já tinham sido usados ou venceram" |
| `vale.emitido` | Vale-troca emitido | código • valor • "devolução da venda nº 00012" |
| `financeiro.entrada` / `.despesa` / `.retirada` / `.saldo_inicial` / `.recebimento` | Entrada lançada / Despesa lançada / Retirada do dono / Saldo inicial / Recebimento confirmado | valor • nome da conta • categoria |
| `financeiro.transferencia` | Transferência entre contas | valor • "<conta> → <conta>" |
| `financeiro.taxas` | Taxas de cartão alteradas | "débito <pct>" • "crédito <pct>" • "baixa automática"/"baixa manual" |

  "venda nº 00012" leva 5 dígitos; os nomes das contas saem com o nome que a loja deu (`auditoria.ts:170-200`).
