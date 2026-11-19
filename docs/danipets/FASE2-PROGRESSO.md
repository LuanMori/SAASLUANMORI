# Fase 2 — andamento da migração do DaniPets (módulo a módulo)

Referência: `docs/danipets/FASE1-DIAGNOSTICO.md` (IDs, classes e plano) e as decisões P1 a P12 aprovadas
pelo Luan em 19/11/2026. Cada módulo: regras no `packages/core` com testes → API da demonstração (mesmo
contrato que o servidor vai implementar) → telas → testes → demonstração gerada e conferida no navegador →
commit no `teste-local-windows`. **Pendências da Visão geral: continuam A DEFINIR** (P6).

| Módulo | Situação |
|---|---|
| 1. Base | **Concluído** (19/11/2026) |
| 2. Produtos e estoque | **Concluído** (19/11/2026) |
| 3. Fornecedores | **Concluído** (19/11/2026) |
| 4. Compras e contas a pagar | **Concluído** (19/11/2026) |
| 5. Caixa do dia | a fazer |
| 6. Clientes | a fazer |
| 7. Fidelidade | a fazer |
| 8. Vale-troca | a fazer |
| 9. Financeiro | a fazer |
| 10. Relatórios | a fazer |
| 11 a 14. Visão geral, Usuários, Dados e backup, Suporte | a fazer |
| 15. Consolidação (Fase 3) | a fazer |

---

## Módulo 1 — Base

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| ESP-01 | Nome "Dani Pet’s", descrição e logo fixos no código | **Dados da loja** (Dados e backup): nome, descrição e logo de cada loja. Aparecem na barra lateral, na tela de entrada e na Frente de caixa. O logo (PNG, JPEG ou WebP) é reduzido no próprio navegador | Adaptado |
| ESP-07 | Números fixos (desconto 10%, tolerância R$ 10, fiado 30 dias, cashback 3,5%/31 dias, cupom 5%/7 dias, aviso 7 dias, retorno 30 dias) | **Regras da loja** com esses valores como padrão e os mesmos limites (`REGRAS_LIMITES`). Já valem: o **desconto sem senha** (tela em Dados e backup → Regras gerais; a Frente de caixa e a regra da venda usam o valor da loja) e o **prazo do fiado** (vencimento das vendas no fiado). As outras valem com o padrão e ganham tela no módulo de cada uma | Adaptado |
| ESP-05 | Nome da loja fixo nas mensagens e no regulamento | Mensagens do DaniPets com `{loja}` no lugar do nome e `preencherModelo` (usados no módulo 7) | Adaptado (uso no M7) |
| ESP-06 | Campo "Pet" no cliente | Regra `clientes.campoExtra` (desligada, rótulo "Pet") — tela no módulo 6 (decisão P12) | Preparado |
| ESP-08 | Categorias de despesa e motivos de ajuste fixos | Listas por loja com as do DaniPets como padrão — telas nos módulos 2 e 9 | Preparado |
| ESP-10 | Unidade "kg" pensada para ração a granel | Regra `produtos.unidades` (un e kg) — tela no módulo 2 | Preparado |
| ACE-12 | Só uma aba aberta (trava) | **Substituído**: várias abas ao mesmo tempo, **uma operação por vez** entre elas (Web Locks), e as outras abas **recarregam sozinhas**. Quem foi desativado ou teve a senha redefinida em outra aba sai; papel mudado vale na hora (como no servidor) | Substituído |
| ACE-13 | Falha ao gravar: aviso vermelho fixo e nenhuma operação nova | **Tudo ou nada**: as gravações de uma operação vão juntas; se o navegador recusar uma, as outras são desfeitas e a tela recebe o motivo. Aviso vermelho fixo no alto, com "Tentar gravar de novo", que some quando volta a gravar. Como nada fica pela metade, as operações seguintes podem ser tentadas | Adaptado (melhor) |
| ACE-14 | Aviso quando aberto em visualização, celular ou Firefox | Aviso na demonstração quando aberta dentro de outra página/aplicativo (e-mail, Drive), no Firefox com o arquivo, ou num navegador que não guarda nada; pede ao navegador para não apagar os dados (armazenamento persistente). O aviso do celular não foi trazido: o sistema novo é feito também para o celular | Adaptado (só na demonstração) |
| ACE-15 | Tema claro/escuro, guardado no computador | Igual: sem escolha segue o computador; o botão da barra lateral troca; a escolha fica neste navegador. Todas as cores viraram variáveis (`estilos.css`) | Criado |
| ACE-17 | Auditoria de tudo (quem, quando, ação, detalhe) | 21 ações novas no histórico, com os nomes do DaniPets e um resumo pronto ("venda nº 00012 • R$ 5,00 de desconto • autorizado por Ana"), sem dado pessoal guardado (nome buscado na hora). Ver `docs/decisoes/0001-auditoria.md` | Adaptado |

