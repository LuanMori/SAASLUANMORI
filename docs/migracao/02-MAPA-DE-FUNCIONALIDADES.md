# 02 — Mapa de funcionalidades (manual de reconstrução)

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`). Por tela: o que ela lê, o que ela faz e onde está a regra
de cada efeito (`03-REGRAS-DE-NEGOCIO.md`). Os campos, botões, textos e atalhos de cada tela estão em
`01-MAPA-DE-TELAS.md`; quem vê cada tela, em `05-MATRIZ-PERMISSOES.md`.

## 1. Como ler

- As telas do sistema antigo falavam com um contrato único, `ApiSistema` (`legacy/web/src/api.ts:862-943`), com duas
  implementações: o **servidor** (`criarApiServidor`, `legacy/web/src/api.ts:1014-1042`) e a **demonstração**
  (`criarApiLocal`, `legacy/web/src/demo/apiLocal.ts:902-3587`, com a equipe e a conta em `criarApiUsuariosDemo`, `legacy/web/src/demo/usuariosDemo.ts:384-608`). Cada método citado abaixo é desse contrato.
- "Servidor antigo: sim" = a parte existia em `legacy/api` (NestJS + PostgreSQL); "só demo" = existia só na
  demonstração, que guardava tudo no navegador. No servidor, o método que faltava respondia 501 "Esta parte ainda não está
  ligada ao servidor. Por enquanto ela funciona na demonstração (sistema-padrao-demo.html)." (`api.ts:956,1035-1041`), e a
  tela mostrava essa mensagem no lugar do conteúdo (`legacy/web/src/painel/TelaPainel.tsx:268-279`).
- A reconstrução implementa **tudo** no servidor (Java), com as regras de `03-REGRAS-DE-NEGOCIO.md` — o que era "só
  demo" passa a existir de verdade, com banco, RLS e testes.

---

## 2. O que existia no servidor antigo e o que só existia na demonstração

**No servidor antigo** (`legacy/api/src`), e nada mais:

| Rota | Método do contrato | O que faz | Fonte |
|---|---|---|---|
| `GET /sessao/loja?loja=` | `lojaDaEntrada` | a loja do endereço (ou da digitada, em desenvolvimento) | `legacy/api/src/auth/sessao.controller.ts:23`; `legacy/web/src/api.ts:997-999` |
| `POST /sessao` | `entrar` | login (§1.4 de 03) | `sessao.controller.ts:29`; `api.ts:1009` |
| `GET /sessao` | `sessaoAtual` | quem está logado (401 = ninguém) | `sessao.controller.ts:38`; `api.ts:1001-1008` |
| `POST /sessao/senha` | `trocarMinhaSenha` | trocar a própria senha (§1.6 de 03) | `sessao.controller.ts:44`; `api.ts:1031-1033` |
| `POST /sessao/sair` | `sair` | sair | `sessao.controller.ts:57`; `api.ts:1010` |
| `GET /usuarios` | `listarUsuarios` | equipe da loja | `legacy/api/src/usuarios/usuarios.controller.ts:18`; `api.ts:1025` |
| `POST /usuarios` | `criarUsuario` | criar usuário (§3 de 03) | `usuarios.controller.ts:23`; `api.ts:1026` |
| `PATCH /usuarios/:id` | `alterarUsuario` | alterar, desativar, reativar | `usuarios.controller.ts:29`; `api.ts:1027` |
| `POST /usuarios/:id/senha` | `redefinirSenhaUsuario` | redefinir a senha de outro | `usuarios.controller.ts:34`; `api.ts:1028` |
| `POST /usuarios/:id/excluir-dados` | `excluirDadosUsuario` | LGPD do usuário desativado | `usuarios.controller.ts:40`; `api.ts:1029` |
| `GET /produtos` | `listarProdutos` | lista de produtos | `legacy/api/src/produtos/produtos.controller.ts:13`; `api.ts:1023` |
| `POST /produtos` | `criarProduto` | cadastro básico (nome, código de barras, preço) | `produtos.controller.ts:19`; `api.ts:1024` |
| `GET /auditoria?limite=` | `listarAuditoria` | histórico (1 a 200, padrão 40) | `legacy/api/src/auditoria/auditoria.controller.ts:73-81`; `api.ts:1030` |
| `GET /saude` | — | saúde do servidor (para o deploy) | `legacy/api/src/saude/saude.controller.ts:12` |

No sistema real, só as seções Usuários e Meu usuário abriam (`SECOES_COM_SERVIDOR`, `legacy/web/src/App.tsx:19,129`); a
primeira tela depois de entrar era Usuários para quem podia, senão a Visão geral (com o aviso de 501) (`App.tsx:128`).

**Só na demonstração**: todo o resto do contrato — loja (dados, regras, ajustes), produtos completos (alterar,
inativar, excluir), estoque, fornecedores, compras e contas a pagar, vendas (Frente de caixa, autorização, cancelamento,
devolução), caixa do dia, clientes e fiado, fidelidade, vale-troca, financeiro, relatórios, dados e backup, comunicados,
visões, manutenção, registro de erros, e em Meu usuário a foto e as entradas e saídas (`meuPerfil`, `meusAcessos`,
`salvarMinhaFoto`). Métodos em `legacy/web/src/demo/apiLocal.ts:1412-3586` e `legacy/web/src/demo/usuariosDemo.ts:384-608`.

---

## 3. Telas

### 3.1 Entrada (login), primeiro acesso e saída

Componentes: `legacy/web/src/App.tsx:1-135`, `legacy/web/src/telas/TelaEntrada.tsx:1-236`,
`legacy/web/src/telas/LayoutEntrada.tsx:1-102`, `legacy/web/src/painel/TrocarSenha.tsx:1-119`. Servidor antigo: **sim**.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `lojaDaEntrada` (a loja do endereço), `sessaoAtual` (já logado?) | `entrar`, `sair`, `trocarMinhaSenha` (primeiro acesso: senha provisória obriga a criar a senha antes de entrar no painel) | §1 de 03 (login, bloqueio, sessão, cookie, inatividade, trocar senha) |

Fluxo (`App.tsx:30-135`): carregando → sem sessão: entrada (com a loja do endereço ou "Endereço não encontrado"); com
sessão e senha provisória: "Crie a sua senha" (`TrocarSenha.tsx:100-119`); com sessão: painel. Sem rede ao abrir: a
mensagem e "Tentar de novo" (`App.tsx:77-88`). Inatividade: sai com "Sua sessão terminou depois de N minutos sem uso.
Entre de novo." (`App.tsx:131`); sessão encerrada pelo servidor: volta à entrada com a mensagem (`App.tsx:132`).

### 3.2 Painel (moldura da área logada)

Componente: `legacy/web/src/painel/TelaPainel.tsx:1-340` (e `BarraLateral.tsx`). Servidor antigo: só a sessão.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `lerConfiguracao` (nome, descrição e logo da loja; regras; nomes das contas), `meuPerfil` (foto), `meusComunicados` (versão, avisos e novidades), `lerAjustesDaLoja` (recursos desligados), `lerCaixa` (na virada do dia) | `marcarComunicadoVisto` ("Entendi"), `registrarErro` (erro inesperado de tela), `sair` | §5, §11.6, §19.1, §19.3 de 03 |

Comportamentos: a barra lateral mostra só o que a pessoa pode ver e o que está ligado (`05-MATRIZ-PERMISSOES.md` §5);
quem força uma seção sem permissão não vê o conteúdo; seção de recurso desligado mostra a mensagem do recurso
(`TelaPainel.tsx:153-158,254-265`); a Frente de caixa abre em tela cheia, sem a barra (`TelaPainel.tsx:174-196`); avisos
no alto: virada do dia ("Novo dia: o caixa de dd/mm/aaaa fechou sozinho à meia-noite, sem contagem da gaveta. Abra o caixa
de hoje para voltar a vender."), novidades da versão e avisos do suporte (`TelaPainel.tsx:107,204-253`); tela que quebra
vira aviso e o erro vai para o registro do suporte (`TelaPainel.tsx:84-86,266-267`); dados recarregam quando algo muda
(`TelaPainel.tsx:109-142`).

### 3.3 Visão geral

Componentes: `legacy/web/src/painel/TelaVisaoGeral.tsx:1-507`, `PendenciasDoInicio.tsx:1-203`, `CardPendencias.tsx:1-109`.
Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarVendas` e `listarDevolucoes` (hoje), `listarProdutos`, `resumoFinanceiro` (só com `financeiro`), `lerSituacaoDoCaixa`, `pendenciasDeClientes` | pelas pendências de clientes: `contaDoCliente`, `taxasParaReceberFiado`, `receberFiadoDoCliente`, `mensagemParaCliente`, `registrarContato` | §10.8, §11, §12.4, §13.3-13.4, §16.1 de 03 |

