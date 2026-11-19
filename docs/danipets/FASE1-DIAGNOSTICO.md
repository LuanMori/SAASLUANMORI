# Fase 1 — Diagnóstico: DaniPets → Sistema Padrão (SaaS multiempresa)

- **Data:** 19/11/2026
- **DaniPets analisado:** `DaniPets_Arquivo_Final.html` — versão V9.3.3, 1,59 MB, 5.703 linhas
  (CSS 836 linhas; programa de ~414 KB com 244 funções; 11 telas; 17 listas de dados; biblioteca de
  planilhas SheetJS 0.20.3 embutida; logo PNG embutido).
- **Sistema novo analisado:** `sistema-padrao-demo (12).html` — 433 KB. É **idêntico, byte a byte**, ao
  arquivo gerado pelo repositório no commit `c37763b`. Por isso a análise foi feita pelo código-fonte
  de onde ele sai: `packages/core` (regras), `apps/web` (telas e API da demonstração) e `apps/api`
  (servidor). O HTML é o resultado de um build (React compilado e minificado), não um arquivo escrito à mão.
- **Nenhum arquivo original foi alterado.** Esta fase não muda código.

Legenda da classificação:
**(a)** já existe e é equivalente · **(b)** existe, mas incompleto · **(c)** existe com comportamento
diferente · **(d)** não existe, precisa ser implementado · **(e)** depende de dado do cliente DaniPets e
vira **configuração por empresa**.

Destino: **Manter** (fica como está no sistema novo) · **Adaptar** (trazer do DaniPets ajustando ao SaaS) ·
**Criar** (implementar do zero com a regra do DaniPets) · **Substituir** (o SaaS resolve de outro jeito,
melhor) · **Descartar** (não faz sentido no SaaS, com motivo) · **Configurar** (vira opção por empresa).

---

## 0. Resumo

| Classe | Quantidade | O que significa |
|---|---|---|
| (a) equivalente | 35 | o sistema novo já faz igual (ou melhor, com o servidor e o isolamento por loja) |
| (b) incompleto | 39 | a regra ou a API existem, falta parte da regra ou a tela |
| (c) diferente | 17 | existe, mas funciona de outro jeito (cada caso tem a recomendação) |
| (d) não existe | 51 | precisa ser implementado |
| (e) configuração por empresa | 11 | dado fixo do DaniPets que vira opção de cada loja |
| **Total** | **153** | todas as funcionalidades do DaniPets têm um destino (seção 2) |

**O sistema novo está à frente** em multiempresa (loja = empresa, dados separados por `lojaId`; no
servidor, isolamento no próprio banco com RLS), login próprio com senha provisória, permissões numa
matriz única, auditoria só de acréscimo, servidor real com testes, CSP, Frente de caixa ajustada à tela
e relatórios com filtros.

**O DaniPets está à frente** em profundidade de negócio: **Caixa do dia** (abertura, sangria,
fechamento com contagem), **Compras** (nota fiscal, custo médio, lotes e validade, contas a pagar),
**Clientes** (tela completa, programa de cashback, cupom de retorno, WhatsApp, fiado com limite),
**vale-troca**, **tela do Financeiro** (extratos), **lucro estimado**, **produtos por kg**,
**exportação/importação** e **configurações** do programa.

**Ponto estrutural mais importante:** o `sistema-padrao-demo.html` é gerado. A implementação precisa
ser feita no código-fonte (regras no `packages/core` com testes, telas no `apps/web`) e o arquivo final
`sistema-padrao-completo.html` gerado pelo mesmo build. Editar o HTML minificado à mão seria perdido no
próximo build e não teria testes (ver seção 4, conflito C1).

---

## 1. Inventário do DaniPets (o que cada coisa faz, pelo código)

### 1.1 Modelo de dados e armazenamento (DaniPets)

Um objeto único `db` (versão 3) gravado inteiro no **IndexedDB** (`danipets` → `kv` → `db`), com cópia
de migração da V7 (`localStorage` `danipets_v2`) e **selo de integridade** (HMAC-SHA-256 com chave não
exportável). Listas: `products`, `sales`, `purchases`, `adjustments`, `customers`, `receivables`,
`payables`, `movements`, `cashOpenings`, `cashClosings`, `audit`, `users`, `returns`, `vouchers`,
`cashback`, `cashbackUses`, `coupons`, `contacts`; `accounts` (Caixa físico, Conta bancária);
`settings` (números sequenciais de venda/devolução/vale, taxas e prazos de cartão, último backup,
regras do programa de fidelidade, selo). Dinheiro em número com arredondamento (`round2`), quantidades
com 3 casas (kg). **Toda alteração** passa por `transact()`: tira uma cópia, aplica, grava; se falhar,
volta a cópia (tudo ou nada). Carrinho do PDV em `danipets_v3_pdv` por usuário; sessão em
`sessionStorage` (`danipets_sessao`); tema em `danipets_tema`.

### 1.2 Telas (menu igual ao do sistema novo)

Frente de caixa (`sales`), Visão geral (`dashboard`), Caixa do dia (`cash`), Produtos e estoque
(`products`), Compras (`purchases`), Clientes (`customers`), Financeiro (`finance`), Relatórios
(`reports`), Usuários (`users`), Dados e backup (`data`), Suporte (`support`). Compras, Financeiro,
Relatórios e Dados e backup: só Dono e Administrador (`PAGE_PERM`). Uma janela genérica (`#modal`),
avisos rápidos (`toast`) e a tela de entrada (`#auth`).

### 1.3 Atalhos e comportamentos automáticos

- **Frente de caixa:** F2 finalizar · F3 buscar produto · F4 Dinheiro · F6 cliente · F7 Fiado · F8 Pix ·
  F9 Débito · F10 Crédito · Esc volta ao leitor · Enter no leitor adiciona · `3*código` = 3 unidades.
