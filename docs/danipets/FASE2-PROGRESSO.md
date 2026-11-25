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
| 5. Caixa do dia | **Concluído** (19/11/2026; ajustes pedidos pelo Luan em 21 e 22/11/2026) |
| 6. Clientes | **Concluído** (20/11/2026; arquivo fiado-caixa do Luan passado para o código em 23/11/2026) |
| 7. Fidelidade | **Concluído** (20/11/2026) |
| 8. Vale-troca | **Concluído** (20/11/2026) |
| 9. Financeiro | **Concluído** (23/11/2026) |
| 10. Relatórios | **Concluído** (23/11/2026) |
| 11 a 14. Visão geral, Usuários, Dados e backup, Suporte | a fazer (Usuários: suporte e Personalizado adiantados em 23/11/2026, a pedido do Luan; Dados e backup: em andamento desde 25/11/2026, também a pedido dele) |
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

---

## Módulo 5 — Caixa do dia

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| CX-01 | Abrir: responsável + fundo de troco; precisa fechar o dia anterior antes | **"Abrir caixa de hoje"**: fundo de troco e observação; o responsável é quem está logado (não dá para digitar outro nome). Um caixa por loja por dia (decisão P4); só o de hoje, e só depois de fechar os dias anteriores. Para o Dono e o Administrador, a dica mostra quanto o Caixa físico tem no sistema | Criado |
| CX-02 | Sangria (deposita no banco ou retirada do dono), suprimento; não tira mais do que a gaveta tem; retirada do dono só com Dono/Admin | Igual: a sangria sai da gaveta e entra na Conta bancária; a **retirada do dono** só sai da gaveta, e o Vendedor precisa da senha do Dono ou do Administrador (quem autorizou fica no lançamento); o suprimento põe dinheiro na gaveta. Nada tira mais do que o esperado na gaveta | Criado |
| CX-03 | Esperado na gaveta = fundo + dinheiro movimentado depois da abertura; resumo | Igual (o saldo inicial e o ajuste do fechamento não entram). No alto da aba: aberto às e responsável, fundo de troco, esperado na gaveta e as vendas de hoje por forma | Criado |
| CX-04 | Fechar: contado, diferença, justificativa; acima de R$ 10 → senha do Dono/Admin; ajuste no Caixa físico; totais por forma | Igual, com a **tolerância da loja** ("Regras do caixa" na própria aba, decisão P5; padrão R$ 10,00). Sempre fecha o dia mais antigo em aberto. O fechamento guarda os números do dia: vendas por forma, sangrias, retiradas, suprimentos e devoluções em dinheiro | Adaptado (tolerância configurável) |
| CX-05 | Desfazer só o último fechamento (motivo + senha), estornando o ajuste | Só o último fechamento e sem caixa aberto depois dele; só o Dono e o Administrador; motivo obrigatório (no fechamento automático, também a explicação). O ajuste é estornado com um lançamento contrário, e o fechamento desfeito continua guardado no caixa ("fechamento desfeito 1 vez") | Criado |
| CX-06 | Fechamento automático à meia-noite, sem contagem | Igual: o caixa de um dia anterior que ficou aberto fecha sozinho, sem contagem e sem ajuste. Na demonstração isso acontece à meia-noite com o sistema aberto (desde 21/11/2026) ou no primeiro uso do dia seguinte; no servidor, vai ser uma tarefa agendada. No histórico aparece como "Fechamento automático", feito pelo Sistema | Criado |
| CX-07 | Histórico (dia, fundo, esperado, contado, diferença, quem) e movimentos do dia | **Histórico de caixa**: dia, fundo, esperado, contado, diferença com a justificativa, quem abriu, fechou e autorizou, e quantas vezes o fechamento foi desfeito. **Movimentos em dinheiro desde a abertura**: hora, descrição, tipo, quem fez e quem autorizou. No celular, o histórico vira cartões com rótulo | Criado |
| CX-08 | Dia já fechado fica travado; lançar nele só com a liberação do Dono | Igual: os dias anteriores até o último caixa fechado ficam travados. **Compra** e **entrada ou ajuste de estoque** com a data de um dia travado pedem a **"Liberação do Dono"** (senha e motivo; o Administrador não libera). A liberação vale uma vez e fica registrada na compra ou no movimento e no histórico ("Lançamento retroativo liberado"). Com o caixa de hoje fechado, não dá para vender, devolver, pagar conta nem lançar no Financeiro | Criado |
| CX-09 | Backup automático ao fechar o caixa | Fica para o módulo 13 (exportar e importar os dados): na demonstração, um lembrete de exportar ao fechar | Para o M13 |
| PDV-12 | Só vende com o caixa aberto e o responsável identificado; caixa de hoje fechado bloqueia | Igual: a API recusa. A Frente de caixa mostra a situação ("Caixa aberto às 08:10", "CAIXA DE HOJE NÃO ABERTO" ou "CAIXA DE HOJE FECHADO") e um aviso com o botão **"Abrir caixa"**. A venda guarda o caixa do dia; cancelar a venda inteira só com o caixa daquela venda aberto | Criado |
| DEV-05 | Devolução em dinheiro exige caixa aberto e não passa do que há na gaveta | Igual: em dinheiro, só com o caixa de hoje aberto e até o esperado na gaveta. Nas outras formas, basta o dia não estar fechado | Adaptado |
| ACE-16 | Cabeçalho com a situação do caixa | A situação aparece no cabeçalho da Visão geral (clicar nela leva para o Caixa do dia), na Frente de caixa e no topo da aba | Adaptado |
| ACE-10 | Liberação do Dono com motivo | Pronta e usada nos dias fechados. O fiado acima do limite usa a mesma janela no módulo 6 | Em parte (M6) |

### O caixa nas outras partes

- **Compra à vista** com a data de hoje: o caixa de hoje não pode estar fechado. Pelo Caixa físico, com o caixa aberto, não passa do esperado na gaveta. O dinheiro sai **no dia da compra**, mesmo quando a compra tem a data de um dia anterior.
- **Pagar conta a pagar**, **lançamento no Financeiro**, **saldo inicial** e **estorno de compra** que devolve dinheiro: o caixa de hoje não pode estar fechado. Pelo Caixa físico, com o caixa aberto, não passa do esperado na gaveta.
- **Receber em dinheiro** (recebimento confirmado no Caixa físico): só com o caixa de hoje aberto.
- **Entrada e ajuste de estoque** ganharam a data (hoje ou antes). Era o que tinha ficado do módulo 2.
- **Permissões novas** (`packages/core/src/permissoes.ts`): fazer a retirada do dono, fechar com diferença acima da tolerância e desfazer o fechamento (Dono e Administrador); liberar lançamento em dia fechado (só o Dono).
- **Histórico**: nos detalhes ficam só valores, dias e ids. A justificativa e os motivos ficam no próprio caixa, na compra ou no movimento (`docs/decisoes/0001-auditoria.md`).
- **Demonstração**: nos dias das vendas de exemplo, o caixa abriu às 08:00 com R$ 100,00 de troco e fechou às 18:30 sem diferença. O Caixa físico começa com esses R$ 100,00 (saldo inicial da implantação). O caixa de hoje fica para a pessoa abrir.

### O que ficou para outro módulo (e por quê)

- **Lançamento financeiro com data de outro dia** (FIN-03): entra com a tela do Financeiro (módulo 9). A liberação do Dono já está pronta para ele.
- **Receber o fiado em dinheiro pela conta do cliente**: módulo 6. A regra do caixa aberto já vale.
- **Vale-troca** no resumo do fechamento: módulo 8.
- **Backup ao fechar o caixa** (CX-09): módulo 13.
- **Data antes do início do uso do sistema**: o DaniPets recusava. A loja do SaaS ainda não tem a data de implantação; por enquanto o sistema recusa só data inválida ou futura.

### Servidor

Sem tabela nova (decisão P3). A parte do caixa responde 501 no sistema real até o servidor ganhar essa parte. Lá, o fechamento automático vai ser uma tarefa agendada para a meia-noite de cada loja.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 325 (+27): abrir, gaveta, sangria, retirada e suprimento, fechar com tolerância, fechamento automático, desfazer, dia travado e liberação, cancelamento e devolução com o caixa, data no estoque;
  - servidor 134;
  - tela 278 (+20): 12 da API do caixa e 8 de telas (Caixa do dia, Frente de caixa sem caixa, Visão geral, compra e ajuste em dia fechado).
  - Os testes que vendem sem tratar do caixa abrem o caixa sozinhos (`apps/web/src/testes/caixa.ts`).
  - Três testes de tela dos módulos 2 e 4 às vezes falhavam com o computador ocupado: liam a tabela antes
    de ela recarregar. Passaram a esperar o dado novo. A suíte inteira rodou 3 vezes seguidas sem falhas.
- **Navegador**:
  - Visão geral com "Caixa de hoje não aberto" (o clique leva ao Caixa do dia);
  - histórico com os 2 dias dos exemplos;
  - abertura com R$ 130,00 (a dica mostra o saldo do Caixa físico);
  - na Frente de caixa, a pílula verde e uma venda de R$ 15,00 em dinheiro;
  - sangria e suprimento, com o esperado certo;
  - em outra aba, o Bruno faz a retirada com a senha da Ana e fecha com falta de R$ 15,00 autorizada pelo Caio;
  - a Frente de caixa passa a mostrar "CAIXA DE HOJE FECHADO", e a aba da Ana atualiza sozinha;
  - a Ana desfaz o fechamento;
  - uma compra com a data de ontem é liberada pela Dona;
  - o histórico mostra as ações novas;
  - tema escuro;
  - celular (390 px) sem rolagem para o lado;
  - console sem erros nem avisos.

### Ajuste de 21/11/2026 (pedido do Luan): formato do DaniPets, meia-noite e "Deseja verificar?"

O pedido: *"quero adicionar este formato na aba caixa, quando o caixa estiver fechado impossível realizar
vendas. caso não ocorra o fechamento manual caixa fechar sozinho a 00:00 e deixar uma pendência avisando e
se deseja verificar."*

- **Formato da aba (igual à imagem do DaniPets):**
  - cabeçalho com "Abertura, sangria, suprimento e fechamento." e, à direita, a situação do caixa de hoje
    (com a bolinha colorida) e a data por extenso ("Sábado, 21 de novembro de 2026");
  - avisos com ícone: amarelo (caixa de hoje não aberto, "Deseja verificar?"), vermelho (dia anterior aberto,
    erro) e verde (caixa fechado, ação feita);
  - "Abrir caixa de hoje" numa linha: Fundo de troco | **Operador** (quem está logado; antes se chamava
    "Responsável") | Observação | Abrir caixa, com a dica embaixo. A sangria e o fechamento usam a mesma
    linha;
  - Histórico de caixa e Movimentos em dinheiro sempre com o cabeçalho; vazios, "Nenhum registro.".
- **Sem caixa aberto não há venda:** a API já recusava. Agora a Frente de caixa recusa na hora (no botão e no
  F2), sem nem tentar gravar.
- **Fechamento sozinho à 00:00 com o sistema aberto:**
  - o painel confere a virada do dia a cada 10 segundos e quando a tela volta a ficar visível
    (`apps/web/src/painel/usarViradaDoDia.ts`; o DaniPets conferia a cada minuto);
  - à meia-noite, o caixa que ficou aberto fecha sozinho, todas as telas leem de novo e aparece o aviso
    "Novo dia: o caixa de 21/11/2026 fechou sozinho à meia-noite, sem contagem da gaveta." (também na Frente
    de caixa, que passa a mostrar "CAIXA DE HOJE NÃO ABERTO");
  - sem o sistema aberto, continua fechando no primeiro uso depois da meia-noite.
