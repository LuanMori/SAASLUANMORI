# 0003 — "Tudo ou nada" e duas vendas ao mesmo tempo

- **Data:** 18/11/2026 · **Origem:** revisão, itens 4.2 e 2.3 · **Situação:** padrão adotado; teste
  das 30 vendas simultâneas **entra junto com as vendas no servidor**

## Sobre o item 2.3 (a premissa)

A reunião disse que "o código atual está preparado" para dois vendedores venderem o último saco de
ração ao mesmo tempo, faltando só o teste. **O servidor ainda não tem vendas nem estoque**: eles
existem só na demonstração (navegador, uma pessoa por vez, sem concorrência possível). Então não há o
que testar hoje — o teste nasce junto com a venda no servidor, com o padrão abaixo, que **já é usado
e testado** em três lugares: código interno de produto (25 cadastros simultâneos sem repetir nem
pular), tentativas de senha (30 logins simultâneos: exatamente 4 conferidos antes do bloqueio) e
"último Dono" (dois Donos se rebaixando ao mesmo tempo: a loja continua com um).

## Decisão: o padrão para toda operação que mexe em mais de uma coisa

1. **Uma transação por operação**: `BancoService.comLoja(lojaId, async (tx) => { ... }, usuarioId)`.
   Tudo o que a venda faz (registrar a venda, baixar o estoque, lançar no caixa, criar o fiado,
   creditar cashback, registrar na auditoria) vai **dentro do mesmo `tx`**. Qualquer erro → `ROLLBACK`
   de tudo. Nada de gravar fora do `tx`, nada de chamar outro serviço no meio.
2. **Regras antes, gravação depois**: a função do `@saas/core` calcula tudo (ex.: `calcularVenda`,
   `movimentosDaVenda`, `efeitosFinanceirosDaVenda`) e o serviço só grava o resultado.
3. **Concorrência**: dentro da transação, **travar antes de ler o que vai decidir**:
   - estoque: `SELECT ... FROM estoque WHERE loja_id = $1 AND produto_id = ANY($2) ORDER BY produto_id FOR UPDATE`
     (a ordem fixa evita impasse entre duas vendas com os mesmos produtos), conferir o saldo e só
     então baixar;
   - sequência por loja (número da venda, código interno): `pg_advisory_xact_lock(hashtextextended('<assunto>:' || loja_id, 0))`
     — lojas diferentes não esperam umas pelas outras;
   - e uma rede de segurança no banco (`CHECK (saldo >= 0)` ou índice único), para o caso de alguém
     esquecer a trava.
4. **Coisas lentas fora da transação** (ex.: scrypt, chamada a operadora de cartão): a transação
   segura uma conexão do banco; mantenha-a curta.
5. **Teste obrigatório** de cada operação nova com disparos simultâneos, como os que já existem.

## O teste que vai existir (quando a venda chegar ao servidor)

30 vendas simultâneas do último item em estoque, de 30 sessões diferentes: exatamente **1** passa,
29 recebem "Estoque insuficiente", o saldo termina em 0 (nunca -1) e há 1 venda, 1 movimento de
estoque e 1 lançamento no caixa — nada pela metade.

## Demonstração

A demonstração grava no `localStorage` em sequência, sem transação. Como roda numa aba só e as
gravações são síncronas, não há concorrência; uma falha no meio (ex.: armazenamento cheio) poderia
deixar meia operação — aceitável numa demonstração, inaceitável no servidor (por isso o padrão acima).
