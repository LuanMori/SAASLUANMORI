package com.saasluanmori.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.domain.UuidV7;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * O isolamento dos fornecedores direto no banco, por SQL, sem passar pela aplicação (template da Fase 3 do prompt
 * mestre): a role {@code saas_app} só enxerga e só grava a loja da transação, não apaga e não muda a loja, o id nem a
 * criação de um fornecedor; e a tabela tem o RLS ligado e forçado com a policy do template.
 */
class IsolamentoFornecedoresTest extends TesteComBanco {

    private LojaDeTeste lojaA;
    private LojaDeTeste lojaB;
    private UUID daA;
    private UUID daB;

    @BeforeEach
    void cadastrar() {
        lojaA = DadosDeTeste.novaLoja("Loja A");
        lojaB = DadosDeTeste.novaLoja("Loja B");
        daA = novoFornecedor(lojaA.id(), "Distribuidora da A", "11222333000181");
        daB = novoFornecedor(lojaB.id(), "Distribuidora da B", "11222333000181");
    }

    private static UUID novoFornecedor(UUID loja, String nome, String documento) {
        UUID id = UuidV7.gerar();
        DadosDeTeste.executar(loja.toString(), "INSERT INTO fornecedores (id, tenant_id, nome, documento) VALUES (?, ?, ?, ?)", id, loja, nome, documento);
        return id;
    }