- **Enter** abre os cards de detalhe e as linhas de venda; **duplo clique** não paga duas vezes.
- **Automáticos:** fechamento do caixa à meia-noite (também com o sistema aberto, conferido a cada
  minuto); saída após 30 min sem uso; backup ao fechar o caixa; bloqueio de uma segunda aba; aviso
  fixo quando o navegador recusa gravar; aviso ao fechar a aba com gravação pendente; o carrinho
  sobrevive a recarregar a página.

### 1.4 Perfis e permissões (DaniPets)

`admin` (Administrador), `dono`, `vendedor` (lista fechada; perfil desconhecido não entra). Dono e
Administrador: tudo. Vendedor: `sell`, `cash`, `customers`, `newProduct`; desconto até 10% por item;
acima disso, **autorização** com a senha de um Dono ou Administrador (`askAuth`). Algumas ações pedem
a **liberação de um Dono** com motivo (`askDono`): brinde, lançamento em dia já fechado, fiado acima do
limite ou com fiado vencido, exclusão de dados de cliente. Permissões internas extras: `fiadoView`
(ver fiado e limites), `programRules` (alterar o programa), `discountAny`.

---

## 2. Tabela comparativa (DaniPets × sistema novo)

### 2.1 Entrada, sessão e segurança (ACE)

| ID | DaniPets (como funciona) | Sistema novo hoje | Classe | Destino |
|---|---|---|---|---|
| ACE-01 | Entrada: escolhe o usuário numa **lista** e digita a senha; olho para mostrar a senha | Usuário **digitado** + senha; a loja vem do endereço; olho, Caps Lock, ajuda | (c) | **Manter o novo**: lista de usuários na tela expõe quem trabalha na loja; multiempresa pede a loja pelo endereço |
| ACE-02 | Primeiro acesso: sem usuários, cria o primeiro Administrador; "Já usa o DaniPets?" restaura backup antes | Primeiro Dono pelo script do servidor; na demonstração, equipe inicial pronta | (c) | Manter; implantação de loja nova fica com o super admin (Fase 3) |
| ACE-03 | Senha PBKDF2 (150 mil voltas), mínimo 6 | scrypt no servidor, PBKDF2 na demonstração, mínimo 8 + lista de senhas comuns, senha provisória | (a) | Manter o novo (mais forte) |
| ACE-04 | 5 senhas erradas → 5 min; diz "Restam N tentativas" | 5 → 5 min, por usuário e por IP; mesma mensagem para usuário que não existe | (c) | Manter o novo (não revela quem existe nem quantas tentativas restam) |
| ACE-05 | Sessão volta ao recarregar a página (até 30 min), com chave da aba | Servidor: cookie HttpOnly (volta ao recarregar). Demonstração: recarregar = sair | (b) | Adaptar na demonstração (opcional): guardar a sessão da aba |
| ACE-06 | Sai após 30 min sem uso | Igual (servidor e tela) | (a) | Manter |
| ACE-07 | Perfis fechados; perfil desconhecido não entra nem autoriza | Igual (`ehPapelDeLoja`, trava no banco) | (a) | Manter |
| ACE-08 | Vendedor: vender, caixa, clientes, cadastrar produto; telas de gestão só Dono/Admin | Mesma matriz, centralizada em `permissoes.ts`, usada por servidor, menu e telas | (a) | Manter; acrescentar as permissões novas (`fiado.ver`, `programa.regras`, `caixa.retirada`...) |
| ACE-09 | Autorização com senha (Dono/Admin) para desconto >10%, devolução, cancelamento, fechamento com diferença, retirada do dono — presa à ação, vale por algumas horas | Autorização para desconto, brinde, devolução e cancelamento, presa à ação, 4 h | (b) | Adaptar: fechamento e retirada do dono entram com o Caixa do dia |
| ACE-10 | **Liberação do Dono** com motivo: brinde, lançamento em dia fechado, fiado acima do limite/vencido, excluir dados de cliente | Brinde: só Dono ✓. Os outros casos não existem ainda | (b) | Adaptar junto com cada módulo |
| ACE-11 | Selo de integridade (HMAC) e aviso de "alteração externa", que só some com a senha do backup | Não existe | (c) | **Substituir**: no SaaS o servidor é a fonte da verdade (RLS + auditoria); na demonstração não protege nada de verdade |
| ACE-12 | Só uma aba aberta (trava) | Várias abas; cada lista gravada separada | (c) | **Substituir** por sincronização entre abas na demonstração e concorrência do servidor (vários vendedores ao mesmo tempo) |
| ACE-13 | Falha ao gravar: aviso vermelho fixo, nenhuma operação nova aceita, "tentar de novo"/"baixar backup" | Se o navegador recusar, guarda só na memória, sem aviso | (b) | Adaptar na demonstração (aviso fixo + bloquear operação) |
| ACE-14 | Aviso de risco quando aberto dentro de e-mail/app/Drive ou navegador que apaga dados | Não existe | (d) | Adaptar só na demonstração (no sistema real os dados ficam no servidor) |
| ACE-15 | Tema claro/escuro/automático, guardado no computador | Botão existe, não faz nada | (b) | Criar |
| ACE-16 | Cabeçalho com a data por extenso e a situação do caixa ("Caixa aberto às 08:10") | Data e saudação na Visão geral; sem situação do caixa | (b) | Adaptar com o Caixa do dia |
| ACE-17 | Auditoria de tudo: quem (nome e id), quando, ação e detalhe | Auditoria só de acréscimo (servidor e demonstração) para sessão, usuários, produto criado, exclusão de cliente | (b) | Adaptar: registrar venda, desconto, devolução, caixa, estoque, compras, financeiro, clientes |

