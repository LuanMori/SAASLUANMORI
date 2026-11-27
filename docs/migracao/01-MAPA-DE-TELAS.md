# 01 — Mapa de telas (manual de reconstrução)

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`). Por tela: partes, campos, ações (com o texto exato dos
botões), mensagens, navegação e atalhos de teclado. As regras e as mensagens de validação vêm de
`03-REGRAS-DE-NEGOCIO.md` (citado como "03 §N"); o que cada tela lê e grava, de `02-MAPA-DE-FUNCIONALIDADES.md`; quem
vê, de `05-MATRIZ-PERMISSOES.md`; o visual, de `04-DESIGN-SYSTEM.md`.

Convenções: o texto entre aspas é exato; `arquivo:linha` aponta para `legacy/web/src/`. Cada tela reconstruída usa o
mesmo markup e as mesmas classes do componente citado (04 §0). Mensagens de erro vindas do servidor aparecem como vieram
(03); a tela só acrescenta as conferências locais listadas aqui, que existem para avisar antes de gravar.

---

## 1. Entrada (login)

Componentes: `telas/TelaEntrada.tsx:1-236`, `telas/LayoutEntrada.tsx:1-102`, `App.tsx:30-135`.

- **Partes**: à esquerda, a vitrine (logo, linha "PDV · Estoque · Financeiro", chamada "Sua loja, / mais organizada / e
  lucrativa.", traço, descrição e os recursos "PDV e vendas", "Controle de estoque", "Gestão financeira", com
  `aria-label` "Apresentação" e "Recursos do sistema"; a ilustração da loja) (`telas/LayoutEntrada.tsx:14-60`;
  `marca.ts:12-23`); à direita, o cartão; no canto, o botão do tema e "Suporte".
- **Cartão**: logo; selo com o nome da loja do endereço; título "Bem-vindo de volta!" (`TelaEntrada.tsx:92`); campos:
  - "Usuário" (`id="entrada-usuario"`, placeholder "Ex.: maria.silva", `autocomplete="username"`, sem maiúscula
    automática, sem corretor, até 64 caracteres) (`TelaEntrada.tsx:104-117`);
  - "Senha" (placeholder "Digite sua senha", `autocomplete="current-password"`, até 128; botão do olho "Mostrar senha" /
    "Esconder senha" com `aria-pressed`; aviso "Caps Lock ativado" quando a tecla está ligada) (`TelaEntrada.tsx:124-155`);
  - botão "Entrar" ("Entrando…" enquanto confere; desativado até poder entrar) (`TelaEntrada.tsx:159-161`) e o link
    "Esqueceu a senha?", que mostra "Solicite uma nova senha ao responsável pela loja. Por segurança, as senhas não são
    enviadas por e-mail." (`TelaEntrada.tsx:163-170`).
  - o selo da loja tem `aria-label` "Loja: <nome>" (`telas/LayoutEntrada.tsx`, `entrada-loja-selo`).
- **Suporte**: botão com fone ("Suporte", `aria-expanded`) que abre a caixa (`role="dialog"`, `aria-label` "Suporte")
  "Precisa de ajuda? Fale com o suporte do Nome da empresa." com o e-mail (`TelaEntrada.tsx:176-195`; `marca.ts:8-11`).
- **Endereço sem loja**: título "Endereço não encontrado" e "Este endereço não corresponde a nenhuma loja ativa. Confira o
  link com o responsável pela loja." (`TelaEntrada.tsx:40-47`).
- **Erros**: os do login (03 §1.4); sem rede: "Não foi possível entrar agora. Verifique a internet e tente de novo."
  (`TelaEntrada.tsx:81`).
- **Ao abrir o sistema** (`App.tsx:77-88`): "Carregando…"; sem rede, a mensagem e "Tentar de novo".
- **Navegação**: entrou com senha provisória → Primeiro acesso (§2); entrou → painel (Visão geral; no servidor antigo,
  Usuários para quem podia) (`App.tsx:105-133`).

## 2. Primeiro acesso (criar a senha) e Trocar a senha

Componente: `painel/TrocarSenha.tsx:1-119`.

- Primeiro acesso: título "Crie a sua senha"; texto "Olá, <nome>. Por segurança, troque a senha provisória por uma senha
  pessoal, que só você vai saber. Ela vale para entrar no sistema e para autorizar operações no caixa."; botão "Sair"
  (`TrocarSenha.tsx:100-119`).
- Formulário (o mesmo em Meu usuário): "Senha nova" com a dica "Pelo menos 8 caracteres. Uma frase curta é fácil de
  lembrar e difícil de adivinhar. Não use o seu nome nem o seu usuário." e "Repita a senha nova"; "Cancelar" quando não é
  o primeiro acesso (`TrocarSenha.tsx:60-96`). Regras e mensagens da senha: 03 §1.2 e §1.6.
- Sucesso (em Meu usuário): "Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa."
  (`painel/TelaMeuUsuario.tsx:251`).

## 3. Moldura do painel (barra lateral e avisos)

Componentes: `painel/TelaPainel.tsx:1-340`, `painel/BarraLateral.tsx:1-113`, `painel/menu.tsx:1-206`.

- **Barra lateral** (04 §6): marca da loja (logo ou iniciais, nome, descrição); "Frente de caixa" em destaque; grupos
  Operação, Cadastros, Gestão e Sistema com os itens que a pessoa pode ver (05 §5); a pessoa (abre Meu usuário, título
  "Abrir Meu usuário"), o botão do tema e "Sair"; rodapé "<versão> • Nome da empresa". Item ativo com
  `aria-current="page"`.
- **Celular e tablet** (até 1000px): a barra vira uma faixa de botões no topo, sem os ícones (04 §4).
- **Avisos no alto do conteúdo** (`TelaPainel.tsx:204-253`): virada do dia ("Novo dia: o caixa de dd/mm/aaaa fechou sozinho
  à meia-noite, sem contagem da gaveta. Abra o caixa de hoje para voltar a vender.", com "Ir para Caixa do dia" e
  "Entendi"); novidades da versão ("Novidades da versão V0.2: <novidades separadas por " • ">", "Entendi"); avisos do
  suporte ("Aviso do suporte: <texto>", "Entendi"; o de atenção com `role="alert"`).
- **Seção de recurso desligado**: título da seção e a mensagem do recurso (03 §5.4) no lugar do conteúdo
  (`TelaPainel.tsx:254-265`).
- **Frente de caixa**: abre em tela cheia, sem a barra (§6).
- **Atalhos**: nenhum na moldura (os da Frente de caixa ficam nela).

## 4. Meu usuário

Componente: `painel/TelaMeuUsuario.tsx:1-258`.

- Título "Meu usuário" (`TelaMeuUsuario.tsx:43`). Três partes:
  - **Perfil** (`:99-160`): a foto ("A sua foto" / "A foto escolhida (ainda não salva)") ou a inicial; botões "Escolher uma
    foto" / "Trocar a foto" (`aria-label` "Escolher a foto do perfil"), com a foto escolhida: "Salvar a foto" ("Salvando…")
    e "Cancelar"; com foto salva: "Tirar a foto". Sucesso: "Foto salva. Ela aparece também no canto da barra lateral." ou
    "Foto tirada." (`:89`). Regras da foto: 03 §4.
  - **Entradas e saídas** (`:169-236`): tabela Dia, Entrada, Saída, Tempo; a sessão atual marcada; nota "Saída “não
    registrada”: o sistema foi fechado sem clicar em Sair. Depois de um tempo sem uso, o sistema sai sozinho (“por falta
    de uso”)." (`:198`). Formato da duração: 03 §4.
  - **Trocar a senha** (`:239-258`): o formulário do §2.

## 5. Visão geral

Componentes: `painel/TelaVisaoGeral.tsx:1-507`, `painel/PendenciasDoInicio.tsx:1-203`, `painel/CardPendencias.tsx:1-109`.

- **Topo**: título "Visão geral", a saudação e a data por extenso; a situação do caixa de hoje (aberto ou não aberto),
  que leva ao Caixa do dia ("Abrir o Caixa do dia") (`TelaVisaoGeral.tsx:110-140`).
- **Cartões** (`aria-label` "Resumo de hoje"): **Vendas de hoje** (cartão grande; "Ver de onde vem este número" / "Fechar o
  relatório"; sem vendas: "Nenhuma venda ainda hoje"); **Produtos ativos** (leva a Produtos e estoque); **Saldo das
  contas** (só com `financeiro`; leva ao Financeiro; sem conseguir ler: "Não foi possível carregar o saldo")
  (`:150-230`). Sem rede depois da primeira carga: "Sem conexão com o servidor. Mostrando o último dado recebido…"
  (`:154`).
- **Relatório de hoje** (abre embaixo do cartão grande) (`:300-420`): "Vendas de hoje" com "Fechar"; texto "Soma de todas
  as vendas finalizadas hoje (<data>) na Frente de caixa: o total por forma de pagamento, por quem vendeu e venda por
  venda, com os produtos e o cliente."; blocos "Por forma de pagamento", "Por quem vendeu", "Venda por venda" (colunas
  Venda, Hora, Produtos vendidos, Cliente, Vendido por, Pagamento, Total; desconto com "(autorizou com senha)") e
  "Devoluções e cancelamentos de hoje"; rodapé "À meia-noite esta tela volta a zero. Todas as vendas ficam guardadas em"
  + botão "Relatórios" (`:396-400`).
- **Card Pendências** (03 §16.1): "Pendências" com a contagem; cada pendência com "Urgente:" ou "Atenção:" (leitor de
  tela), o texto e o botão; vazio: "Nada pendente. Tudo em ordem." com a nota; antes de existir o card de pendências no
  servidor: "Ainda não definimos quais avisos entram aqui. Quando escolhermos (caixa, estoque, validade, contas…), eles
  aparecem nesta lista." (`CardPendencias.tsx:20-109`).
- **Pendências de clientes** (`PendenciasDoInicio.tsx`): "Fiado a vencer · N", "Cashback a vencer · N", "Promoções
  exclusivas · N", cada uma com "Ver lista"; a janela lista as pessoas com "Receber" (só no fiado; `aria-label` "Receber o
  fiado de <nome>") e "WhatsApp" (`aria-label` "WhatsApp para <nome>"), ou o motivo de não ter WhatsApp ("Lembrete
  registrado" quando já foi lembrado); "Fechar".

## 6. Frente de caixa (PDV)

Componentes: `painel/TelaFrenteCaixa.tsx:1-1147`, `painel/caixa/carrinho.ts`, janelas em `painel/caixa/`.

**Partes** (`TelaFrenteCaixa.tsx:1-26,480-1000`): topo escuro com "← Painel", o título "Frente de caixa", a situação do
caixa e "Operador: <nome>"; à esquerda, a barra do produto, a faixa do cliente, a fita de itens e o resumo; à direita, o
visor do último item e do total, o pagamento e "FINALIZAR · F2"; rodapé com as teclas, "Devolução / cancelamento" e
"Limpar venda". A tela cabe na altura da janela; quem rola é só a lista de itens (04 §4).

**Caixa não aberto ou fechado** (`:520-540`): aviso no lugar da venda — fechado: "… estão encerradas. Para vender, o Dono
ou o Administrador pode desfazer o fechamento em Caixa do dia."; não aberto: "Sem caixa aberto não há vendas: abra o
caixa para começar.", com o botão "Abrir caixa" ou "Ir para Caixa do dia" (para quem pode abrir a aba).

**Barra do produto** (`:190-260,545-580`): rótulo "PRODUTO"; placeholder "Bipe o código ou digite o nome (3*código = 3
un.)" ("Carregando produtos…" enquanto carrega); `aria-label` "Código ou nome do produto"; botão "OK"; dica "Enter põe o
produto na venda. Com mais de um produto achado, use a seta para baixo e escolha na lista.".
- Enquanto digita: até 8 produtos pelo nome (sem acento) ou pelo começo do código interno ou de barras, com o saldo; lista
  com `aria-label` "Produtos encontrados".
- Multiplicador: "3*código", "3x código", "1,5*código" (kg); sem multiplicador = 1 unidade ou 1 kg; erros "Este produto é
  vendido por unidade: use quantidade inteira (ex.: 3*7891000100103)." · "Peso inválido: use até 3 casas (ex.: 1,5*código
  = 1,5 kg)." · "No máximo 9999 unidades de uma vez." · "No máximo 999,999 kg de uma vez." (`caixa/carrinho.ts:78-100`).
- Enter: código de barras exato, depois código interno exato (só ativos); senão o único achado; vários: "Mais de um
  produto encontrado: escolha na lista."; só números sem achar: "Código "<código>" não encontrado (ou produto inativo)." (a
  barra limpa, leitura encadeada); texto sem achar: "Nenhum produto encontrado para “<texto>”." (o texto fica para
  corrigir) (`:220-235`).
- O produto que já está na venda soma a quantidade; não passa do estoque (a lista mostra o saldo; o servidor confere).

**Cliente da venda** (`:585-650`): "Não identificado · venda sem cashback" e "Identificar cliente · F6"; identificado: nome,
"Cashback para usar", "Vale R$ X", "Cupom X% aplicado", "Fiado em aberto R$ X" (com dias de atraso), o limite de fiado
("Sem limite de fiado") e "×" ("Tirar o cliente da venda": tira o fiado e o cashback do pagamento). Ao identificar: "Cliente:
<nome>." ou "Cliente cadastrado: <nome>." (com o cupom, quando há) (`:1100-1110`).

**Fita de itens** (`:655-760`): colunas Produto, Quantidade, Preço, Total; − e + ("Diminuir <nome>", "Aumentar <nome>";
passo 1 un ou 0,5 kg); quantidade digitável; "Aplicar desconto" / "Alterar desconto"; "Remover desconto" (pergunta
"Remover o desconto de <nome> e voltar ao preço de tabela de R$ X?"; depois "Desconto removido: <nome> voltou ao preço de
tabela.") (`:265-275`); remover o item ("Remover <nome>"). Resumo: "Itens N · Produtos N", "Descontos R$ X", "Total R$
X" (no kg, cada produto conta um item) (`:762-772`; `caixa/carrinho.ts:120-135`).

**Pagamento** (`:775-960`): visor do último item ("Aguardando leitura" sem item) e do total; formas com tecla — Dinheiro F4,
Pix F8, Cartão de débito F9, Cartão de crédito F10, Fiado F7 (a linha inteira embaixo; sem cliente fica apagada e clicar
explica: "Venda no fiado precisa de cliente identificado. Identifique o cliente (F6).") (`:87-90,837-866`); a forma usada
fica marcada na próxima venda (fiado volta para Pix) (`:90,404`).
- Dinheiro: "RECEBIDO EM DINHEIRO" (no dividido, "· PARTE DE R$ X"); "TROCO" ou "VALOR INSUFICIENTE" ("Faltam R$ X");
  atalhos ("Atalhos do valor recebido"): "Exato" e as três próximas quantias redondas acima (múltiplos de R$ 5, 10, 50 e
  100); Enter no valor recebido finaliza (`:895-940`; `caixa/carrinho.ts:250-254`).
- "Dividir pagamento" / "+ Outra forma" (até 8 partes; cada parte com forma e valor, placeholder "0,00", "Tirar a parte
  N"; "Falta pagar" / "Passou do total") (`:868-950`).
- "Usar cashback (R$ X)" (com cliente e saldo); tirar: "Não usar o cashback nesta venda" ("Cashback fora desta venda. O
  cliente paga R$ X."); tirar o cliente com cashback: "O cashback saiu do pagamento: ele é do cliente." (`:320-345,
  955-960`).
- "Usar vale-troca" (janela do vale); cada vale com "Não usar o vale <código> nesta venda" ("Vale-troca fora desta venda.
  O cliente paga R$ X.") (`:350-362,810-820,952-953`).
- "FINALIZAR · F2" ("GRAVANDO…" enquanto grava). Antes de enviar, a tela confere: fiado sem cliente; caixa (as mesmas
  mensagens do servidor, 03 §11.1); "Há um valor inválido no pagamento dividido (ex.: 12,50)."; "Os pagamentos somam R$
  X, e falta pagar R$ Y depois do cashback." / "Os pagamentos somam R$ X, e a venda é R$ Y."; "Informe o valor recebido
  em dinheiro (igual ou maior que R$ X)." (`:371-394`).
- **Sucesso** (`:405-413`): "Venda #00012 finalizada: R$ X em <pagamentos>. Troco: R$ X. Cliente: <nome>. <Primeiro nome>
  ganhou R$ X de cashback." (brinde: "brinde, sem pagamento"). A venda limpa, o foco volta para a barra.
- Fiado que precisa do Dono: abre a liberação (janela de senha) e reenvia com ela.
- "Limpar venda" pergunta "Limpar a venda atual?" (`:433`).

**Atalhos de teclado** (`:442-469,976-993`; com janela aberta, as teclas são da janela): F2 finalizar · F3 volta para a
barra do produto (seleciona o texto) · F4 Dinheiro · F6 cliente · F7 fiado (só com o recurso Fiado ligado) · F8 Pix · F9
débito · F10 crédito · Esc limpa a barra e volta o foco a ela · seta para baixo/cima anda na lista de produtos e volta
para a barra · Enter na barra põe o produto · Enter no valor recebido finaliza. O rodapé mostra as teclas com `<kbd>`.

**Janelas da Frente de caixa** (comportamento da janela: 04 §6):
- **Cliente (F6)** (`caixa/ModalCliente.tsx:1-233`): "CPF, telefone ou nome" ("Digite o CPF, o telefone ou o nome.",
  "Buscando…", "Nenhum cliente encontrado. Cadastre o cliente novo."); lista "Clientes encontrados"; "Usar este cliente",
  "Cadastrar novo cliente", "Cancelar"; o cadastro rápido (os campos de 03 §12.1, já preenchidos com o que foi digitado) com
  "Cadastrar e usar na venda" ("Cadastrando…") e "Voltar"; sem escolher: "Escolha um cliente da lista.".
- **Desconto** (`caixa/ModalDesconto.tsx:1-136`): "Preço de tabela: R$ X. O Vendedor pode dar até 10% sozinho."; "Preço
  final (R$)" ("por unidade"/"por kg"; "Use 0 para brinde."); "Motivo do desconto" (placeholder "Ex.: embalagem
  amassada"); acima do limite ou brinde ("Brinde: autorização de um Dono"): "Quem autoriza" e "Senha"; botão "Aplicar
  desconto" / "Autorizar e aplicar" ("Conferindo…"), "Cancelar". Conferências: "Informe o preço final (ex.: 6,50). Use 0
  para brinde." · "O preço final deve ser menor que o preço de tabela (0 para brinde)." · "Informe o motivo do desconto." ·
  "Não há Dono cadastrado para autorizar." · "Digite a senha de quem autoriza.".
- **Autorização / liberação do Dono** (`caixa/ModalSenha.tsx:1-115`): título "Autorização necessária" ou "Liberação do Dono";
  "Quem autoriza" / "Dono" ("Ninguém para autorizar" / "Nenhum Dono ativo"); "Senha" / "Senha do Dono"; "Motivo" (na
  liberação; placeholder "Ex.: nota fiscal que chegou atrasada"); "Autorizar" / "Liberar" ("Conferindo…"), "Cancelar";
  "Não há usuário Dono ativo para liberar." · "Digite a senha do Dono." · "Informe o motivo.". Usada também no Caixa do dia,
  Produtos e estoque, Compras e Clientes.
- **Vale-troca** (`caixa/ModalVale.tsx:1-123`): "Vale" (lista "Escolha…" / "Nenhum vale com saldo na lista") ou "ou código do
  vale" (placeholder "VT-0001-ABC"); "Usar" ("Buscando…"), "Cancelar"; "Escolha um vale ou digite o código." · "Este vale
  já foi usado.". Vale emitido na devolução: "Devolução nº N registrada." com o código em destaque, "Usar agora nesta venda
  (troca)" e "Fechar".
- **Devolução / cancelamento** (`caixa/ModalDevolucao.tsx:1-446`): "Número da venda" (placeholder "Ex.: 12"; "Digite o
  número da venda (ex.: 12)."), as "Vendas de hoje" para escolher, "Continuar" ("Buscando…"), "Fechar"; depois: colunas
  Produto, Vendido, Já devolvido, Devolver, Volta ao estoque, Preço; "Como o valor volta": "Mesma forma da venda (<formas
  com valores>)" ou "Vale-troca (troca agora ou compra depois)"; "Cliente do vale (opcional)" ("Não informado"); "Motivo"
  (placeholder "Ex.: produto errado, cliente desistiu, embalagem furada"); "Quem autoriza" e "Senha" para quem não tem
  `estorno`; botões "Confirmar devolução" e "Cancelar a venda" (perigo) ("Registrando…"), "Voltar"; venda de outro dia:
  "Cancelar a venda inteira só no mesmo dia. Dá para devolver itens.". Sucesso: "Venda #00012 cancelada. Devolvido:
  <formas com valores>." · "Devolução nº N registrada: R$ X abatidos do fiado do cliente." (e o vale emitido)
  (`:218-255,280-440`).
