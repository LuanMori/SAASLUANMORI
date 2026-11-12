# Configurar o Auth0 (Fase -1)

Cada **loja = uma Organization** do Auth0. O token que o Auth0 entrega ao frontend traz o
claim `org_id`; a API usa esse `org_id` para achar a loja (`lojas.auth0_org_id`).
A loja **nunca** vem do frontend.

> Os nomes de menus abaixo podem variar um pouco conforme a versão do painel do Auth0.

## 1. Tenant

1. Crie uma conta/tenant em auth0.com (ex.: `sistema-padrao-dev`). Tenha um tenant de
   **desenvolvimento** separado do de **produção**.
2. Anote o domínio do tenant (ex.: `sistema-padrao-dev.us.auth0.com`) → `AUTH0_DOMAIN` (API)
   e `VITE_AUTH0_DOMAIN` (web).
3. Anote a **região** escolhida — entra na análise de LGPD (transferência internacional de
   dados, porque e-mail e nome dos usuários ficam no Auth0). Ver PENDÊNCIAS.

## 2. API (o "recurso" que o token autoriza)

Applications → APIs → **Create API**

| Campo | Valor |
|---|---|
| Name | Sistema Padrão API |
| Identifier | `https://api.<seu-dominio>.com.br` (não precisa existir ainda; é só um identificador) |
| Signing Algorithm | **RS256** |

- Identifier → `AUTH0_AUDIENCE` (API) e `VITE_AUTH0_AUDIENCE` (web). Os dois iguais.
- Em Settings da API, ligue **Allow Offline Access** (refresh token).

## 3. Aplicação do frontend

Applications → Applications → **Create Application** → **Single Page Application**

Em *Settings*:

| Campo | Desenvolvimento |
|---|---|
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs | `http://localhost:5173` |
| Allowed Web Origins | `http://localhost:5173` |
| Refresh Token Rotation | **ligado** |

- Client ID → `VITE_AUTH0_CLIENT_ID`.

Na aba **Organizations** da aplicação:

| Campo | Valor |
|---|---|
| Type of Users | **Business Users** (só entra quem é membro de uma loja) |
| Login Flow | **Prompt for Credentials** (a pessoa digita e-mail/senha; quem é de várias lojas escolhe a loja depois) |

Recomendado também: ligar **Identifier First** em Authentication Profile.

## 4. Lojas (Organizations)

Organizations → **Create Organization**, uma por loja (ex.: `loja-a`, `loja-b`):

1. Em **Connections**, habilite `Username-Password-Authentication` (ou a conexão que for usar).
2. Em **Members**, adicione/convide as pessoas da loja.
3. Copie o **ID** da organization (`org_...`).

Cadastre as lojas no banco de desenvolvimento:

```bash
# apps/api/.env
SEED_LOJAS=Loja A=org_xxxxxxxx;Loja B=org_yyyyyyyy
npm run db:seed -w @saas/api
```

> Plano Free do Auth0: até **5 Organizations** = 5 lojas. Acima disso, plano pago (B2B).

## 5. Pessoas (só entra quem o dono cadastrou)

Ser membro da Organization no Auth0 **não basta**. A pessoa também precisa ser cadastrada
na loja do nosso sistema — senão ela faz login e recebe "Seu acesso a esta loja ainda não foi liberado".

1. No Auth0: User Management → Users → abra a pessoa e copie o **user_id** (ex.: `auth0|6731f0c2...`).
2. Ela precisa estar em **Members** da Organization da loja (passo 4).
3. Cadastre no sistema (papéis: `dono`, `administrador`, `vendedor`):

```bash
npm run db:usuario -w @saas/api -- --org org_xxxxxxxx --sub "auth0|6731f0c2..." --papel dono
# tirar o acesso (vale na próxima requisição, sem esperar o token expirar):
npm run db:usuario -w @saas/api -- --org org_xxxxxxxx --sub "auth0|6731f0c2..." --desativar
```

> Este script é provisório: na Fase 5.7 o dono cadastra pela tela, e na Fase 3 o super_admin cria a loja e o primeiro dono.

## 6. Opcional: nome da loja no cabeçalho

Se o tenant estiver configurado para usar nomes de Organization na Authentication API, o token
traz também `org_name`, e o frontend mostra esse nome no cabeçalho. Sem isso aparece "Minha loja".
(O nome "oficial" da loja virá da API numa fase seguinte.)

## 7. Produção (Fase 8, registrado aqui para não esquecer)

- **Custom domain** do Auth0 (ex.: `login.<seu-dominio>.com.br`): sem ele, navegadores que
  bloqueiam cookie de terceiros (Safari) perdem a sessão ao recarregar a página.
- Com custom domain, o `iss` do token passa a ser o custom domain: `AUTH0_DOMAIN` da API
  tem que ser o custom domain também, senão todo token é recusado (401).
- Tenant de produção separado, com as URLs `https://app.<seu-dominio>.com.br`.
- Rate limit / proteção de força bruta do Auth0 ligados (Attack Protection) — Fase 9.