### 2.2 Visão geral (VG)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| VG-01 | "Vendas de hoje" com detalhamento ("de onde vem") | Igual, com detalhe por forma de pagamento, por quem vendeu, venda por venda e devoluções | (a) | Manter |
| VG-02 | Unidades vendidas hoje (un + kg) | Não existe | (d) | Criar (com kg) |
| VG-03 | Produtos ativos (e inativos) | Produtos ativos | (a) | Manter (+ inativos quando houver inativação) |
| VG-04 | Saldo das contas (gestor) + a receber + a pagar | Saldo + a receber (cartão e fiado) | (b) | Adaptar: "a pagar" com Compras |
| VG-05 | Últimas 6 vendas, com etiqueta cancelada/com devolução | Venda por venda no detalhe de hoje | (c) | Adaptar: card "Últimas vendas" |
| VG-06 | **Pendências**: caixa não aberto, dias sem fechamento, lote vencido/vencendo, estoque baixo/negativo, clientes para lembrar, fiado vencido, cliente excluído por vendedor, cartão vencido, contas a pagar vencidas, avisos de backup | Card pronto, conteúdo **A DEFINIR** (decisão do Luan); regras 6, 7, 10 e 11 prontas e desligadas | (c) | **Decisão sua** (pergunta P6) |

### 2.3 Frente de caixa (PDV)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| PDV-01 | Leitor com `3*código`, busca por nome (F3), Esc volta ao leitor | Igual | (a) | Manter |
| PDV-02 | Carrinho: +/−, quantidade digitada, remover; **kg em passos de 0,5** | Igual, só unidades inteiras | (b) | Adaptar com kg |
| PDV-03 | Desconto por item com motivo; vendedor até 10%; acima, senha; brinde só Dono; remover desconto | Igual | (a) | Manter |
| PDV-04 | **Cupom de retorno** aplicado sozinho ao identificar o cliente | Não existe | (d) | Criar (com Fidelidade) |
| PDV-05 | Formas com atalho: Dinheiro F4, Pix F8, Débito F9, Crédito F10, Fiado F7 | Igual | (a) | Manter |
| PDV-06 | Pagamento dividido | Igual | (a) | Manter |
| PDV-07 | Valor recebido e troco, também na parte em dinheiro do dividido; atalhos de valor | Igual (com "Exato" e valores redondos) | (a) | Manter |
| PDV-08 | **Cashback** do cliente abate o total (o que vence primeiro) | Não existe | (d) | Criar |
| PDV-09 | **Vale-troca** como pagamento (escolhe o vale; a sobra fica no vale) | Não existe | (d) | Criar |
| PDV-10 | Fiado só com cadastro completo; **limite por cliente**; acima do limite ou com fiado vencido → liberação do Dono | Fiado só com cliente identificado | (b) | Adaptar: limite, vencido, liberação |
| PDV-11 | F6: busca por CPF/telefone/nome, cadastra na hora; faixa com cashback, vale, fiado/limite, cupom | F6 com busca no servidor e cadastro na hora; faixa com o fiado | (b) | Adaptar: chips de cashback, vale, limite e cupom |
| PDV-12 | Só vende com **caixa aberto** e responsável identificado; caixa de hoje fechado bloqueia | Vende sem caixa | (d) | Criar com o Caixa do dia |
| PDV-13 | Venda só de brinde fica sem pagamento | Igual | (a) | Manter |
| PDV-14 | Número sequencial #00001 por loja | Igual | (a) | Manter |
| PDV-15 | Carrinho guardado por pessoa | Igual | (a) | Manter |
| PDV-16 | Finaliza só depois de gravar (se falhar, os itens ficam) | Igual | (a) | Manter |
| PDV-17 | Devolução/troca a partir do PDV pelo número da venda | Igual | (a) | Manter |
| PDV-18 | Aviso final "Venda #N finalizada" + cashback ganho | Aviso de venda finalizada | (b) | Adaptar com cashback |
| PDV-19 | Tela cheia estilo mercado | Igual, ajustada à altura da tela | (a) | Manter o novo |

### 2.4 Devolução, troca, cancelamento e vale-troca (DEV)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| DEV-01 | Devolução parcial por item/quantidade com motivo; volta à prateleira ou descarte | Igual | (a) | Manter |
| DEV-02 | Valor volta pela mesma forma, na proporção do que cada forma ainda pode devolver | Igual | (a) | Manter |
| DEV-03 | Opção **vale-troca** (código VT-0001-ABC) | Não existe | (d) | Criar |
| DEV-04 | Abate primeiro o fiado em aberto da venda | Igual | (a) | Manter |
| DEV-05 | Devolução em dinheiro exige caixa aberto e não passa do que há na gaveta | Não passa do caixa ✓; sem exigir caixa aberto | (b) | Adaptar com o Caixa do dia |
| DEV-06 | Cartão: abate do a receber; se já recebido, sai da conta | Igual | (a) | Manter |
| DEV-07 | Retira o cashback gerado; devolve o cashback usado | Não existe | (d) | Criar com Fidelidade |
| DEV-08 | Vendedor precisa de autorização | Igual | (a) | Manter |
| DEV-09 | Cancelar a venda inteira: mesmo dia, caixa da venda aberto, sem devoluções, motivo, autorização; cupom volta a valer | Mesmo dia, sem devoluções, motivo, autorização | (b) | Adaptar: caixa aberto e cupom |
| DEV-10 | Lista de vales-troca em aberto | Não existe | (d) | Criar (Financeiro e Clientes) |

