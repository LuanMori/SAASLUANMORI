# apps/web/Dockerfile — tela do sistema real servida pelo nginx, que também repassa /api para a API
# (o navegador fala com UM endereço só: o cookie de sessão é SameSite=Strict e o CORS nem entra em jogo).
# Construir a partir da raiz do repositório:  docker build -f apps/web/Dockerfile .
# Rede com proxy que inspeciona HTTPS: --secret id=ca_extra,src=certificado.crt (não fica na imagem).

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=ca_extra,required=false \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    npm ci -w @saas/core -w @saas/web --include-workspace-root
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w @saas/core && npm run build -w @saas/web

# nginx sem root (porta 8080), só com os arquivos do build
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/seguranca.conf /etc/nginx/seguranca.conf
COPY apps/web/nginx/proxy_api.conf /etc/nginx/proxy_api.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
