# Pendências da Visão geral

> **Status: A DEFINIR.** O card já existe (pedido do Luan em 13/11/2026), mas ainda não escolhemos
> quais avisos entram nele. Enquanto este status for "A DEFINIR", o card mostra
> "Ainda não definimos quais avisos entram aqui." e nada é inventado.

## O que já está pronto

- Card **Pendências** no fim da Visão geral, no formato do DaniPets V9.3.3: título com a contagem,
  urgentes primeiro (ícone vermelho), atenção (ícone amarelo), texto e um botão opcional que leva
  para a aba onde se resolve.
- Regras de quem vê, já funcionando:
  - pendência marcada **só gestor** some para o Vendedor (como os avisos de Financeiro no DaniPets);
  - o botão some para quem não pode abrir a aba de destino (ex.: Vendedor não vê "Fazer pedido" em Compras).
- Demonstração: faixa amarela → **Usuários de teste** → **Mostrar pendências de exemplo** (só para ver o visual).
- Código: `apps/web/src/painel/pendencias.ts` (tipo `Pendencia`) e `apps/web/src/painel/CardPendencias.tsx`.
  Para ligar as pendências de verdade, cada uma vira uma regra que olha os dados da loja e devolve
  itens `Pendencia`, passados para `TelaPainel` em `pendencias`.
- **Regras prontas, mas desligadas (16/11/2026)**: como a Frente de caixa agora alimenta o estoque e o
  cartão a receber, as sugestões **6** (estoque baixo), **7** (estoque negativo) e **10** (cartão vencido sem
  confirmar) já estão escritas e testadas em `apps/web/src/painel/regrasPendencias.ts`, com os textos do
  DaniPets. Nada aparece no card até o Luan decidir: ligar é só passar o resultado para `pendencias`.

## Sugestões para escolher

Gravidade: **alta** = resolver já · **média** = atenção. "Gestor" = Dono e Administrador.

| # | Pendência | Gravidade | Quem vê | Botão leva para | Depende de (ainda não existe) |
|---|---|---|---|---|---|
| **Caixa do dia** | | | | | |
| 1 | O caixa de hoje não foi aberto: vendas ficam bloqueadas | média | todos | Caixa do dia ("Abrir caixa") | abertura e fechamento de caixa |
| 2 | Dia anterior com caixa aberto e sem fechamento | média | todos | Caixa do dia | abertura e fechamento de caixa |
| 3 | Fechamento com diferença acima do tolerado, aguardando o Dono | alta | gestor | Caixa do dia | fechamento de caixa |
| **Produtos e estoque / Compras** | | | | | |
| 4 | Lote com validade **vencida** ainda no estoque | alta | todos (baixa só gestor) | Produtos e estoque | lote e validade na entrada de compras |
| 5 | Lote vencendo em até 30 dias | média | todos | Produtos e estoque | lote e validade |
| 6 | Estoque baixo (no mínimo ou abaixo) | média | todos | Compras ("Fazer pedido") | **pronta, desligada** (o mínimo já se define na aba Produtos e estoque) |
| 7 | Estoque negativo (vendeu mais do que tinha) | alta | gestor | Produtos e estoque ("Ajustar") | **pronta, desligada** |
| **Financeiro** | | | | | |
| 8 | Contas a pagar vencidas | alta | gestor | Financeiro | contas a pagar |
| 9 | Contas a pagar vencendo hoje ou amanhã | média | gestor | Financeiro | contas a pagar |
| 10 | Recebimentos de cartão vencidos aguardando confirmação | média | gestor | Financeiro | **pronta, desligada** (falta a tela do Financeiro para confirmar) |
| **Clientes** | | | | | |
| 11 | Fiado vencido | média | gestor | Clientes | fiado |
| 12 | Clientes para lembrar (sem comprar há X dias, cashback vencendo) | média | todos | Clientes | histórico e cashback |
| **Usuários e acesso (próprio do SaaS)** | | | | | |
| 13 | Pessoa aguardando o Dono liberar o acesso | média | gestor | Usuários | tela de usuários (Fase 5.7) |
| 14 | Usuário bloqueado por muitas senhas erradas | média | gestor | Usuários | login definitivo |
| **Assinatura do SaaS (próprio do SaaS)** | | | | | |
| 15 | Fatura do sistema vencendo ou em atraso | alta perto do vencimento | só Dono | página da assinatura | cobrança do SaaS |

### Backup: sugestão de NÃO trazer do DaniPets

No DaniPets os avisos de backup ("último backup tem mais de um dia", "copie para um pen drive")
existem porque os dados ficam no notebook da loja. No SaaS os dados ficam no servidor, com backup
automático do banco: a loja não precisa fazer nada. Sugestão: não incluir esses avisos para a loja
(no máximo um alerta para o super admin, se um backup do servidor falhar).

## Como decidir

Para cada pendência: entra ou não? Gravidade? Quem vê? Para qual aba o botão leva?
Sugestão de ordem: começar pelas que já estão prontas (6, 7 e 10) e pelas que dependem das próximas
telas (Caixa do dia e Produtos e estoque): 1, 2, 4 e 5.