### 2.5 Caixa do dia (CX)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| CX-01 | Abrir: responsável + fundo de troco; precisa fechar o dia anterior antes | Não existe (aba em branco) | (d) | Criar |
| CX-02 | Sangria (deposita no banco ou retirada do dono), suprimento; não tira mais do que a gaveta tem; retirada do dono só com Dono/Admin | Não existe | (d) | Criar |
| CX-03 | Esperado na gaveta = fundo + dinheiro movimentado depois da abertura; resumo | Não existe | (d) | Criar |
| CX-04 | Fechar: contado, diferença, justificativa; diferença acima de **R$ 10** → senha Dono/Admin; ajuste no Caixa físico; totais por forma | Não existe | (d) | Criar (tolerância configurável) |
| CX-05 | Desfazer só o último fechamento (motivo + senha), estornando o ajuste | Não existe | (d) | Criar |
| CX-06 | Fechamento automático à meia-noite, sem contagem | Não existe | (d) | Criar |
| CX-07 | Histórico (dia, fundo, esperado, contado, diferença, quem) e movimentos do dia | Não existe | (d) | Criar |
| CX-08 | Dia já fechado fica travado; lançar nele só com liberação do Dono | Não existe | (d) | Criar |
| CX-09 | Backup automático ao fechar o caixa | Não existe | (c) | Substituir: backup é do servidor; na demonstração, lembrete de exportar |

### 2.6 Produtos e estoque (PRD)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| PRD-01 | Cadastro: nome, código de barras, marca, peso, **unidade (un/kg)**, fornecedor, preço, estoque mínimo, estoque inicial + custo do inicial (só gestor) | Nome, código de barras, preço (mínimo e entrada por movimento) | (b) | Adaptar: marca, peso, unidade, fornecedor, estoque inicial com custo |
| PRD-02 | Código interno do sistema (maior + 1, 4 dígitos); código de barras único e diferente de qualquer código interno | Igual (servidor e demonstração) | (a) | Manter |
| PRD-03 | Preço maior que zero (brinde só na venda) | Igual | (a) | Manter |
| PRD-04 | Aviso de produto parecido (mesmo nome, marca e peso) | Não existe | (d) | Criar |
| PRD-05 | **Editar** produto, com confirmação se já tem histórico e auditoria do antes/depois | Não existe (só cadastrar) | (d) | Criar |
| PRD-06 | Inativar/reativar; excluir só sem histórico | Não existe | (d) | Criar |
| PRD-07 | Lista com busca (código, produto, preço, saldo, mínimo, ações) | Lista sem busca | (b) | Adaptar |
| PRD-08 | Ajuste: motivos fixos (perda/avaria, vencido, correção de contagem, outro + observação), nunca negativo, com data (retroativa com liberação) | Ajuste com motivo livre, nunca negativo, data de hoje | (b) | Adaptar: motivos (configuráveis) e data |
| PRD-09 | Saldo = inicial + compras − vendas + devoluções à prateleira + ajustes; card "Como o saldo é calculado" | Saldo = soma dos movimentos | (b) | Adaptar: card explicativo |
| PRD-10 | **Custo médio móvel** a cada compra; custo guardado no item vendido | Não existe | (d) | Criar |
| PRD-11 | **Lotes e validade** (por compra; o mais antigo sai primeiro), avisos de vencido/vencendo em 30 dias, "Dar baixa no lote" | Não existe | (d) | Criar |
| PRD-12 | Estoque mínimo, aviso de baixo e de negativo | Mínimo e situação (baixo/zerado) | (a) | Manter |
| PRD-13 | Quantidades em **kg** com 3 casas (rações a granel) | Só unidades inteiras | (d) | Criar (quantidade em milésimos, sem número quebrado) |

### 2.7 Compras e contas a pagar (CMP)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| CMP-01 | Registrar compra por **nota fiscal** (fornecedor, NF, data), vários itens (produto, quantidade, custo > 0, validade); só gestor | Não existe (aba em branco) | (d) | Criar |
| CMP-02 | À vista (escolhe a conta) ou **a prazo** (vencimento → conta a pagar) | Não existe | (d) | Criar |
| CMP-03 | NF repetida do mesmo fornecedor pede confirmação | Não existe | (d) | Criar |
| CMP-04 | Custo diferente do último: mostra custo, preço e margem e oferece mudar o preço na mesma gravação | Não existe | (d) | Criar |
| CMP-05 | Ao escolher o produto, sugere o último custo e o fornecedor (só gestor) | Não existe | (d) | Criar |
| CMP-06 | **Estornar compra** com motivo; não deixa o estoque negativo; conta a pagar cancelada na proporção | Não existe | (d) | Criar |
| CMP-07 | Bonificação: lançar como entrada de estoque sem custo | "Entrada" de estoque sem custo | (c) | Manter, com explicação na tela |
| CMP-08 | Histórico de compras (data, produto, fornecedor, NF, qtd, custo, pagamento, validade, situação) | Não existe | (d) | Criar |
| CMP-09 | **Contas a pagar**: lista, pagar escolhendo a conta, vencidas no painel | Não existe | (d) | Criar |
| CMP-10 | Fornecedor como texto livre no produto e na compra | Não existe | (d) | Criar como **cadastro simples de fornecedores** por loja (pedido do documento; pergunta P9) |

