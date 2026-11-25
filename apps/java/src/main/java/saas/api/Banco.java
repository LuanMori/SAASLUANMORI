package saas.api;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public class Banco {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transacao;
    public Banco(JdbcTemplate jdbc, PlatformTransactionManager gerente) {
        this.jdbc = jdbc;
        this.transacao = new TransactionTemplate(gerente);
        if (!"saas_app".equals(jdbc.queryForObject("select current_user", String.class)))
            throw new IllegalStateException("A API exige a role saas_app.");
        Boolean insegura = jdbc.queryForObject("select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles where rolname = current_user", Boolean.class);
        if (!Boolean.FALSE.equals(insegura)) throw new IllegalStateException("Role da API insegura.");
    }
    public record Loja(UUID id, boolean ativa) {}
    public record Usuario(UUID id, String papel, boolean ativo) {}
    public Loja buscarLoja(String org) {
        return jdbc.query("select id, ativa from lojas where auth0_org_id = ?",
            (rs,n) -> new Loja(rs.getObject("id", UUID.class), rs.getBoolean("ativa")), org).stream().findFirst().orElse(null);
    }
    public Usuario buscarUsuario(UUID lojaId, String sub) {
        return comLoja(lojaId, tx -> tx.query("select id, papel, ativo from usuarios where loja_id = ? and auth0_sub = ?",
            (rs,n) -> new Usuario(rs.getObject("id", UUID.class), rs.getString("papel"), rs.getBoolean("ativo")),
            lojaId, sub).stream().findFirst().orElse(null));
    }
    public <T> T comLoja(UUID lojaId, Function<JdbcTemplate,T> operacao) {
        if (lojaId == null) throw new IllegalArgumentException("comLoja: lojaId inválido");
        return transacao.execute(status -> {
            jdbc.queryForObject("select set_config('app.loja_id', ?, true)", String.class, lojaId.toString());
            return operacao.apply(jdbc);
        });
    }
}
