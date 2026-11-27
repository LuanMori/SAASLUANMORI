package com.saasluanmori.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.Usuario;
import com.saasluanmori.repository.UsuarioRepository;
import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * O isolamento por loja no banco (regra 1.5: "query SQL direta, bypassando a camada de aplicação, confirma que o banco
 * bloqueia"), a conferência ao subir e o caminho da aplicação (JPA com a loja definida em cada transação).
 */
class IsolamentoNoBancoTest extends TesteComBanco {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private UsuarioRepository usuarios;

    @Autowired
    private TransactionTemplate transacao;

    private LojaDeTeste lojaA;
    private LojaDeTeste lojaB;

    @BeforeEach
    void cadastrar() {
        lojaA = DadosDeTeste.novaLoja("Loja A");
        lojaB = DadosDeTeste.novaLoja("Loja B");
        DadosDeTeste.novoUsuario(lojaA.id(), "ana", "Ana", Papel.DONO, null, true);
        DadosDeTeste.novoUsuario(lojaB.id(), "bia", "Bia", Papel.DONO, null, true);
    }

    @Test
    void aConexaoDaAplicacaoPassaNaConferencia() {
        assertThat(ConferenciaDoBanco.problemasDeSeguranca(new JdbcTemplate(dataSource))).isEmpty();
    }

    @Test
    void aConferenciaRecusaAConexaoDaRoleDona() throws SQLException {
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            List<String> problemas = ConferenciaDoBanco.problemasDeSeguranca(new JdbcTemplate(new SingleConnectionDataSource(c, true)));
            assertThat(problemas).containsExactly("A role da aplicação é dona de tabela(s): auditoria, flyway_schema_history, lojas, sessoes, usuarios.");
        }
    }

    @Test
    void semLojaNaTransacaoOBancoDaErro() throws SQLException {
        try (Connection c = conectarComoApp(); Statement st = c.createStatement()) {
            assertThatThrownBy(() -> st.executeQuery("SELECT usuario FROM usuarios"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("app.tenant_id");
        }
    }

    @Test
    void comALojaDefinidaSoAparecemOsDadosDela() throws SQLException {
        try (Connection c = conectarComoApp()) {
            c.setAutoCommit(false);
            definirLoja(c, lojaA.id());
            assertThat(logins(c, "SELECT usuario FROM usuarios WHERE usuario IN ('ana', 'bia')")).containsExactly("ana");
            // nem pedindo a outra loja pelo id
            assertThat(logins(c, "SELECT usuario FROM usuarios WHERE tenant_id = '" + lojaB.id() + "'")).isEmpty();
            c.rollback();
        }
    }

    @Test
    void naoGravaNaOutraLoja() throws SQLException {
        try (Connection c = conectarComoApp()) {
            c.setAutoCommit(false);
            definirLoja(c, lojaA.id());
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO auditoria (id, tenant_id, acao) VALUES (?, ?, 'teste')")) {
                ps.setObject(1, UUID.randomUUID());
                ps.setObject(2, lojaB.id());
                assertThatThrownBy(ps::execute).isInstanceOf(SQLException.class).hasMessageContaining("row-level security");
            }
            c.rollback();
        }
    }

    @Test
    void aAplicacaoNaoApagaNemAlteraOHistorico() throws SQLException {
        try (Connection c = conectarComoApp()) {
            c.setAutoCommit(false);
            definirLoja(c, lojaA.id());
            try (Statement st = c.createStatement()) {
                assertThatThrownBy(() -> st.execute("DELETE FROM auditoria")).isInstanceOf(SQLException.class).hasMessageContaining("permission denied");
            }
            c.rollback();
        }
    }

    @Test
    void oCaminhoDaAplicacaoSoEnxergaALojaDoContexto() {
        List<String> daA = TenantContext.comLoja(lojaA.id(), null,
                () -> transacao.execute(t -> usuarios.findAll().stream().map(Usuario::getUsuario).toList()));
        assertThat(daA).containsExactly("ana");
        List<String> daB = TenantContext.comLoja(lojaB.id(), null,
                () -> transacao.execute(t -> usuarios.findAll().stream().map(Usuario::getUsuario).toList()));
        assertThat(daB).containsExactly("bia");
    }

    @Test
    void semLojaNoContextoAAplicacaoNaoLeNada() {
        // conexão nova: "unrecognized configuration parameter" (42704); conexão do pool já usada por outra loja: o valor
        // voltou a vazio no fim da transação e "" não é um uuid (22P02). Nos dois casos, o banco recusa.
        assertThatThrownBy(() -> transacao.execute(t -> usuarios.findAll()))
                .rootCause()
                .isInstanceOf(SQLException.class)
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isIn("42704", "22P02"));
    }

    private static Connection conectarComoApp() throws SQLException {
        return BancoDeTeste.conectar(BancoDeTeste.APP, BancoDeTeste.APP_SENHA);
    }

    private static void definirLoja(Connection c, UUID loja) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            ps.setString(1, loja.toString());
            ps.execute();
        }
    }

    private static List<String> logins(Connection c, String sql) throws SQLException {
        List<String> r = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                r.add(rs.getString(1));
            }
        }
        return r;
    }
}