### 2.8 Clientes, fidelidade e fiado (CLI)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| CLI-01 | Cadastro: nome, telefone (com DDD), CPF (validado), **pet**, aniversário, endereço, observações, limite de fiado (gestor), WhatsApp, **autorização de mensagens (com data)**, não incomodar | Nome, telefone e CPF obrigatórios e válidos, CPF sem repetir | (b) | Adaptar os campos que faltam ("pet" vira campo configurável — ESP-06) |
| CLI-02 | "Cadastro completo" (nome, telefone, CPF) exigido para cashback, cupom e fiado; venda sem cliente segue normal | Os três já são obrigatórios: todo cadastro é completo | (c) | Manter o novo; a regra do DaniPets fica valendo para dados importados |
| CLI-03 | Lista: busca (nome, pet, CPF/telefone), filtros (com cashback, vale, fiado, fiado vencido, incompleto, sumidos, não incomodar), até 300 linhas, colunas com situação | Busca no servidor (para o F6); sem tela | (b) | Criar a tela |
| CLI-04 | Conta do cliente: resumo + **extrato** (tudo, compras, cashback, vale, fiado, contatos) | `historicoDoCliente` (compras e fiado) na API; sem tela | (b) | Criar a tela + extrato completo |
| CLI-05 | CPF mascarado; mostrar o CPF completo só quando pedido | Mascarado na busca | (b) | Adaptar ("mostrar CPF", registrado na auditoria) |
| CLI-06 | Editar cliente | API pronta; sem tela | (b) | Criar a tela |
| CLI-07 | Excluir cliente sem histórico (motivo); se foi o vendedor, aviso no painel do gestor até "Ciente" | Não existe | (d) | Criar |
| CLI-08 | **Excluir dados (LGPD)**: só Dono, com liberação e motivo; não com fiado aberto; apaga dos registros e do texto da auditoria; retira o cashback que sobrou; o vale continua para quem tem o código | Regra pronta (só Dono, não com fiado aberto, tira o nome das vendas, recebimentos e lançamentos); sem tela | (b) | Adaptar: texto da auditoria, cashback, tela |
| CLI-09 | Desativar/reativar (gestor) | API pronta; sem tela | (b) | Criar a tela |
| CLI-10 | **Cashback**: % sobre o pago em dinheiro/Pix/cartão (3,5%), validade (31 dias), em lotes; cashback/vale/fiado não geram; devolução retira; cancelamento devolve o usado | Não existe | (d) | Criar (regras configuráveis) |
| CLI-11 | **Cupom de retorno**: sem comprar há 30 dias → lembrete com cupom de 5% por 7 dias, aplicado sozinho no PDV, um por ciclo | Não existe | (d) | Criar |
| CLI-12 | Aviso de cashback vencendo (7 dias antes) | Não existe | (d) | Criar |
| CLI-13 | Aba **Retorno**: listas "sem comprar" e "cashback vencendo", quem ficou de fora, resultado dos lembretes (voltou em 15 dias, taxa) | Não existe | (d) | Criar |
| CLI-14 | **WhatsApp**: mensagens prontas com `{nome}`, `{loja}`, `{dias}`, `{desconto}`, `{validade}`, `{valor}`, `{vencimento}`, abre o wa.me; só com autorização; "Falei" sem mensagem; adiar; não incomodar | Não existe | (d) | Criar |
| CLI-15 | Aba **Fiado** (gestor): devendo, limite, disponível, mais antiga, vencido/vence em, totais, receber, lembrar; aviso do CDC art. 42 | Fiado como recebível; sem tela | (b) | Criar a tela |
| CLI-16 | Receber fiado pela conta do cliente: abate o mais antigo; dinheiro (com caixa aberto), Pix ou cartão (com taxa); não gera cashback | Confirmar recebível um a um (API) | (b) | Adaptar (abater o mais antigo, caixa aberto) |
| CLI-17 | Aba **Regras do programa** (gestor altera; vendedor vê): limites de cada número; mensagens editáveis; opção "fiado vencido pede Dono" | Não existe | (d) | Criar (configuração por loja) |
| CLI-18 | Regulamento do programa pronto para copiar | Não existe | (d) | Criar com o nome da loja (ESP-05) |
| CLI-19 | Painel: clientes para lembrar, fiado vencido | Regra 11 (fiado vencido) pronta e desligada | (c) | Depende da decisão das pendências (P6) |

### 2.9 Financeiro (FIN)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| FIN-01 | Contas Caixa físico e Conta bancária; saldo = soma dos movimentos | Regra e API prontas; sem tela (aba em branco) | (b) | Criar a tela |
| FIN-02 | Saldo inicial de cada conta (uma vez) | Regra e API prontas | (b) | Criar a tela |
| FIN-03 | Lançamento: entrada, despesa (categorias fixas), transferência, retirada; **data** (retroativa com liberação) | Entrada, despesa (categoria livre), retirada, transferência; data de hoje | (b) | Adaptar: categorias configuráveis e data |
| FIN-04 | Caixa físico nunca negativo; banco negativo pede confirmação | Caixa nunca negativo na devolução | (b) | Adaptar para todo lançamento |
| FIN-05 | Cartão a receber com taxa e prazo por forma; confirmar (escolhe a conta); confirmar todos os vencidos | Regra e API prontas (confirmar um a um) | (b) | Criar a tela + "confirmar todos" |
| FIN-06 | Fiado a receber por cliente | Regra pronta | (b) | Tela (Clientes → Fiado) |
| FIN-07 | **A pagar** (compras a prazo) | Não existe | (d) | Criar com Compras |
| FIN-08 | **Extrato** de cada card (Caixa, Banco, A receber, A pagar) com período, saldo anterior, saldo corrido, estornos em linha própria, CSV | Não existe | (d) | Criar |
| FIN-09 | Vales-troca em aberto | Não existe | (d) | Criar |
| FIN-10 | Taxas e prazos de cartão (configuração validada) | Regra pronta; sem tela | (b) | Criar a tela |