### O que ficou para outro módulo (e por quê)

- **ACE-16** (cabeçalho com a situação do caixa) e **dias travados** (CX-08): dependem do caixa do dia →
  módulo 5.
- **ACE-10** (liberação do Dono com motivo): entra junto com cada caso (fiado acima do limite no 6,
  lançamento em dia fechado no 5).
- **"Baixar backup agora"** no aviso de falha: entra com a exportação dos dados da loja (módulo 13).

### Servidor

Nada novo de tabela (decisão P3: agora só a demonstração). O contrato `ApiLoja` (`lerConfiguracao`,
`salvarDadosDaLoja`, `salvarRegrasDaLoja`) responde 501 no sistema real até o servidor ganhar essa parte;
enquanto isso, a barra lateral usa o nome da sessão e as regras padrão. O `GET /auditoria` do servidor já
devolve o mesmo `resumo` da demonstração.

### Testes e conferência

- Testes automáticos: núcleo 261 (+23: regras da loja, auditoria, limite de desconto), servidor 134, tela
  227 (+44: gravação tudo ou nada, trava entre abas, API da demonstração, Dados e backup, tema, avisos).
- Navegador (Chromium, arquivo aberto com dois cliques): tema escuro e claro; nome e logo novos na barra;
  desconto sem senha de 15% valendo na Frente de caixa; duas abas — a desativação do Bruno numa aba tira o
  acesso dele na outra e a barra lateral da outra atualiza sozinha; armazenamento cheio → aviso vermelho,
  nada gravado pela metade, aviso some ao liberar espaço; histórico com as ações novas; celular (390 px)
  sem rolagem para o lado; console sem erros nem avisos.

---

## Módulo 2 — Produtos e estoque

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| PRD-01 | Cadastro: nome, código de barras, marca, peso, unidade (un/kg), fornecedor, preço, estoque mínimo, estoque inicial + custo (só gestor) | **Cadastro completo** numa janela: nome, código de barras, marca, peso da embalagem, vendido por unidade ou kg, preço (do quilo, no kg), estoque inicial e o custo dele (o custo, só Dono e Administrador; o Vendedor cadastra sem custo, como no DaniPets). O estoque mínimo continua no botão "Mínimo". O fornecedor entra no módulo 3, já como cadastro | Adaptado |
| PRD-04 | Aviso de produto parecido (mesmo nome, marca e peso) | Igual: pergunta "Salvar mesmo assim?" (no cadastro e na alteração); a comparação ignora maiúsculas e espaços | Criado |
| PRD-05 | Editar, com confirmação se já tem história e auditoria do antes/depois | Igual: "Alterar" (Dono e Administrador); nome ou código de barras de produto com vendas ou movimentos pergunta antes; o histórico registra "Preço alterado" (de → para) e "Produto alterado" (quais campos) | Criado |
| PRD-06 | Inativar/reativar; excluir só sem história | Igual: inativo some da Frente de caixa; "Excluir" só aparece (e só passa) sem vendas nem movimentos (o estoque inicial do cadastro não conta) | Criado |
| PRD-07 | Lista com busca | Busca por nome, marca ou código (sem acento e sem maiúscula); inativos no fim da lista | Adaptado |
| PRD-08 | Ajuste com motivos fixos + observação | Motivos **da loja** (padrão: os do DaniPets), em "Regras do estoque", e observação; a API recusa motivo fora da lista. A data do ajuste (retroativa com liberação) fica para o módulo 5, com os dias fechados | Adaptado |
| PRD-09 | Card "Como o saldo é calculado" | Clicar no saldo abre a conta: inicial + entradas − vendas + cancelamentos + devoluções ± ajustes | Adaptado |
| PRD-13 | Quantidades em kg com 3 casas | **kg em gramas** (inteiro, como o dinheiro em centavos): venda, estoque, devolução, mínimo, Visão geral e Relatórios. Na Frente de caixa: "1,5*código" = 1,5 kg, sem multiplicador = 1 kg, botões + e − de 0,5 kg (como o DaniPets), peso digitado com vírgula; o valor sai pelo preço do quilo; devolver o kg aos poucos dá exatamente o valor cobrado | Criado |
| ESP-10 | Unidade "kg" pensada para ração a granel | "Regras do estoque": a loja liga ou desliga a venda por kg (e por unidade) | Adaptado |

