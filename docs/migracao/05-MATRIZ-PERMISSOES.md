# 05 — Matriz de permissões

Fase 1 da reconstrução. Fonte única no sistema antigo: `legacy/core/src/permissoes.ts`. Telas, demonstração e
servidor perguntam `pode(quem, permissao)`; ninguém compara o papel solto para liberar uma ação
(`legacy/core/src/permissoes.ts:2-4,156-158`).

## 1. Perfis (papéis)

| Papel | Nome na tela | Quem é | Fonte |
|---|---|---|---|
| `super_admin` | "Adm. Sup" (no histórico e nas vendas aparece como "Suporte") | o usuário mestre do sistema, da nossa empresa: está em todas as lojas vendidas, tem acesso a tudo e é invisível (não aparece na lista de usuários da loja) | `legacy/core/src/papeis.ts:7-9,11,27-32` |
| `dono` | "Dono" | dono da loja | `papeis.ts:16,24` |
| `administrador` | "Administrador" | gerente | `papeis.ts:16,24` |
| `vendedor` | "Vendedor" | vende, opera o caixa, cuida de clientes e cadastra produto novo | `papeis.ts:3-4,16,24` |
| `personalizado` | "Personalizado" | só as funções que o Dono (ou o Administrador) escolher | `papeis.ts:6,16,24` |

`ehGestor` = Dono, Administrador ou Adm. Sup; `ehDono` = Dono ou Adm. Sup (`papeis.ts:41,44`). Papel que não está na
matriz não pode nada (`permissoes.ts:145-154`).

## 2. As permissões e quem tem cada uma

Grupos especiais (`legacy/core/src/permissoes.ts`):
- **Só do Dono** (`SO_DONO`): `brinde`, `usuarios.donos`, `usuarios.excluir_dados`, `clientes.excluir_dados`,
  `caixa.ciencia`, `financeiro.baixa_cartao`, `dia_fechado.liberar`, `fiado.liberar` (`:61-71`).
- **Só do Adm. Sup** (`SO_ADM_SUP`): `dados.restaurar`, `suporte.ferramentas` (`:73-78`).
- **A matriz** (`:126-135`): Adm. Sup = todas; Dono = todas, menos as só do Adm. Sup; Administrador = todas, menos as
  só do Dono e as só do Adm. Sup; Vendedor = `vender`, `caixa`, `clientes`, `produtos.cadastrar`.
- **Personalizado**: só as funções marcadas para ele, dentre as que se podem dar (`PERMISSOES_CONCEDIVEIS`): todas,
  menos as só do Dono, as só do Adm. Sup e `usuarios` (`:80-83`). Uma função gravada por fora que não se pode dar não
  vale (`:145-152`).

Legenda: ✓ tem · — não tem · ◐ só se for marcada para ele.

| Permissão | Texto (`PERMISSOES`) | Adm. Sup | Dono | Administrador | Vendedor | Personalizado |
|---|---|---|---|---|---|---|
| `vender` | Vender na Frente de caixa | ✓ | ✓ | ✓ | ✓ | ◐ |
| `caixa` | Abrir e fechar o caixa | ✓ | ✓ | ✓ | ✓ | ◐ |
| `clientes` | Cadastrar e consultar clientes | ✓ | ✓ | ✓ | ✓ | ◐ |
| `clientes.desativar` | Desativar e reativar cliente | ✓ | ✓ | ✓ | — | ◐ |
| `clientes.limite` | Definir o limite de fiado do cliente | ✓ | ✓ | ✓ | — | ◐ |
| `clientes.cpf` | Ver o CPF completo do cliente | ✓ | ✓ | ✓ | — | ◐ |
| `clientes.fiado` | Ver o fiado de todos os clientes (aba Fiado) | ✓ | ✓ | ✓ | — | ◐ |
| `produtos.cadastrar` | Cadastrar produto novo | ✓ | ✓ | ✓ | ✓ | ◐ |
| `produtos.alterar` | Alterar, inativar e excluir produto | ✓ | ✓ | ✓ | — | ◐ |
| `estoque.lancar` | Lançar entrada, ajuste e estoque mínimo | ✓ | ✓ | ✓ | — | ◐ |
| `compras` | Compras | ✓ | ✓ | ✓ | — | ◐ |
| `financeiro` | Financeiro | ✓ | ✓ | ✓ | — | ◐ |
| `relatorios` | Relatórios e vendas de outros dias | ✓ | ✓ | ✓ | — | ◐ |
| `dados` | Dados e backup | ✓ | ✓ | ✓ | — | ◐ |
| `dados.restaurar` | Restaurar uma cópia de segurança (troca os dados atuais da loja) | ✓ | — | — | — | — |
| `loja.configurar` | Alterar os dados e as regras da loja | ✓ | ✓ | ✓ | — | ◐ |
| `usuarios` | Cadastrar, alterar e desativar usuários | ✓ | ✓ | ✓ | — | — |
| `usuarios.donos` | Cadastrar e alterar outro Dono, ou dar o papel de Dono | ✓ | ✓ | — | — | — |
| `usuarios.excluir_dados` | Excluir os dados de um usuário desativado (LGPD) | ✓ | ✓ | — | — | — |
| `clientes.excluir_dados` | Excluir os dados de um cliente (LGPD) | ✓ | ✓ | — | — | — |
| `desconto.acima_do_limite` | Dar desconto acima do limite da loja sem pedir senha | ✓ | ✓ | ✓ | — | ◐ |
| `estorno` | Cancelar venda e devolver itens sem pedir senha | ✓ | ✓ | ✓ | — | ◐ |
| `brinde` | Dar brinde (preço R$ 0,00) sem pedir senha | ✓ | ✓ | — | — | — |
| `caixa.retirada` | Fazer a retirada do dono (gaveta) sem pedir senha | ✓ | ✓ | ✓ | — | ◐ |
| `caixa.diferenca` | Fechar o caixa com diferença acima da tolerância sem pedir senha | ✓ | ✓ | ✓ | — | ◐ |
| `caixa.desfazer` | Desfazer o fechamento do caixa | ✓ | ✓ | ✓ | — | ◐ |
| `caixa.ciencia` | Dar ciência do fechamento com diferença acima da tolerância | ✓ | ✓ | — | — | — |
| `financeiro.baixa_cartao` | Escolher se o cartão entra no banco na hora ou fica a receber | ✓ | ✓ | — | — | — |
| `dia_fechado.liberar` | Liberar lançamento em dia com o caixa já fechado | ✓ | ✓ | — | — | — |
| `fiado.liberar` | Liberar venda no fiado acima do limite ou com fiado vencido | ✓ | ✓ | — | — | — |
| `suporte.ferramentas` | Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção) | ✓ | — | — | — | — |