- **Pendência "Deseja verificar?"** (a nº 16 de `docs/PENDENCIAS.md`, a primeira definida e ligada):
  - para o Dono e o Administrador, na Visão geral: "O caixa de 21/11/2026 fechou sozinho à meia-noite, sem
    contagem da gaveta (esperado R$ 100,00). Deseja verificar?", com o botão **Verificar**;
  - no Caixa do dia, o mesmo aviso abre a janela **"Verificar o fechamento"**: fundo, entradas e saídas em
    dinheiro, esperado na gaveta e vendas do dia. Bateu: **Marcar como verificado** (observação opcional;
    quem e quando ficam no caixa e no histórico, "Fechamento automático verificado"). Não bateu:
    **Desfazer para contar** e fechar o dia com a contagem (a diferença vira ajuste, com justificativa);
  - o Vendedor não confere: vê "a verificar" no histórico;
  - o card de Pendências, quando não há nada, diz "Nada pendente. Tudo em ordem." e explica que, por enquanto,
    só este aviso está ligado.
- **Defeito corrigido:** desfazer um fechamento automático não adiantava, porque a próxima leitura fechava o
  dia sozinho de novo. Agora o dia reaberto hoje fica aberto até a próxima meia-noite, esperando a contagem
  (`precisaFecharSozinho` em `packages/core/src/caixa.ts`).
- **Testes:**
  - núcleo 387 (+3): dia reaberto, verificação e pedido (e o texto novo do histórico);
  - servidor 134;
  - tela 334 (+8): API (verificar e quem vê; dia reaberto), aba (verificar, Vendedor, desfazer para contar),
    Visão geral, painel (virada da meia-noite, inclusive na Frente de caixa) e o relógio.
- **Navegador** (com o relógio controlado):
  - às 23:58 a Ana abre o caixa;
  - às 00:01 aparece o aviso de novo dia e a Visão geral mostra a pendência;
  - **Verificar** → janela → marcado como verificado, e a pendência some;
  - na Frente de caixa às 23:59, com um item no carrinho, a virada bloqueia a venda (F2 recusado e nenhuma
    venda gravada);
  - o Vendedor vê só "a verificar";
  - tema escuro;
  - celular sem rolagem para o lado;
  - console sem erros.

### Ajuste de 22/11/2026 (pedido do Luan): pendências 1, 2 e 3 do caixa ligadas

O pedido: *"pode ligar todos, o 3 somente para o dono"* (as três sugestões do caixa de `docs/PENDENCIAS.md`).

- **1 — caixa de hoje não aberto** (todos): "O caixa de hoje não foi aberto: vendas ficam bloqueadas.", com
  **Abrir caixa** (texto do DaniPets).
- **2 — dia anterior com caixa aberto** (todos): "Dia com caixa aberto e sem fechamento: 21/11/2026. Feche esse
  dia para abrir o caixa de hoje.", com **Ir ao caixa**. Aparece no lugar da 1, porque é esse dia que precisa
  fechar antes. Com o fechamento automático, só acontece quando alguém desfez o fechamento para contar a gaveta.
- **3 — diferença acima da tolerância** (urgente, **só o Dono**): "Fechamento de 22/11/2026 com falta de
  R$ 30,00, acima da tolerância de R$ 10,00 (fechou: Bruno • autorizou: Caio).", com **Conferir**:
  - no Caixa do dia, o Dono vê o aviso vermelho com a justificativa e clica em **Ciente** (como o "Ciente" do
    DaniPets para cliente excluído). O histórico mostra "ciente: Ana em … às …" ou "aguardando a ciência do
    Dono", e o registro de ações ganha "Ciência de diferença no fechamento";
  - se foi o próprio Dono que fechou ou autorizou com a senha, já fica ciente;
  - o fechamento guarda a tolerância do momento: mudar a regra depois não muda o que já fechou;
  - permissão nova em `packages/core/src/permissoes.ts`: "Dar ciência do fechamento com diferença acima da
    tolerância" (só o Dono; aparece na tabela de permissões da aba Usuários). O Administrador não vê a 3.
- O card de Pendências vazio diz "Nada pendente. Tudo em ordem." e "Por enquanto, só os avisos do caixa estão
  ligados". As outras pendências continuam A DEFINIR.
- No histórico do caixa, a coluna "Quem" passou a quebrar a linha, para o botão "Desfazer fechamento" não ficar
  cortado.
- **Testes:**
  - núcleo 390 (+3): tolerância guardada, ciência automática do Dono e dar ciência; permissão nova;
  - servidor 134;
  - tela 340 (+6): API (só o Dono vê e dá ciência; o Dono que fecha ou autoriza já fica ciente), regras das
    pendências 1, 2, 3 e 16, Visão geral e Caixa do dia (Administrador e Dono) e o filtro "só o Dono" do painel.
- **Navegador:**
  - o Vendedor vê a 1 e "Abrir caixa" leva ao Caixa do dia; com o caixa aberto, "Nada pendente";
  - o Bruno fecha com falta de R$ 30,00 autorizada pelo Caio;
  - o Caio (Administrador) não vê a 3;
  - a Ana vê a 3 em vermelho e dá **Ciente** no Caixa do dia;
  - a 2 aparece depois de desfazer um fechamento automático, e "Ir ao caixa" leva ao fechamento;
  - celular sem rolagem para o lado;
  - console sem erros.

---

## Módulo 6 — Clientes e fiado

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| CLI-01 | Cadastro: nome, telefone, CPF, pet, aniversário, endereço, observações, limite de fiado (gestor), WhatsApp, autorização de mensagens (com data), não incomodar | Igual. O **"Pet" virou o campo extra da loja** (decisão P12): ligado e com o nome que a loja escolher, em "Regras dos clientes" (desligado no padrão). O limite de fiado só o Dono e o Administrador mudam (a API recusa o Vendedor). A autorização de mensagens guarda quando e quem registrou | Adaptado |
| CLI-02 | Cadastro completo (nome, telefone, CPF) exigido para o fiado | No sistema novo todo cadastro já é completo; a regra fica valendo para dados de fora: fiado só com o cadastro completo | Mantido |
| CLI-03 | Lista: busca (nome, pet, CPF, telefone), filtros, até 300 linhas, situação | **Aba Clientes**: busca por nome, campo extra, CPF ou telefone (3 números ou mais); filtros (todos, com fiado, fiado vencido, cadastro incompleto, não incomodar, desativados); até 300 linhas; situação (cadastro incompleto, fiado vencido, acima do limite, não incomodar, em dia) | Criado |
| CLI-04 | Conta do cliente: resumo + extrato | **Conta do cliente**: fiado em aberto, limite e disponível, compras (total e ticket médio), última compra, dados do cadastro, as compras no fiado em aberto e o **extrato** (Tudo, Compras, Fiado: compras, devoluções, compras no fiado, pagamentos e estornos do fiado) | Criado (cashback, vale e contatos entram no extrato nos módulos 7 e 8) |
| CLI-05 | CPF mascarado; completo só quando pedido | Igual: as telas recebem o CPF mascarado (nem chega o número inteiro). O Dono e o Administrador clicam em "Mostrar", e isso fica no histórico ("CPF completo visto"). Na edição, o CPF em branco mantém o do cadastro | Adaptado |
| CLI-06 | Editar cliente | Igual ("Editar cadastro"), com o histórico do que mudou | Criado |
| CLI-07 | Excluir cliente sem histórico (motivo); se foi o Vendedor, aviso no painel do gestor até "Ciente" | Igual. O aviso aparece no alto da aba Clientes para o Dono e o Administrador, porque as pendências da Visão geral ainda estão a definir | Adaptado |
| CLI-08 | Excluir dados (LGPD): só Dono, com liberação e motivo; não com fiado aberto | Igual: "Excluir dados (LGPD)" pede a **liberação do Dono** (senha e motivo). Apaga também o campo extra, o nascimento, o endereço, as observações, o limite e a autorização. As vendas continuam, sem identificar o cliente. A parte do cashback entra no módulo 7 | Adaptado |
| CLI-09 | Desativar e reativar (gestor) | Igual ("Desativar" e "Reativar" na conta); o cliente desativado some da busca da Frente de caixa | Criado |
| CLI-15 | Aba Fiado (gestor): devendo, limite, disponível, mais antiga, vencido ou vence em, totais, receber; aviso do CDC art. 42 | Igual: totais (a receber, vencido, limite concedido) e as contas em aberto da mais vencida para a menos, com "Receber" e "Abrir conta". O "Lembrar" (WhatsApp) entra no módulo 7 | Criado |
| CLI-16 | Receber fiado pela conta: abate o mais antigo; dinheiro (com caixa aberto), Pix ou cartão (com taxa) | Igual: o valor (todo ou parte) abate primeiro a compra que vence primeiro. A janela mostra o que vai ser abatido e quanto fica devendo. Dinheiro só com o caixa de hoje aberto; Pix na Conta bancária; cartão fica a receber da operadora, com a taxa. O Vendedor também recebe, como no DaniPets | Criado |
| PDV-10 | Fiado só com cadastro completo; limite por cliente; acima do limite ou com fiado vencido → liberação do Dono | Igual: na Frente de caixa, a venda no fiado que passa do limite, de cliente sem limite (limite 0) ou com fiado vencido (regra da loja, ligada no padrão) abre a **"Liberação do Dono"** (senha e motivo). O Administrador não libera. A venda guarda quem liberou e por quê | Criado |
| PDV-11 | F6: faixa com cashback, vale, fiado/limite e cupom | A faixa do cliente mostra o fiado em aberto, o limite com o disponível (ou "Sem limite de fiado") e o fiado vencido. Cashback, vale e cupom entram nos módulos 7 e 8 | Em parte (M7, M8) |

### Outros pontos

- **Permissões novas**:
  - Dono e Administrador: definir o limite de fiado, ver o CPF completo e ver o fiado de todos os clientes (a aba Fiado e o filtro de fiado);
  - só o Dono: liberar fiado acima do limite ou com fiado vencido.
- **Regras dos clientes** (Dono e Administrador), dentro da própria aba (decisão P5): o campo extra e as regras do fiado (prazo e "fiado vencido pede a liberação do Dono").
- **Fiado pago em parte**: a parte paga fica separada, como "recebida". Assim, se a compra for devolvida depois, o sistema abate primeiro o que ainda estava em aberto e devolve o resto pela conta em que o pagamento entrou.
- **Demonstração**: a cliente de exemplo Maria Oliveira tem R$ 200,00 de limite de fiado.
- **Mudança que a pessoa vai notar**: cliente com limite 0 só compra no fiado com a liberação do Dono, como no DaniPets. Antes de registrar o fiado, defina o limite de quem compra fiado.

### O que ficou para outro módulo (e por quê)

- **Cashback, cupom de retorno, aba Retorno, lembretes pelo WhatsApp** ("Lembrar pagamento", "Avisar cashback") e o **regulamento** do programa: módulo 7.
- **Vale-troca** na conta e no extrato: módulo 8.
- **Registro de alterações dentro da conta do cliente**: o histórico completo continua em Usuários → Histórico.
- **Avisos na Visão geral** (clientes para lembrar, fiado vencido): dependem das pendências (decisão P6, a definir).

### Servidor