### Diferença proposital

- No DaniPets, a unidade de um produto com história podia mudar (o saldo 12 virava 12 kg). Aqui **não muda**:
  as vendas e o saldo estão guardados em unidades ou em gramas, e mudar de unidade mudaria o sentido
  deles. A tela avisa e sugere cadastrar um produto novo e inativar o antigo.

### O que ficou para outro módulo

- Fornecedor no produto: módulo 3 (cadastro de fornecedores).
- Custo médio, lotes e validade (PRD-10, 11): módulo 4 (compras). O custo do estoque inicial já fica
  guardado para o custo médio.
- Data retroativa no ajuste: módulo 5 (dias fechados).

### Servidor

Sem tabela nova (decisão P3). O servidor continua aceitando só o cadastro básico de produto (nome, código
de barras e preço), com a mesma validação de antes; a demonstração usa o cadastro completo. Alterar,
inativar e excluir respondem 501 no sistema real até o servidor ganhar essa parte.

### Testes e conferência

- Testes automáticos: núcleo 276 (+15: quantidades em kg, cadastro completo, parecido, venda e devolução
  por kg, conta do saldo), servidor 134, tela 238 (+11: tela de produtos, kg na Frente de caixa, carrinho).
- Navegador: exemplo a granel (25 kg, preço por kg); busca; produto parecido; alterar preço e histórico
  "de → para"; excluir sem história; ajuste com motivo da loja e observação; conta do saldo; Frente de caixa
  com "1,5*código", botão + de 0,5 kg e venda finalizada; Visão geral "2 kg vendidos"; regras do estoque;
  tema escuro; celular sem rolagem lateral; console sem erros nem avisos.

---

## Módulo 3 — Fornecedores

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| CMP-10 | Fornecedor como texto livre no produto e na compra | **Cadastro simples de fornecedores por loja** (decisão P9), na aba Compras: nome, CNPJ ou CPF (com os dígitos conferidos), telefone com DDD, contato e observação; o documento não se repete na loja; alterar, desativar e reativar; tudo no histórico. No produto, **"Fornecedor principal"** escolhido da lista (só Dono e Administrador veem a lista, como a aba Compras do DaniPets); fornecedor desativado sai da lista de escolha e a API recusa usá-lo | Criado |

- Quem cuida: Dono e Administrador (permissão "Compras"); o Vendedor recebe 403 e não vê a lista.
- Isolamento: cada loja tem os seus fornecedores (o mesmo CNPJ pode existir em lojas diferentes).
- Servidor: sem tabela nova (P3); a parte de fornecedores responde 501 no sistema real até lá.
- Nas compras (módulo 4), a nota fiscal vai apontar para o fornecedor do cadastro.

Testes: núcleo 281 (+5), servidor 134, tela 243 (+5). Navegador: cadastro com CNPJ e telefone
formatados, fornecedor principal no produto, histórico "Produto alterado (fornecedor)", celular sem
rolagem lateral, console sem erros.

---

