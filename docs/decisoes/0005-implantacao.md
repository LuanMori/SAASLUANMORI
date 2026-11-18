# 0005 — Como o sistema vai para produção

- **Data:** 18/11/2026 · **Origem:** revisão, itens 3.1 a 3.4, 5.1 e 5.3 · **Situação:** adotado e testado

## Decisão

- **Docker**: imagem da API (alvo `api`: só o que roda, usuário sem privilégio, sistema de arquivos
  só leitura), imagem de ferramentas (alvo `ferramentas`: migrations e scripts) e imagem da tela
  (nginx sem root, que também repassa `/api`). Um `docker-compose.prod.yml` sobe tudo num servidor.
- **Mesmo endereço para tela e API** (o nginx repassa `/api`): o cookie de sessão é SameSite=Strict e
  o CORS nem entra em jogo.
- **HTTPS fora do compose** (Cloudflare, balanceador ou Caddy): o certificado curinga dos subdomínios
  das lojas fica com quem é bom nisso.
- **Sinal de vida**: `GET /saude` (API + banco), usado pelo Docker, pelo compose e pelo monitoramento.
- **Migrations antes da API**: o container `migracao` roda e termina; a API só sobe depois que ele
  terminar com sucesso.
- **Logs em JSON** no stdout, com rotação pelo Docker (5 × 10 MB) e o mesmo `X-Request-Id` no nginx e na API.
- **CI** (GitHub Actions) a cada push: segredos, tipos, testes com Postgres 16 (vigilância inclusa),
  drift do schema, demonstração atualizada e as imagens subindo juntas, com backup e restauração.

## Por que não Kubernetes/ECS agora

Um servidor com Docker atende os primeiros clientes com folga, custa pouco e qualquer dev entende
(`docs/deploy.md`). As imagens são as mesmas que rodariam no ECS/Kubernetes: a mudança, quando vier,
é de onde rodar, não de como empacotar. Pontos a resolver antes de ter várias cópias da API: contador
de tentativas por IP no banco/Redis.

## Consequências

- O primeiro `up` num servidor novo já deixa tudo pronto (banco UTF-8 com ordem do português, roles,
  migrations); falta só cadastrar a loja e o primeiro Dono (2 comandos).
- Backup e restauração por script, com teste automático e um teste manual por mês (`docs/backup.md`).
