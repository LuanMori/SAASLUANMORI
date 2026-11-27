package com.saasluanmori.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Conferência de segurança ao subir ({@code legacy/api/src/banco/conferencia.ts:1-63}). O servidor se RECUSA a subir se:
 * <ol>
 *   <li>a role da conexão, ou qualquer role de que ela faça parte (mesmo com NOINHERIT: dá para "virar" ela com
 *       SET ROLE), é superusuário ou tem BYPASSRLS — o RLS deixaria de valer e uma loja veria os dados de outra;</li>
 *   <li>a role é dona de alguma tabela (ou faz parte da role dona): o dono pode desligar o RLS;</li>
 *   <li>alguma tabela com a coluna {@code tenant_id} está sem RLS ligado e forçado, ou sem policy;</li>
 *   <li>o banco ou a conexão não estão em UTF-8.</li>
 * </ol>
 * As mensagens citam só nomes de roles e de tabelas, nunca senha nem endereço de conexão. Roda depois das migrações e
 * antes de o servidor web começar a atender ({@link SmartInitializingSingleton}).
 */
@Component
public class ConferenciaDoBanco implements SmartInitializingSingleton {

    static final String ROLES = """
            WITH RECURSIVE papeis AS (
              SELECT oid FROM pg_roles WHERE rolname = current_user
              UNION
              SELECT m.roleid FROM pg_auth_members m JOIN papeis p ON m.member = p.oid
            )
            SELECT r.rolname AS nome, r.rolsuper AS super, r.rolbypassrls AS bypass
              FROM pg_roles r JOIN papeis p ON p.oid = r.oid
             ORDER BY r.rolname""";

    static final String DONA_DE_TABELA = """
            SELECT c.relname AS tabela
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'MEMBER')
             ORDER BY c.relname""";

    static final String TABELAS_DE_LOJA = """
            SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
                   EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS policy
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
               AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
             ORDER BY c.relname""";

    static final String CODIFICACAO = """
            SELECT pg_encoding_to_char(d.encoding) AS banco, current_setting('client_encoding') AS conexao
              FROM pg_database d WHERE d.datname = current_database()""";

    private final JdbcTemplate jdbc;

    public ConferenciaDoBanco(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void afterSingletonsInstantiated() {
        List<String> problemas = problemasDeSeguranca(jdbc);
        if (!problemas.isEmpty()) {
            throw new IllegalStateException("Conexão com o banco insegura: o servidor não sobe. " + String.join(" ", problemas)
                    + " Veja docs/SEGURANCA.md.");
        }
    }

    /** Os problemas encontrados na conexão {@code jdbc} (lista vazia = segura). */
    public static List<String> problemasDeSeguranca(JdbcTemplate jdbc) {
        List<String> problemas = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList(ROLES)) {
            if (Boolean.TRUE.equals(r.get("super"))) {
                problemas.add("A role \"" + r.get("nome") + "\" é superusuário.");
            }
            if (Boolean.TRUE.equals(r.get("bypass"))) {
                problemas.add("A role \"" + r.get("nome") + "\" tem BYPASSRLS.");
            }
        }

        List<String> donas = jdbc.queryForList(DONA_DE_TABELA, String.class);
        if (!donas.isEmpty()) {
            problemas.add("A role da aplicação é dona de tabela(s): " + String.join(", ", donas) + ".");
        }

        List<Map<String, Object>> tabelas = jdbc.queryForList(TABELAS_DE_LOJA);
        if (tabelas.isEmpty()) {
            problemas.add("Nenhuma tabela de loja encontrada (as migrations foram aplicadas neste banco?).");
        }
        for (Map<String, Object> t : tabelas) {
            boolean seguro = Boolean.TRUE.equals(t.get("rls")) && Boolean.TRUE.equals(t.get("forcado")) && Boolean.TRUE.equals(t.get("policy"));
            if (!seguro) {
                problemas.add("A tabela \"" + t.get("tabela") + "\" tem tenant_id mas está sem RLS ligado e forçado, ou sem policy.");
            }
        }

        Map<String, Object> cod = jdbc.queryForMap(CODIFICACAO);
        if (!"UTF8".equals(cod.get("banco"))) {
            problemas.add("O banco está em " + cod.get("banco") + "; precisa ser UTF8 (docs/deploy.md).");
        }
        if (!"UTF8".equals(cod.get("conexao"))) {
            problemas.add("A conexão está em " + cod.get("conexao") + "; precisa ser UTF8.");
        }
        return problemas;
    }
}
