# 0002 — Login próprio no lugar do Auth0

- **Data:** 18/11/2026 · **Origem:** revisão, itens 5.4 e 3.5 · **Decisão do Luan:** "Fazer agora com login próprio"

## Contexto

O servidor autenticava pelo Auth0 (Organizations), mas: (1) todo usuário novo precisava ser criado por
nós no Auth0 **e** no banco — a reunião apontou isso como gargalo (5.4); (2) a tela de entrada que o
Luan pediu é usuário e senha com a loja vinda do subdomínio, igual ao DaniPets; (3) o Auth0 trazia
custo por usuário e uma dependência externa para cada login.

## Decisão

Usuário e senha guardados no nosso banco, por loja; **o Dono cadastra a equipe** pela aba Usuários.

- Senha: **scrypt** (embutido no Node, sem biblioteca nova), sal por senha, custo guardado junto
  (dá para aumentar depois), comparação em tempo constante. Senha nova: 8+ caracteres, fora da lista
  das mais usadas, sem o usuário/nome (NIST 800-63B; sem "maiúscula + número + símbolo").
- **Senha provisória**: a que o Dono cria; no primeiro acesso a pessoa cria a dela (nem o Dono sabe a
  senha de quem autoriza descontos).
- **Sessão no servidor** (tabela `sessoes`), cookie `__Host-sessao` HttpOnly + Secure + SameSite=Strict
  com um segredo aleatório de 256 bits; o banco guarda só o SHA-256. Por que não JWT: dá para
  **encerrar na hora** (desativar, redefinir senha, sair de todos os aparelhos), e não há chave de
  assinatura para vazar. Custo: uma consulta por pedido (leve, com índice).
- Inatividade de **30 min** (DaniPets) e limite de **12 h**; a tela também sai sozinha.
- **Bloqueio** (item 3.5): 5 senhas erradas = 5 minutos por usuário (no banco, com `FOR UPDATE`),
  5 erradas em 1 minuto = 5 minutos por IP (memória), uma tentativa por vez para o mesmo usuário, e o
  usuário que não existe se comporta igual (não revela quem existe).
- A loja vem do **endereço** (`DOMINIO_BASE`), nunca do que a tela manda.
- Defesa em profundidade no banco: trigger `usuarios_trava_api` (Dono, último Dono, a si mesmo).

## Consequências

- A tela de entrada da demonstração virou a do sistema real (a mesma `TelaEntrada`).
- Quem estava cadastrado pelo Auth0 ficou **sem senha** (a migration não tem como saber a senha do
  Auth0): o Dono ou o script `db:usuario --redefinir-senha` cria uma provisória.
- "Esqueci a senha" não manda e-mail (não guardamos e-mail): o Dono cria uma provisória nova. Se um
  dia houver recuperação por e-mail, o e-mail volta a ser guardado (e entra na política de privacidade).
- Dois fatores (2FA) não existem ainda: candidato para o Dono, quando houver clientes grandes.
- Com várias cópias da API, o contador por IP precisa ir para o banco/Redis (ver `SEGURANCA.md`).
