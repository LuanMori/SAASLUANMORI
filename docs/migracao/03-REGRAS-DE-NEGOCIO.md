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
