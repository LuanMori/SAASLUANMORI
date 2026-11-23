# Login próprio — usuário e senha de cada loja

> Decisão do Luan em 18/11/2026 (revisão, item 5.4): sai o Auth0; cada pessoa entra com usuário e
> senha guardados no nosso banco, e o **Dono cadastra a equipe** pela aba **Usuários**.
> Detalhes da decisão: [`decisoes/0002-login-proprio.md`](decisoes/0002-login-proprio.md).
> Desde 23/11/2026 (pedido do Luan): o **Dono e o Administrador só são cadastrados pelo suporte (Adm. Sup)**,
> na implantação; o Dono cadastra **Vendedor** e **Personalizado** (com as funções que ele marcar).
> Detalhes: [`decisoes/0006-adm-sup-e-personalizado.md`](decisoes/0006-adm-sup-e-personalizado.md).

## Como a pessoa entra

1. Abre o endereço da loja: `lojaa.nomedaempresa.com.br`. **A loja vem do endereço**, nunca do que a
   tela manda (em desenvolvimento, sem `DOMINIO_BASE`, vem de `?loja=lojaa` ou `VITE_LOJA`).
2. Digita usuário e senha. O servidor confere a senha (hash **scrypt**, nunca a senha em texto).
3. Se a senha é **provisória** (criada pelo Dono), o sistema só deixa fazer uma coisa: **criar a
   própria senha**. Nenhuma outra tela ou rota funciona antes disso.
4. Pronto: a sessão fica num cookie que o JavaScript da página não consegue ler.

## O suporte (Adm. Sup)

O **Adm. Sup** (papel `super_admin`) é o usuário mestre do sistema: um login que vale para todas as lojas,
cadastrado no servidor (pode haver um por pessoa da equipe de suporte). Ele entra em **qualquer loja** com o
próprio usuário e senha e tem acesso a tudo, mas não aparece na lista de usuários da loja; no histórico e nas
vendas, aparece como **"Suporte"**.

```bash
npm run db:suporte -w @saas/api -- --usuario suporte                  # cadastra; mostra a senha UMA vez
npm run db:suporte -w @saas/api -- --usuario suporte --redefinir-senha
npm run db:suporte -w @saas/api -- --usuario suporte --desativar      # (esta e a nova senha encerram as sessões dele)
npm run db:suporte -w @saas/api -- --usuario suporte --reativar
```

A senha é sorteada (20 letras e números) e mostrada uma vez: guarde num cofre de senhas. Ela **não é
provisória** e só muda por esse script (a tela "Trocar senha" recusa para o suporte). O login do suporte
não pode ser usado por ninguém da loja. Em produção (Docker):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao \
  npx tsx scripts/cadastrar-suporte.ts --usuario suporte
```

## O primeiro Dono de cada loja

O Dono (e o Administrador) **só o suporte cadastra**, na implantação. Dois caminhos, os dois "pelo suporte":

1. **Pela tela:** o suporte entra no endereço da loja e cadastra o Dono na aba **Usuários**.
2. **Pelo script**, no servidor (quem tem acesso ao servidor é o suporte):

```bash
npm run db:seed    -w @saas/api                    # lojas do SEED_LOJAS ("Loja A=lojaa;Loja B=lojab")
npm run db:usuario -w @saas/api -- --loja lojaa --usuario ana --nome "Ana Paula" --papel dono
```

Os dois mostram a **senha provisória uma vez**. Entregue à pessoa; no primeiro acesso ela cria a dela.
Depois, o Dono cadastra a equipe (Vendedor e Personalizado) pela aba Usuários.
No Windows, o `teste-local.bat` faz tudo isso e mostra a senha. Em produção (Docker):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao \
  npx tsx scripts/cadastrar-usuario.ts --loja lojaa --usuario ana --nome "Ana Paula" --papel dono
```

Perdeu o acesso? `... --loja lojaa --usuario ana --redefinir-senha` (nova provisória) ou `--desativar`,
ou o suporte entra na loja e faz o mesmo pela aba Usuários. O `db:usuario` recusa o login do suporte e o papel
Personalizado (este se cadastra pela tela, com as funções); o `db:suporte` recusa um login que alguém de alguma
loja já usa.

## Regras (as mesmas no servidor, na tela e na demonstração — `packages/core`)