### 3.4 Frente de caixa

Componentes: `legacy/web/src/painel/TelaFrenteCaixa.tsx:1-1147` e as janelas em `legacy/web/src/painel/caixa/`
(`ModalCliente.tsx`, `ModalDesconto.tsx`, `ModalSenha.tsx`, `ModalVale.tsx`, `ModalDevolucao.tsx`). Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarProdutos`, `listarEstoque`, `lerSituacaoDoCaixa`, `listarVales`, `listarAutorizadores`; `buscarClientesParaVenda` (F6); `buscarValePorCodigo`; `buscarVenda` (devolução) | `criarVenda`, `autorizar` (desconto, brinde, fiado, cancelamento, devolução), `cadastrarCliente` (pela busca F6), `cancelarVenda`, `devolverItens` | §10, §11.1, §12.4, §13.1-13.2, §14 de 03 |

Na demonstração, o carrinho da venda em andamento fica guardado no navegador, por loja e pessoa (chave
`saas-demo:pdv:<loja>:<pessoa>`; recarregar a página não perde a venda; a autorização dada com senha não é guardada)
(`legacy/web/src/demo/DemoApp.tsx:158`; `legacy/web/src/painel/TelaFrenteCaixa.tsx:121,140`;
`legacy/web/src/painel/caixa/carrinho.ts:10-13`); no sistema real antigo a chave não era passada (`legacy/web/src/App.tsx:
121-133`). Decisão T12 de `06-RISCOS-E-DECISOES.md`: o carrinho continua no navegador, por loja e pessoa.

### 3.5 Caixa do dia

Componente: `legacy/web/src/painel/TelaCaixaDoDia.tsx:1-928` (e `caixa/ModalSenha.tsx`). Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `lerCaixa` | `abrirCaixa`, `operarCaixa` (sangria, retirada do dono, suprimento), `fecharCaixa`, `verificarFechamentoAutomatico`, `darCienciaDaDiferenca`, `desfazerFechamento`, `autorizar` (retirada e diferença do Vendedor), `salvarRegrasDaLoja` (tolerância) | §11 de 03 |

### 3.6 Produtos e estoque

Componentes: `legacy/web/src/painel/TelaProdutosEstoque.tsx:1-360`, `produtos/ModalProduto.tsx:1-234`,
`produtos/ModaisEstoque.tsx:1-346`. Servidor antigo: só listar e o cadastro básico.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarProdutos`, `listarEstoque`, `listarMovimentosEstoque`, `listarFornecedores`, `lerConfiguracao` | `criarProduto`, `alterarProduto`, `definirProdutoAtivo`, `excluirProduto`, `lancarMovimentoEstoque` (com `autorizar` para dia fechado), `definirEstoqueMinimo`, `salvarRegrasDaLoja` (motivos de ajuste e unidades) | §5.3, §7, §11.9 de 03 |

