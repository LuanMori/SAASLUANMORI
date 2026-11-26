# apps/api/Dockerfile — imagens da API (item 3.x da revisão de 18/11/2026).
# Rede com proxy que inspeciona HTTPS (empresa, antivírus): passe o certificado dela, que NÃO fica
# na imagem:  docker build --secret id=ca_extra,src=certificado.crt ...
# Construir SEMPRE a partir da raiz do repositório (o monorepo inteiro é o contexto):
#   docker build -f apps/api/Dockerfile --target api .
#   docker build -f apps/api/Dockerfile --target ferramentas .
#
# Alvos:
#   api         só o necessário para rodar (dist + dependências de produção), usuário sem privilégio
#   ferramentas migrations (prisma migrate deploy) e scripts de instalação (db:usuario, db:seed...)

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false

# ---------------------------------------------------------------- dependências (com as de desenvolvimento)
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    npm ci -w @saas/core -w @saas/api --include-workspace-root

# ---------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @saas/core && npm run build -w @saas/api

# ---------------------------------------------------------------- migrations e scripts
FROM build AS ferramentas
WORKDIR /app/apps/api
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------- só as dependências de produção
FROM base AS deps-producao
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    npm ci --omit=dev -w @saas/core -w @saas/api --include-workspace-root

# ---------------------------------------------------------------- imagem que roda
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps-producao /app/node_modules node_modules
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/saude').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
