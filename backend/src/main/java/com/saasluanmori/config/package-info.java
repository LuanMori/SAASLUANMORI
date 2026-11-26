/**
 * Configuração da aplicação: segurança (login próprio com scrypt e sessão em cookie HttpOnly), multiempresa
 * (a loja da sessão vale na requisição e, no banco, em cada transação, para o RLS do PostgreSQL), web e auditoria.
 */
package com.saasluanmori.config;