## Módulo 4 — Compras e contas a pagar

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| CMP-01 | Compra por nota fiscal (fornecedor, NF, data) com vários itens (produto, quantidade, custo > 0, validade); só gestor | Janela **"Registrar compra"** na aba Compras: fornecedor do cadastro (ou sem fornecedor), NF (opcional), data (hoje ou antes; a trava dos dias fechados entra no módulo 5) e vários itens com produto, quantidade (unidades ou kg), custo (do quilo, no kg) e validade (opcional). Só Dono e Administrador (permissão "Compras") | Criado |
| CMP-02 | À vista (escolhe a conta) ou a prazo (vencimento vira conta a pagar) | Igual: à vista sai do Caixa físico ou da Conta bancária (o Caixa físico não fica negativo, como no resto do sistema); a prazo vira **conta a pagar** com o vencimento (padrão: daqui a 30 dias) | Criado |
| CMP-03 | NF repetida do mesmo fornecedor pede confirmação | Igual: "Já existe a NF 5001 de *fornecedor* (compra nº 1)" e a pergunta "Registrar mesmo assim?" | Criado |
| CMP-04 | Custo diferente do último: mostra custo, preço e margem e oferece mudar o preço na mesma gravação | Igual: um passo a mais mostra o custo de antes e o novo, o preço de venda e a margem antes e depois, e o **preço sugerido que mantém a margem**. Marcando, o preço muda junto com a compra (no histórico: "Preço alterado", com o nº da compra); sem marcar, o preço continua | Criado |
| CMP-05 | Ao escolher o produto, sugere o último custo e o fornecedor | Igual: o custo da última compra já vem preenchido e o fornecedor principal do produto entra se o campo estiver vazio | Criado |
| CMP-06 | Estornar compra com motivo; não deixa o estoque negativo; conta a pagar cancelada na proporção | **Estorno por item** (no DaniPets cada linha da compra é um registro), com motivo; recusa se o estoque ficaria negativo. À vista: o dinheiro volta para a conta de onde saiu. A prazo em aberto: a conta diminui o valor do item e é cancelada se zerar. A prazo já paga: o dinheiro volta para a conta usada no pagamento | Adaptado |
| CMP-07 | Bonificação: entrada de estoque sem custo | Mantido como "Entrada" em Produtos e estoque, com a explicação na janela da compra e no rodapé do histórico | Mantido |
| CMP-08 | Histórico de compras | Card **"Histórico de compras"**: nº, data, fornecedor, NF, total, pagamento e situação; clicar nos itens mostra quantidade, custo, validade e situação de cada um, com o botão "Estornar" | Criado |
| CMP-09 | Contas a pagar: lista, pagar escolhendo a conta, vencidas no painel | Card **"Contas a pagar"** na aba Compras: as abertas por vencimento, o total e as vencidas marcadas; "Pagar" escolhe a Conta bancária ou o Caixa físico. As vencidas na Visão geral entram no módulo 11, e a mesma lista no Financeiro no módulo 9 | Criado (painel no M11) |
| PRD-10 | Custo médio móvel a cada compra; custo guardado no item vendido | **Custo médio** recalculado a partir da história (custo do estoque inicial e as compras, sem as estornadas), mostrado em Produtos e estoque só para Dono e Administrador. Cada venda guarda o custo médio do momento em cada item, para o lucro dos Relatórios (módulo 10) | Criado |
| PRD-11 | Lotes e validade (o mais antigo sai primeiro), avisos de vencido e de vencendo em 30 dias, "Dar baixa no lote" | Card **"Validade"** na aba Compras: lotes vencidos ou vencendo em 30 dias que ainda têm saldo. Pela regra "o mais antigo sai primeiro", o saldo de hoje é das compras mais novas. "Dar baixa" pergunta quanto ainda está na prateleira e lança como ajuste "Produto vencido"; zero quer dizer que o lote já acabou, e o aviso some | Criado |

Outros pontos:

- A conta do saldo (Produtos e estoque) ganhou a linha "+ Compras (menos as estornadas)".
- O Vendedor não vê compras, custos nem contas a pagar: a API responde 403, como no DaniPets.
- Tudo entra no histórico: "Compra registrada", "Compra estornada", "Baixa de lote (validade)", "Conta
  paga" e "Preço alterado".
- Cada compra é uma operação só (tudo ou nada): estoque, dinheiro, conta a pagar e preço gravam juntos, ou
  nada grava.

### O que ficou para outro módulo

- **Caixa aberto** para a compra à vista paga pelo Caixa físico e **dias fechados** (compra com data de um
  dia já fechado): módulo 5.
- **Vencidas na Visão geral**: módulo 11. **Contas a pagar no Financeiro** (e outras despesas a prazo):
  módulo 9.
- **Lucro com o custo guardado na venda**: módulo 10.

### Servidor

Sem tabela nova (decisão P3). A parte de compras, contas a pagar e lotes responde 501 no sistema real até o
servidor ganhar essa parte.

### Testes e conferência

- Testes automáticos: núcleo 298 (+17: compra, nota repetida, custo médio, margem e preço sugerido,
  estorno, contas a pagar, lotes), servidor 134, tela 258 (+15: API das compras, tela Compras, conta do
  saldo).
- Navegador: compra a prazo com 2 itens (unidade e kg) de R$ 938,00, conta a pagar e lote com validade no
  aviso; conta paga pela Conta bancária; estorno do item a granel (a conta já estava paga, então o dinheiro
  volta para a Conta bancária); custo médio R$ 118,00 em Produtos e estoque; conta do saldo com as compras;
  histórico com as ações novas; celular (390 px) sem rolagem lateral, com os itens da nota em cartões;
  console sem erros nem avisos.