### 3.7 Compras (e fornecedores)

Componentes: `legacy/web/src/painel/TelaCompras.tsx:1-472`, `compras/ModalCompra.tsx:1-408`,
`compras/ModaisCompra.tsx:1-225`. Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarCompras`, `listarContasAPagar`, `listarFornecedores`, `listarLotesVencendo`, `listarProdutos` | `registrarCompra` (com `autorizar` para dia fechado), `estornarItemDaCompra`, `darBaixaNoLote`, `pagarContaAPagar`, `cadastrarFornecedor`, `alterarFornecedor`, `definirFornecedorAtivo` | §8, §9, §11.9 de 03 |

### 3.8 Clientes (Clientes, Fiado, Retorno, Vales-troca, Regras do programa)

Componentes: `legacy/web/src/painel/TelaClientes.tsx:1-948`, `clientes/ModaisCliente.tsx:1-515`,
`clientes/ModalWhatsapp.tsx:1-128`, `clientes/AbaRetorno.tsx:1-223`, `clientes/AbaRegras.tsx:1-269`,
`clientes/ResumoClientes.tsx:1-261`. Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarContasDeClientes`, `contaDoCliente`, `listarFiado`, `listarRetorno`, `listarVales`, `resumoDoCashback`, `listarAvisosDeClientes`, `lerConfiguracao`, `taxasParaReceberFiado`, `lerTaxasCartao` | `cadastrarCliente`, `atualizarCliente`, `definirClienteAtivo`, `excluirCliente`, `verCpfDoCliente`, `excluirDadosDoCliente` (com `autorizar`), `conferirAvisoDeCliente`, `receberFiadoDoCliente`, `salvarTaxasCartao`, `mensagemParaCliente`, `registrarContato`, `adiarLembrete`, `marcarNaoIncomodar`, `salvarRegrasDaLoja` (programa de fidelidade, mensagens, campo extra) | §5.3, §12, §13, §14, §15.6 de 03 |

