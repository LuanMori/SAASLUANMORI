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
| 6. Clientes | **Concluído** (20/11/2026) |
| 7. Fidelidade | **Concluído** (20/11/2026) |
| 8. Vale-troca | **Concluído** (20/11/2026) |
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