### 2.10 Relatórios (REL)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| REL-01 | Período De/Até (padrão: mês atual) | De/Até e atalhos Hoje/Ontem/Todas | (a) | Manter |
| REL-02 | Faturamento bruto, devoluções, líquido, ticket médio, unidades, descontos | Total vendido, vendas líquidas, ticket médio, descontos, taxas | (b) | Adaptar: unidades (un + kg) |
| REL-03 | **Lucro estimado**: custo das mercadorias (custo médio guardado na venda), cashback usado, taxas; lista de produtos sem custo | Não existe | (d) | Criar (depende do custo médio) |
| REL-04 | Mais vendidos (10 primeiros) | Não existe | (d) | Criar |
| REL-05 | Por forma de pagamento | Igual | (a) | Manter |
| REL-06 | Vendas do período + venda completa (itens, descontos, pagamentos, devoluções) | Igual, com filtros por quem vendeu, cliente e pagamento | (a) | Manter o novo |
| REL-07 | Devoluções e trocas do período | Igual | (a) | Manter |
| REL-08 | Posição de estoque (inicial, comprado, ajustes, vendido, devolvido, saldo) | Saldo e movimentos | (b) | Adaptar |
| REL-09 | Auditoria (quando, quem, ação, detalhe) | Histórico na aba Usuários (só ações de acesso, usuários e produtos) | (b) | Adaptar (todas as ações, filtro por período) |
| REL-10 | Exportar CSV (vendas, estoque) com proteção contra fórmula no Excel | Não existe | (d) | Criar |

### 2.11 Dados e backup (DAT)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| DAT-01 | Baixar backup completo (JSON) | Backup automático do **servidor** (testado); demonstração sem exportação | (c) | Adaptar: "exportar os dados da loja" (também portabilidade LGPD) |
| DAT-02 | Backup protegido por senha + código de recuperação | Backup do servidor no próprio servidor | (c) | Substituir (servidor); exportação da demonstração sem senha |
| DAT-03 | Backup automático numa pasta do computador (guarda 30) | Não se aplica | (c) | **Descartar**: no SaaS o backup é do servidor, para todas as lojas |
| DAT-04 | Lembrete semanal de copiar para pen drive | Não se aplica | (c) | **Descartar** (cópia externa é do servidor) |
| DAT-05 | Restaurar backup (baixa os dados atuais antes; recusa arquivo alterado) | Restauração no servidor (script testado) | (b) | Adaptar na demonstração: "importar os dados da loja", com confirmação |
| DAT-06 | Exportar Excel (Produtos, Compras, Vendas) | Não existe | (d) | Criar (pergunta P7: CSV ou Excel) |
| DAT-07 | Importar planilha (acrescenta o que não existe; planilha de fora só com senha de Administrador) | Não existe | (d) | Criar (pergunta P8, ligada ao item 5.5 adiado) |
| DAT-08 | Pedir armazenamento persistente e mostrar o uso | Não existe | (d) | Adaptar só na demonstração |

### 2.12 Usuários (USR)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| USR-01 | Lista: nome, perfil, situação, último acesso | Igual (+ usuário e senha provisória) | (a) | Manter |
| USR-02 | Cadastrar: nome, perfil, senha (mín. 6) | Nome, login, papel, senha provisória (mín. 8) | (c) | Manter o novo |
| USR-03 | Editar nome e perfil | Igual | (a) | Manter |
| USR-04 | Nova senha | Igual (provisória) | (a) | Manter |
| USR-05 | Desativar (não a si mesmo); mantém pelo menos um **Administrador** ativo | Mantém pelo menos um **Dono** ativo (no banco também) | (c) | Manter o novo (só o Dono faz as ações mais sensíveis) |
| USR-06 | Trocar minha senha | Igual (barra lateral) | (a) | Manter |
| USR-07 | Histórico de acessos (gestor) e **"Meus acessos"** (o vendedor vê os seus) | Histórico para gestor; vendedor não vê a aba | (b) | Adaptar: "Meus acessos" |
| USR-08 | Texto do que cada perfil pode | Tabela "O que cada papel pode fazer" | (a) | Manter |

### 2.13 Suporte (SUP)

| ID | DaniPets | Sistema novo | Classe | Destino |
|---|---|---|---|---|
| SUP-01 | Contatos do suporte (e-mail, telefone/WhatsApp) fixos no código | Contato em `marca.ts` (tela de entrada) | (e) | Configurar (empresa do SaaS) |
| SUP-02 | "Copiar informações para o suporte" (versão, navegador, usuário, números) | Não existe | (d) | Criar (sem dado pessoal) |
| SUP-03 | Problemas comuns (FAQ) | Não existe | (d) | Criar com textos do SaaS (sem pen drive) |
| SUP-04 | Versão no rodapé da barra lateral | Igual ("V0.1 • Nome da empresa") | (a) | Manter |

### 2.14 Dados específicos do cliente DaniPets (ESP)

| ID | No DaniPets | Classe | Destino |
|---|---|---|---|
| ESP-01 | Nome "Dani Pet’s", descrição "Rações, petiscos e acessórios" e logo PNG embutidos | (e) | Configurar: dados da loja (nome, descrição, logo) — o sistema novo já tem nome e descrição por loja |
| ESP-02 | Chaves `danipets_v2`, `danipets_v3_pdv`, `danipets_tema`, `danipets_sessao`, banco `danipets` | (e) | Descartar (o sistema novo usa `saas-demo:*`, separado por loja) |
| ESP-03 | Arquivos `danipets-backup-*.json` | (e) | Descartar/renomear com o nome do sistema e da loja |
| ESP-04 | E-mail e telefone pessoais do desenvolvedor no Suporte | (e) | Configurar (empresa do SaaS) — não copiar |
| ESP-05 | Nome da loja fixo nas mensagens de WhatsApp e no regulamento | (e) | Configurar (vem do nome da loja) |
| ESP-06 | Campo **"Pet"** no cliente (pet shop) | (e) | Configurar: campo extra com rótulo por loja ("Pet", "Veículo"...), ou desligado |
| ESP-07 | Padrões: cashback 3,5%/31 dias, retorno 30 dias, cupom 5%/7 dias, aviso 7 dias, fiado 30 dias, tolerância do caixa R$ 10, desconto 10%, taxas 1,5%/3% | (e) | Configurar por loja, com esses valores como padrão |
| ESP-08 | Categorias de despesa e motivos de ajuste fixos | (e) | Configurar por loja (com a lista do DaniPets como padrão) |
| ESP-09 | Avisos e migrações das versões antigas (V2, V7, V8) | (e) | Descartar |
| ESP-10 | Unidade "kg" e "peso" pensados em ração a granel | (e) | Configurar: unidades por loja (un, kg; outras depois) |