### 3.9 Financeiro

Componentes: `legacy/web/src/painel/TelaFinanceiro.tsx:1-756`, `financeiro/ModaisFinanceiro.tsx:1-550` (e as janelas de
pagar conta, receber fiado e taxas, de Compras e Clientes). Servidor antigo: não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `resumoFinanceiro`, `extratoDaConta`, `listarRecebiveis`, `listarContasAPagar`, `listarFiado`, `contaDoCliente`, `lerConfiguracao` | `lancarNoFinanceiro`, `definirSaldoInicial`, `receberRecebivel`, `receberRecebiveis`, `cadastrarContaAPagar`, `pagarContaAPagar`, `receberFiadoDoCliente`, `salvarTaxasCartao`, `salvarRegrasDaLoja` (nomes das contas e categorias de despesa) | §9.4, §12.4, §15 de 03 |

### 3.10 Relatórios

Componentes: `legacy/web/src/painel/TelaRelatorios.tsx:1-241`, `relatorios/AbaTudo.tsx`, `relatorios/AbaVendas.tsx`,
`relatorios/AbasRelatorios.tsx`, `relatorios/AbaVisoes.tsx`, `relatorios/TabelaDaPlanilha.tsx`; montagem das tabelas em
`legacy/web/src/relatorios/planilhas.ts:1-873` e do Excel em `legacy/web/src/relatorios/xlsx.ts:1-266`. Servidor antigo:
não.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarVendas`, `listarDevolucoes`, `listarRecebiveis`, `listarProdutos`, `listarEstoque`, `listarMovimentosEstoque`, `listarClientes`, `listarFiado`, `listarVales`, `listarLancamentos`, `listarContasAPagar`, `lerCaixa`, `listarCompras`, `listarAuditoria(2000)`, `listarVendasAntigas`, `listarVisoes` (`planilhas.ts:94-137`) | exportar uma aba ou tudo para o Excel (arquivo feito na tela), `registrarExportacao` | §16.2, §17, §18.4, §19.2 de 03 |

Na reconstrução, as tabelas e o arquivo .xlsx são montados no servidor (decisão T9 de `06-RISCOS-E-DECISOES.md`), com as
mesmas colunas e o mesmo formato.

### 3.11 Usuários

Componente: `legacy/web/src/painel/TelaUsuarios.tsx:1-739`. Servidor antigo: **sim**.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `listarUsuarios`, `listarAuditoria` (histórico da equipe) | `criarUsuario`, `alterarUsuario` (nome, papel, funções do Personalizado, desativar, reativar), `redefinirSenhaUsuario`, `excluirDadosUsuario` | §3 de 03; `05-MATRIZ-PERMISSOES.md` §4 |

### 3.12 Dados e backup

Componentes: `legacy/web/src/painel/TelaDadosBackup.tsx:1-311` (Dados do sistema: dados e regras da loja),
`dados/ParteImportarExportar.tsx:1-558`, `dados/ParteAdmSup.tsx:1-458` (só Adm. Sup), `dados/CartaoVisoes.tsx:1-407`,
`dados/CartaoManutencao.tsx:1-334`. Servidor antigo: não.

| Parte | Lê | Faz | Regras |
|---|---|---|---|
| Dados do sistema | `lerConfiguracao` | `salvarDadosDaLoja`, `salvarRegrasDaLoja` | §5.2-5.3 de 03 |
| Importar e exportar | `listarProdutos`, `listarEstoque`, `listarFornecedores`, `listarClientes`, `lerConfiguracao` | exportar planilhas e modelos (`registrarPlanilhaExportada`), `conferirImportacao`, `importarCadastro`, `conferirVendasAntigas`, `importarVendasAntigas`, `gerarCopiaDaLoja`, `conferirCopiaDaLoja`, `restaurarCopiaDaLoja` | §18 de 03 |
| Adm. Sup | `listarAtualizacoes`, `listarAvisosDaEquipe`, `lerAjustesDaLoja`, `listarProdutos`, `listarUsuarios`, `listarVisoes`, `diagnosticoDaLoja`, `listarErros` | `publicarAtualizacao`, `criarAvisoDaEquipe`, `encerrarAvisoDaEquipe`, `salvarAjustesDaLoja`, `salvarVisao`, `excluirVisao`, `zerarEstoqueNegativo`, `limparErros` | §5.4, §19 de 03 |

### 3.13 Meu usuário

Componentes: `legacy/web/src/painel/TelaMeuUsuario.tsx:1-258` e o formulário de `TrocarSenha.tsx`. Servidor antigo: só
trocar a senha.

| Lê | Faz | Efeitos e regras |
|---|---|---|
| `meuPerfil`, `meusAcessos` (entradas e saídas) | `salvarMinhaFoto` (salvar ou tirar), `trocarMinhaSenha` | §1.6 e §4 de 03 |

### 3.14 Suporte

Em branco, como hoje (decisão do Luan registrada no `CLAUDE.md`): o item aparece para todos na barra lateral
(`legacy/web/src/painel/menu.tsx:160`) e a tela não tem conteúdo (`legacy/web/src/painel/TelaPainel.tsx:5-6`).

---

## 4. Comportamentos que valem para todas as telas

- **Recarregar quando os dados mudam**: as telas que carregam dados recarregam sozinhas quando outra tela grava algo,
  mantendo o que a pessoa está digitando (`legacy/web/src/painel/usarCarga.ts:1-44`; `legacy/web/src/sincronizacao.ts:1-17`).
- **Atualização periódica**: a Visão geral e Produtos e estoque recebem `intervaloMs` e recarregam com a aba visível
  (`TelaPainel.tsx:286,295`; `usarCarga.ts:39-41`).
- **Sem rede depois da primeira carga**: a tela mantém o que já mostrava e avisa; 401/403 bloqueia com a mensagem
  (`usarCarga.ts:28-31`).
- **Erro inesperado**: vira um aviso no lugar da tela e vai para o registro de erros do suporte, com a aba
  (`legacy/web/src/painel/registroDeErros.tsx:1-81`; `TelaPainel.tsx:84-86,266-267`).
- **Virada da meia-noite** com o sistema aberto: o caixa que ficou aberto fecha sozinho, as telas recarregam e aparece o
  aviso do novo dia (`TelaPainel.tsx:94-107`; `legacy/web/src/painel/usarViradaDoDia.ts:1-30`).
- **Inatividade**: a tela sai sozinha depois de `inatividadeMin` minutos sem uso (`TelaPainel.tsx:92`; §1.5 de 03).
