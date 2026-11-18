# LGPD — rascunhos (item 3.6 da revisão de 18/11/2026)

> **RASCUNHOS.** Escritos para a revisão de um advogado antes de publicar (a reunião sugeriu o
> advogado: custo estimado R$ 500 a R$ 1.500 — Pergunta 2, decisão de vocês). Os campos entre
> colchetes `[ ]` precisam ser preenchidos.

| Arquivo | Para quê | Onde vai |
|---|---|---|
| [`politica-de-privacidade.md`](politica-de-privacidade.md) | o que o sistema coleta, por quê, com quem compartilha, por quanto tempo, direitos do titular | site e link na tela de entrada |
| [`termos-de-uso.md`](termos-de-uso.md) | contrato de uso do SaaS com a loja (inclui o papel de cada um na LGPD) | site; aceite na contratação |
| [`registro-de-tratamento.md`](registro-de-tratamento.md) | registro interno das operações com dados pessoais (art. 37) | interno (mostrar se a ANPD pedir) |
| [`pedidos-do-titular.md`](pedidos-do-titular.md) | o passo a passo quando alguém pede para ver, corrigir ou excluir os dados | interno (equipe e lojas) |

## Quem é quem (resumo para decidir)

- **A loja** (cliente do SaaS) é a **controladora** dos dados dos clientes dela e da equipe dela: é ela
  que decide cadastrar o cliente, vender no fiado etc.
- **Nós** (a empresa do SaaS) somos **operadores** desses dados: guardamos e processamos em nome da
  loja. Somos **controladores** só dos dados de quem contrata o SaaS (nome do Dono, cobrança).
- **Encarregado (DPO)**: a LGPD pede um encarregado com contato público. Pode ser um de vocês
  (decisão: [nome e e-mail]). Agentes de pequeno porte têm regras simplificadas (Resolução CD/ANPD
  nº 2/2022), mas indicar um canal de contato continua sendo boa prática.

## O que o sistema já faz (18/11/2026)

- **Exclusão de dados do usuário** (pessoa da equipe): aba Usuários → desativar → "Excluir dados".
  Só o Dono. Apaga nome, login e senha; o histórico fica como "Usuário removido".
- **Exclusão de dados do cliente**: regra pronta e testada (`packages/core/src/cliente.ts`,
  `excluirDadosDoCliente` na API da demonstração). Só o Dono, e não com fiado em aberto (a dívida
  precisa do cadastro até ser paga). Apaga nome, CPF e telefone e tira o nome das vendas, dos
  recebimentos e dos lançamentos. O botão entra junto com a aba **Clientes** (ainda em branco).
- **Mínimo necessário**: o e-mail dos usuários, que nunca foi usado, saiu do banco. CPF aparece
  mascarado na busca do caixa. Logs sem nome, CPF, telefone, e-mail ou senha.
- **Segurança**: isolamento entre lojas no banco (RLS), senhas com hash, cookie HttpOnly, CSP, backup
  testado (ver `../SEGURANCA.md` e `../backup.md`).

## O que falta decidir

1. Revisão por advogado (Pergunta 2 da reunião).
2. Nome e e-mail do encarregado (DPO).
3. **Por quanto tempo guardar** o histórico (auditoria) e as vendas: a sugestão está em
   `../decisoes/0001-auditoria.md` (fiscal pede 5 anos para o que é de venda).
4. Onde ficam os servidores e os backups (Brasil ou exterior: se exterior, a política precisa dizer).
5. Prazo para atender pedidos do titular (a LGPD fala em "prazo razoável"; sugestão: 15 dias).
