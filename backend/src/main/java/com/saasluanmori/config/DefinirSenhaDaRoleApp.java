package com.saasluanmori.config;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Liga o LOGIN da role {@code saas_app} e define a senha dela a partir do ambiente, logo depois das migrações, com a
 * conexão da role dona do schema. É o {@code db:app-role} do sistema antigo
 * ({@code legacy/api/scripts/definir-senha-app.ts:1-43}), feito automaticamente quando
 * {@code SAAS_DB_DEFINIR_SENHA_APP=true}: a senha nunca fica em código nem em migração, e é a mesma que a aplicação usa
 * para conectar ({@code SAAS_DB_APP_SENHA}).
 */
@Component
@ConditionalOnProperty(name = "SAAS_DB_DEFINIR_SENHA_APP", havingValue = "true")
public class DefinirSenhaDaRoleApp implements Callback {

    /** O mesmo mínimo do script antigo ({@code definir-senha-app.ts:13-15}). */
    static final int TAMANHO_MINIMO = 16;

    private final String senha;

    public DefinirSenhaDaRoleApp(Environment env) {
        String s = env.getProperty("SAAS_DB_APP_SENHA", "");
        if (s.length() < TAMANHO_MINIMO) {
            throw new IllegalStateException("SAAS_DB_APP_SENHA precisa ter pelo menos " + TAMANHO_MINIMO + " caracteres.");
        }
        this.senha = s;
    }

    @Override
    public boolean supports(Event event, Context context) {
        return event == Event.AFTER_MIGRATE;
    }

    @Override
    public boolean canHandleInTransaction(Event event, Context context) {
        return true;
    }

    @Override
    public void handle(Event event, Context context) {
        definir(context.getConnection(), senha);
    }

    @Override
    public String getCallbackName() {
        return "definir-senha-da-role-app";
    }

    /** ALTER ROLE não aceita parâmetro; {@code format(%L)} faz o escape seguro do literal (como o script antigo). */
    static void definir(Connection conexao, String senha) {
        try (PreparedStatement ps = conexao.prepareStatement("SELECT format('ALTER ROLE saas_app WITH LOGIN PASSWORD %L', ?::text)")) {
            ps.setString(1, senha);
            try (ResultSet rs = ps.executeQuery(); Statement st = conexao.createStatement()) {
                rs.next();
                st.execute(rs.getString(1));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Não foi possível ligar o login da role saas_app: " + e.getSQLState(), e);
        }
    }
}