Sem tabela nova (decisão P3). A parte nova de clientes responde 501 no sistema real até o servidor ganhar essa parte.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 339 (+14): cadastro completo, fiado do cliente, limite e liberação, receber abatendo a mais antiga, pagamento em parte e devolução depois, extrato, histórico;
  - servidor 134;
  - tela 292 (+14): 9 da API de clientes e 5 de telas (lista e conta, CPF, receber, aba Fiado, exclusão com aviso, regras com o campo extra, LGPD com liberação, fiado acima do limite na Frente de caixa).
  - Os testes antigos de fiado passaram a dar limite ao cliente e a liberação para a exclusão LGPD.
- **Navegador**:
  - lista com o CPF oculto e o limite da Maria;
  - "Mostrar CPF" para a Dona;
  - extrato com as compras de exemplo;
  - campo extra "Pet" ligado nas regras e preenchido;
  - venda no fiado dentro do limite;
  - venda no fiado do João (sem limite) liberada pela Dona;
  - aba Fiado com os totais e "acima do limite";
  - receber em dinheiro (com o caixa aberto) e em Pix;
  - LGPD do João com liberação;
  - em outra aba, o Bruno exclui um cliente sem histórico; o aviso aparece para a Ana (a aba atualiza sozinha) e ela marca "Ciente";
  - histórico com as ações novas;
  - tema escuro;
  - celular (390 px) sem rolagem para o lado;
  - console sem erros nem avisos.

### Ajuste de 23/11/2026: o arquivo "fiado-caixa" do Luan, passado para o código

