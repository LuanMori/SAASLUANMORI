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

## 7. Caixa do dia

Componente: `painel/TelaCaixaDoDia.tsx:1-928` (e `painel/caixa/ModalSenha.tsx`). Regras: 03 §11.

- **Topo** (`TelaCaixaDoDia.tsx:89-107`): título "Caixa do dia" e "Abertura, sangria, suprimento e fechamento."; a
  situação ("Caixa aberto às HH:MM", "Caixa de hoje fechado" ou "Caixa de hoje não aberto"), a data por extenso e, para
  quem tem `loja.configurar`, o botão "Regras do caixa" (`:229-234`).
- **Avisos no alto** (`:117-178`): o resultado da última ação; para o Dono, cada fechamento com diferença acima da
  tolerância ("O fechamento de dd/mm/aaaa teve <falta|sobra> de R$ X, acima da tolerância de R$ Y (fechou: <nome> às
  HH:MM • autorizou: <nome>). Justificativa: <texto>", botão "Ciente" — "Gravando…"; sucesso "Ciência registrada:
  fechamento de dd/mm/aaaa. A pendência saiu da Visão geral."); cada fechamento automático a verificar ("O caixa de
  dd/mm/aaaa fechou sozinho à meia-noite, sem contagem da gaveta (esperado R$ X). Deseja verificar?", botão
  "Verificar"); dia anterior aberto ("O caixa de dd/mm/aaaa ainda está aberto. Feche esse dia antes de abrir o caixa de
  hoje."); hoje fechado ("O caixa de hoje já foi fechado." + para gestor " Para lançar hoje, desfaça o fechamento no
  histórico abaixo."); não aberto ("O caixa de hoje (dd/mm/aaaa) ainda não foi aberto. Sem caixa aberto não há
  vendas.").
- **Abrir caixa de hoje** (`:279-345`): "Fundo de troco na gaveta (R$)" (placeholder "0,00"), "Operador" (quem está
  logado), "Observação" (placeholder "Opcional"); dica "Informe todo o dinheiro que está na gaveta agora. O esperado no
  fechamento parte deste valor."; botão "Abrir caixa" ("Abrindo…"). Conferência: "Informe o fundo de troco (todo o
  dinheiro que está na gaveta agora). Sem troco, digite 0.". Sucesso: "Caixa aberto com R$ X de fundo de troco. Operador:
  <nome>." (`:302-306`).
- **Números do caixa aberto** (`:236-265`, `aria-label` "Caixa de hoje"): "Caixa aberto às" (com "Operador: <nome>"),
  "Fundo de troco" ("Informado na abertura"), "Esperado na gaveta" ("Fundo + entradas − saídas em dinheiro desde a
  abertura"), "Vendas de hoje" (em dinheiro, e "em dinheiro • Pix R$ X • cartões R$ X • fiado R$ X • cashback R$ X •
  vale-troca R$ X").
- **Sangria, suprimento ou retirada** (`:370-450`): "Operação" ("Sangria (tirar da gaveta)", "Suprimento (pôr na
  gaveta)"); na sangria, "Destino da sangria" ("Depositar no banco" ou "Retirada do dono (levou para casa)", com " • pede
  a senha do Dono ou do Administrador" para quem não tem `caixa.retirada`); "Valor (R$)"; "Descrição" (placeholder "Ex.:
  levou ao banco"); botão "Registrar". Conferências: "Informe o valor." · "Descreva a operação (ex.: levou ao banco)." · a
  mensagem da gaveta (03 §11.3). A retirada do Vendedor abre a autorização (§6, janela de autorização).
- **Fechar caixa de dd/mm/aaaa** (`:480-550`; sempre o dia mais antigo aberto): "Esperado na gaveta: R$ X"; "Dinheiro contado
  na gaveta (R$)"; "Observação (obrigatória se houver diferença)" (placeholder "Ex.: troco errado na venda das 15h");
  botão "Fechar caixa" ("Fechando…"). Conferências: "Informe o dinheiro contado na gaveta." · "Há <falta|sobra> de R$ X na
  gaveta. Escreva a justificativa (por exemplo: troco errado, pagamento sem registro).". Acima da tolerância, o Vendedor
  passa pela autorização. Sucesso: "Caixa de dd/mm/aaaa fechado sem diferença." ou "Caixa de dd/mm/aaaa fechado. <Falta|Sobra>
  de R$ X lançada como ajuste no saldo do Caixa físico." (`:497`).
- **Histórico de caixa** (`:560-660`): colunas Dia, Fundo de troco, Esperado, Contado, Diferença, Quem; sem linhas: "Nenhum
  registro."; detalhes "fechamento desfeito N vez(es)", "automático • sem contagem", "fechou: Sistema (meia-noite)" ou
  "fechou: <nome> às HH:MM"; para gestor, "Desfazer fechamento" no último ("Desfazer o fechamento de dd/mm/aaaa"), com a
  nota "Só o último fechamento pode ser desfeito".
- **Movimentos em dinheiro desde a abertura** (`:670-700`): colunas Hora, Descrição, Tipo (nome do lançamento, 03 §15.2),
  Valor.
- **Verificar fechamento automático** (`:740-800`): "Números do dia"; "Fechamento automático à meia-noite: ninguém contou a
  gaveta e nada foi ajustado no saldo. O caixa foi aberto por <nome> às HH:MM."; quando não dá mais para desfazer: "Conte a
  gaveta e compare com o esperado. Este fechamento não pode mais ser desfeito (já há caixa aberto ou fechado depois dele):
  anote na observação o que encontrou."; "Observação (opcional)" (placeholder "Ex.: contei a gaveta e bateu"); botões
  "Marcar como verificado", "Desfazer para contar" (quando pode desfazer) e "Cancelar". Sucesso: "Fechamento de
  dd/mm/aaaa verificado. A pendência saiu da Visão geral." (`:747`).
- **Desfazer fechamento** (`:810-870`): "Motivo para desfazer o fechamento" (no automático: "Motivo do ajuste do fechamento
  automático"; placeholder "Ex.: contei errado") e, no automático, "Explique por que o fechamento automático precisa ser
  ajustado"; botão "Desfazer fechamento". Conferências: "Informe o motivo." · "Explique por que o fechamento automático
  precisa ser ajustado.".
- **Regras do caixa** (`:880-925`): "Diferença aceita no fechamento (R$)"; "Salvar" ("Salvando…"); fora do limite: "Informe
  um valor de R$ 0,00 a R$ 1.000,00." (o limite da regra, 03 §5.3).

## 8. Produtos e estoque

Componentes: `painel/TelaProdutosEstoque.tsx:1-360`, `painel/produtos/ModalProduto.tsx:1-234`,
`painel/produtos/ModaisEstoque.tsx:1-346`. Regras: 03 §7.

- **Topo** (`TelaProdutosEstoque.tsx:131-150`): título "Produtos e estoque"; botões "Regras do estoque" (com
  `loja.configurar`) e "+ Cadastrar produto" (com `produtos.cadastrar`).
- **Produtos** (`:165-270`): busca (placeholder "Buscar nome, marca ou código", `aria-label` "Buscar produto"; sem acento,
  no nome, na marca, no código interno e no de barras; ativos primeiro) (`:95-98`); colunas Código, Produto, Preço (no kg,
  "/kg"), Estoque (com a situação baixo/zerado/negativo; botão "Como o saldo de <nome> é calculado"), Mínimo, Ações;
  ações por permissão: "Entrada", "Ajuste", "Mínimo" (`estoque.lancar`), "Alterar", "Inativar"/"Reativar", "Excluir"
  (`produtos.alterar`; Excluir só sem história). Sucessos: "<nome> foi inativado: não aparece mais na Frente de caixa." ·
  "<nome> foi reativado." · "<nome> foi excluído." (pergunta antes "Excluir o produto "<nome>"? Ele ainda não tem vendas nem
  movimentos de estoque.") (`:111-126`).
- **Últimos movimentos do estoque** (`:278-300`): colunas Data, Hora, Movimento, Quantidade, Motivo, Lançado por; "Nenhum
  movimento ainda.".
- **Cadastrar / Alterar produto** (`ModalProduto.tsx:42-234`): título "Cadastrar produto" ou "Alterar produto: <nome>" (com
  "Código interno 0001 (do sistema, não muda)."); campos "Nome do produto" (placeholder "Ex.: Ração Premium Cães
  Adultos"), "Código de barras (opcional)", "Marca (opcional)", "Vendido por" ("Unidade (un)" / "Quilo (kg, a granel)";
  presa com história: "Já tem vendas ou movimentos: a unidade não muda."), "Peso da embalagem em kg (opcional)"
  (placeholder "Ex.: 15 ou 0,5"), "Preço de venda (R$)" ou "Preço do quilo (R$)" (placeholder "0,00"), "Fornecedor
  principal (opcional)" ("Nenhum"; o desativado que já estava aparece como "Fornecedor desativado"); no cadastro, "Estoque
  inicial em unidades (opcional)" / "Estoque inicial em kg (opcional)" e, para Dono e Administrador, "Custo de cada unidade
  do estoque inicial (R$, opcional)" / "Custo do kg do estoque inicial (R$, opcional)"; dica "Depois do cadastro, o estoque
  muda só por entrada, ajuste, venda e devolução."; botões "Cadastrar produto" / "Salvar alterações" ("Salvando…") e
  "Cancelar". Conferências: "Informe um preço válido (ex.: 12,90)." · "Peso em kg, com até 3 casas (ex.: 15 ou 0,5)." ·
  "Estoque em unidades inteiras." / "Estoque em kg, com até 3 casas (ex.: 25 ou 12,5)." · "Informe um custo válido (ex.:
  8,50)." · "Nada mudou."; produto parecido: pergunta "<mensagem do servidor> Salvar mesmo assim?" e reenvia; falha
  inesperada: "Não foi possível salvar. Tente de novo.". Sucessos: "<nome> cadastrado com o código 0001 (R$ X o kg)." ·
  "<nome>: alterações salvas." (`:60-100,126-142,160-230`).
- **Entrada / Ajuste / Estoque mínimo** (`ModaisEstoque.tsx:34-210`): título "Entrada de estoque" ou "Ajuste de estoque";
  "Saldo atual: <saldo>"; quantidade em unidades ou em kg ("em kg, com até 3 casas (ex.: 2,5)"); no ajuste, "Motivo"
  ("Escolha…" + os motivos da loja); "Data"; "Observação (opcional)" (placeholders "Ex.: embalagem rasgada, contagem do dia
  16" / "Ex.: nota 1234 do fornecedor"); botões "Lançar entrada" / "Lançar ajuste" / "Salvar mínimo" ("Gravando…") e
  "Cancelar". Conferências: "Informe a quantidade <em unidades|em kg>, maior que zero." · "Escolha o motivo do ajuste." ·
  "Informe o mínimo <…> (0 = sem aviso de estoque baixo).". Data de dia fechado: abre a liberação do Dono; sem ela:
  "<Entrada|Ajuste> não lançad<a|o>: falta a liberação de um Dono.". Sucessos: "<Entrada lançada|Ajuste lançado>
  (data dd/mm/aaaa): <nome> +3 un. Saldo agora: 15 un." (o trecho da data só quando não é hoje) · "Estoque mínimo de <nome>: 4 un." · "<nome> ficou sem aviso de
  estoque baixo." (`:69-130`).
- **Como o saldo é calculado** (`ModaisEstoque.tsx:213-273`): tabela "Estoque inicial", "+ Compras (menos as estornadas)",
  "+ Entradas", "− Vendas", "+ Vendas canceladas", "+ Devoluções que voltaram para a prateleira", "± Ajustes", "= Saldo";
  nota "Devoluções de avaria ou vencido não voltam para o estoque. Nada é apagado: para corrigir, lance um ajuste.";
  "Fechar".
- **Regras do estoque** (`ModaisEstoque.tsx:275-346`): "Como a loja vende" (caixas un e kg; nota "Desligar uma unidade só
  vale para produtos novos ou alterados; os já cadastrados continuam vendendo como antes."); "Motivos de ajuste (um por
  linha)"; "Salvar as regras" ("Salvando…"). Sucesso: "Regras do estoque salvas.".

## 9. Compras (e fornecedores)

Componentes: `painel/TelaCompras.tsx:1-472`, `painel/compras/ModalCompra.tsx:1-408`, `painel/compras/ModaisCompra.tsx:1-225`.
Regras: 03 §8 e §9.

- **Topo** (`TelaCompras.tsx:98-112`): título "Compras"; botões "+ Cadastrar fornecedor" e "+ Registrar compra".
- **Validade: lotes vencidos ou vencendo em 30 dias** (`:133-180`): colunas Produto, Compra, Validade (com "vencido", "vence
  hoje" ou "vence em N dia(s)"), Ainda no estoque, Ação ("Dar baixa", `aria-label` "Dar baixa no lote de <nome>").
- **Contas a pagar** (`:181-228`): "nenhuma em aberto" quando vazio; colunas Conta, Vencimento, Valor; "Pagar" (`aria-label`
  "Pagar <descrição>").
- **Histórico de compras** (`:229-305`): colunas com o número e a data, Fornecedor, Itens (cada item com quantidade, custo,
  "/kg" no kg; "estornado" no item estornado; "Estornar" com `aria-label` "Estornar <produto> da compra N"), Total,
  Pagamento.
- **Fornecedores** (`:309-360`): colunas com o nome, CNPJ / CPF, Telefone, Contato, Ações ("Alterar", "Desativar" /
  "Reativar"). Sucessos: "<nome> foi desativado: não aparece mais na lista de escolha." · "<nome> foi reativado." ·
  "<nome> cadastrado." · "<nome>: alterações salvas." (`:84-87,366`).
- **Cadastrar / Alterar fornecedor** (`:440-470`): título "Cadastrar fornecedor" ou "Alterar fornecedor: <nome>"; campos
  "Nome do fornecedor" (placeholder "Ex.: Distribuidora Pet Sul"), "CNPJ ou CPF (opcional)", "Telefone com DDD
  (opcional)", "Contato (opcional)" (placeholder "Ex.: Marcos, representante"), "Observação (opcional)" (placeholder "Ex.:
  entrega às terças"); botões "Cadastrar fornecedor" / "Salvar alterações" ("Salvando…") e "Cancelar".
- **Registrar compra** (`ModalCompra.tsx:283-408`): "Fornecedor" ("Sem fornecedor" + os ativos); "Número da nota fiscal
  (opcional)"; "Data da compra"; itens com colunas Produto ("Escolha…"), Quantidade, Custo unitário (R$) (placeholder
  "0,00"; "(do kg)" no kg), Validade, Total; "×" ("Tirar o item N"); "+ Adicionar item"; "Total da nota: R$ X"; dica
  "Mercadoria de bonificação (sem custo) não é compra: lance como entrada em Produtos e estoque."; "Pagamento": "À vista,
  saindo de <conta>" ou "A prazo, vencendo em <data> (dd/mm/aaaa: vira conta a pagar)"; botões "Registrar compra"
  ("Registrando…") e "Cancelar". Conferências: "Item N: escolha o produto." · "<produto>: informe a quantidade <em
  unidades inteiras|em kg (até 3 casas)>." · "<produto>: informe o custo unitário (maior que zero). Mercadoria de
  bonificação: lance como entrada em Produtos e estoque." (`:113-116`). Nota repetida: pergunta "<mensagem do servidor>
  Registrar mesmo assim?" e reenvia (`:136-137`). Data de dia fechado: liberação do Dono; sem ela: "Compra não registrada:
  falta a liberação de um Dono." (`:202`).
- **O custo mudou** (`ModalCompra.tsx:208-280`; DaniPets CMP-04): título "O custo de compra subiu" / "O custo de compra
  baixou" (ou "N produtos mudaram de custo nesta nota"); "O preço sugerido mantém a mesma margem sobre o custo novo. Sem
  marcar, o preço de venda continua o mesmo."; colunas Produto, Custo (última compra → esta), Preço de venda e margem
  ("margem X% → Y%"), Novo preço de venda (caixa "Mudar para R$" com o preço sugerido); conferência "Informe o novo preço
  de venda de <produto>."; botões "Registrar compra" ("Registrando…") e "Voltar".
- Sucesso: "Compra nº N registrada: R$ X, a pagar até dd/mm/aaaa. Estoque atualizado." (o trecho "a pagar" só a prazo)
  (`TelaCompras.tsx:378`).
- **Estornar** (`ModaisCompra.tsx:38-110`): título "Estornar: <produto>"; "Compra nº N de dd/mm/aaaa, NF X: <quantidade> × R$
  X = R$ Y."; o que acontece ("Sai do estoque: <quantidade>." e "Volta para <conta>: R$ X." / "… (a conta já tinha sido
  paga)." / "A conta a pagar (R$ X) é cancelada." / "A conta a pagar diminui R$ X (de R$ Y para R$ Z)." / "Não há valor a
  devolver."); "Motivo do estorno" (placeholder "Ex.: lançada em dobro"); dica "Depois do estorno, lance a compra certa.";
  botões "Estornar" e "Cancelar". Conferência: "Informe o motivo do estorno.". Sucesso: "Compra estornada: <produto>.
  Estoque e financeiro corrigidos." (`:58-76`).
- **Pagar conta** (`ModaisCompra.tsx:112-165`): título "Pagar conta"; "<descrição> • vence dd/mm/aaaa • R$ X"; "Sai de" (as
  duas contas, com os nomes da loja); "Pagar" e "Cancelar". Sucesso: "Conta paga: R$ X saíram de <conta>." (`:134`).
- **Dar baixa no lote** (`ModaisCompra.tsx:166-225`): título "Dar baixa no lote"; "<produto> • compra de dd/mm/aaaa • NF X •
  validade dd/mm/aaaa. Pela regra do mais antigo sai primeiro, cerca de <quantidade> deste lote ainda estariam no
  estoque."; "Vencidos que ainda estão na prateleira (<unidades|kg>)" com a dica "Mais que zero: sai do estoque como
  "Produto vencido". Zero: o lote já acabou e o aviso some."; "Observação (opcional)" (placeholder "Ex.: conferido na
  prateleira"); "Dar baixa" e "Cancelar". Conferência: "Informe a quantidade <em unidades inteiras|em kg (até 3 casas)>
  (0 = o lote já acabou).". Sucesso: "Baixa do lote registrada: <quantidade> de <produto> saíram do estoque como
  vencidos." ou "Baixa do lote registrada (<produto>: o lote já tinha acabado)." (`:187-191`).

## 10. Clientes

Componentes: `painel/TelaClientes.tsx:1-948`, `painel/clientes/ModaisCliente.tsx:1-515`, `painel/clientes/ModalWhatsapp.tsx:1-128`,
`painel/clientes/AbaRetorno.tsx:1-223`, `painel/clientes/AbaRegras.tsx:1-269`, `painel/clientes/ResumoClientes.tsx:1-261`.
Regras: 03 §12, §13, §14.

- **Topo** (`TelaClientes.tsx:170-200`): título "Clientes" e "+ Novo cliente"; o resultado da última ação; para Dono e
  Administrador, cada exclusão feita pelo Vendedor: "<quem> excluiu o cliente <nome> (<telefone>) em <data>. Motivo:
  <motivo>." com "Ciente".
- **Resumo dos clientes** (`ResumoClientes.tsx:15-261`, `aria-label` "Resumo dos clientes"): cartões com "Ver de onde vem
  este número" ("Ver de onde vem" / "Fechar"), que abrem: **Vale-troca em aberto** (texto "Vales-troca emitidos em
  devoluções e trocas. O saldo é o valor do vale menos o que já foi usado como pagamento na Frente de caixa. O vale vale para
  quem estiver com o código, com ou sem cliente identificado."; colunas Vale, Cliente, Emitido em, Origem, Valor, Usado,
  Saldo; "Total em vales: R$ X · crédito dos clientes na loja"; sem nenhum: "Nenhum vale em aberto"), **Cashback em aberto**
  (o percentual e o prazo da loja; "Gerado R$ X"; colunas com Gerado, Venceu, Em aberto, Próximo vencimento; "Vence nos
  próximos N dias" com Ganho em, Vence; "Esses clientes aparecem na aba Retorno para receber o aviso." e "Abrir retorno") e os
  atalhos para as abas Fiado ("Nada vencido") e Retorno.
- **Abas** (`aria-label` "Seções de Clientes", `aria-current="page"` na ativa): "Clientes" (com o total), "Retorno" (só com
  a Fidelidade ligada; com a contagem), "Fiado" (só com `clientes.fiado`; com a contagem), "Regras do programa"
  (`:232-249`).
- **Aba Clientes** (`:270-470`): busca (placeholder "Buscar nome, CPF ou telefone", `aria-label` "Buscar cliente"); filtro
  (`aria-label` "Filtrar clientes"): "Todos os clientes", "Com cashback", "Com vale-troca", "Com fiado em aberto" e "Com
  fiado vencido" (`clientes.fiado`), "Cadastro incompleto", "Sem comprar há muito tempo", "Não incomodar", "Desativados"
  (`clientes.desativar`) (`:50-60`); colunas Cliente (com "WhatsApp • aceita mensagens" ou "sem WhatsApp"), Telefone, CPF
  (mascarado), Última compra, Cashback, Vale-troca, Fiado (só com `clientes.fiado`), Situação ("cadastro incompleto",
  "fiado vencido", "acima do limite", "não incomodar", "sem comprar há N dias", "desativado", "em dia"); cada linha abre a
  conta ("Abrir a conta de <nome>"). Vazio: "Nenhum cliente cadastrado ainda. Clique em “+ Novo cliente”." ou "Nenhum
  cliente encontrado. Confira a busca ou o filtro." (`:419`).
- **Conta do cliente** (`:540-800`): "← Voltar para a lista"; o cadastro (telefone "· WhatsApp", ou "sem autorização para
  mensagens"; CPF mascarado com "Mostrar" / "Ocultar" para `clientes.cpf`); os números (cashback, "nada para vencer";
  vale-troca, "nenhum vale em aberto"; fiado, "nada em aberto"; limite, "sem fiado (só com a liberação de um Dono)"; compras,
  "nenhuma ainda" / "nunca comprou"); "Cupom de retorno ativo: X% de desconto até dd/mm/aaaa. Entra sozinho quando o
  cliente for identificado na Frente de caixa."; ações: "Receber fiado", "Editar cadastro", "Lembrete de retorno", "Avisar
  cashback", "Lembrar pagamento" (cada lembrete só quando faz sentido e com a permissão), "Desativar" / "Reativar"
  (`clientes.desativar`; sucesso "<nome> foi desativado: não aparece na busca da Frente de caixa." / "<nome> foi
  reativado."), "Excluir cliente" (sem história) e "Excluir dados (LGPD)" (Dono; com a liberação; sucesso "Dados do cliente
  excluídos. As vendas continuam, sem identificar o cliente."); **Fiado em aberto** (colunas Compra, Data, Vence, Em
  aberto); **Extrato** (`aria-label` "Filtrar extrato": tudo, compras, fiado, cashback, contatos, vale; colunas Movimento,
  Detalhe, Valor; linha cancelada riscada; 03 §12.3).
- **Novo cliente / Editar cadastro** (`ModaisCliente.tsx:42-188`): título "Novo cliente" ou "Editar cadastro de <primeiro
  nome>"; "Nome, telefone e CPF são obrigatórios."; campos "Nome completo", "Telefone com DDD", "CPF" (placeholder
  "000.000.000-00"; na edição, vazio mantém o do cadastro), o campo extra da loja (placeholder "Ex.: Thor, cão"),
  "Nascimento", "Limite de fiado (R$)" (só para Dono e Administrador; dica "Limite 0 = não compra no fiado. Passar do limite
  na Frente de caixa pede a liberação de um Dono."; para os outros: "O limite de fiado é definido pelo Dono ou pelo
  Administrador."), "Endereço", "Observações", as caixas do WhatsApp, "O cliente autoriza receber ofertas e lembretes da
  loja pelo WhatsApp." ("Pergunte ao cliente. Quem não autorizar continua com o fiado normalmente.") e "Não incomodar";
  botões "Cadastrar cliente" / "Salvar alterações" ("Gravando…") e "Cancelar". Conferência: "Limite de fiado: use só
  números (ex.: 200 ou 200,00)." (`:83`). Sucesso: "<primeiro nome> foi cadastrado." / "Cadastro salvo." (`TelaClientes.tsx:322`).
- **Receber fiado** (`ModaisCliente.tsx:189-358`): título "Receber fiado"; o que está "em aberto" (ou "neste vencimento");
  "Valor a baixar (R$)"; "Forma de pagamento" (Dinheiro, Pix, Débito, Crédito); no dinheiro, "Dinheiro entregue (R$)"
  (placeholder "0,00") e o troco; "Prévia do recebimento" ("Receber no Pix", "Cobrar na maquininha" com o bruto e a taxa;
  "Consultando a taxa da maquininha…"); o que abate de cada compra e quanto fica devendo; botões "Confirmar recebimento"
  ("Registrando…") e "Voltar". Regras e mensagens: 03 §12.4.
- **Taxas da maquininha** (`ModaisCliente.tsx:361-465`; também no Financeiro): "Cartão de débito (%)", "Cartão de crédito
  (%)", "Débito cai em (dias)", "Crédito cai em (dias)" e a baixa automática ou manual (só o Dono muda); conferências
  "<forma>: informe um percentual de 0 a 99,99." · "Prazo do <débito|crédito>: informe de 0 a 365 dias."; sucesso "Taxas da
  maquininha atualizadas." (`:390-405`).
- **Excluir cliente** (`ModaisCliente.tsx:467-515`): "Motivo da exclusão" (placeholder "Ex.: cadastro em duplicidade");
  conferência "Informe o motivo da exclusão."; sucesso "<nome> foi excluído.".
- **WhatsApp** (`ModalWhatsapp.tsx:17-128`): título do lembrete ("Lembrete de retorno (com cupom)", "Aviso de cashback
  vencendo", "Lembrete de pagamento do fiado"); "Para <nome> · <telefone>"; "Mensagem" (editável, já preenchida, 03 §13.3);
  no retorno com cupom: "Ao marcar como enviado, o cliente ganha um cupom de X% válido até dd/mm/aaaa. O desconto entra
  sozinho quando ele for identificado na Frente de caixa."; "Abrir no WhatsApp" (abre o link) e então "O WhatsApp foi
  aberto. Depois de enviar a mensagem, clique em “Marcar como enviado”."; "Marcar como enviado" ("Gravando…"), "Cancelar",
  "Fechar". Sucesso: "<tipo> registrado para <primeiro nome>." (com o cupom, quando há) (`:67`).
- **Aba Retorno** (`AbaRetorno.tsx:82-223`): "Clientes com cadastro completo sem comprar há N dias ou mais e clientes com
  cashback vencendo em até N dias. Cada cliente recebe um lembrete por ciclo…"; cupom desligado: "O cupom de retorno está
  desligado nas regras do programa."; cada cliente com "WhatsApp", "Já falei", "Adiar 7 dias", "Não incomodar" e "Abrir
  conta" (com `aria-label` "<ação> <nome>"); os que ficaram de fora e o motivo; **Resultado dos lembretes de retorno**
  (colunas Data, Cliente, Canal — "WhatsApp" / "Sem mensagem" —, Resultado: voltou, não voltou, aguardando; a taxa).
- **Aba Fiado** (`TelaClientes.tsx:830-945`): "Contas em aberto" com "Taxas da maquininha"; colunas com o cliente, Devendo,
  Limite, Disponível, Mais antiga em aberto, Ações ("Receber", "WhatsApp" ou "O cliente não tem WhatsApp no cadastro.",
  "Abrir conta"); nota "Ao cobrar, fale só com o cliente, sem expor a dívida a outras pessoas (Código de Defesa do
  Consumidor, art. 42). O dinheiro recebido entra no esperado do Caixa do dia; Pix entra na Conta bancária…" (`:942`).
- **Aba Regras do programa** (`AbaRegras.tsx:36-269`): "Só o Dono e o Administrador alteram as regras. O Vendedor vê esta
  página para explicar o programa ao cliente."; blocos **Cashback** (Percentual — "Sobre o valor pago em dinheiro, Pix ou
  cartão. Zero desliga o cashback."; Prazo para usar; Mínimo e máximo por compra; Produtos que dão cashback; Parte paga com
  cashback, vale-troca ou fiado; Devolução e cancelamento), **Retorno e cupom** (Lembrar após; Desconto do cupom de retorno;
  Validade do cupom; Aviso de cashback vencendo; Frequência), **Fiado** (Limite de crédito; Passar do limite; Prazo para
  pagar; Cliente com fiado vencido), **Cadastro** (Campos obrigatórios; Venda sem cliente; Cashback, cupom e fiado;
  Autorização para mensagens; Campo extra no cadastro, com "Nome do campo extra"), **Mensagens do WhatsApp** (as três, com
  as variáveis) e **Regulamento para deixar na loja** (o texto de 03 §13.5, com "Copiar texto"); "Salvar regras"
  ("Gravando…"). Conferências: "<regra>: informe um número." · "<regra>: use um valor entre X e Y." · "<regra>: use um
  número inteiro de dias." · "As mensagens não podem ficar em branco." · "Dê um nome para o campo extra (ex.: Pet,
  Veículo)." (`:95-102`). Os textos de cada regra estão em `AbaRegras.tsx:148-210`.

## 11. Financeiro

Componentes: `painel/TelaFinanceiro.tsx:1-756`, `painel/financeiro/ModaisFinanceiro.tsx:1-550` (e as janelas de pagar
conta, receber fiado e taxas de Compras e Clientes). Regras: 03 §9.4, §12.4, §15.

- **Topo** (`TelaFinanceiro.tsx:108-126`): título "Financeiro"; botões "Taxas da maquininha", "Saldo inicial" e "+ Novo
  lançamento".
- **Cartões** (`:238-282`, `aria-label` "Saldos e totais"): "Saldo total" (a soma; nota "<conta> + <conta>"; negativo em
  vermelho); um cartão por conta com o nome da loja ("ver extrato" / "extrato aberto abaixo"; "✎" para trocar o nome,
  `aria-label` "Trocar o nome de <conta>", título "Trocar o nome da conta", com `loja.configurar`); "A receber" ("cartão R$
  X • fiado R$ Y • N vencido(s)"); "A pagar" ("N conta(s) • N vencida(s)" ou "nenhuma conta em aberto"). Cada cartão abre a
  parte dele embaixo.
- **Extrato da conta** (`:283-470`): título "Extrato do <conta>" / "da <conta>" (com o nome da loja); "Período": "Hoje",
  "Últimos 7 dias", "Este mês", "Mês passado", "Escolher datas" ("De", "Até"); "Mostrar": "Tudo", "Só entradas", "Só
  saídas"; "Buscar" (placeholder "Descrição, categoria ou quem lançou"; sem acento); colunas Data, Lançamento, Valor,
  Saldo (saldo anterior no começo, saldo depois de cada linha); vazio: "Nenhum lançamento no período." ou "Nenhum lançamento
  com esse filtro no período."; "Totais do período" com entradas, saídas e "Saldo final R$ X" (03 §15.8).
- **A receber** (`:500-660`): **Cartão (maquininha)** — na baixa manual, "Baixa manual: cada venda no cartão fica a receber
  até alguém confirmar o depósito da operadora (o prazo de cada cartão está nas taxas da maquininha)."; colunas Venda, Forma,
  Bruto, Taxa, Líquido, Cai em, Ação (confirmar); "Confirmar os vencidos (N)"; **Fiado (clientes)** — colunas Cliente, Deve,
  Vencido, Vence primeiro, com "Receber" (`aria-label` "Receber o fiado de <nome>").
- **Contas a pagar** (`:670-756`): filtro "Quais contas" (abertas, pagas, canceladas, todas); "+ Nova conta a pagar";
  colunas Conta (com "compra a prazo" quando vem de compra), Vencimento, Valor, Situação ("paga em dd/mm/aaaa • <conta>");
  "Pagar" (`aria-label` "Pagar <descrição>"); vazio: "Nenhuma conta aqui.".
- **Novo lançamento** (`ModaisFinanceiro.tsx:93-262`): "Tipo de lançamento": "Entrada", "Despesa", "Retirada do dono",
  "Transferência"; conta ("Entra em" / "Sai de"; na transferência, "Vai para" a outra); "Valor (R$)" (placeholder "0,00");
  "Descrição" (placeholders "Ex.: depósito do dinheiro da gaveta" / "Ex.: conta de luz de novembro"); na despesa,
  "Categoria" (as da loja); dicas "Retirada do dono: dinheiro que o dono tira da loja para ele." · "Transferência: o dinheiro
  sai de uma conta e entra na outra, com o mesmo valor." · "O lançamento aparece no extrato <da conta> com a sua data e o
  seu nome."; botões "Lançar" ("Gravando…") e "Cancelar". Conferências: "Informe um valor maior que zero." · "Descreva o
  lançamento.". Saída que deixa a Conta bancária negativa: "<banco> vai ficar negativa em R$ X (saldo de R$ Y). Confira o
  valor; se estiver certo, clique em “Lançar mesmo assim”." e o botão vira "Lançar mesmo assim" (`:240-259`). Sucessos:
  "Transferência de R$ X: do <conta> para a <conta>." · "<Tipo> de R$ X lançada no <conta>." (`:140-146`).
- **Saldo inicial** (`ModaisFinanceiro.tsx:266-334`): "Conta" (as que ainda não têm saldo inicial) e o valor ("Informe o valor
  (pode ser zero)."); sucesso "Saldo inicial do <conta>: R$ X." (`:290-295`).
- **Nome da conta** (`ModaisFinanceiro.tsx:336-408`): "Nome da conta (<nome padrão>)"; texto "O nome aparece nos cards, no
  extrato e nas escolhas de conta de todo o sistema (ex.: “Banco Itaú” no lugar de “Conta bancária”). O dinheiro e o
  histórico não mudam."; "Salvar nome" e "Voltar para “<nome padrão>”"; conferências "O nome da conta tem de 2 a 30
  caracteres." · "Nada mudou no nome da conta.".
- **Nova conta a pagar** (`ModaisFinanceiro.tsx:410-492`): descrição (placeholder "Ex.: Aluguel de dezembro"), valor,
  "Vencimento", categoria ("Sem categoria" + as da loja); sucesso "Conta a pagar lançada: <descrição> • R$ X • vence
  dd/mm/aaaa." (`:443`).
- **Confirmar recebimento** (`ModaisFinanceiro.tsx:494-550`): título "Confirmar recebimento" / "Confirmar recebimentos"
  (vários), a conta onde entrou; sucesso "Recebimento confirmado".
