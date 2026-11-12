// apps/api/test/apoio/ambiente.ts
// Roda antes de cada arquivo de teste: a API sobe com a role saas_app
// (a mesma situação de produção) e com um "Auth0" de teste.
import { AUDIENCE_TESTE, AUTH0_DOMAIN_TESTE, URL_APP_TESTE } from './config.js';

process.env.DATABASE_URL_APP = URL_APP_TESTE;
process.env.AUTH0_DOMAIN = AUTH0_DOMAIN_TESTE;
process.env.AUTH0_AUDIENCE = AUDIENCE_TESTE;
process.env.WEB_ORIGINS = 'http://localhost:5173';
