# Backup e restauração (item 3.4 da revisão de 18/11/2026)

> "Backup que nunca foi testado não é backup." Por isso há três camadas: o backup automático, um
> teste automático de restauração a cada push (CI) e um teste de restauração manual por mês, com a
> data registrada no fim deste arquivo.

## Como funciona

- `deploy/backup.sh` faz `pg_dump` com a role **`saas_backup`** (só lê, com BYPASSRLS para enxergar
  todas as lojas — sem ela o backup falha, porque o RLS com FORCE vale até para o dono das tabelas).
- Grava `backups/saas-AAAAMMDD-HHMMSS.dump`, confere se o arquivo abre (`pg_restore --list`) e apaga os
  com mais de `BACKUP_DIAS` dias (padrão 14). A pasta `backups/` fica com permissão só do dono.
- O backup leva tabelas, dados, RLS, policies, a trava de usuários e os privilégios.

## Ligar o backup automático (no servidor)

```bash
crontab -e
# todo dia às 03:17 (hora do servidor)
17 3 * * *  cd /opt/sistema-padrao && ./deploy/backup.sh >> backups/backup.log 2>&1
```

**Copie os backups para fora do servidor.** Backup no mesmo disco some junto com ele. Opções (a
escolher): `rclone` para Google Drive/Backblaze/S3, ou `aws s3 sync backups/ s3://<balde>/` no mesmo cron.
Os arquivos têm dados pessoais (nome e telefone de clientes): o destino precisa ser privado e, de
preferência, criptografado.

## Restaurar

| Para | Comando |
|---|---|
| **Testar** um backup (banco novo `saas_restaurado`, o banco em uso não muda) | `./deploy/restaurar.sh backups/saas-...dump` |
| **Voltar** o sistema para um backup (perde o que foi feito depois dele) | `./deploy/restaurar.sh backups/saas-...dump --substituir-producao` (para a API, pede o nome do banco para confirmar) |

O script recria as roles se o servidor for novo, restaura como superusuário, aplica as senhas do
`.env.producao` e mostra quantas linhas cada tabela tem. Servidor novo do zero: instale como em
`deploy.md`, copie o `.dump` para `backups/` e rode o `restaurar.sh ... --substituir-producao`.

## Cópia de segurança de UMA loja (tela Dados e backup)

Diferente do backup acima (o banco inteiro, de todas as lojas, feito pelo servidor), a loja também baixa a
**própria cópia** pela tela **Dados e backup → Importar e exportar** (Fase 2, módulo 13; DaniPets DAT-01 e DAT-05):

- **O arquivo** (`copia-de-seguranca-<loja>-<AAAA-MM-DD-HHMM>.json`) leva todos os dados da loja: cadastros, vendas,
  estoque, caixa, financeiro, fidelidade, vales-troca e as vendas antigas importadas. Leva também a equipe (sem senha) e o histórico, que vão só
  para consulta. O formato fica em `packages/core/src/copiaDaLoja.ts`.
- **Quem baixa:** quem tem Dados e backup e pode ver o CPF completo, porque a cópia leva o CPF dos clientes. Cada
  download fica no histórico.
- **Restaurar:** só o Adm. Sup.
  - A cópia só volta na mesma loja.
  - É recusado o arquivo de outra loja, de versão mais nova do sistema ou alterado depois de gerado.
  - Antes de trocar, a tela baixa uma cópia dos dados de agora (`copia-antes-de-restaurar-...json`).
  - A equipe (com as senhas de hoje) e o histórico não mudam, e a restauração entra no histórico.
- **Ficam fora** as ferramentas do suporte: as atualizações, os avisos para a equipe, os ajustes da loja (recursos
  ligados e limites) e as visões sob medida. Restaurar uma cópia antiga não religa um recurso nem muda um limite.
- **Conferência:** o arquivo leva o SHA-256 do conteúdo (em JSON canônico). Ela pega arquivo corrompido ou mexido à
  mão, mas não é assinatura: quem souber recalcular passa. Ela é calculada sobre o arquivo como veio: uma cópia feita
  antes de um assunto novo existir (como as vendas antigas) continua valendo, e o assunto que falta volta vazio.
- **No servidor**, essa parte responde 501 por enquanto. Ao entrar, a conferência passa a ser assinada com uma chave
  que só o servidor tem (HMAC), e a restauração confere cada registro antes de gravar.

## Testes automáticos

- `apps/api/test/backup.spec.ts`: backup **de verdade** (pg_dump com a role de backup), restauração num
  banco novo, mesmas linhas (inclusive acentos), mesmo RLS e policies, e a API sobe no banco restaurado.
  Prova também que com a role da API o pg_dump **falha** (por isso a role de backup existe).
- CI (`.github/workflows/ci.yml`, job `docker`): sobe as imagens, roda `deploy/backup.sh` e
  `deploy/restaurar.sh` a cada push.

## Na AWS (RDS)

Ligue o backup automático do RDS (retenção de 7 a 35 dias) e a restauração para um ponto no tempo.
Snapshot do RDS é cópia física: não depende de role nem de RLS. Teste do mesmo jeito: restaure um
snapshot numa instância nova, aponte uma API de teste para ela e confira.

## Registro dos testes de restauração

Faça um por mês: rode `./deploy/restaurar.sh <backup mais recente>`, confira as contagens e anote aqui.

| Data | Backup usado | Onde | Resultado | Quem |
|---|---|---|---|---|
| 18/11/2026 | `saas-20261118-142925.dump` (28 KB) | `docker-compose.prod.yml` no ambiente de testes do Claude | restaurado em `saas_restaurado`: lojas 2, usuários 3, auditoria 15 — iguais à origem | Claude (com o Luan acompanhando o relatório) |
| próximo: até 18/12/2026 | | servidor de produção | | |
