package com.saasluanmori.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * A foto do perfil direto no banco, por SQL, sem passar pela aplicação: a {@code saas_app} só troca a foto de quem é da
 * loja da transação, o banco confere o formato e o tamanho, e a foto do Adm. Sup (linha sem loja) só passa pelas funções
 * dele, que não mexem em mais ninguém.
 */
class IsolamentoMeuUsuarioTest extends TesteComBanco {

    private static final String PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    private LojaDeTeste lojaA;
    private LojaDeTeste lojaB;
    private UUID ana;
    private UUID bia;
    private UUID suporte;

    @BeforeEach
    void cadastrar() {
        lojaA = DadosDeTeste.novaLoja("Loja A");
        lojaB = DadosDeTeste.novaLoja("Loja B");
        ana = DadosDeTeste.novoUsuario(lojaA.id(), "ana", "Ana", Papel.DONO, null, false);
        bia = DadosDeTeste.novoUsuario(lojaB.id(), "bia", "Bia", Papel.DONO, null, false);
        suporte = DadosDeTeste.novoSuporte("sup" + UUID.randomUUID().toString().substring(0, 8), null);
    }

    private static Connection comoApp(UUID loja, UUID pessoa) throws SQLException {
        Connection c = BancoDeTeste.conectar(BancoDeTeste.APP, BancoDeTeste.APP_SENHA);
        c.setAutoCommit(false);
        try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true), set_config('app.usuario_id', ?, true)")) {
            ps.setString(1, loja.toString());
            ps.setString(2, pessoa.toString());
            ps.execute();
        }
        return c;
    }

    private static int trocarFoto(Connection c, UUID id, String foto) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("UPDATE usuarios SET foto = ? WHERE id = ?")) {
            ps.setString(1, foto);
            ps.setObject(2, id);
            return ps.executeUpdate();
        }
    }

    @Test
    void soTrocaAFotoDeQuemEDaLojaDaTransacao() throws SQLException {
        try (Connection c = comoApp(lojaA.id(), ana)) {
            assertThat(trocarFoto(c, ana, PNG)).isEqualTo(1);
            // a pessoa da outra loja nem aparece para o UPDATE
            assertThat(trocarFoto(c, bia, PNG)).isZero();
            // a linha do Adm. Sup (sem loja) também não
            assertThat(trocarFoto(c, suporte, PNG)).isZero();
            c.rollback();
        }
    }

    @Test
    void oBancoConfereOFormatoEOTamanhoDaFoto() throws SQLException {
        for (String foto : new String[] {"data:image/svg+xml;base64,PHN2Zz4=", "https://exemplo.com/foto.png", PNG + "\n",
            "data:image/jpeg;base64," + "A".repeat(150_000)}) {
            try (Connection c = comoApp(lojaA.id(), ana)) {
                assertThatThrownBy(() -> trocarFoto(c, ana, foto)).isInstanceOf(SQLException.class).hasMessageContaining("usuarios_foto_formato");
                c.rollback();
            }
        }
    }

    @Test
    void aFotoDoAdmSupSoPassaPelasFuncoesDele() throws SQLException {
        try (Connection c = comoApp(lojaA.id(), suporte)) {
            try (PreparedStatement ps = c.prepareStatement("SELECT app_suporte_definir_foto(?, ?)")) {
                ps.setObject(1, suporte);
                ps.setString(2, PNG);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getBoolean(1)).isTrue();
                }
                // com o id de alguém da loja, a função não acha ninguém (só mexe no Adm. Sup)
                ps.setObject(1, ana);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getBoolean(1)).isFalse();
                }
            }
            try (PreparedStatement ps = c.prepareStatement("SELECT app_suporte_foto(?), (SELECT foto FROM usuarios WHERE id = ?)")) {
                ps.setObject(1, suporte);
                ps.setObject(2, ana);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getString(1)).isEqualTo(PNG);
                    assertThat(rs.getString(2)).as("a foto da Ana não mudou").isNull();
                }
            }
            // a aplicação não lê a linha do Adm. Sup direto
            try (PreparedStatement ps = c.prepareStatement("SELECT count(*) FROM usuarios WHERE id = ?")) {
                ps.setObject(1, suporte);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getInt(1)).isZero();
                }
            }
            c.rollback();
        }
    }
}
