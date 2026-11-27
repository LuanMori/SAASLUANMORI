package com.saasluanmori.teste;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * O banco dos testes: um PostgreSQL de verdade (o RLS não existe em banco de mentira). Uma vez por execução, com a role
 * administradora do servidor, recria o banco {@code saasluanmori_teste} (UTF-8, ICU pt-BR, como o de produção do sistema
 * antigo) com a role dona {@code saas_dono}, que não é superusuário (como num banco gerenciado). As migrações rodam
 * como dona e a aplicação conecta como {@code saas_app}.
 *
 * <p>Onde está o servidor: {@code SAAS_TESTE_PG_URL} (padrão {@code jdbc:postgresql://localhost:5432/postgres}),
 * {@code SAAS_TESTE_PG_USUARIO} e {@code SAAS_TESTE_PG_SENHA} (padrão {@code postgres}/{@code postgres}, o do serviço
 * do CI).
 */
public final class BancoDeTeste {

    public static final String BANCO = "saasluanmori_teste";
    public static final String DONO = "saas_dono";
    public static final String DONO_SENHA = "senha-local-do-teste";
    public static final String APP = "saas_app";
    public static final String APP_SENHA = "senha-de-teste-nao-usar-em-producao";

    private static final String ADMIN_URL = env("SAAS_TESTE_PG_URL", "jdbc:postgresql://localhost:5432/postgres");
    private static final String ADMIN_USUARIO = env("SAAS_TESTE_PG_USUARIO", "postgres");
    private static final String ADMIN_SENHA = env("SAAS_TESTE_PG_SENHA", "postgres");

    private static boolean pronto;

    private BancoDeTeste() {
    }

    /** O endereço JDBC do banco de teste (o mesmo servidor do administrador). */
    public static String url() {
        return ADMIN_URL.substring(0, ADMIN_URL.lastIndexOf('/') + 1) + BANCO;
    }

    /** Recria o banco (uma vez por execução) e passa as variáveis que a aplicação lê. */
    public static synchronized void preparar(DynamicPropertyRegistry registro) {
        if (!pronto) {
            recriar();
            pronto = true;
        }
        registro.add("SAAS_DB_URL", BancoDeTeste::url);
        registro.add("SAAS_DB_APP_SENHA", () -> APP_SENHA);
        registro.add("SAAS_DB_DONO_USUARIO", () -> DONO);
        registro.add("SAAS_DB_DONO_SENHA", () -> DONO_SENHA);
        registro.add("SAAS_DB_DEFINIR_SENHA_APP", () -> "true");
    }

    private static void recriar() {
        try (Connection c = DriverManager.getConnection(ADMIN_URL, ADMIN_USUARIO, ADMIN_SENHA); Statement st = c.createStatement()) {
            st.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '" + DONO + "') THEN "
                    + "CREATE ROLE " + DONO + " LOGIN NOSUPERUSER CREATEROLE NOBYPASSRLS PASSWORD '" + DONO_SENHA + "'; END IF; END $$");
            // a role da aplicação já existe neste servidor (outra execução): a dona precisa poder definir a senha dela
            st.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '" + APP + "') THEN "
                    + "GRANT " + APP + " TO " + DONO + " WITH ADMIN OPTION; END IF; END $$");
            st.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '" + BANCO + "' AND pid <> pg_backend_pid()");
            st.execute("DROP DATABASE IF EXISTS " + BANCO);
            st.execute("CREATE DATABASE " + BANCO + " OWNER " + DONO
                    + " ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'pt-BR' LOCALE 'C.UTF-8' TEMPLATE template0");
        } catch (SQLException e) {
            throw new IllegalStateException("Não foi possível preparar o banco de teste em " + ADMIN_URL
                    + " (defina SAAS_TESTE_PG_URL, SAAS_TESTE_PG_USUARIO e SAAS_TESTE_PG_SENHA).", e);
        }
    }

    /** Uma conexão nova com o banco de teste, como a role dada. */
    public static Connection conectar(String usuario, String senha) throws SQLException {
        return DriverManager.getConnection(url(), usuario, senha);
    }

    private static String env(String nome, String padrao) {
        String v = System.getenv(nome);
        return v == null || v.isBlank() ? padrao : v;
    }
}
