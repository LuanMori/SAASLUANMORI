// apps/api/test/apoio/ambiente.ts
// Roda antes de cada arquivo de teste: a API sobe com a role saas_app (a mesma situação de
// produção), cookie sem "Secure" (o supertest fala http) e logs só de erro.
import { URL_APP_TESTE } from './config.js';

process.env.DATABASE_URL_APP = URL_APP_TESTE;
process.env.WEB_ORIGINS = 'http://localhost:5173';
process.env.COOKIE_SEGURO = 'false';
process.env.LOG_NIVEL = 'erro';
process.env.SALTOS_DE_PROXY = '1';
delete process.env.DOMINIO_BASE;
delete process.env.SESSAO_INATIVIDADE_MIN;
delete process.env.SESSAO_MAXIMA_HORAS;
