# 0001 — Padrão de "quem fez o quê" (auditoria)

- **Data:** 18/11/2026 · **Origem:** revisão, item 4.1 · **Situação:** padrão adotado; prazos **a decidir**

## Contexto

No DaniPets tudo fica registrado ("Fulano deu 15% de desconto na venda #123 às 14h32"). No SaaS isso
vale ainda mais: precisamos responder quem fez, em qual loja e quando — inclusive para a LGPD.

## Decisão

1. **Uma tabela `auditoria`**, por loja, com RLS como as outras: `loja_id`, `usuario_id` (quem fez;
   vazio = sistema/script ou tentativa sem login), `acao` (texto fixo de `ACOES_AUDITORIA`, em
   `packages/core/src/auditoria.ts`), alvo (`alvo_tipo` + `alvo_id`), `detalhes` (JSON) e `criado_em`.
2. **Só acrescenta.** A role da API tem `SELECT` e `INSERT`, nunca `UPDATE`/`DELETE` (teste de
   vigilância confere). Ninguém apaga o histórico pela API.
3. **Na mesma transação da ação** (`registrarAuditoria(tx, ...)`): se a ação falhar, o registro some
   junto; se o registro falhar, a ação não acontece.
4. **Sem dado pessoal em `detalhes`**: só ids, papéis, códigos e nomes de campos. O nome de quem fez e
   do alvo é lido da tabela de usuários/produtos **na hora de mostrar**: assim, a exclusão LGPD de um
   usuário vale também para o histórico ("Usuário removido").
5. **Quem vê**: Dono e Administrador da loja (aba Usuários → Histórico). O Vendedor não vê.
   "Nós vemos tudo" (super admin) entra na Fase 3.

## O que já é registrado

Entrar, sair, senha errada, bloqueio por senhas erradas; usuário criado, alterado (quais campos e o
papel antes/depois), desativado, reativado, senha redefinida, senha trocada, dados excluídos; produto
cadastrado.

Desde a Fase 2, módulo 1 (19/11/2026), também (por enquanto só na demonstração, onde essas partes
existem): dados e regras da loja alterados; desconto na venda (número, valor, brinde e quem autorizou),
venda cancelada e devolução (número, valor e quem autorizou); entrada, ajuste e estoque mínimo (com o
produto e o motivo); cliente cadastrado, alterado (quais campos), desativado, reativado e dados
excluídos; entrada, despesa, retirada do dono, transferência, saldo inicial, recebimento confirmado e
taxas de cartão alteradas. Os nomes do DaniPets (`audit(...)`) foram mantidos nos textos.

Módulos 3 e 4: fornecedor cadastrado, alterado, desativado e reativado; compra registrada (número, NF,
total, à vista ou a prazo), compra estornada, baixa de lote (validade) e conta paga.

Módulo 5 (Caixa do dia, 19/11/2026): abertura de caixa (dia e fundo de troco), sangria, suprimento,
retirada do dono da gaveta (com quem autorizou), fechamento (esperado, contado, diferença e quem
autorizou), fechamento automático (feito pelo "Sistema", sem pessoa), fechamento desfeito e lançamento
retroativo liberado (o que foi lançado, o dia e quem liberou). Os textos livres (justificativa do
fechamento, motivo de desfazer, motivo da liberação) ficam no próprio caixa, na compra ou no movimento de
estoque, e não nos detalhes do histórico.
Em 21/11/2026 (pedido do Luan): **fechamento automático verificado** (o dia, o esperado na gaveta e se houve
observação; a observação em si fica no próprio caixa). Em 22/11/2026: **ciência de diferença no fechamento**
(o dia e a falta ou a sobra; quem deu ciência é o Dono que está logado). Em 23/11/2026 (arquivo fiado-caixa):
"fiado recebido" passou a guardar o cobrado, a taxa, o troco e o vencimento; "taxas de cartão alteradas", as
taxas do débito e do crédito e a baixa (automática ou manual); o lembrete de pagamento, o vencimento lembrado.
Só valores, dias e percentuais: nada de dado pessoal.

Módulo 6 (Clientes e fiado, 20/11/2026): limite de fiado alterado (de → para), autorização de mensagens
(autorizou ou cancelou), não incomodar, CPF completo visto, fiado recebido (valor e forma), fiado liberado
pelo Dono (venda, valor e quem liberou), cliente excluído (sem histórico), exclusão de cliente conferida e
dados do cliente excluídos (LGPD, com quem liberou). O motivo da exclusão feita pelo Vendedor fica no aviso
para o Dono e o Administrador; o motivo da liberação, na venda ou no cadastro anonimizado.

Módulo 7 (Fidelidade, 20/11/2026): lembrete de retorno, aviso de cashback e lembrete de pagamento (o canal,
WhatsApp ou sem mensagem, e o cupom dado: % e validade), lembrete adiado (até quando), cupom de retorno usado
(% e venda) e cashback não recuperado (devolução ou cancelamento, venda e valor). O texto da mensagem não vai
para o histórico (pode ter dado pessoal); fica só o que o lembrete registrou.

Módulo 8 (Vale-troca, 20/11/2026): vale-troca emitido (código, valor e a venda da devolução). O código do vale
não é dado pessoal; o cliente do vale fica no alvo da linha (o nome é buscado na hora de mostrar).

O resumo de cada linha ("venda nº 00012 • R$ 5,00 de desconto • autorizado por Ana") sai de
`resumirAuditoria` (`@saas/core`), igual no servidor e na demonstração; o nome de quem autorizou é
buscado na hora (nos detalhes fica só o id). **Cada domínio novo entra aqui** (caixa, compras,
fidelidade...): acrescente a ação em `ACOES_AUDITORIA` (e o resumo em `resumirAuditoria`) e chame
`registrarAuditoria` na mesma transação.

## A decidir (vocês)

| Pergunta | Sugestão |
|---|---|
| Quais ações registrar? | todas as que mudam dinheiro, estoque, preço, permissão ou acesso (as "sensíveis"); leitura não |
| Por quanto tempo guardar? | o que for de venda/financeiro: **5 anos** (fiscal); acessos (entrar/sair/senha errada): **1 ano**; depois, uma limpeza mensal (precisa de uma role própria com `DELETE`, nunca a da API) |
| O Vendedor vê o histórico dele? | sim, só o dele, numa tela própria (a reunião sugeriu) — entra quando houver vendas no servidor |
