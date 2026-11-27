package com.saasluanmori.teste;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.UuidV7;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;

/**
 * Cadastros dos testes, gravados como a role dona do schema (como os comandos de administração): lojas com endereço
 * sorteado (os testes não esbarram uns nos outros) e usuários. A dona também passa pelo RLS forçado, então a loja vai
 * no {@code app.tenant_id} da transação.
 */
public final class DadosDeTeste {

    /** Uma loja criada para um teste. */
    public record LojaDeTeste(UUID id, String nome, String subdominio) {
    }

    /** Loja que não existe: usada para o Adm. Sup, que não tem loja, passar pela policy da loja sem erro. */
    private static final String NENHUMA_LOJA = "00000000-0000-0000-0000-000000000000";

    private static final SecureRandom SORTEIO = new SecureRandom();

    private DadosDeTeste() {
    }

    public static LojaDeTeste novaLoja(String nome) {
        String subdominio = "t" + Long.toString(Math.abs(SORTEIO.nextLong() % 2_000_000_000_000L), 36);
        UUID id = UuidV7.gerar();
        executar(null, "INSERT INTO lojas (id, nome, subdominio) VALUES (?, ?, ?)", id, nome, subdominio);
        return new LojaDeTeste(id, nome, subdominio);
    }

    public static void desativarLoja(UUID loja) {
        executar(null, "UPDATE lojas SET ativa = false WHERE id = ?", loja);
    }

    public static UUID novoUsuario(UUID loja, String login, String nome, Papel papel, String senhaHash, boolean provisoria) {
        UUID id = UuidV7.gerar();
        executar(loja.toString(), "INSERT INTO usuarios (id, tenant_id, usuario, nome, papel, senha_hash, senha_provisoria) VALUES (?, ?, ?, ?, ?::papel, ?, ?)",
                id, loja, login, nome, papel.valor(), senhaHash, provisoria);
        return id;
    }

    public static void desativarUsuario(UUID loja, UUID usuario) {
        executar(loja.toString(), "UPDATE usuarios SET ativo = false WHERE id = ?", usuario);
    }

    public static UUID novoSuporte(String login, String senhaHash) {
        UUID id = UuidV7.gerar();
        executar(NENHUMA_LOJA, "INSERT INTO usuarios (id, tenant_id, usuario, nome, papel, senha_hash, senha_provisoria) VALUES (?, NULL, ?, ?, 'super_admin', ?, false)",
                id, login, Papel.NOME_SUPORTE, senhaHash);
        return id;
    }

    public static void desativarSuporte(UUID suporte) {
        executar(NENHUMA_LOJA, "UPDATE usuarios SET ativo = false WHERE id = ? AND tenant_id IS NULL", suporte);
    }

    /** Roda um comando como a role dona, numa transação com a loja dada (ou sem loja, para a tabela de lojas). */
    public static void executar(String loja, String sql, Object... parametros) {
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            if (loja != null) {
                try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                    ps.setString(1, loja);
                    ps.execute();
                }
            }
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                for (int i = 0; i < parametros.length; i++) {
                    ps.setObject(i + 1, parametros[i]);
                }
                ps.execute();
            }
            c.commit();
        } catch (SQLException e) {
            throw new IllegalStateException("Falha ao preparar os dados do teste: " + e.getMessage(), e);
        }
    }
}