Os textos estão em `legacy/core/src/permissoes.ts:20-53`.

## 3. Mensagem de recusa

`mensagemSemPermissao(p)` = `"<texto da permissão>: só <quem pode>."`, com quem pode entre Dono, Administrador e
Vendedor, separados por vírgula e "ou" no último; sem nenhum deles, "o Adm. Sup"
(`legacy/core/src/permissoes.ts:160-173`). As mensagens exatas, que a reconstrução precisa repetir:

| Permissão | Mensagem |
|---|---|
| `vender`, `caixa`, `clientes`, `produtos.cadastrar` | "<texto>: só o Dono, o Administrador ou o Vendedor." (ex.: "Vender na Frente de caixa: só o Dono, o Administrador ou o Vendedor.") |
| as que têm Dono e Administrador | "<texto>: só o Dono ou o Administrador." (ex.: "Financeiro: só o Dono ou o Administrador.") |
| as só do Dono | "<texto>: só o Dono." (ex.: "Dar brinde (preço R$ 0,00) sem pedir senha: só o Dono.") |
| as só do Adm. Sup | "<texto>: só o Adm. Sup." (ex.: "Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção): só o Adm. Sup.") |

No servidor antigo, a recusa sai como 403 com `codigo: sem_permissao` (`legacy/api/src/auth/guarda-autenticacao.ts:54-57`).

## 4. O Personalizado, tela por tela

Na tela de Usuários, as funções do Personalizado são marcadas por tela: o `acesso` abre a tela, e os `extras` só
valem com o acesso (`legacy/core/src/permissoes.ts:85-107`).

| Tela | Acesso | Extras |
|---|---|---|
| Frente de caixa | `vender` | `desconto.acima_do_limite`, `estorno` |
| Caixa do dia | `caixa` | `caixa.retirada`, `caixa.diferenca`, `caixa.desfazer` |
| Produtos e estoque | (todos consultam) | `produtos.cadastrar`, `produtos.alterar`, `estoque.lancar` |
| Compras | `compras` | — |
| Clientes | `clientes` | `clientes.desativar`, `clientes.limite`, `clientes.cpf`, `clientes.fiado` |
| Financeiro | `financeiro` | — |
| Relatórios | `relatorios` | — |
| Dados e backup | `dados` | — |
| Regras da loja | (várias telas) | `loja.configurar` |

`funcoesCoerentes` tira os extras que ficaram sem o acesso da tela deles (`permissoes.ts:114-122`). As regras de
cadastro do Personalizado (pelo menos uma função, extra exige o acesso) estão em `03-REGRAS-DE-NEGOCIO.md`, no módulo
Usuários.

## 5. O que cada perfil vê na barra lateral

Cada item do menu pede uma permissão e, em três deles, que o recurso esteja ligado na loja (Adm. Sup → Ajustes desta
loja). O item aparece só se as duas condições valem (`legacy/web/src/painel/menu.tsx:204-206`).

| Item | Permissão | Recurso da loja | Fonte |
|---|---|---|---|
| Frente de caixa (botão em destaque) | `vender` | — | `menu.tsx:58-60,191` |
| Visão geral | — (todos) | — | `menu.tsx:46` |
| Caixa do dia | `caixa` | — | `menu.tsx:69-71` |
| Produtos e estoque | — (todos) | — | `menu.tsx:81` |
| Compras | `compras` | `compras` | `menu.tsx:91-93` |
| Clientes | `clientes` | — | `menu.tsx:104-106` |
| Financeiro | `financeiro` | `financeiro` | `menu.tsx:115-117` |
| Relatórios | `relatorios` | `relatorios` | `menu.tsx:126-128` |
| Dados e backup | `dados` | — | `menu.tsx:137-138` |
| Usuários | `usuarios` | — | `menu.tsx:148-149` |
| Suporte | — (todos) | — | `menu.tsx:160` |
| Meu usuário | — (todos) | — | `menu.tsx:172` |

Grupo do menu sem nenhum item visível some junto (`legacy/web/src/painel/BarraLateral.tsx:54-56`). Na
Visão geral, uma pendência marcada "só gestor" some para quem não é gestor, e uma "só Dono" some para quem não é Dono
(`legacy/web/src/painel/pendencias.ts:30-32`; `legacy/web/src/painel/TelaPainel.tsx:169`).

As regras de permissão que dependem de cada operação (quem cria quem na aba Usuários, o Vendedor que só consulta o dia
de hoje, as liberações com senha na Frente de caixa e no caixa) estão nos módulos do `03-REGRAS-DE-NEGOCIO.md`.
