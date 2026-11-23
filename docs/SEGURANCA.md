# Segurança — o que protege o quê, e como conferir

> Atualizado em 18/11/2026 (revisão, itens 2.1, 2.2, 2.4, 3.5, 5.2 e 5.3) e em 23/11/2026 (o suporte, Adm. Sup:
> seção 7). Cada proteção abaixo tem um teste automático que roda no CI a cada push: se alguém desligar a
> proteção, o teste falha.

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
| **Toda** tabela com `loja_id` tem RLS ligado **e forçado** e uma policy `loja_id = app_loja_atual()`; tabela nova sem `loja_id` precisa entrar de propósito na lista do que não é de loja (hoje: `lojas` e `_prisma_migrations`). Uma única policy a mais, revisada e presa no teste: a da linha do suporte, só para a dona do schema (seção 7) | `apps/api/test/vigilancia.spec.ts` |
| A role da API, **e toda role de que ela faça parte** (mesmo com NOINHERIT), não é superusuário nem tem BYPASSRLS; não é dona de tabela | `vigilancia.spec.ts` |
| A role da API tem **exatamente** estes privilégios (nada de DELETE nem TRUNCATE): lista fechada no teste | `vigilancia.spec.ts` |
| **A API se recusa a subir** se a conexão for de superusuário, de role com BYPASSRLS (mesmo herdado), de role dona de tabela, se alguma tabela com `loja_id` estiver sem RLS, ou se o banco não estiver em UTF-8 | `apps/api/src/banco/conferencia.ts` + `vigilancia.spec.ts` |
| Query sem `app.loja_id` devolve zero linhas; INSERT/UPDATE em outra loja é recusado; o valor não vaza pelo pool de conexões | `rls-banco.spec.ts` |
| De ponta a ponta pela API: cookie de uma loja não abre outra; 30 pedidos simultâneos de lojas diferentes não se misturam | `isolamento.spec.ts` |
| Trava no banco para usuários (Dono e Administrador só pelo suporte, Personalizado com funções, desativar a si mesmo, mudar o próprio papel, loja sem Dono) | `usuarios.spec.ts` |

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

## 7. O suporte (Adm. Sup) — o usuário mestre (pedido do Luan, 23/11/2026)

O **Adm. Sup** (`super_admin`) entra em qualquer loja com tudo liberado, não aparece na lista de usuários e
aparece como **"Suporte"** no histórico e nas vendas. Só ele cadastra o Dono (na implantação) e o
Administrador. Ver [`decisoes/0006-adm-sup-e-personalizado.md`](decisoes/0006-adm-sup-e-personalizado.md).

```
POST /sessao (loja do endereço, usuário, senha)
   │ 1. procura o usuário NA LOJA (RLS, como sempre)
   │ 2. não achou → app_suporte_para_login(usuário)   ← função do banco, estreita
   │ 3. mesma conferência de senha, mesmo bloqueio (5 erradas = 5 min), mesma resposta para quem não existe
   ▼
sessão criada NA LOJA do endereço (loja_id da loja, usuario_id do suporte)
   └─ a cada pedido: app_suporte_por_id(id) confere se o suporte continua ativo
```

| Proteção | Teste |
|---|---|
| A linha do suporte não tem loja (`loja_id` NULL, CHECK do banco): a API (`saas_app`) **não enxerga** essa linha (RLS) e não consegue listar, alterar nem apagar o suporte | `adm-sup.spec.ts`, `rls-banco.spec.ts` |
| A API só chega ao suporte por **três funções SECURITY DEFINER**, com `search_path` fixo, sem `EXECUTE` para PUBLIC: `app_suporte_para_login` (o que o login precisa), `app_suporte_por_id` (nome e situação) e `app_suporte_registrar` (senhas erradas, bloqueio, último acesso). Nenhuma lista suportes nem muda nome, papel ou senha | `adm-sup.spec.ts`, `migracoes.spec.ts` |
| A única policy fora do padrão (`usuarios_suporte_dono_do_schema`) vale **só para a dona do schema** (num banco gerenciado ela não é superusuário e passa pelo RLS forçado): nunca para a `saas_app` nem para PUBLIC | `vigilancia.spec.ts` |
| Ninguém da loja usa o login do suporte (cadastrar `suporte` numa loja é recusado), e a senha dele não muda pela loja: só pelo script `db:suporte` (sorteada, 20 caracteres, mostrada uma vez) | `adm-sup.spec.ts` |
| Desativar ou dar nova senha ao suporte pelo script encerra as sessões abertas dele **em todas as lojas** | `adm-sup.spec.ts` |
| Dono e Administrador: só o suporte cadastra ou dá esses papéis — na API **e** na trava do banco (`usuarios_trava_api`), que reconhece o suporte pela função | `usuarios.spec.ts`, `adm-sup.spec.ts` |

**Cuidado de operação:** a senha do suporte abre todas as lojas. Guarde num cofre de senhas, use uma
pessoa por login de suporte (`--usuario suporte.joao`, por exemplo) e desative com `--desativar` quem sair
da equipe. Tudo o que o suporte faz numa loja fica no histórico dela, como "Suporte".
