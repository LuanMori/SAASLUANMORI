# Pendências da Visão geral

> **Status: A DEFINIR.** O card já existe (pedido do Luan em 13/11/2026), mas ainda não escolhemos
> quais avisos entram nele. **Exceção: as do Caixa do dia já estão definidas e LIGADAS** pelo Luan:
> a **16** (caixa fechado sozinho à meia-noite, "Deseja verificar?", Dono e Administrador) em 21/11/2026,
> e a **1** (caixa de hoje não aberto, todos), a **2** (dia anterior com caixa aberto, todos) e a **3**
> (fechamento com diferença acima da tolerância, **só o Dono**) em 22/11/2026. **Também ligadas (23/11/2026,
> arquivo fiado-caixa do Luan, "no card de pendências"):** a **17** (fiado a vencer, Dono e Administrador), a
> **18** (cashback a vencer, todos) e a **19** (promoções exclusivas, todos), que fazem o papel da 12.
> As outras continuam a definir: sem nenhuma pendência, o card diz "Nada pendente. Tudo em ordem." e
> explica que, por enquanto, só os avisos do caixa e dos clientes estão ligados. Nada é inventado.

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
  DaniPets. Em 17/11/2026 entrou a **11** (fiado vencido), junto com o fiado na Frente de caixa. Nada aparece no card até o Luan decidir: ligar é só passar o resultado para `pendencias`.
- **20/11/2026 (módulo 7, Fidelidade):** a **12** (clientes para lembrar hoje: sem comprar e cashback vencendo)
  também ficou pronta e desligada, com o texto do DaniPets ("2 clientes para lembrar hoje (1 sem comprar, 1
  cashback vencendo)"). Ela usa a mesma lista da aba Clientes → Retorno.
- **23/11/2026 (arquivo fiado-caixa do Luan; "as três pendências novas: no card de pendências"): 17, 18 e 19
  LIGADAS.** Cada uma mostra a contagem ("Fiado a vencer · 2") e o botão **Ver lista**, que abre os clientes na
  própria Visão geral:
  - **17 Fiado a vencer** (Dono e Administrador): compras no fiado que vencem de hoje a 7 dias, por cliente e
    vencimento, com **Receber** (só aquele vencimento) e **WhatsApp** (o lembrete de pagamento daquele
    vencimento, com a mensagem da loja; vale uma vez por vencimento: depois aparece "Lembrete registrado");
  - **18 Cashback a vencer** (todos): a mesma lista da aba Retorno, com **WhatsApp**;
  - **19 Promoções exclusivas** (todos): clientes sem comprar há N dias que podem receber o cupom de retorno
    (só se a loja dá cupom), com **WhatsApp**.
  - Quem pediu **"não incomodar"** ou adiou os lembretes fica fora das três listas (decisão do Luan: o "não
    incomodar" só tira das listas; a mensagem pela conta do cliente continua possível).
  - Código: `pendenciasDeClientes` na API e `apps/web/src/painel/PendenciasDoInicio.tsx`.
- **22/11/2026 (pedido do Luan: "pode ligar todos, o 3 somente para o dono"): a 1, a 2 e a 3 foram LIGADAS.**
  - **1** "O caixa de hoje não foi aberto: vendas ficam bloqueadas." (todos), botão **Abrir caixa**;
  - **2** "Dia com caixa aberto e sem fechamento: 21/11/2026. Feche esse dia para abrir o caixa de hoje."
    (todos), botão **Ir ao caixa**. Com o fechamento automático, isso só acontece quando alguém desfez o
    fechamento de um dia para contar a gaveta e ainda não fechou; nesse caso ela aparece no lugar da 1;
  - **3** "Fechamento de 22/11/2026 com falta de R$ 30,00, acima da tolerância de R$ 10,00 (fechou: Bruno •
    autorizou: Caio)." (urgente, **só o Dono**), botão **Conferir**. No Caixa do dia, o Dono vê o aviso
    vermelho com a justificativa e clica em **Ciente** (como o "Ciente" do DaniPets para cliente excluído).
    Se foi o próprio Dono que fechou ou autorizou, já fica ciente. O fechamento guarda a tolerância daquele
    momento, e mudar a regra depois não muda o que já fechou. Permissão nova: "Dar ciência do fechamento
    com diferença acima da tolerância" (só o Dono).
- **21/11/2026 (pedido do Luan): a 16 foi DEFINIDA e LIGADA.** Quando ninguém fecha o caixa, ele fecha
  sozinho à meia-noite (inclusive com o sistema aberto) e fica a pendência "O caixa de 21/11/2026 fechou
  sozinho à meia-noite, sem contagem da gaveta (esperado R$ 100,00). Deseja verificar?", com o botão
  **Verificar** (leva ao Caixa do dia). Lá, o Dono ou o Administrador confere os números do dia e marca como
  verificado (com observação), ou desfaz o fechamento para fechar contando. Verificado, a pendência some.
  Código: `pendenciasDoCaixa` em `apps/web/src/painel/regrasPendencias.ts`, calculada na Visão geral.
- **18/11/2026 (login próprio e aba Usuários):** a sugestão 13 mudou — ninguém mais "espera o Dono liberar"
  (o Dono cadastra direto); no lugar, avisar de quem recebeu senha provisória e ainda não entrou. A 14
  (usuário bloqueado) já pode ser feita: o bloqueio por senhas erradas existe no servidor e na demonstração.