| Regra | Valor | Onde |
|---|---|---|
| Senha | 8+ caracteres; fora da lista das mais usadas; sem o usuário nem o nome | `usuario.ts` → `validarSenhaNova` |
| Senhas erradas | 5 seguidas bloqueiam o usuário por **5 minutos** (DaniPets: MAX_TRIES/LOCK_MINUTES). Vale também para a senha de quem autoriza desconto/cancelamento no caixa — é a mesma contagem | `tentativas.ts` |
| Por IP | 5 logins errados em 1 minuto (de qualquer usuário) bloqueiam **aquele IP** por 5 minutos (item 3.5) | `apps/api/src/auth/limites.ts` |
| No nginx | no máximo 10 `POST /api/sessao` por minuto por IP (camada extra) | `apps/web/nginx/default.conf` |
| Usuário que não existe | a mesma mensagem, o mesmo tempo de resposta e o mesmo bloqueio de quem existe | `sessao.service.ts` |
| Usuário desativado | só quem acerta a senha descobre que está desativado | idem |
| Sessão | termina com **30 minutos sem uso** (DaniPets: IDLE_MINUTES) ou **12 horas** depois do login; a tela sai sozinha junto | `SESSAO_INATIVIDADE_MIN`, `SESSAO_MAXIMA_HORAS` |
| Trocar a senha | pede a senha atual; errar 5 vezes bloqueia e derruba a sessão; troca derruba as sessões dos outros aparelhos | `POST /sessao/senha` |
| Desativar / nova senha pelo Dono | derruba na hora as sessões abertas da pessoa | `usuarios.service.ts` |
| Quem cadastra | O Dono e o Administrador cadastram **Vendedor** e **Personalizado**. **Dono e Administrador: só o suporte** (Adm. Sup) cadastra ou dá esses papéis. Mexer em Dono (alterar, desativar, nova senha): só outro Dono ou o suporte. Ninguém desativa a si mesmo nem muda o próprio papel ou as próprias funções. A loja nunca fica sem um Dono ativo | `conferirGestaoDeUsuario` + trava no banco |
| Personalizado | só as funções marcadas para ele (pelo menos uma). Não recebe as funções só do Dono nem a de cadastrar usuários; quem cadastra só dá as funções que tem | `permissoes.ts` (`PERMISSOES_CONCEDIVEIS`) + `usuario.ts` |
| Excluir dados (LGPD) | só o Dono, só de usuário desativado; fica "Usuário removido" no histórico | `POST /usuarios/:id/excluir-dados` |

O banco tem uma trava própria (trigger `usuarios_trava_api`): mesmo que a API tivesse um erro, a role
da API não consegue cadastrar ou dar o papel de Dono ou de Administrador sem ser o suporte, deixar um
Personalizado sem funções, desativar a si mesma, mudar o próprio papel ou deixar a loja sem Dono.

## O cookie de sessão

- Valor: `<id da loja>.<segredo de 256 bits>`. O banco guarda só o **SHA-256** do segredo: quem lê o
  banco não consegue entrar como ninguém. Trocar o id da loja no cookie não acha sessão nenhuma.
- `HttpOnly` (o JavaScript não lê: um XSS não rouba a sessão), `SameSite=Strict` (outro site não usa
  a sessão), sem validade fixa (some ao fechar o navegador).
- Produção (`COOKIE_SEGURO=true`): nome `__Host-sessao` + `Secure` — só por HTTPS e só no endereço
  exato da loja (um subdomínio vizinho não planta nem lê o cookie). Desenvolvimento: `sessao`.
- Pedido que muda dados vindo de outro site (Origin ou Sec-Fetch-Site) é recusado (403), mesmo com cookie.

## Rotas

| Rota | Quem | O quê |
|---|---|---|
| `GET /sessao/loja` | qualquer um | nome da loja do endereço (tela de entrada) |
| `POST /sessao` | qualquer um | `{ usuario, senha }` (+ `loja` só em desenvolvimento) → cookie |
| `GET /sessao` | logado (também com senha provisória) | quem está logado |
| `POST /sessao/senha` | logado (também com senha provisória) | `{ senhaAtual, senhaNova }` |
| `POST /sessao/sair` | qualquer um | encerra a sessão deste navegador |
| `GET/POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/senha`, `POST /usuarios/:id/excluir-dados` | Dono, Administrador e o suporte | tela Usuários (`permissoes` só no Personalizado) |
| `GET /auditoria?limite=40` | Dono, Administrador e o suporte | histórico (quem fez o quê; o suporte aparece como "Suporte") |
| `GET /saude` | qualquer um | a API e o banco respondem? |

## Quem veio do Auth0

A migration `20261118120000_login_proprio_sessoes_auditoria` converteu os dados: cada loja ganhou um
endereço a partir do nome ("Loja A" → `lojaa`; repetido ganha número; nome reservado vira `loja...`) e
cada pessoa ganhou um login provisório a partir do nome (ex.: `anapaula1`), **sem senha**. Ninguém
entra até o Dono (ou o script `db:usuario --redefinir-senha`) criar uma senha provisória. O e-mail,
que nunca foi usado, saiu do banco (LGPD: só o dado que precisa).
