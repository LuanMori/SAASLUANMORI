# Registro das operações de tratamento (LGPD, art. 37)

> **RASCUNHO interno.** Atualize quando o sistema passar a guardar um dado novo. Última revisão: 18/11/2026.

| # | Dado | Titular | Finalidade | Base legal | Onde fica | Quem acessa | Prazo | Como apagar |
|---|---|---|---|---|---|---|---|---|
| 1 | Nome e usuário (login) | equipe da loja | entrar no sistema; mostrar quem fez cada ação | execução de contrato | tabela `usuarios` (Postgres) | Dono e Administrador da loja | enquanto a pessoa estiver na equipe; depois, até o pedido de exclusão | Usuários → desativar → Excluir dados |
| 1b | Foto do perfil (opcional) | equipe da loja | mostrar quem está logado (barra lateral) e na lista da equipe | consentimento: a própria pessoa escolhe a foto e pode tirar | cadastro do usuário (hoje só na demonstração; o servidor ainda não guarda) | a própria pessoa (Meu usuário) e o Dono e o Administrador (Usuários) | até a pessoa tirar ou os dados serem excluídos | Meu usuário → Tirar a foto; Usuários → Excluir dados (a foto sai junto) |
| 2 | Senha (só o hash scrypt) | equipe da loja | autenticação | execução de contrato | `usuarios.senha_hash` | ninguém lê a senha (só o hash) | idem 1 | idem 1 (o hash é apagado) |
| 3 | Último acesso, tentativas erradas, bloqueio | equipe da loja | segurança (bloqueio por senhas erradas) | legítimo interesse | `usuarios` | Dono e Administrador | idem 1 | idem 1 |
| 4 | Sessões (hash do segredo, horários) | equipe da loja | manter a pessoa logada; encerrar à distância | execução de contrato | tabela `sessoes` | ninguém pela tela | [a decidir: ex. 90 dias depois de encerrada] | limpeza periódica (a implementar) |
| 5 | Histórico de ações (quem, o quê, quando) — sem nomes nos detalhes | equipe da loja | prestação de contas, segurança | legítimo interesse / obrigação legal (vendas) | tabela `auditoria` | Dono e Administrador | [a decidir — ver `decisoes/0001-auditoria.md`] | o nome sai junto com a exclusão do usuário (o histórico lê o nome na hora) |
| 6 | IP de quem foi bloqueado por excesso de tentativas | quem tenta entrar | segurança | legítimo interesse | só nos logs da API (`evento: ip_bloqueado`) | equipe técnica | retenção dos logs: [a decidir, sugestão 30 dias] | rotação dos logs (Docker: 5 arquivos de 10 MB) |
| 7 | Nome, telefone, CPF | clientes da loja | identificar na venda, histórico, fiado | definida pela loja (controladora) | `clientes` (hoje só na demonstração) | equipe da loja; CPF mascarado na busca do caixa | enquanto a loja quiser; fiado aberto segura o cadastro | Clientes → Excluir dados (só o Dono; regra pronta, botão com a aba Clientes) |
| 8 | Compras, pagamentos, fiado | clientes da loja | gestão da loja | definida pela loja; obrigação fiscal | `vendas`, recebíveis, lançamentos (hoje só na demonstração) | equipe (Vendedor: só o dia) | fiscal: 5 anos | a exclusão do cliente tira o nome; os valores ficam (obrigação fiscal) |
| 9 | Backups (cópia de tudo acima) | todos | recuperar de desastre | legítimo interesse | `backups/` no servidor + [cópia externa] | equipe técnica | [14] dias no servidor; [X] fora | expiram sozinhos (`BACKUP_DIAS`) |
| 10 | Dados de quem contrata (nome, contato, cobrança) | responsável pela loja | contrato e cobrança | execução de contrato | [sistema de cobrança — a definir] | sócios | 5 anos após o fim (fiscal) | [a definir] |
| 11 | Arquivos baixados em Dados e backup: a cópia de segurança da loja (tudo de 1 a 8 da loja, com o CPF completo dos clientes; a equipe vai sem senha) e as planilhas de cadastro (CPF completo só para quem pode vê-lo) | clientes e equipe da loja | a loja guardar e levar os próprios dados (portabilidade); voltar a loja a uma cópia (só o Adm. Sup) | definida pela loja (controladora) | no computador de quem baixou (fora do sistema) | quem baixou: Dono, Administrador ou Personalizado com Dados e backup (a cópia pede também "Ver o CPF completo") | decidido pela loja | a loja apaga o arquivo; cada download fica no histórico (quem e quando) |

**Não guardamos**: e-mail da equipe (removido em 18/11/2026: nunca foi usado), dados sensíveis,
localização, cookies de rastreamento.
