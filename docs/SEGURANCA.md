# Segurança — o que protege o quê, e como conferir

> Atualizado em 18/11/2026 (revisão, itens 2.1, 2.2, 2.4, 3.5, 5.2 e 5.3). Cada proteção abaixo tem
> um teste automático que roda no CI a cada push: se alguém desligar a proteção, o teste falha.

## 1. Uma loja nunca vê os dados de outra (itens 2.1 e 2.2)

```
navegador ── cookie HttpOnly ──▶ nginx ──▶ API
                                            │ 1. sessão conferida no banco (hash do segredo, loja ativa, pessoa ativa)
                                            │ 2. a loja vem SÓ da sessão (nunca do corpo, da URL ou de cabeçalho)
                                            │ 3. BancoService.comLoja(lojaId, fn, usuarioId):
                                            │      BEGIN; set_config('app.loja_id', ...); set_config('app.usuario_id', ...); ...; COMMIT
                                            ▼
                                        Postgres — role saas_app (sem BYPASSRLS, não é dona das tabelas)
                                            RLS: loja_id = app_loja_atual()  ← vale mesmo se a query esquecer o filtro
```

| Proteção | Teste |
|---|---|
| **Toda** tabela com `loja_id` tem RLS ligado **e forçado** e uma policy `loja_id = app_loja_atual()`; tabela nova sem `loja_id` precisa entrar de propósito na lista do que não é de loja (hoje: `lojas` e `_prisma_migrations`) | `apps/api/test/vigilancia.spec.ts` |
| A role da API, **e toda role de que ela faça parte** (mesmo com NOINHERIT), não é superusuário nem tem BYPASSRLS; não é dona de tabela | `vigilancia.spec.ts` |
| A role da API tem **exatamente** estes privilégios (nada de DELETE nem TRUNCATE): lista fechada no teste | `vigilancia.spec.ts` |
| **A API se recusa a subir** se a conexão for de superusuário, de role com BYPASSRLS (mesmo herdado), de role dona de tabela, se alguma tabela com `loja_id` estiver sem RLS, ou se o banco não estiver em UTF-8 | `apps/api/src/banco/conferencia.ts` + `vigilancia.spec.ts` |
| Query sem `app.loja_id` devolve zero linhas; INSERT/UPDATE em outra loja é recusado; o valor não vaza pelo pool de conexões | `rls-banco.spec.ts` |
| De ponta a ponta pela API: cookie de uma loja não abre outra; 30 pedidos simultâneos de lojas diferentes não se misturam | `isolamento.spec.ts` |
| Trava no banco para usuários (promover a Dono, desativar a si mesmo, loja sem Dono) | `usuarios.spec.ts` |

**Como conferir na mão** (no servidor): `docker compose -f docker-compose.prod.yml --env-file .env.producao logs api | head`
— se a API subiu, a conferência do item acima passou. Ela imprime o motivo e para se não passar.

A role `saas_backup` **tem** BYPASSRLS de propósito: só ela consegue fazer o backup de todas as lojas.
Ela só lê (SELECT), não é usada pela API, e a API não faz parte dela (se fizesse, não subiria).
Ver [`decisoes/0004-roles-do-banco.md`](decisoes/0004-roles-do-banco.md).

## 2. Login (item 3.5)

Detalhes em [`LOGIN.md`](LOGIN.md): senha com scrypt, 5 erradas = 5 minutos (por usuário), 5 erradas em
1 minuto = 5 minutos (por IP), mesma resposta para usuário que não existe, cookie `__Host-` HttpOnly e
SameSite=Strict, sessão de 30 minutos sem uso. Testes: `autenticacao.spec.ts` e `usuarios.spec.ts`.

**Limite**: os contadores por IP ficam na memória da API. Com uma cópia da API (o `docker-compose.prod.yml`),
vale exatamente como descrito. Com várias cópias atrás de um balanceador, cada uma conta as suas: aí os
contadores precisam ir para o banco ou um Redis. O bloqueio por usuário já fica no banco e vale para todas.

## 3. Navegador (item 5.2)

- **CSP** (Content-Security-Policy): só roda script e estilo do próprio endereço; a página só conversa
  com o próprio endereço; ninguém coloca o sistema dentro de um `<iframe>`. No nginx
  (`apps/web/nginx/seguranca.conf`) e também no HTML do build (`apps/web/vite.config.ts`).
- Demonstração (`sistema-padrao-demo.html`): CSP com o **hash** do script e do estilo embutidos
  (`apps/web/scripts/juntar-html.mjs`) e `connect-src 'none'` — ela não manda dado para lugar nenhum.
- Outros cabeçalhos: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Strict-Transport-Security` (HSTS). A API ainda manda os do `helmet`.
- Pedidos que mudam dados vindos de outro site são recusados pela API (Origin/Sec-Fetch-Site), além do
  cookie SameSite=Strict.
- Respostas da API com `Cache-Control: no-store`.

## 4. Logs sem dado pessoal (item 5.3)

A API escreve **uma linha JSON por evento** (`apps/api/src/http/log.ts`): hora, nível, evento, id da
requisição (o mesmo `X-Request-Id` do nginx e da resposta), método, **padrão** da rota (`/usuarios/:id`,
nunca os valores), status, tempo, id da loja e id do usuário. **Nunca**: corpo, cookie, senha, nome,
CPF, telefone, e-mail ou mensagem de erro do banco. O teste `acentos-e-logs.spec.ts` confere isso.
Exceção: o evento `ip_bloqueado` leva o IP bloqueado (segurança; ver o registro de tratamento em `lgpd/`).

Ver os logs: `docker compose -f docker-compose.prod.yml --env-file .env.producao logs -f api`.
Buscar um erro que a pessoa viu na tela: pegue o `X-Request-Id` da resposta (DevTools) e procure por ele.

## 5. Segredos (item 2.4)

- **Varredura** `node scripts/varrer-segredos.mjs --historico`: procura chaves da AWS, chaves privadas,
  tokens do GitHub/Slack/Google/Stripe/IA, senha dentro de endereço de banco e atribuições do tipo
  `SENHA=...`/`API_KEY=...` nos arquivos **e em todos os commits de todos os branches**. Roda no CI.
- **Resultado em 18/11/2026**: nada encontrado (39 commits, branches `main` e `teste-local-windows`).
- Nenhum segredo em código: tudo vem do ambiente (`.env`, `.env.producao`, ambos fora do git). O
  `.dockerignore` deixa `.env` e builds locais fora das imagens.

**Se a varredura achar um segredo de verdade**, nesta ordem:
1. **Revogar/trocar** o segredo no serviço de origem (AWS, banco, provedor) — é isso que fecha a porta;
2. trocar no `.env.producao` e reiniciar (`up -d`);
3. só depois limpar o histórico (`git filter-repo`) e avisar quem tem cópia do repositório.
Apagar do código não basta: o valor continua no histórico do git.

## 6. Acentos (item 4.5)

- Banco em UTF-8 (a API confere ao subir) e criado com a ordem alfabética do português (ICU `pt-BR`).
- Texto digitado é guardado em NFC: o "ç" que o Mac manda em duas partes vira o mesmo "ç" do Windows.
- Teste de ponta a ponta: "Ração Pássaro Açaí — Coração & Ñandú" vai pela API, é gravado (bytes UTF-8
  conferidos no banco) e volta idêntico (`acentos-e-logs.spec.ts`).
- A demonstração começa com o **BOM** UTF-8: o "demonstraﺣ۶ﺣ۲o" da reunião era um visualizador
  adivinhando a codificação errada; com o BOM, ele não precisa adivinhar.