---

## 3. O que será mantido, adaptado, criado, substituído ou descartado

**Mantido (do sistema novo, sem regredir):** multiempresa por `lojaId` (a "empresa"/tenant) com os
dados separados por loja; login próprio com senha provisória e bloqueio; permissões centralizadas;
Frente de caixa atual (layout, atalhos, desconto, autorização, dividido, troco, fiado, devolução,
cancelamento); Visão geral com detalhamento; Relatórios com filtros; aba Usuários com histórico;
auditoria só de acréscimo; regras com testes no `packages/core`; servidor (NestJS + Postgres com RLS);
CSP e BOM; barra lateral do DaniPets V9.3.3; verde `#0b7f55`.

**Adaptado (DaniPets → SaaS):** ACE-05, 09, 10, 13, 14, 16, 17 · VG-02, 04, 05 · PDV-02, 10, 11, 18 ·
DEV-05, 09 · PRD-01, 07, 08, 09 · CLI-01, 05, 08, 16 · FIN-03, 04 · REL-02, 08, 09 · DAT-01, 05, 08 ·
USR-07 · SUP-02, 03.

**Criado (não existe no sistema novo):** Caixa do dia inteiro (CX-01 a 08); Compras, fornecedores e
contas a pagar (CMP-01 a 06, 08 a 10); custo médio, lotes e validade, kg, edição e inativação de
produto (PRD-04 a 06, 10, 11, 13); tela de Clientes com fidelidade (cashback, cupom, retorno,
WhatsApp, regras, regulamento, aba Fiado) (CLI-03, 04, 06, 07, 09 a 15, 17, 18); vale-troca (PDV-09,
DEV-03, DEV-10, FIN-09); cashback e cupom no PDV (PDV-04, 08) e na devolução (DEV-07); tela do
Financeiro com extratos (FIN-01, 02, 05 a 08, 10); lucro estimado, mais vendidos e CSV (REL-03, 04, 10);
exportar e importar (DAT-06, 07); tema escuro (ACE-15); configurações da loja (ESP-01, 05 a 08, 10).

**Substituído (o SaaS resolve melhor):** selo HMAC → servidor como fonte da verdade + auditoria
(ACE-11); trava de uma aba → sincronização entre abas na demonstração e concorrência no servidor
(ACE-12); backup em pasta/pen drive → backup automático do servidor (CX-09, DAT-02); entrada por lista
de usuários → usuário digitado (ACE-01); mínimo 6 → 8 caracteres; "pelo menos um Administrador" →
"pelo menos um Dono" (USR-05).

**Descartado (com motivo):** backup automático em pasta e lembrete de pen drive (DAT-03, 04: o
servidor faz o backup de todas as lojas); migrações e avisos das versões V2/V7/V8 (ESP-09); chaves
e nomes `danipets_*` (ESP-02, 03); contatos pessoais fixos (ESP-04, vira configuração).

---

## 4. Conflitos e riscos

| # | Conflito ou risco | Recomendação |
|---|---|---|
| C1 | O `sistema-padrao-demo.html` é **gerado** (React compilado). Editar o HTML à mão seria apagado no próximo build, sem testes, contra a regra do projeto (testes + regerar + commit) | Implementar no código-fonte e gerar o `sistema-padrao-completo.html` pelo mesmo build (P1) |
| C2 | A Fase 2 pede "blocos de código sem truncamento" na conversa. São milhares de linhas: colar tudo na conversa estoura o contexto e não deixa testar | Cada módulo vira commit(s) no branch, com testes; na conversa vai o resumo, os arquivos e o link (P2) |
| C3 | "Vários vendedores ao mesmo tempo com atualização consistente": num HTML com `localStorage` isso só vale para abas do **mesmo navegador**. Entre computadores, só com o servidor | Na demonstração: sincronizar abas e conferir a versão antes de gravar. No servidor: o padrão de trava por loja já existe (decisão 0003). Levar cada módulo ao servidor depois (P3) |
| C4 | Termos `empresaId/tenantId` × `lojaId` | Manter `lojaId` (a loja **é** a empresa/tenant); renomear não traz ganho e quebraria o servidor |
| C5 | **kg** muda a quantidade de inteiro para decimal em venda, estoque, devolução e relatórios | Guardar em milésimos (inteiro), como o dinheiro em centavos: sem erro de arredondamento |
| C6 | Um caixa por loja por dia (DaniPets) × vários vendedores em terminais diferentes | Começar como o DaniPets (um caixa da loja, vários vendedores vendendo nele) e preparar para mais de um caixa depois (P4) |
| C7 | DaniPets exige "pelo menos um Administrador"; o novo exige "pelo menos um Dono" | Manter o novo (o Dono é quem libera brinde, LGPD e regras) |
| C8 | Pendências da Visão geral estão **A DEFINIR** (`docs/PENDENCIAS.md`), e o DaniPets tem uma lista pronta | Decisão sua (P6) |
| C9 | Configurações: o DaniPets espalha as regras pelas abas; a barra lateral é cópia do DaniPets | Regras nas próprias abas (como o DaniPets) e "Dados da loja" em Dados e backup, sem mexer na barra lateral (P5) |
| C10 | Excel: a SheetJS embutida soma ~700 KB e tem histórico de falhas de segurança | CSV (o Excel abre) para exportar e importar por modelo; Excel completo só se for indispensável (P7) |
| C11 | Importar o backup do DaniPets foi **adiado** (item 5.5 da reunião) | Confirmar se continua adiado (P8) |
| C12 | Capacidade do `localStorage` (~5 MB) na demonstração, com anos de vendas | Aceitável para demonstração; o uso real é no servidor. Aviso quando estiver perto do limite |
| C13 | Dados já salvos da demonstração (vendas, estoque) precisam continuar abrindo depois das mudanças | Conversão automática na primeira abertura, como já foi feito antes |
| C14 | O servidor hoje só tem login, usuários, produtos e histórico. Vendas, estoque, clientes e financeiro estão só na demonstração | Contratos de API únicos (`ApiSistema`): a demonstração e o servidor implementam o mesmo; o servidor vem depois, módulo a módulo |
| C15 | Dados reais com nome de loja, contatos e logo no DaniPets | Nada disso é copiado: vira configuração (ESP-01 a 10) |
| C16 | Tamanho do trabalho: 153 funcionalidades, 90 a implementar ou completar (b + d) | Por módulos, com commit e testes a cada um; a conversa pode ser resumida no meio sem perder nada |