    @Test
    void aTabelaTemORlsLigadoEForcadoComAPolicyDoTemplate() throws SQLException {
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA); Statement st = c.createStatement();
                ResultSet rs = st.executeQuery("SELECT c.relrowsecurity, c.relforcerowsecurity, p.polname, pg_get_expr(p.polqual, p.polrelid), "
                        + "pg_get_expr(p.polwithcheck, p.polrelid) FROM pg_class c JOIN pg_policy p ON p.polrelid = c.oid WHERE c.relname = 'fornecedores'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getBoolean(1)).as("RLS ligado").isTrue();
            assertThat(rs.getBoolean(2)).as("RLS forçado").isTrue();
            assertThat(rs.getString(3)).isEqualTo("fornecedores_tenant_isolation");
            assertThat(rs.getString(4)).isEqualTo("(tenant_id = (current_setting('app.tenant_id'::text))::uuid)");
            assertThat(rs.getString(5)).isEqualTo("(tenant_id = (current_setting('app.tenant_id'::text))::uuid)");
            assertThat(rs.next()).as("uma policy só").isFalse();
        }
        // as da fundação passaram a ter o mesmo nome
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA); Statement st = c.createStatement();
                ResultSet rs = st.executeQuery("SELECT polname FROM pg_policy WHERE polname LIKE '%_tenant_isolation' ORDER BY 1")) {
            List<String> nomes = new ArrayList<>();
            while (rs.next()) {
                nomes.add(rs.getString(1));
            }
            assertThat(nomes).containsExactly("auditoria_tenant_isolation", "fornecedores_tenant_isolation", "sessoes_tenant_isolation", "usuarios_tenant_isolation");
        }
    }

    @Test
    void semLojaNaTransacaoOBancoDaErro() throws SQLException {
        try (Connection c = conectarComoApp(); Statement st = c.createStatement()) {
            assertThatThrownBy(() -> st.executeQuery("SELECT nome FROM fornecedores")).isInstanceOf(SQLException.class).hasMessageContaining("app.tenant_id");
        }
    }

    @Test
    void cadaLojaSoEnxergaOsDela() throws SQLException {
        try (Connection c = conectarComoApp()) {
            c.setAutoCommit(false);
            definirLoja(c, lojaA.id());
            assertThat(nomes(c, "SELECT nome FROM fornecedores")).containsExactly("Distribuidora da A");
            // nem pedindo a outra loja ou o fornecedor dela pelo id
            assertThat(nomes(c, "SELECT nome FROM fornecedores WHERE tenant_id = '" + lojaB.id() + "' OR id = '" + daB + "'")).isEmpty();
            c.rollback();
        }
    }

    @Test
    void naoGravaNemAlteraNaOutraLoja() throws SQLException {
        try (Connection c = conectarComoApp()) {
            c.setAutoCommit(false);
            definirLoja(c, lojaA.id());
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO fornecedores (id, tenant_id, nome) VALUES (?, ?, 'Invasor')")) {
                ps.setObject(1, UuidV7.gerar());
                ps.setObject(2, lojaB.id());
                assertThatThrownBy(ps::execute).isInstanceOf(SQLException.class).hasMessageContaining("row-level security");
            }
            c.rollback();
            definirLoja(c, lojaA.id());
            try (Statement st = c.createStatement()) {
                // o da outra loja nem aparece para o UPDATE
                assertThat(st.executeUpdate("UPDATE fornecedores SET nome = 'Trocado' WHERE id = '" + daB + "'")).isZero();
            }
            c.rollback();
        }
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            definirLoja(c, lojaB.id());
            assertThat(nomes(c, "SELECT nome FROM fornecedores")).containsExactly("Distribuidora da B");
            c.rollback();
        }
    }

    @Test
    void aAplicacaoNaoApagaNemMudaALojaOIdOuACriacao() throws SQLException {
        try (Connection c = conectarComoApp()) {
            for (String sql : List.of("DELETE FROM fornecedores WHERE id = '" + daA + "'",
                    "UPDATE fornecedores SET tenant_id = '" + lojaB.id() + "' WHERE id = '" + daA + "'",
                    "UPDATE fornecedores SET id = '" + UuidV7.gerar() + "' WHERE id = '" + daA + "'",
                    "UPDATE fornecedores SET criado_em = now() WHERE id = '" + daA + "'",
                    "UPDATE fornecedores SET criado_por = NULL WHERE id = '" + daA + "'")) {
                c.setAutoCommit(false);
                definirLoja(c, lojaA.id());
                try (Statement st = c.createStatement()) {
                    assertThatThrownBy(() -> st.execute(sql)).as(sql).isInstanceOf(SQLException.class).hasMessageContaining("permission denied");
                }
                c.rollback();
            }
        }
    }

    @Test
    void oDocumentoNaoSeRepeteNaLojaMasPodeSeRepetirEmOutra() {
        // as duas lojas já têm o mesmo CNPJ (cadastrar); na mesma loja, o banco recusa
        assertThatThrownBy(() -> novoFornecedor(lojaA.id(), "Outra da A", "11222333000181"))
                .hasMessageContaining("fornecedores_tenant_id_documento_key");
        // sem documento, quantos forem
        novoFornecedor(lojaA.id(), "Sem documento 1", null);
        novoFornecedor(lojaA.id(), "Sem documento 2", null);
    }

    @Test
    void oBancoConfereOFormatoDoDocumentoEDoTelefone() {
        // só os dígitos, 11 ou 14 (com a máscara, nem cabe na coluna)
        assertThatThrownBy(() -> novoFornecedor(lojaA.id(), "Formato", "1122233300018")).hasMessageContaining("fornecedores_documento_formato");
        assertThatThrownBy(() -> novoFornecedor(lojaA.id(), "Formato", "11.222.333/0001-81")).hasMessageContaining("character varying(14)");
        assertThatThrownBy(() -> DadosDeTeste.executar(lojaA.id().toString(),
                "INSERT INTO fornecedores (id, tenant_id, nome, telefone) VALUES (?, ?, 'Fone', '3333-4444')", UuidV7.gerar(), lojaA.id()))
                .hasMessageContaining("fornecedores_telefone_formato");
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

    private static List<String> nomes(Connection c, String sql) throws SQLException {
        List<String> r = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                r.add(rs.getString(1));
            }
        }
        return r;
    }
}
