# Pedidos do titular — passo a passo

> **RASCUNHO interno.** Para a equipe do SaaS e para as lojas.

Alguém pediu para **ver, corrigir ou apagar** os próprios dados. Responda em até [15] dias e guarde a
data do pedido e da resposta.

## 1. Quem pediu e de qual dado

- **Cliente de uma loja** (nome, CPF, telefone, compras): quem decide é a **loja**. Se o pedido chegou
  para nós, encaminhe à loja e ajude.
- **Pessoa da equipe de uma loja**: idem, a loja decide (o Dono faz pela tela).
- **Quem contrata o SaaS**: nós decidimos.

Confirme que quem pede é o titular (ex.: pedido vindo do telefone ou e-mail cadastrado, ou documento).

## 2. Ver os dados (acesso)

- Cliente: aba Clientes → histórico do cliente (entra junto com a aba Clientes). Até lá, a equipe
  técnica extrai do banco os dados daquele cliente, só daquela loja.
- Equipe: aba Usuários (nome, login, papel, situação, último acesso) e Histórico.

## 3. Corrigir

- Equipe: Usuários → Editar (o Dono ou o Administrador).
- Cliente: aba Clientes → editar (quando a aba existir).

## 4. Apagar (eliminação)

**Pessoa da equipe** — o Dono da loja:
1. Usuários → **Desativar** a pessoa (o acesso termina na hora);
2. Usuários → **Excluir dados** (só o Dono vê o botão, só em quem está desativado);
3. Fica "Usuário removido" no histórico: o que ela fez continua registrado, sem o nome.

**Cliente da loja** — o Dono da loja (aba Clientes; a regra já está pronta e testada):
1. Se o cliente tem **fiado em aberto**, o sistema não deixa: a dívida precisa do cadastro até ser
   paga (ou a loja decide perdoar/registrar o recebimento e então exclui);
2. Excluir dados: nome, CPF e telefone apagados; o nome some das vendas, dos recebimentos e dos
   lançamentos; os valores ficam (obrigação fiscal).

**Backups**: os dados apagados ainda existem nos backups até eles expirarem (`BACKUP_DIAS`, padrão
14 dias). Diga isso na resposta. Se um backup for restaurado nesse período, repita a exclusão.

## 5. Responder

Modelo: "Recebemos seu pedido em [data]. [Seus dados foram excluídos em [data] / Seguem os dados que
temos sobre você: ...]. Cópias de segurança são apagadas automaticamente em até [14] dias.
Encarregado de dados: [nome, e-mail]."