## Sugestões para escolher

Gravidade: **alta** = resolver já · **média** = atenção. "Gestor" = Dono e Administrador.

| # | Pendência | Gravidade | Quem vê | Botão leva para | Depende de (ainda não existe) |
|---|---|---|---|---|---|
| **Caixa do dia** | | | | | |
| **1** | **O caixa de hoje não foi aberto: vendas ficam bloqueadas** | média | todos | Caixa do dia ("Abrir caixa") | **DEFINIDA pelo Luan em 22/11/2026 e LIGADA** |
| **2** | **Dia anterior com caixa aberto e sem fechamento** | média | todos | Caixa do dia ("Ir ao caixa") | **DEFINIDA pelo Luan em 22/11/2026 e LIGADA** |
| **3** | **Fechamento com diferença acima da tolerância: o Dono dá ciência** | alta | **só o Dono** | Caixa do dia ("Conferir" → "Ciente") | **DEFINIDA pelo Luan em 22/11/2026 e LIGADA** |
| **16** | **Caixa fechado sozinho à meia-noite, sem contagem: "Deseja verificar?"** | média | gestor | Caixa do dia ("Verificar") | **DEFINIDA pelo Luan em 21/11/2026 e LIGADA** |
| **Produtos e estoque / Compras** | | | | | |
| 4 | Lote com validade **vencida** ainda no estoque | alta | todos (baixa só gestor) | Produtos e estoque | lote e validade na entrada de compras |
| 5 | Lote vencendo em até 30 dias | média | todos | Produtos e estoque | lote e validade |
| 6 | Estoque baixo (no mínimo ou abaixo) | média | todos | Compras ("Fazer pedido") | **pronta, desligada** (o mínimo já se define na aba Produtos e estoque) |
| 7 | Estoque negativo (vendeu mais do que tinha) | alta | gestor | Produtos e estoque ("Ajustar") | **pronta, desligada** |
| **Financeiro** | | | | | |
| 8 | Contas a pagar vencidas | alta | gestor | Financeiro | **dá para ligar** (o Financeiro já lista e paga, desde 23/11/2026) |
| 9 | Contas a pagar vencendo hoje ou amanhã | média | gestor | Financeiro | **dá para ligar** (idem; inclui as contas avulsas: aluguel, energia) |
| 10 | Recebimentos de cartão vencidos aguardando confirmação | média | gestor | Financeiro | **pronta, desligada**; só aparece na baixa manual (o Financeiro já tem "Confirmar os vencidos") |
| **Clientes** | | | | | |
| 11 | Fiado vencido | média | gestor | Clientes | **pronta, desligada** (o fiado já existe na Frente de caixa) |
| 12 | Clientes para lembrar (sem comprar há X dias, cashback vencendo) | média | todos | Clientes (aba Retorno) | substituída pela 18 e pela 19 (23/11/2026) |
| **17** | **Fiado a vencer (próximos 7 dias), com Receber e WhatsApp** | média | gestor | "Ver lista" no card | **DEFINIDA pelo Luan em 23/11/2026 e LIGADA** |
| **18** | **Cashback a vencer, com WhatsApp** | média | todos | "Ver lista" no card | **DEFINIDA pelo Luan em 23/11/2026 e LIGADA** |
| **19** | **Promoções exclusivas (sem comprar, com o cupom de retorno), com WhatsApp** | média | todos | "Ver lista" no card | **DEFINIDA pelo Luan em 23/11/2026 e LIGADA** |
| **Usuários e acesso (próprio do SaaS)** | | | | | |
| 13 | Usuário com senha provisória que ainda não entrou (há mais de 3 dias): a senha provisória pode ter se perdido | média | gestor | Usuários ("Nova senha") | nada: dá para fazer com o que já existe (desde 18/11/2026) |
| 14 | Usuário bloqueado por muitas senhas erradas (pode ser alguém tentando adivinhar a senha) | média | gestor | Usuários | nada: o bloqueio já existe no login próprio (18/11/2026) |
| **Assinatura do SaaS (próprio do SaaS)** | | | | | |
| 15 | Fatura do sistema vencendo ou em atraso | alta perto do vencimento | só Dono | página da assinatura | cobrança do SaaS |

### Backup: sugestão de NÃO trazer do DaniPets

No DaniPets os avisos de backup ("último backup tem mais de um dia", "copie para um pen drive")
existem porque os dados ficam no notebook da loja. No SaaS os dados ficam no servidor, com backup
automático do banco: a loja não precisa fazer nada. Sugestão: não incluir esses avisos para a loja
(no máximo um alerta para o super admin, se um backup do servidor falhar).

## Como decidir

Para cada pendência: entra ou não? Gravidade? Quem vê? Para qual aba o botão leva?
Já ligadas: as do caixa (1, 2, 3 e 16) e as de clientes (17, 18 e 19). Sugestão de ordem para as próximas: as
que já estão prontas e só esperam o "sim" (6, 7, 10 e 11) e as de validade (4 e 5), que dependem da aba Produtos
e estoque. A 10 (cartão a receber vencido) só faz sentido para quem escolher a baixa manual do cartão.
