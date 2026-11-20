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