O Luan mandou um `sistema-padrao-fiado-caixa.html` com funções escritas à mão dentro do arquivo já gerado (fora
do código, sem testes; sumiriam na próxima geração da demonstração). A revisão (pedido "veja se todo o código
está bem amarrado") achou o arquivo funcionando, mas solto do projeto e com regras mudadas sem registro. Com as
decisões do Luan, tudo foi refeito no código, com testes:

- **Receber fiado** (janela nova, como no arquivo):
  - valor a baixar (todo, parte ou só um vencimento);
  - a forma em botões;
  - **dinheiro entregue com troco**: na gaveta entra só o valor da baixa;
  - **cartão com a taxa da maquininha repassada ao cliente**: ele paga o bruto e a loja recebe o valor cheio. A
    conta (`cotarRecebimentoFiado`) foi conferida para todas as taxas de 0,01% a 99,99% e nunca erra o centavo;
  - prévia com "Cobrar na maquininha", taxa, líquido, saldo após a baixa e o que abate primeiro;
  - **chave do pedido**: o clique duplo ou a rede lenta não recebem duas vezes;
  - **"a taxa mudou"**: se a taxa mudou entre a tela e a gravação, a pessoa confere o valor novo antes.
- **Baixa do cartão** (decisão 1: "ao definir as taxas da maquininha receber automaticamente, mas ter a opção de
  deixar manual, escolha do dono"):
  - **automática** (o padrão): a venda e o fiado no cartão entram na Conta bancária na hora, já sem a taxa;
  - **manual**: ficam a receber da operadora até confirmar o depósito, como no DaniPets;
  - só o Dono escolhe (permissão nova "Escolher se o cartão entra no banco na hora ou fica a receber");
  - as vendas de exemplo da demonstração seguem o padrão (o cartão delas já está no banco);
  - cancelar ou devolver uma venda com baixa feita tira o valor do banco (a regra do módulo 4 já tratava isso).
- **Taxas da maquininha** (decisão 2): botão em **Clientes → Fiado**, para o **Dono e o Administrador** (as
  taxas); a baixa automática ou manual fica travada para o Administrador. No arquivo, era só o Dono e
  comparando o nome do papel, fora da tabela de permissões.
- **"Não incomodar"** (decisão 3): **só tira das listas**. No arquivo, também bloqueava a mensagem de cobrança;
  agora a mensagem pela conta do cliente continua possível.
- **Pendências de clientes no card** (decisão 4): Fiado a vencer, Cashback a vencer e Promoções exclusivas, com
  "Ver lista", Receber e WhatsApp (as 17, 18 e 19 de `docs/PENDENCIAS.md`).
- **Lembrete de pagamento de um vencimento**: usa a mensagem de cobrança da loja (com o valor e a data daquele
  vencimento), em vez do texto fixo do arquivo, e vale uma vez por vencimento.
- Histórico: "Fiado recebido" mostra o cobrado, a taxa, o troco e o vencimento; "Taxas de cartão alteradas" mostra
  as taxas e a baixa.
- **Testes**:
  - núcleo 396 (+6): cotação, vencimento, referência, fiado a vencer, baixa na hora, taxas com a baixa, permissão;
  - servidor 134;
  - tela 353 (+13): API (troco, vencimento, chave, taxa mudou, baixa manual e automática, taxas por papel,
    pendências de clientes, lembrete do vencimento) e telas (receber, taxas, pendências com Ver lista).
- **Navegador**:
  - fiado recebido com troco (a gaveta sobe só o valor da baixa);
  - venda no crédito com baixa automática (o banco sobe na hora) e com a manual (fica a receber);
  - o Administrador com a baixa travada;
  - "Fiado a vencer" com o WhatsApp do vencimento e o Receber no crédito com a taxa repassada;
  - celular;
  - console sem erros.

---

## Módulo 7 — Fidelidade

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| CLI-10 | Cashback: % do que foi pago em dinheiro, Pix ou cartão (3,5%), válido por 31 dias, em lotes; cashback, vale e fiado não geram; devolução retira; cancelamento devolve o usado | Igual, com o percentual (0 a 20%) e o prazo (1 a 3.650 dias) nas regras da loja. Cada compra vira um lote; o uso tira primeiro do lote que vence antes. Só com o cadastro completo. **Cashback em aberto** no alto da aba Clientes, com "Ver de onde vem" (gerado + devolvido − usado − retirado − vencido = em aberto), por cliente e o que vence nos próximos dias. Coluna e filtro "Com cashback" na lista; "Cashback disponível" na conta; no extrato: ganho, devolvido, usado, retirado e vencido | Criado |
| CLI-11 | Cupom de retorno: sem comprar há 30 dias → lembrete com cupom de 5% por 7 dias, aplicado sozinho, um por ciclo | Igual: a mensagem de retorno marcada como enviada pelo WhatsApp dá o cupom; se o cliente já tem um valendo, a mensagem fala desse. "Já falei" não dá cupom (como no DaniPets). Cancelar a venda devolve o cupom, até a validade. Na conta: "Cupom de retorno ativo" | Criado |
| CLI-12 | Aviso de cashback vencendo (7 dias antes) | Igual, na aba Retorno e no resumo; o prazo do aviso (0 a 365 dias) é regra da loja | Criado |
| CLI-13 | Aba Retorno: "sem comprar" e "cashback vencendo", quem ficou de fora, resultado dos lembretes | **Subaba Retorno** (todos os papéis): as duas listas, com WhatsApp, "Já falei", "Adiar 7 dias", "Não incomodar" (com confirmação) e "Abrir conta"; quem ficou de fora hoje e por quê (já lembrado neste ciclo, adiado ou "não incomodar"); o resultado (voltou em até 15 dias, a taxa). Na lista de clientes: filtro "Sem comprar há muito tempo" e a situação "sem comprar há N dias" | Criado |
| CLI-14 | WhatsApp: mensagens com variáveis, wa.me, só com autorização; "Já falei"; adiar; não incomodar | Igual: a janela mostra a mensagem pronta (dá para ajustar), "Abrir no WhatsApp" (em outra janela) e "Marcar como enviado". O **{loja} vira o nome da loja** (ESP-05). O lembrete de pagamento (fiado) só pede o WhatsApp e é do Dono e do Administrador: "Lembrar" na aba Fiado e "Lembrar pagamento" na conta. Na conta também: "Lembrete de retorno" (quem sumiu) e "Avisar cashback" (cashback vencendo) | Criado |
| CLI-17 | Regras do programa (o gestor altera; o vendedor vê) | **Subaba Regras do programa**: Cashback, Retorno e cupom, Fiado e Cadastro (com o campo extra da loja), mais as mensagens do WhatsApp (cada uma aceita só as variáveis dela; variável errada é recusada). O campo extra e as regras do fiado saíram da janela "Regras dos clientes" do módulo 6 e vieram para cá, como no DaniPets | Criado |
| CLI-18 | Regulamento pronto para copiar | Igual, com o nome e as regras da loja, e "Copiar texto". Com o cashback em 0%, o item 2 diz "No momento, as compras não geram cashback" | Adaptado |
| CLI-08 | (parte que faltava) LGPD retira o cashback que sobrou | Igual: o cliente perde o cashback que sobrou (fica como "retirado") e a liberação avisa quanto | Concluído |
| PDV-04 | Cupom de retorno aplicado sozinho ao identificar o cliente | Igual: nos itens sem desconto manual ("cupom de retorno" no item, com o preço de antes). O desconto manual tira o cupom do item; tirar o desconto devolve. A tela manda só o id do cupom: o servidor confere o cupom do cliente e calcula o preço | Criado |
| PDV-08 | Cashback abate o total (o que vence primeiro) | **"Usar cashback (R$ X)"**: abate até o saldo e a forma escolhida paga o resto; o visor mostra "Compra − Cashback" e, grande, o total a pagar; o × tira. Se o cashback cobre tudo: "O cashback do cliente paga a compra toda" e o que sobra de saldo. Trocar ou tirar o cliente tira o cashback. O servidor confere o saldo | Criado |
| PDV-11 | (parte que faltava) F6 com cashback e cupom | A faixa mostra "Cashback R$ X" (o vencimento aparece ao passar o mouse) e "Cupom 5% aplicado"; o aviso diz "Cliente: Maria. Cupom de 5% aplicado. Cashback disponível: R$ X."; sem cliente, "Não identificado · venda sem cashback" | Criado (o vale entra no módulo 8) |
| PDV-18 | Aviso final "Venda #N finalizada" + cashback ganho | Igual: "… Maria ganhou R$ X de cashback." | Adaptado |
| DEV-07 | Devolução retira o cashback gerado; devolve o cashback usado | Igual: a devolução tira na proporção do valor devolvido (a que completa a venda leva o resto), primeiro do lote da própria compra e depois dos outros; o que já tinha sido usado ou vencido fica no histórico como "Cashback não recuperado". O cancelamento tira tudo. O cashback usado na compra volta como lote novo, com prazo novo | Criado |

### Outros pontos

- **Forma de pagamento "Cashback"** (como no DaniPets): aparece nas vendas por forma (Relatórios, Visão geral e as vendas de hoje do Caixa do dia). Não entra em conta nenhuma do financeiro, porque é desconto dado pela loja; quando volta (devolução ou cancelamento), volta para o cliente como cashback.
- **Histórico**: lembrete de retorno, aviso de cashback e lembrete de pagamento (com o canal e o cupom), lembrete adiado, cupom de retorno usado e cashback não recuperado ("Não incomodar" e "Regras da loja alteradas" já existiam).
- **Quem pode**: Retorno e Regras do programa, todos os papéis veem; alterar as regras, o Dono e o Administrador; o lembrete de pagamento, quem vê o fiado de todos (Dono e Administrador).
- **Demonstração**: as vendas de exemplo com cliente já geraram cashback (Maria R$ 8,82 e João R$ 5,59). Para ver gente na aba Retorno sem esperar 30 dias, ponha em Regras do programa "Lembrar após" = 1 dia e "Aviso de cashback vencendo" = 31 dias. Para mandar pelo WhatsApp, marque no cadastro que o cliente autoriza as mensagens.

### O que não veio (e por quê)

- **Aviso de "data do computador atrasada"** (DaniPets dataAtrasada): no sistema real a data vem do servidor, não do computador da loja; a demonstração usa a do navegador.

### O que ficou para outro módulo (e por quê)

- **Vale-troca** (crédito do cliente na Frente de caixa, na conta, no extrato e no filtro da lista): módulo 8.
- **Lucro estimado descontando o cashback usado**: módulo 10 (Relatórios).
- **Avisos na Visão geral** ("clientes para lembrar hoje"): dependem das pendências (decisão P6, a definir). A regra (sugestão 12 de `docs/PENDENCIAS.md`) já ficou pronta e desligada, como as 6, 7, 10 e 11.

### Servidor

Sem tabela nova (decisão P3): os lotes de cashback, os usos, os cupons e os lembretes ficam na demonstração. No sistema real, essa parte responde 501 até o servidor ganhá-la.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 369 (+30): gerar (só dinheiro, Pix e cartão; arredondamento sem float), saldo e lotes, usar o que vence antes, devolver como lote novo, retirar na devolução e no cancelamento, LGPD, cupom (ativo, dado pela mensagem, preço pela regra), venda com cashback e cupom, financeiro sem o cashback, lista de retorno, resultado dos lembretes, mensagens, link do WhatsApp, regulamento, extrato e histórico;
  - servidor 134;
  - tela 315 (+23): 1 da regra de pendência 12 (pronta e desligada), 10 da API (cashback na venda, devolução, cancelamento e "não recuperado", cupom, lembretes, adiar e não incomodar, cashback vencendo, LGPD, exemplos), 4 do carrinho e 8 de telas (usar cashback, cashback que cobre tudo, cupom na Frente de caixa, Retorno com WhatsApp, "Já falei", adiar e não incomodar, regras do Vendedor e do Dono, resumo do cashback).
- **Navegador** (19 passos):
  - cashback em aberto da loja de exemplo e "de onde vem";
  - F6 com o cashback; "Usar cashback" (R$ 15,00 − R$ 8,82 = R$ 6,18); aviso final com o cashback ganho;
  - regras salvas; regulamento com o nome da loja;
  - João na lista de retorno e no cashback vencendo; WhatsApp com a mensagem e o link; cupom dado ao marcar como enviado;
  - cupom aplicado sozinho na Frente de caixa (R$ 79,90 → R$ 75,91); resultado "Voltou";
  - extrato da Maria com o cashback ganho e usado;
  - celular (390 px) sem rolagem para o lado nas subabas Retorno e Regras do programa;
  - console sem erros nem avisos.
  - As conferências dos módulos 4, 5 e 6 rodaram de novo e passaram.

---

## Módulo 8 — Vale-troca

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| DEV-03 | Devolução com a opção **vale-troca** (código VT-0001-ABC) | Igual: na devolução, "Como o valor volta" → "Mesma forma da venda" ou "Vale-troca (troca agora ou compra depois)". O vale fica com o cliente da venda, com outro cliente escolhido ("Cliente do vale") ou sem cliente. O código tem o número do vale e 3 letras sorteadas, sem as que se confundem (0 e O, 1 e I). Depois de registrar, a janela mostra o código em destaque para anotar | Criado |
| DEV-04 | (no vale-troca) abate primeiro o fiado em aberto da venda | Igual: na devolução como vale, o que o cliente ainda deve daquela compra no fiado é abatido antes; só o resto vira vale (se cobrir tudo, não emite vale) | Criado |
| PDV-09 | Vale-troca como pagamento (escolhe o vale; a sobra fica no vale) | **"Usar vale-troca"**: escolhe um vale com saldo na lista ou digita o código (maiúsculas ou minúsculas). Vale para quem tem o código, com ou sem cliente identificado. Cada vale abate o que cobre, depois do cashback; a forma escolhida paga o resto; o visor mostra cada vale com o × para tirar; se o crédito cobre tudo, "O crédito do cliente paga a compra toda" e o que sobra fica no vale. Na devolução pela Frente de caixa, "Usar agora nesta venda (troca)" põe o vale novo no pagamento | Criado |
| DEV-09 | (parte do vale) cancelamento e devolução de compra paga com vale | O valor volta para o mesmo vale, que reabre. Com dois vales na mesma compra, cada um recebe no máximo o que pagou nela (o DaniPets podia devolver demais no primeiro vale) | Adaptado |
| DEV-10 | Lista de vales-troca em aberto | **"Vale-troca em aberto"** no alto da aba Clientes: o total e, clicando, a lista (código, cliente, emitido em, origem, valor, usado, saldo) e quantos já foram usados por inteiro | Criado |
| FIN-09 | Vales-troca em aberto no Financeiro | A mesma lista entra no Financeiro quando a aba for montada (módulo 9); por enquanto fica na aba Clientes, como no resumo do DaniPets | Em parte (M9) |
| CLI-03 | (parte que faltava) coluna e filtro "Com vale-troca" | Igual: coluna "Vale-troca" e filtro "Com vale-troca" na lista de clientes | Concluído |
| CLI-04 | (parte que faltava) vale no extrato | Igual: na conta, o saldo e os códigos dos vales; no extrato, "Vale-troca" (emitido), "Vale-troca usado" e "Vale-troca devolvido" | Concluído |
| CLI-08 | (parte que faltava) LGPD com vale | Igual: o vale continua valendo para quem tem o código; só o nome do cliente sai do vale. A liberação avisa | Concluído |
| PDV-11 | (parte que faltava) F6 com o vale | A faixa do cliente mostra "Vale R$ X" | Concluído |

### Outros pontos

- **Forma de pagamento "Vale-troca"** (como no DaniPets): aparece nas vendas por forma (Relatórios, Visão geral e as vendas de hoje do Caixa do dia), com o código do vale ("Vale-troca VT-0001-ABC R$ 30,00"). Não entra em conta nenhuma do financeiro: o vale é crédito do cliente na loja; o dinheiro da compra devolvida fica com a loja.
- **O vale não gera cashback** (como no DaniPets: só dinheiro, Pix e cartão geram).
- **Cliente com vale** conta como "com histórico": o cadastro não pode ser excluído, só os dados (LGPD).
- **Histórico**: "Vale-troca emitido" (código, valor e a venda); a devolução continua registrada como antes.
- **Quem pode**: todos os papéis usam e veem os vales (a Frente de caixa precisa escolher o vale); a devolução continua pedindo a autorização do Dono ou do Administrador quando é o Vendedor.
- **Demonstração**: para ver, abra o caixa, faça uma devolução na Frente de caixa escolhendo "Vale-troca" e use "Usar agora nesta venda (troca)".

### O que ficou para outro módulo (e por quê)

- **Vales-troca em aberto no Financeiro** (FIN-09): módulo 9, quando a aba Financeiro for montada.
- **Vales na exportação CSV** (DaniPets planilha "Vales-troca"): módulo 13 (Dados e backup).

### Servidor

Sem tabela nova (decisão P3): os vales ficam na demonstração. No sistema real, essa parte responde 501 até o servidor ganhá-la.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 384 (+15): código e emissão, usar e devolver no vale, divisão entre os vales da venda, vales em aberto, vale na venda (sem cliente, saldo, código), financeiro sem o vale, devolução como vale com o fiado abatido antes, o vale emitido não diminui o que ainda pode voltar, extrato e histórico;
  - servidor 134;
  - tela 326 (+11): 6 da API (devolução como vale, fiado abatido, cliente do vale, uso na venda e saldo, volta no cancelamento e na devolução com dois vales, LGPD), 2 do carrinho e 3 de telas (devolução como vale e a troca na hora, "Usar vale-troca" pela lista e pelo código, vale no resumo, na lista, na conta e no extrato).
- **Navegador** (14 passos):
  - devolução da venda nº 1 como vale (com a Maria como cliente do vale); código em destaque; "Usar agora nesta venda (troca)";
  - a troca paga só com o vale, com a sobra de R$ 30,10 no vale;
  - "Usar vale-troca" pelo código em minúsculas, sem cliente; o × tira o vale;
  - "Vale-troca em aberto" com a lista dos vales; extrato da Maria com o vale emitido e usado;
  - celular (390 px) sem rolagem para o lado;
  - console sem erros nem avisos.
  - As conferências dos módulos 4, 5, 6 e 7 rodaram de novo e passaram.


---

## Módulo 9 — Financeiro

O pedido do Luan (23/11/2026, 2ª imagem): *"Quero que traga as informações dos saldos das contas, contas a pagar, a
receber, caixa físico e conta bancária. Trazendo como se fosse um extrato bancário, deixando também com nomes
editáveis (ex.: ao invés de ser conta bancária o cliente poder colocar Banco Itaú), confirmar recebimentos automáticos
ou manuais ao definir taxa."*

### O que veio do DaniPets (FIN-01 a FIN-10)

- **Cards** (FIN-01): Saldo total, Caixa físico, Conta bancária, A receber (cartão + fiado) e A pagar. Clicar num card
  abre a parte dele logo abaixo. O saldo é a soma dos lançamentos; nada é apagado.
- **Extrato de cada conta, como o do banco** (FIN-08):
  - período: hoje, últimos 7 dias, este mês (o padrão), mês passado ou escolher as datas (até um ano);
  - "Saldo anterior" em cima, cada lançamento com data, hora, o que foi, quem lançou e o **saldo depois dele**, e o
    "Saldo em …" embaixo; entradas em verde (+), saídas em vermelho (−);
  - filtro "Mostrar" (tudo, só entradas, só saídas) e busca por descrição, categoria ou quem lançou;
  - estorno é uma linha própria; compra com a data da nota entra no dia da nota ("lançado em …").
- **Saldo inicial** (FIN-02): uma vez por conta; o botão some quando as duas contas já têm. A Conta bancária pode
  começar negativa (cheque especial).
- **Novo lançamento** (FIN-03 e FIN-04): entrada, despesa (com as categorias da loja), retirada do dono e
  transferência. O Caixa físico não fica negativo (o sistema recusa); a Conta bancária pode, mas a tela avisa
  "vai ficar negativa em R$ …" e pede "Lançar mesmo assim".
- **A receber** (FIN-05 e FIN-06):
  - cartão: venda, forma, bruto, taxa, líquido e "cai em", com **Confirmar** (escolhendo a conta) e **Confirmar os
    vencidos (N)** de uma vez (tudo ou nada);
  - fiado por cliente (deve, vencido, vence primeiro), com **Receber** (a mesma janela de Clientes → Fiado, com troco e
    taxa do cartão).
- **A pagar** (FIN-07): as compras a prazo e, agora, as **contas avulsas** (aluguel, energia, boleto: descrição, valor,
  vencimento e categoria), com **Pagar** (escolhendo a conta), filtro Em aberto / Pagas / Todas e "vencida" ou
  "vence hoje". A conta avulsa paga leva a categoria para o lançamento.
- **Taxas da maquininha** (FIN-10): o botão também fica no Financeiro (continua em Clientes → Fiado). Na **baixa
  manual**, a janela mostra o prazo de cada cartão ("Débito cai em N dias", "Crédito cai em N dias").

### Nomes das contas (pedido do Luan)

- O ✎ em cada card troca o nome da conta ("Banco Itaú" no lugar de "Conta bancária"), de 2 a 30 caracteres; as duas
  contas não podem ter o mesmo nome; "Voltar para “Conta bancária”" desfaz. Quem troca: Dono e Administrador.
- O nome vale em todo o sistema: cards, extrato, Visão geral, escolhas de conta (pagar conta, compra à vista,
  confirmar recebimento), Caixa do dia (sangria, fechamento), receber fiado, taxas da maquininha, mensagens de erro
  e o histórico (aba Usuários).
- Português sem erro de concordância: com o nome padrão, a frase de sempre ("na Conta bancária", "do Caixa físico");
  com o nome da loja, entre aspas e sem artigo ("em “Banco Itaú”"), que serve para qualquer nome.
- O nome fica nas regras da loja (`regras.financeiro.nomesContas`); o histórico registra "regras da loja alteradas:
  categorias de despesa e nomes das contas", sem o nome novo (texto livre não vai para o histórico).

### Baixa do cartão: automática ou manual

- Automática (o padrão): o aviso da parte A receber diz que o cartão entra na conta na hora, já sem a taxa, e que não
  há o que confirmar.
- Manual (escolha do Dono nas taxas): o cartão fica a receber até alguém **Confirmar** o depósito da operadora.

### O que ficou para outro módulo (e por quê)

- **Exportar o extrato para Excel**: no módulo 10 (Relatórios), junto com "exportar tudo".
- **Lançamento com data de um dia anterior** (DaniPets: retroativo com liberação): por enquanto, só a data de hoje.
- **Pendências do Financeiro** (8, 9 e 10 de `docs/PENDENCIAS.md`): já dá para ligar, mas continuam A DEFINIR.

### Servidor

Sem tabela nova (decisão P3): o Financeiro fica na demonstração (o contrato `ApiFinanceiro` ganhou `extratoDaConta`,
`receberRecebiveis` e `cadastrarContaAPagar`). No sistema real, essa parte responde 501 até o servidor ganhá-la.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 406 (+10): nome da conta e a frase com artigo ou aspas, extrato (saldo anterior, saldo corrido, dia da
    nota, ordem gravada, período vazio), nomes nas regras (limites, iguais, padrão, versão antiga), conta a pagar
    avulsa (validação, prazo, categoria no lançamento) e os nomes no histórico;
  - servidor 134;
  - tela 376 (+19): 9 da API (nomes no resumo, no extrato, nas mensagens e no histórico; extrato e período;
    confirmar vários; fiado recusado; conta avulsa; resumo), 9 da tela (cards, extrato e filtros, renomear e voltar
    ao padrão, Administrador renomeia, despesa com banco negativo, transferência, saldo inicial, confirmar um e os
    vencidos, baixa automática, a pagar) e 1 do painel (o nome novo aparece em Compras).
- **Navegador**:
  - 5 cards; extrato do banco com saldo anterior e saldo final;
  - "Banco Itaú" no card, no extrato, na dica da sangria do Caixa do dia e no "Sai de" ao pagar;
  - despesa lançada aparece na hora no extrato;
  - a receber com baixa automática e, depois de mudar para manual, os prazos de cada cartão;
  - conta de energia (exemplo) paga pelo Banco Itaú;
  - tema escuro; celular (390 px) sem rolagem para o lado e os cards em duas colunas;
  - console sem erros.

---

## Módulo 10 — Relatórios

O pedido do Luan (23/11/2026, 3ª imagem): *"Relatórios, quero que traga todas as informações referentes ao sistema, mas
de forma organizada por abas e maneiras de filtrar, e também dando a opção de exportar todas as informações para o
Excel."*

### Como ficou

- **Período no topo**, valendo para todas as abas: Todas, Hoje, Ontem, Últimos 7 dias, Este mês ou De/Até.
- **Abas**, cada uma com os filtros dela e **Exportar esta aba (Excel)**, que leva o que a tabela mostra:
  - **Vendas** (a de antes): quem vendeu, cliente e pagamento; total, ticket médio, itens, descontos, devoluções,
    canceladas e taxas; por quem vendeu, por forma de pagamento e a lista das vendas. No Excel: vendas, itens
    vendidos, pagamentos e devoluções;
  - **Produtos** (DaniPets REL-03 e REL-04): mais vendidos (por R$, quantidade ou lucro), sem o devolvido; custo
    médio da hora da venda; **lucro estimado** = vendas dos produtos com custo − custo − taxas de cartão − cashback
    usado, com a margem. Produto vendido sem custo fica de fora e é contado à parte; sem custo nenhum, o lucro
    aparece como "—" (sem inventar número);
  - **Estoque** (REL-08): posição no período (no início, entradas, ajustes, vendido, devolvido, no fim, mínimo,
    situação, custo médio e valor em estoque) e os movimentos; filtros de busca, situação e inativos;
  - **Clientes**: compras e total no período, ticket médio, última compra, fiado em aberto e vencido, limite, e os
    vales-troca emitidos; filtros de busca, "compraram no período", "com fiado" e inativos. O CPF sai mascarado;
  - **Financeiro**: lançamentos (com o nome que a loja deu a cada conta), despesas por categoria, o que há a receber
    e a pagar; filtros de conta, entradas/saídas e categoria;
  - **Caixa**: cada dia (abertura, fechamento, esperado, contado, diferença, justificativa, situação), com "só os
    dias com diferença";
  - **Compras**: compras e itens comprados, por fornecedor e pagamento;
  - **Histórico** (REL-09): quem fez o quê, com filtros de pessoa, ação e busca.
- **Exportar tudo (Excel)**: um arquivo com 17 abas — Resumo (período, total vendido, devoluções, vendas líquidas,
  ticket médio, custo, taxas, cashback, lucro estimado, entradas e saídas), Vendas, Itens vendidos, Pagamentos,
  Devoluções, Produtos vendidos, Posição de estoque, Movimentos de estoque, Clientes, Vales-troca, Lançamentos,
  A receber, A pagar, Caixa do dia, Compras, Itens comprados e Histórico.
- **O arquivo do Excel** (.xlsx) é feito no próprio navegador, sem biblioteca de fora (`apps/web/src/relatorios/xlsx.ts`):
  dinheiro vai como número com formato "R$" (dá para somar no Excel), datas como data, a primeira linha fica em
  negrito, congelada e com filtro. Texto nunca vira fórmula (proteção contra fórmula, REL-10). O nome do arquivo diz o
  assunto e o período (ex.: `relatorio-tudo-2026-11-01-a-2026-11-23.xlsx`).
- **Histórico**: cada exportação fica registrada ("Relatório exportado para Excel": o assunto, o período e quantas
  abas), por causa da LGPD (a planilha pode levar dados de clientes).
- Parte que o servidor ainda não tiver fica de fora (a aba avisa) e o resto continua.

### O que ficou para outro módulo (e por quê)

- **CSV**: o Excel já cobre; se precisar de CSV para outro programa, entra em Dados e backup (módulo 13).
- **Custo nos produtos dos exemplos**: os exemplos da demonstração não têm compras, então o lucro deles aparece como
  "sem custo registrado"; ao registrar uma compra, o custo passa a valer nas próximas vendas.

### Servidor

Sem tabela nova: os relatórios leem as outras partes. `registrarExportacao` entrou no contrato (`ApiRelatorios`); no
sistema real, sem essa parte, a exportação funciona e só não fica no histórico.

### Testes e conferência

- **Testes automáticos**:
  - núcleo 406 (o resumo "Relatório exportado para Excel" entrou no teste do histórico);
  - servidor 134;
  - tela 393 (+17): 6 do arquivo do Excel (CRC, ZIP, nomes de aba, datas, tipos das células, texto que parece
    fórmula, primeira linha congelada e com filtro), 7 das planilhas (lucro estimado com o custo da hora da venda e
    sem o devolvido, sem custo, posição de estoque no período, clientes com CPF mascarado, caixa, histórico, as 17
    abas do "tudo", nome do arquivo e parte que falta no servidor) e 4 da tela (as 8 abas, filtros, período do topo,
    exportar esta aba e exportar tudo com o registro no histórico). Os 7 testes antigos de Relatórios continuam.
- **Navegador**:
  - as 8 abas abrem com a tabela de cada uma;
  - "Exportar esta aba" e "Exportar tudo" baixam o .xlsx (17 abas);
  - o arquivo baixado abre no openpyxl (tipos, formato "R$", data, linha congelada, filtro) e no LibreOffice;
  - celular (390 px) sem rolagem para o lado; console sem erros.

---

## Frente de caixa — ajustes pedidos pelo Luan

### 23/11/2026: uma barra só para o produto e o aviso do caixa com ícone

O pedido (1ª imagem): *"Alterar o formato visual da mensagem do caixa fechado, será que é necessario duas barras
para procurar produto?"*. Resposta do Luan: **uma barra só**.

- **Uma barra só** (rótulo PRODUTO), no lugar do leitor CÓDIGO e da busca por nome:
  - o leitor continua igual: bipe o código, Enter, e o item entra; "3*código" = 3 unidades; a barra limpa sozinha
    depois de cada leitura, mesmo com erro;
  - digitando o nome (sem acento) ou o começo do código, a lista "Produtos encontrados" abre embaixo da barra,
    com o código interno, o saldo e o preço;
  - Enter com um produto só na lista já põe o item. Com mais de um, aparece "Mais de um produto encontrado:
    escolha na lista." e o texto fica na barra;
  - a seta para baixo entra na lista, as setas andam e Enter escolhe; a seta de cima, no primeiro, volta para a
    barra;
  - "2*nome" põe 2 do produto escolhido ("1,5*nome" = 1,5 kg a granel). Um nome que já começa com número, como
    "10x15", vale como nome;
  - nome que não existe: "Nenhum produto encontrado para “…”." e o texto fica para corrigir;
  - **F3** volta para a barra e seleciona o texto; **Esc** limpa a barra (o rodapé diz "Esc limpar a barra");
  - no celular, a barra deixou de abrir o teclado só de números, para dar para digitar o nome.
- **Lista da barra:** o saldo de produto a granel aparecia em gramas ("saldo 25000"). Agora sai na unidade do
  produto ("saldo 25 kg", "saldo 3 un"), e o preço do granel mostra "/kg".
- **Aviso do caixa** no mesmo formato do Caixa do dia (amarelo, com ícone de atenção, título em negrito e o botão à
  direita), no lugar da faixa vermelha:
  - não aberto: "**Caixa de hoje não aberto.** Sem caixa aberto não há vendas: abra o caixa para começar."
    [Abrir caixa]. Na virada da meia-noite, a frase "Novo dia: o caixa de … fechou sozinho…" entra no meio;
  - fechado: "**Caixa de hoje fechado às 11:00.** As vendas de hoje estão encerradas. Para vender, o Dono ou o
    Administrador pode desfazer o fechamento em Caixa do dia." [Ir para Caixa do dia];
  - a venda continua travada do mesmo jeito: F2 ou FINALIZAR sem caixa aberto avisam e não gravam.
- **Testes:**
  - tela 357 (+4): barra única (nome, lista, "Mais de um", setas, "2*nome", F3, Esc, nome que não existe),
    começo do código e código inteiro, granel na lista, PDV com o caixa fechado (aviso com ícone e o botão);
  - os testes que bipavam pelo "Leitor de código de barras" passaram a usar a barra "Código ou nome do produto".
- **Navegador:**
  - uma barra só; o aviso amarelo com ícone nos dois estados;
  - "Abrir caixa" leva ao Caixa do dia, e com o caixa aberto o aviso some;
  - a lista abre logo embaixo da barra, alinhada; seta para baixo e Enter põem o produto, e o foco volta para a
    barra; "3*código" põe 3;
  - celular (390 px) sem rolagem para o lado, com a lista aberta;
  - console sem erros.

---

## Usuários — ajustes pedidos pelo Luan

### 23/11/2026: o suporte (Adm. Sup) em todas as lojas, o Personalizado e o Dono só pelo suporte

O pedido (4ª imagem): *"na opção de criar usuários, desapareça o perfil dono e adm. O perfil dono vai ser criado
apenas na implantação, e só pode ser criado pelo Adm. Sup. O perfil Adm. Sup é o perfil que deve estar presente em
tudo e ter acesso a tudo mas de forma invisível."* Respostas do Luan: usuário mestre em todos os sistemas e vendas;
o Dono cria **Vendedor** e **Personalizado** (que edita as funções); aparece como **"Suporte"**; demonstração e
servidor agora. Decisão completa: [`../decisoes/0006-adm-sup-e-personalizado.md`](../decisoes/0006-adm-sup-e-personalizado.md).

- **Criar usuário:** o Dono e o Administrador só veem **Vendedor** e **Personalizado**, com a dica "O Dono e o
  Administrador são cadastrados pelo suporte (Adm. Sup), na implantação do sistema." O suporte vê os quatro papéis.
- **Personalizado:** ao escolher, abre "Funções do Personalizado", com as funções que quem cadastra pode dar
  (as que ele mesmo tem, menos as só do Dono e a de cadastrar usuários); pelo menos uma. A pessoa vê no menu e
  consegue fazer **só** o que foi marcado (a tela, a demonstração e o servidor usam a mesma regra, `pode()` de
  `@saas/core`). Na lista: "Personalizado · 3 funções". Editar: dá para mudar as funções; trocar o papel apaga as
  funções. Na tabela de permissões da aba, a coluna Personalizado diz "se marcada".
- **Menu de cada um:** "Frente de caixa" passou a pedir a função **Vender** e "Clientes", a função **Clientes**
  (antes apareciam para todos). Para o Dono, o Administrador e o Vendedor nada muda (eles têm as duas); o
  Personalizado só vê o que foi marcado. No card de pendências da Visão geral, as listas de cashback e de
  promoções (que têm nomes de clientes) também só aparecem para quem tem a função Clientes.
- **Editar papel:** dar o papel de Dono ou de Administrador é só do suporte. O Dono pode tirar alguém de
  Administrador (para Vendedor ou Personalizado). Ninguém muda o próprio papel nem as próprias funções.
- **O suporte (Adm. Sup):**
  - entra em **qualquer loja** com o mesmo usuário e senha; tem tudo liberado; a barra lateral mostra
    "Suporte · Adm. Sup";
  - **não aparece** na lista de usuários da loja; no histórico, nas vendas e no caixa aparece como **"Suporte"**;
  - ninguém da loja pode usar o login dele; a senha dele não muda pela tela (só pelo script `db:suporte`);
  - na demonstração: login `suporte`, senha `demo1234` (a faixa amarela explica em "Usuários de teste").
- **Servidor:**
  - migration `20261123210000_adm_sup_e_personalizado`: papel `personalizado`, coluna `permissoes` (só no
    Personalizado, CHECK no banco), três funções estreitas para a API chegar ao suporte sem enxergar a linha dele
    (`app_suporte_para_login`, `app_suporte_por_id`, `app_suporte_registrar`) e a trava `usuarios_trava_api` com as
    regras novas (Dono e Administrador só pelo suporte; Personalizado com funções; ninguém muda as próprias funções).
    O `down.sql` desfaz tudo (Personalizado volta a Vendedor);
  - o login procura a pessoa na loja e, se não achar, o suporte (mesma conferência de senha, mesmo bloqueio, mesma
    resposta para quem não existe); a sessão dele fica na loja do endereço;
  - script novo `npm run db:suporte -w @saas/api -- --usuario suporte` (cadastrar, `--redefinir-senha`,
    `--desativar`, `--reativar`; senha sorteada de 20 caracteres, mostrada uma vez; encerra as sessões dele em
    todas as lojas). O `db:usuario` passou a recusar o login do suporte e o papel Personalizado (pela tela);
  - documentado em `docs/LOGIN.md`, `docs/SEGURANCA.md` (seção 7), `docs/deploy.md` e no README.
- **Testes:**
  - núcleo 409 (+3): quem cria quem, Personalizado (funções que se podem dar, pelo menos uma, só as que quem
    cadastra tem), o suporte como alvo ("Usuário não encontrado"), próprio papel e funções;
  - servidor (+7): `adm-sup.spec.ts` (novo, 5: entra em qualquer loja; não aparece na lista; cadastra Dono e
    Administrador; "Suporte" no histórico; a API não enxerga a linha; ninguém usa o login dele; senha só pelo
    script; desativar e nova senha encerram as sessões em todas as lojas), `usuarios.spec.ts` (regras novas e a
    trava no banco conectando como `saas_app`), `scripts.spec.ts` (login do suporte e Personalizado no
    `db:usuario`), `vigilancia.spec.ts` (a policy da dona do schema é a única exceção; a coluna `permissoes` na
    lista fechada de privilégios), `migracoes.spec.ts` (aplica, reverte e reaplica a migration nova);
  - tela 399 (+6): aba Usuários (Dono só vê Vendedor e Personalizado; funções do Personalizado), demonstração
    (o suporte entra em qualquer loja, fica fora da lista, aparece como "Suporte"; login dele recusado na loja),
    menu do Personalizado (sem Vender, sem Frente de caixa; sem Clientes, sem Clientes) e o card de pendências
    sem nomes de clientes para quem não tem a função Clientes.
- **Navegador:**
  - a Ana (Dono) só vê Vendedor e Personalizado, com a dica do suporte; o Personalizado abre a lista de funções;
  - um Personalizado com "Vender" e "Relatórios" vê a Frente de caixa e, no menu, só Visão geral, Produtos e
    estoque (consulta), Relatórios e Suporte;
  - o suporte entra na Loja B, aparece como "Suporte · Adm. Sup", cadastra um Dono, não aparece na lista, e o
    histórico diz "Suporte";
  - console sem erros.

### 24/11/2026: Vendedor ou Personalizado em cartões; o Personalizado tela por tela

O pedido: *"na criação de usuários ainda está presente o usuário dono e adm, queria algo como vendedor e personalizado.
Personalizado você escolhe o que a pessoa tem acesso."* (O arquivo que o Luan conferiu era da versão anterior, sem o
ajuste de 23/11; o ajuste já tirava Dono e Administrador da lista. Agora a escolha ficou mais clara.)

- **Papel em cartões**, no lugar da lista: **Vendedor** (com o que ele faz, tirado da matriz de permissões: "Vender na
  Frente de caixa, abrir e fechar o caixa, cadastrar e consultar clientes e cadastrar produto novo.") e
  **Personalizado** ("Você escolhe o que a pessoa acessa, tela por tela."). Vendedor vem marcado.
  - Para o suporte, Dono e Administrador aparecem à parte, em "Só o suporte, na implantação".
  - Ao editar alguém que já é Dono ou Administrador, o papel dele aparece à parte, em "Papel atual" (o Dono pode
    passá-lo a Vendedor ou Personalizado). Na própria pessoa, os cartões ficam travados.
- **O que esta pessoa acessa**, tela por tela, na ordem do menu: Frente de caixa, Caixa do dia, Produtos e estoque,
  Compras, Clientes, Financeiro, Relatórios, Dados e backup e Regras da loja.
  - Marcar a tela dá o acesso a ela (o mesmo que o menu pede). Dentro dela ficam os extras, por exemplo: Clientes →
    ver o CPF completo, limite de fiado; Frente de caixa → desconto acima do limite e cancelar sem senha.
  - O extra só fica liberado com a tela marcada, e desmarcar a tela tira os extras.
  - Produtos e estoque (todos consultam) e Regras da loja (valem em várias telas) não têm tela para marcar: só os
    extras.
  - A mesma regra vale no servidor e na demonstração: um extra mandado sem a tela é recusado ("Para “Ver o CPF
    completo do cliente”, marque também a tela “Clientes”.").
  - Os grupos ficam em `@saas/core` (`TELAS_DO_PERSONALIZADO`). Um teste confere que cada função que se pode dar
    aparece uma vez e que cada tela pede, no menu, o mesmo acesso da escolha.
- **Testes:** núcleo 410 (+1: telas do Personalizado, regra do extra na criação e na alteração); servidor (a regra do
  extra no POST e no PATCH); tela 407 (+6): cartões com o que cada papel faz, telas e extras, editar o Personalizado,
  o Administrador à parte na edição, a própria pessoa travada, e o menu × telas do Personalizado.
- **Navegador:** o Dono vê só os cartões Vendedor e Personalizado; as 9 telas com as 20 funções; o extra de Clientes
  travado sem Clientes; o Personalizado criado só vê no menu o que foi marcado; o suporte vê também Dono e
  Administrador em "Só o suporte, na implantação"; claro e escuro, PC e celular, sem rolagem para o lado; console sem
  erros.

### 25/11/2026: aba "Meu usuário" (o nome lá embaixo abre a aba)

O pedido do Luan (imagem do perfil Vendedor): *"no perfil de vendedor não possui a aba usuario, e tem trocar senha lá
em baixo, certo? Então quero a criação da aba usuario, lá dentro é possivel ver o horario de entrada e saída, alterar a
foto de perfil, e alterar a senha. e ao clicar no nome lá em baixo no quanto inferior esquerdo, direcionar para a aba
usuario"*.

- **Aba "Meu usuário"**, para todos (inclusive o Vendedor e o Adm. Sup), no fim do grupo Sistema. Clicar no nome, no
  canto de baixo da barra lateral, também abre a aba. Ela tem três cartões:
  - **Perfil:** a foto, o nome, o login e o papel.
    - A foto pode ser escolhida, trocada ou tirada. Ela é cortada em quadrado, reduzida a 256 px e salva em JPEG, no
      próprio navegador.
    - Antes de salvar, a tela mostra a prévia.
    - A foto aparece também no canto da barra lateral, no lugar da inicial, e entra no histórico.
  - **Entradas e saídas** (DaniPets USR-07, "Meus acessos"): as 30 mais recentes, com o dia, a entrada, a saída e o
    tempo.
    - A saída pode ser pelo botão Sair ou "por falta de uso".
    - A sessão de agora aparece como "em uso agora".
    - Entrada sem saída aparece como "não registrada" (o sistema foi fechado sem clicar em Sair).
    - No celular, cada entrada vira um bloco com o nome de cada informação.
  - **Trocar a senha:** o formulário que antes abria pelo botão da barra lateral. Depois da troca, ele volta vazio.
- **O botão "Trocar senha" saiu da barra lateral.** A troca de senha agora fica em Meu usuário. Lá embaixo ficaram o
  nome (que abre a aba), o tema e Sair.
- **Saída por falta de uso no histórico:** "Saiu do sistema • por falta de uso". Antes, ela não se distinguia do botão
  Sair.
- **Correção:** na demonstração, quando o Adm. Sup trocava a própria senha, ele era gravado na equipe da loja e a senha
  dele não mudava. Agora a senha e a foto dele ficam no lugar dele, fora das lojas.
- **LGPD:** a foto é dado pessoal. "Excluir dados" do usuário tira a foto também. Ela entrou no registro de tratamento
  (`docs/lgpd/registro-de-tratamento.md`, linha 1b).
- **Sistema real:** a aba já funciona lá para trocar a senha. A foto e as entradas e saídas avisam que ainda não estão
  ligadas ao servidor (a API responde 501).
- **Testes:**
  - núcleo 432 (+7): a foto (formato e tamanho), cada entrada com a sua saída (fora de ordem, duas entradas seguidas,
    saída sem entrada, a de agora), o tempo e o resumo no histórico;
  - tela 448 (+13): a API da demonstração (perfil sem senha, foto e histórico, recusas, LGPD, o Adm. Sup fora da
    equipe com a senha nova valendo, só as próprias entradas e saídas), a aba (perfil, tabela, foto com prévia e
    cancelar, trocar a senha, sistema real sem a parte) e a barra (o nome abre a aba, a foto aparece no canto, sem o
    botão antigo).
- **Navegador:**
  - o Vendedor abriu a aba pelo nome e salvou uma foto de verdade (JPEG quadrado de 256 px, 6 KB);
  - trocou a senha, saiu e entrou com a senha nova, e a tabela mostrou as duas sessões;
  - tema escuro e celular sem rolagem para o lado, console sem erros.

---

## Tela de entrada — ajustes pedidos pelo Luan

### 24/11/2026: tema claro / escuro já na entrada

O pedido: *"colocar o tema claro e escuro na tela de entrada no sistema"*.

- No canto de cima da tela de entrada, à esquerda do **Suporte**, o mesmo botão de tema da barra lateral (lua = usar o
  escuro; sol = usar o claro). Também aparece no "Endereço não encontrado" e na tela de **criar a senha** do primeiro
  acesso.
- A escolha é uma só para o sistema inteiro e fica guardada neste navegador: trocar na entrada vale depois de entrar,
  e trocar na barra lateral vale na entrada depois de sair. Sem escolha, segue o claro/escuro do computador.
- O botão virou um componente só (`apps/web/src/BotaoTema.tsx`), usado na barra lateral e nas telas de entrada.
- **Testes:** tela 401 (+2): o botão na entrada (ao lado do Suporte, troca e guarda; também sem loja) e no primeiro
  acesso.
- **Navegador:** PC (1366 px) e celular (390 px), no claro e no escuro: o botão fica na mesma linha do Suporte, sem
  rolagem para o lado; recarregar mantém a escolha; entrar com o escuro abre o painel escuro; trocar na barra e sair
  deixa a entrada no claro; computador no escuro sem escolha abre a entrada escura; console sem erros.

### 24/11/2026: tela de entrada mais profissional, com mais da nossa marca

O pedido (com a imagem de referência): *"Deixe mais profissional e implante na tela de início, acredito que possua muito
o nome do cliente e pouco o nome da nossa empresa."*

- **Duas metades.** À esquerda, o painel verde da **nossa marca**:
  - a logo grande, o nome da empresa, a frase "Gestão completa para o seu negócio";
  - três destaques do sistema: PDV (vendas rápidas), Estoque (controle de lotes) e Financeiro (fluxo e resultados);
  - "© ano Nome da empresa" no pé.

  À direita, o formulário, num painel claro com o canto arredondado por cima do verde.
- **A loja aparece uma vez só**: no formulário, com o rótulo "Acesso à loja" em cima do nome (na referência, o nome da
  loja aparecia duas vezes e grande). O nome da empresa aparece no painel e no pé do formulário.
- O tema claro / escuro e o Suporte continuam no canto. No escuro, o verde do painel fica mais fechado.
- **Celular e tablet** (até 900 px): o painel vira uma faixa verde com a logo e a frase, e o formulário sobe por cima
  dela. Os destaques ficam só no computador.
- O **primeiro acesso** (criar a senha) usa o mesmo molde, com o rótulo "Primeiro acesso".
- O nome, a frase e os destaques ficam em `apps/web/src/marca.ts`, para trocar num lugar só quando o nome da empresa
  for definido. O molde fica em `apps/web/src/telas/LayoutEntrada.tsx`.
- **Sem imagem de fora** (a página não carrega nada de outro endereço): os fundos são gradientes, círculos de luz e uma
  textura de pontos em SVG. A foto de prateleiras da referência não entrou: precisaria de uma imagem nossa, com
  direito de uso.
- Na demonstração, a tela de entrada deixou de rolar 3 px por causa da faixa amarela de cima.
- **Testes:** tela 408 (+1): o painel tem o nome, a frase e os destaques, e a loja aparece uma vez só.
- **Navegador:** PC (1366 e 1920 px), tablet (820 px) e celular (390 px), no claro e no escuro, mais o primeiro acesso:
  sem rolagem para o lado; no PC e no tablet, sem rolagem nenhuma; console sem erros. O tema continua trocando e
  sendo guardado.

### 24/11/2026 (depois): de volta ao formato da imagem do Luan, com frases e desenho mais profissionais

O pedido: *"Gostei mais da minha imagem enviada, continue com ela mas deixe com frases mais profissionais e a casa que
está no lado esquerdo deixe mais profissional também."* A versão anterior (com a nossa marca no painel) foi trocada por
esta.

- **Painel da esquerda, como na imagem:**
  - verde-escuro, com as curvas verde-claras nos cantos e um fundo de prateleiras desfocado. É um desenho em SVG, não
    foto: a página não carrega nada de fora;
  - a **loja em destaque**: o desenho da loja num selo de vidro, o nome dela grande, a frase e os três destaques.
- **O desenho da loja**, refeito: letreiro, toldo listrado verde e branco com a borda recortada, vitrine com reflexo,
  porta com maçaneta e calçada, com traço uniforme e as cores da marca.
- **À direita, como na imagem:** a nossa logo em cima, o nome da loja, "Boas-vindas", o formulário, "Esqueceu sua
  senha?" e a logo pequena no pé. O tema e o Suporte continuam no canto.
- **Frases mais profissionais:**
  - frase do painel: "Gestão integrada e eficiente para o seu negócio";
  - destaques: PDV ("Vendas ágeis e seguras"), Estoque ("Lotes e validades sob controle") e Financeiro ("Fluxo de
    caixa e resultados");
  - embaixo de "Boas-vindas": "Acesse sua conta para continuar.";
  - campos "Usuário" e "Senha" (antes "Insira seu usuário" e "Insira sua senha"), com "Digite seu usuário" e "Digite
    sua senha" dentro deles. A dica do usuário diz "Use o usuário cadastrado pelo responsável da loja (ex.:
    maria.silva).";
  - "Esqueceu sua senha?": "Solicite uma nova senha ao responsável pela loja. Por segurança, as senhas não são enviadas
    por e-mail.";
  - Suporte: "Precisa de ajuda? Fale com o suporte do Nome da empresa.";
  - endereço sem loja: "Confira o link com o responsável pela loja."; Caps Lock: "Caps Lock ativado";
  - primeiro acesso: "Por segurança, troque a senha provisória por uma senha pessoal, que só você vai saber. Ela vale
    para entrar no sistema e para autorizar operações no caixa."
- O botão **Entrar** parado (antes de digitar usuário e senha) fica verde-claro, como na imagem, em vez de cinza.
- **Celular e tablet:** o painel vira uma faixa com o selo da loja, o nome e a frase. O formulário mostra a logo,
  "Boas-vindas" e os campos. O nome da loja não se repete na tela: o título continua lá para o leitor de tela.
- **Testes:** tela 408: o painel tem a loja, a frase e os destaques; a nossa logo fica no formulário e no pé; os
  rótulos novos; a ajuda da senha.
- **Navegador:** PC (1366 e 1920 px), tablet e celular, no claro e no escuro, mais o primeiro acesso: sem rolagem para
  o lado (no PC e no tablet, sem rolagem nenhuma); o tema continua trocando e sendo guardado; console sem erros.

### 24/11/2026 (modelo novo do Luan): marca, chamada, ilustração da loja e cartão de entrada

O Luan mandou um modelo novo da tela de entrada (a imagem "LojaGestor"). A tela segue o modelo:

- **Fundo claro** com manchas verdes suaves (no escuro, o fundo escurece e as manchas continuam verdes).
- **À esquerda:**
  - a logo nova: a fachada da loja, em branco, num quadrado verde. Ao lado vai o nome da empresa (por enquanto "Nome
    da empresa") e embaixo "PDV · ESTOQUE · FINANCEIRO";
  - a chamada "Sua loja, mais organizada e lucrativa." e o texto "Um sistema completo para gerenciar vendas (PDV),
    estoque, financeiro e o dia a dia do seu negócio.";
  - os recursos, com ícones: "PDV e vendas", "Controle de estoque", "Gestão financeira".
- **No meio, a ilustração da loja em 3D** (isométrica), sobre uma mancha verde:
  - a loja com o toldo listrado verde e branco, o telhado verde e o letreiro com o ícone da loja;
  - a vitrine com prateleiras e a porta;
  - a estante aberta com caixas de papelão e uma planta;
  - o caixa com o monitor do gráfico, as caixas e a planta na frente.

  É desenhada por código (`apps/web/src/telas/ilustracaoLoja.ts`), sem imagem de fora.
- **À direita, o cartão de entrada:**
  - a logo, a loja do endereço num selo ("Loja A") e "Bem-vindo de volta!";
  - "Acesse sua conta e gerencie sua loja.", os campos Usuário ("Ex.: maria.silva") e Senha ("Digite sua senha", com
    o olho para mostrar), Entrar e "Esqueceu a senha?".

  O selo da loja não estava no modelo. Ficou pequeno, para a pessoa saber em que loja está entrando.
- O tema claro / escuro e o Suporte continuam no canto de cima.
- **Tela média** (até 1200 px): sem a ilustração. **Tablet:** a marca, a ilustração e o cartão, um embaixo do outro.
  **Celular:** a marca e o cartão.
- O **primeiro acesso** usa o mesmo cartão ("Crie a sua senha").
- Os textos da marca ficam em `apps/web/src/marca.ts` e a logo em `apps/web/src/Logo.tsx`. O nome "LojaGestor" do
  modelo ainda não entrou: o nome continua "Nome da empresa" até o Luan confirmar.
- **Testes:** tela 408: a marca, a chamada, o texto e os recursos; a ilustração embutida e escondida do leitor de tela;
  o selo da loja; o título "Bem-vindo de volta!".
- **Navegador:** PC (1366 e 1920 px), tablet e celular, no claro e no escuro, mais o primeiro acesso: sem rolagem
  nenhuma; o tema continua trocando e sendo guardado; console sem erros.

### 25/11/2026: o cartão de entrada mais ao centro

O Luan pediu o quadro da direita mais centralizado. Vimos duas opções em prévia: o cartão no meio da metade direita
da tela, ou a tela toda numa faixa central de 1600 px. Entrou a primeira (opção A).

- **Tela larga (acima de 1200 px):** o cartão fica no meio da metade direita da tela. Em 1920 px ele anda 172 px
  para o centro (a margem da direita passa de 88 para 260 px) e a ilustração da loja fica um pouco menor (de 932 para
  760 px de largura). Em 1366 px o cartão anda 53 px.
- **Continua igual:** o tema claro / escuro e o Suporte no canto, "Esqueceu a senha?" com a orientação, o olho para
  mostrar a senha e o aviso de Caps Lock. O primeiro acesso ("Crie a sua senha") usa o mesmo molde e também fica com
  o cartão mais ao centro.
- **Tela média, tablet e celular:** sem mudança.
- Só CSS: a regra `@media (min-width: 1201px)` de `.entrada` em `apps/web/src/estilos.css`.
- **Navegador:** 1920, 1366, 1280 e 1200 px, tablet e celular, no claro e no escuro: sem rolagem, o cartão no meio da
  metade direita (acima de 1200 px), a ilustração sem entrar no cartão, o tema e o Suporte sem cobrir o cartão. As
  funções: o tema troca e fica guardado; o Suporte abre e fecha; "Esqueceu a senha?" mostra a orientação; a senha
  errada avisa; a Ana entra; um usuário novo cai no primeiro acesso, com o cartão no mesmo lugar; console sem erros.

### 25/11/2026: a tela de entrada cabe na altura da tela

O Luan mandou um print em que a tela de entrada passava do fundo da tela (o último recurso, "Gestão financeira",
ficava cortado). Era uma tela mais baixa: notebook, ou o Windows com zoom de 125%, que deixa uns 1495×695 px úteis.

- **No PC:** as medidas de altura acompanham a altura da tela. Entram nessa conta a logo, a chamada, o texto, os
  recursos, os espaços, os campos, o botão e o cartão. A partir de ~900 px de altura fica tudo como antes. Abaixo
  disso diminui junto com a tela, até um mínimo legível.
- **Tela baixa (até 700 px):** o tema e o Suporte ficam um pouco menores e o conteúdo começa abaixo deles, sem
  encostar no cartão.
- **Na demonstração**, a conta desconta a faixa amarela (que sai depois).
- **Tablet e celular:** sem mudança.
- Só CSS: `apps/web/src/estilos.css` e `apps/web/src/demo/demo.css`.
- **Navegador:** 1495×695, 1366×650, 1280×590, 1280×600, 1536×730, 1440×800, 1920×950, 1920×1080, 1024×640, 1100×620,
  1280×720, 1600×900, 2560×1300, tablet e celular, no claro e no escuro: sem rolagem nenhuma; o tema e o Suporte sem
  encostar no cartão; a ilustração fora do cartão; console sem erros. Em 1920×950 e 1920×1080 as medidas são as
  mesmas de antes.

## Relatórios — ajustes pedidos pelo Luan

### 25/11/2026: aba "Tudo" e o ícone do Excel

- **Aba "Tudo"**, a primeira, que abre ao entrar em Relatórios: um cartão para cada assunto com os números do período
  escolhido:
  - Vendas: total, quantidade, ticket médio e itens;
  - Produtos: o mais vendido, o custo, o lucro estimado e as taxas;
  - Estoque: ativos, abaixo do mínimo, zerados e valor;
  - Clientes: ativos, os que compraram, o comprado e o fiado em aberto;
  - Financeiro: entradas, saídas, resultado e despesas;
  - Caixa: dias, diferenças, faltas e sobras;
  - Compras: quantidade, total, a prazo e estornos;
  - Histórico: registros, pessoas e o último registro.

  Os números são os mesmos de cada aba sem os filtros dela (só o período do topo). "Ver detalhes" abre a aba do
  assunto. Parte que o sistema da loja ainda não tem avisa no próprio cartão.
- **Ícone no estilo do Excel** (a planilha com o "X" verde, desenhada no próprio sistema) em "Exportar tudo (Excel)" e
  em "Exportar esta aba (Excel)".
- **Correção:** valor zero com o sinal trocado aparecia como "-R$ 0,00" (as Faltas do caixa sem nenhuma falta). Agora
  `formatarCentavos` mostra "R$ 0,00" em todo o sistema.
- **Testes:** cada número da aba Tudo é comparado com o cartão da aba do assunto; o período do topo vale para o Tudo;
  "Ver detalhes" abre a aba certa; parte indisponível avisa; os dois botões têm o ícone; o zero negativo no núcleo.
- **Navegador:** 1600 px no claro e no escuro, 1366 px e celular: os 8 assuntos, o ícone, sem rolagem para o lado e
  console sem erros.

---

## Módulo 13 — Dados e backup

O pedido do Luan (25/11/2026, 3ª imagem): *"Colocar sub abas bem definidas. a primeira com dados do sistema com oque já
está presente, como alterar nome da empresa do cliente, logo, regras, etc.. a outra aba importação de dados, importar
planilhas de dados, caso o cliente possua outro sistema e esteja migrando para o nosso, importar produtos, vendas, etc,
exportar dados do sistema entre outros. Uma aba somente para o Adm. Sup. como: lançar atualizações, ajustes, criar
visões, para conseguirmos ter acesso mesmo quando vender."*

O Luan marcou todas as opções das três perguntas:

- **Importar** de .xlsx ou .csv, com modelo para baixar e prévia antes de gravar:
  - produtos, clientes e fornecedores;
  - vendas antigas, só como histórico: não mexem em estoque, caixa e financeiro.
- **Exportar**:
  - planilhas do Excel, no mesmo formato da importação;
  - cópia de segurança completa;
  - restaurar uma cópia: só o Adm. Sup, porque apaga os dados atuais.
- **Parte do Adm. Sup**:
  - atualizações e avisos;
  - ajustes por loja;
  - visões sob medida;
  - manutenção.

O módulo vai em partes, um commit por parte (13a a 13h).

### 13a (25/11/2026): as partes da tela

- **Três partes**, no mesmo formato das abas dos Relatórios:
  - **Dados do sistema**, que abre primeiro: o que já havia, ou seja, Dados da loja (nome, descrição e logo) e Regras
    gerais;
  - **Importar e exportar**: em branco até a vez dela (13b a 13d);
  - **Adm. Sup**: só o Adm. Sup vê; fica em branco até a vez dela (13e a 13h).
- **Permissão nova `suporte.ferramentas`** (núcleo), só do Adm. Sup:
  - fica fora do Dono, do Administrador e do Personalizado;
  - não se dá a ninguém, e gravada por fora não vale;
  - a mensagem de recusa diz "só o Adm. Sup.".
- **Servidor:** nada muda. A permissão não vai para o banco, então a regra do banco sobre as funções do Personalizado
  continua a mesma.
- **Testes:**
  - núcleo 412 (+1): o Adm. Sup tem tudo; o Dono tem tudo menos `suporte.ferramentas`; ninguém mais a tem, nem o
    Personalizado;
  - tela 416 (+3): o Dono e o Administrador veem duas partes; o Personalizado não vê a do Adm. Sup, nem com a
    função gravada por fora; o Adm. Sup vê as três, e trocar de parte troca o que aparece.
- **Navegador:** o Dono vê duas partes e o Adm. Sup vê três, a 1600 px no claro e no escuro e no celular. Cada parte
  abre, sem rolagem para o lado e sem erros no console.

### 13b (25/11/2026): exportar, cópia de segurança e restaurar

A parte **Importar e exportar** ganhou três cartões.

**Exportar para o Excel** (DaniPets DAT-06): os cadastros de produtos, clientes e fornecedores, cada um num .xlsx com
as mesmas colunas do modelo de importação (`packages/core/src/modelosDePlanilha.ts`). Assim, a 13c lê o mesmo formato.

| Planilha | Colunas | Observações |
|---|---|---|
| Produtos | código interno, nome, código de barras, marca, unidade, peso (kg), preço, estoque, custo, estoque mínimo, fornecedor e situação | no produto por kg, estoque e mínimo em quilos; o custo é o custo médio |
| Clientes | nome, telefone, CPF, WhatsApp, nascimento, endereço, o campo extra da loja (quando ligado), limite de fiado, "aceita mensagens" e observações | só os clientes ativos; quem teve os dados excluídos (LGPD) fica de fora; o CPF vai completo só para quem pode vê-lo, senão a coluna vai em branco (nunca mascarada, para o arquivo servir para importar) |
| Fornecedores | nome, CNPJ ou CPF, telefone, contato, observação e situação | |

- Cada cadastro aparece para quem tem o acesso da aba dele: clientes com Clientes, fornecedores com Compras.
- Cada planilha baixada fica no histórico, com o cadastro e o número de linhas.
- O arquivo se chama, por exemplo, `produtos-loja-a-2026-11-25.xlsx`.

**Cópia de segurança** (DaniPets DAT-01):
- um arquivo .json com todos os dados da loja: cadastros, vendas, estoque, caixa, financeiro, fidelidade e
  vales-troca. Leva também a equipe (sem senha) e o histórico, só para consulta;
- **quem baixa:** quem tem Dados e backup **e** pode ver o CPF completo, porque a cópia leva o CPF dos clientes. O Dono
  e o Administrador podem; o Personalizado, só com as duas funções. Fica no histórico;
- o arquivo leva a **conferência** (SHA-256 do conteúdo): arquivo corrompido ou mexido à mão é recusado na restauração.

**Restaurar uma cópia** (DaniPets DAT-05), só o **Adm. Sup**:
- **permissão nova `dados.restaurar`**, só dele, como a `suporte.ferramentas`. O Dono vê o aviso de que a
  restauração é com o Adm. Sup;
- **escolher o arquivo:** o sistema confere o formato, a loja e a conferência. Cópia de outra loja, de versão mais
  nova do sistema ou alterada é recusada, com o motivo;
- **prévia:** a data e a hora da cópia, quem a baixou, o total de registros e quantos há de cada assunto;
- **confirmação:** a pessoa marca "Entendi: os dados atuais da loja serão trocados pelos desta cópia";
- **antes de trocar**, o sistema baixa uma cópia dos dados de agora (`copia-antes-de-restaurar-...json`). Se não der
  para baixar, nada é trocado;
- **depois:** a loja volta ao que a cópia tem, tudo ou nada. As outras lojas não mudam. A equipe (com as senhas de
  hoje) e o histórico continuam, e a restauração entra no histórico ("cópia de dd/mm/aaaa • N registros"). A barra
  lateral recarrega, porque o nome e o logo da loja podem ter mudado.

**Decisões tomadas (para o Luan conferir):**
- a equipe e o histórico não voltam na restauração. Assim ninguém perde o acesso nem a senha, e o histórico continua
  "só acrescenta";
- a planilha de clientes leva só os clientes ativos, como a lista da aba Clientes;
- só os cadastros viraram planilha. As vendas antigas entram na 13d, junto com a importação delas, no mesmo formato.

**Servidor:** sem tabela nova. A cópia, a restauração e o registro das planilhas respondem 501 até o servidor ganhar
essa parte. Lá, a conferência vai ser assinada com uma chave que só o servidor tem (`docs/backup.md`).

**Testes:**
- núcleo 425 (+13): o JSON canônico, montar a cópia, as recusas (outra loja, versão nova, partes que não batem, a
  contagem), quem baixa e o resumo das três ações novas no histórico;
- tela 435 (+19):
  - a API da demonstração: a cópia leva todas as chaves de dados; o que vai e o que não vai (senha); quem baixa;
    restaurar volta tudo sem mexer na outra loja, na equipe e no histórico; o Dono e o Administrador não restauram;
    arquivo alterado, de outra loja ou que não é cópia é recusado; restaurar num navegador apagado traz a loja de
    volta sem os exemplos por cima;
  - as planilhas: colunas, quilos, custo, fornecedor, campo extra, CPF em branco, nome do arquivo;
  - a tela: as três planilhas, a cópia, o Personalizado só com Dados e backup, e o Adm. Sup restaurando com prévia,
    confirmação e a cópia de antes baixada.
- **Navegador:**
  - o Dono baixou as três planilhas, que abriram no openpyxl com as colunas certas, dinheiro em "R$", linha
    congelada e filtro;
  - o Dono baixou a cópia; depois, mudou a descrição da loja;
  - o Adm. Sup restaurou: a cópia de antes saiu com a descrição mudada, e a descrição voltou;
  - 1600 px claro e escuro e celular sem rolagem para o lado, console sem erros.