---

## 5. Plano de implementação por módulo (Fase 2)

Cada módulo: **regras no `packages/core` com testes** → **API da demonstração** (`localStorage`, separado
por loja) com o mesmo contrato que o servidor vai implementar → **telas** (layout e cores do sistema
novo) → testes de tela → demonstração regerada, conferida no navegador e no celular → commit e push.

| Ordem | Módulo | Itens | Depende de |
|---|---|---|---|
| 1 | **Base**: configurações da loja (dados cadastrais, logo, parâmetros com os padrões do DaniPets), auditoria de todas as ações, datas e dias travados, tema escuro, sincronização entre abas e aviso de falha de gravação na demonstração | ACE-13 a 17, ESP-01, 05 a 08, 10 | — |
| 2 | **Produtos e estoque**: campos novos, kg, edição, inativação, exclusão, busca, motivos de ajuste, card do saldo, produto parecido | PRD-01, 04 a 09, 13 | 1 |
| 3 | **Fornecedores** (cadastro simples) | CMP-10 | 1 |
| 4 | **Compras e contas a pagar**: NF com vários itens, custo médio, lotes e validade, à vista/a prazo, NF repetida, mudança de preço com margem, estorno, baixa de lote | CMP-01 a 09, PRD-10, 11 | 2, 3 |
| 5 | **Caixa do dia**: abrir, sangria, suprimento, retirada, fechar, desfazer, fechamento automático, travas; o PDV passa a exigir caixa aberto | CX-01 a 08, PDV-12, DEV-05 | 1 |
| 6 | **Clientes**: tela (lista, filtros, conta, extrato, editar, excluir, LGPD), campos novos, fiado com limite e liberação, receber fiado, aba Fiado | CLI-01 a 09, 15, 16, PDV-10, 11 | 1, 5 |
| 7 | **Fidelidade**: cashback, cupom de retorno, aba Retorno, WhatsApp, regras e regulamento | CLI-10 a 14, 17, 18, PDV-04, 08, 18, DEV-07 | 6 |
| 8 | **Vale-troca**: emitir na devolução, usar no PDV, lista em aberto | PDV-09, DEV-03, 09, 10, FIN-09 | 6 |
| 9 | **Financeiro (tela)**: cards, extratos com período e CSV, lançamentos com categoria e data, saldo inicial, confirmar recebimentos, contas a pagar, taxas | FIN-01 a 10 | 4, 5 |
| 10 | **Relatórios**: lucro estimado, mais vendidos, unidades, posição de estoque, auditoria completa, CSV | REL-02 a 04, 08 a 10 | 2, 4 |
| 11 | **Visão geral**: unidades (un + kg), a pagar, últimas vendas, situação do caixa; pendências só se aprovadas | VG-02, 04 a 06 | 4, 5 |
| 12 | **Usuários**: "Meus acessos" | USR-07 | 1 |
| 13 | **Dados e backup**: exportar/importar os dados da loja, planilhas | DAT-01, 05 a 08 | todos |
| 14 | **Suporte**: copiar informações, problemas comuns, contatos configuráveis | SUP-01 a 03 | 1 |
| 15 | **Consolidação (Fase 3)**: `sistema-padrao-completo.html`, checklist de aceitação, navegador sem erro no console, celular, relatório final | — | todos |

Depois (fora deste trabalho, se você quiser): levar cada módulo ao servidor (tabelas com RLS, rotas,
testes de vigilância), na mesma ordem.

---

## 6. Perguntas para aprovar (com a recomendação)

| # | Pergunta | Recomendação |
|---|---|---|
| P1 | Onde implementar? | No código-fonte, gerando o HTML pelo build |
| P2 | Formato da Fase 2? | Um commit por módulo, com testes; na conversa, o resumo e os arquivos |
| P3 | O servidor entra junto? | Agora só a demonstração (o arquivo HTML); o servidor depois, módulo a módulo |
| P4 | Caixa? | Um caixa por loja por dia, como o DaniPets (vários vendedores vendem nele) |
| P5 | Onde ficam as configurações? | Nas próprias abas, como o DaniPets, e "Dados da loja" em Dados e backup (sem item novo na barra) |
| P6 | Pendências da Visão geral? | Você decide: ligar a lista do DaniPets agora ou continuar A DEFINIR |
| P7 | Excel? | CSV (abre no Excel), sem a biblioteca de 700 KB |
| P8 | Importar o backup do DaniPets (5.5)? | Continua adiado |
| P9 | Fornecedores? | Cadastro simples (nome, documento, telefone), usado nas compras e no produto |
| P10 | Identidade visual por empresa? | Nome, descrição e logo por loja; a cor continua o verde do sistema |
| P11 | Nome do arquivo final? | `sistema-padrao-completo.html` passa a ser o arquivo gerado (no lugar do `sistema-padrao-demo.html`) |
| P12 | Campo "Pet"? | Campo extra do cliente com rótulo configurável por loja (desligado por padrão) |
