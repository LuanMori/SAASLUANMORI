package saas.api;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import saas.core.Produto;
@Service
public class Produtos {
    private final Banco banco;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter ISO = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private static final String CAMPOS = "id, codigo_interno, codigo_barras, nome, preco_centavos, ativo, criado_em, atualizado_em";
    public record Publico(UUID id, String codigoInterno, String codigoBarras, String nome, int precoCentavos,
        boolean ativo, String criadoEm, String atualizadoEm) {}
    public Produtos(Banco banco) { this.banco = banco; }
    private Publico ler(ResultSet rs, int n) throws SQLException {
        return new Publico(rs.getObject("id", UUID.class), rs.getString("codigo_interno"), rs.getString("codigo_barras"),
            rs.getString("nome"), rs.getInt("preco_centavos"), rs.getBoolean("ativo"),
            ISO.format(rs.getObject("criado_em", OffsetDateTime.class).toInstant()),
            ISO.format(rs.getObject("atualizado_em", OffsetDateTime.class).toInstant()));
    }
    public List<Publico> listar(Autenticacao.Contexto ctx) {
        return banco.comLoja(ctx.lojaId(), tx -> tx.query(
            "select " + CAMPOS + " from produtos where loja_id = ? order by nome asc, id asc limit 1000", this::ler, ctx.lojaId()));
    }
    private String produtoComCodigo(JdbcTemplate tx, UUID loja, String codigo) {
        return tx.query("select nome from produtos where loja_id = ? and (codigo_interno = ? or codigo_barras = ?) limit 1",
            (rs,n) -> rs.getString(1), loja, codigo, codigo).stream().findFirst().orElse(null);
    }
    private String proximoCodigo(JdbcTemplate tx, UUID loja, String barras) {
        Long maior = tx.queryForObject("select max(codigo_interno::bigint) from produtos where loja_id = ?", Long.class, loja);
        double numero = (maior == null ? 0d : maior.doubleValue()) + 1;
        for (int i=0; i<1000; i++, numero++) {
            String candidato = Produto.formatarCodigoInterno(numero);
            if (!candidato.equals(barras) && produtoComCodigo(tx, loja, candidato) == null) return candidato;
        }
        throw new IllegalStateException("Não foi possível gerar o código interno.");
    }
    private UUID uuid7() {
        long ms = System.currentTimeMillis() & 0xffffffffffffL;
        return new UUID((ms << 16) | 0x7000L | (RANDOM.nextLong() & 0xfffL),
            (RANDOM.nextLong() & 0x3fffffffffffffffL) | 0x8000000000000000L);
    }
    public Publico criar(Autenticacao.Contexto ctx, Object entrada) {
        Produto.Resultado validacao = Produto.validarNovoProduto(entrada);
        if (!validacao.ok()) throw new ErroApi(400, "Dados do produto inválidos.", validacao.erros());
        Produto.NovoProduto novo = validacao.valor();
        UUID loja = ctx.lojaId();
        try {
            return banco.comLoja(loja, tx -> {
                tx.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, "produtos:codigos:" + loja);
                if (novo.codigoBarras() != null) {
                    String dono = produtoComCodigo(tx, loja, novo.codigoBarras());
                    if (dono != null) throw new ErroApi(409,
                        "Código de barras repetido: " + novo.codigoBarras() + " já está vinculado ao produto \"" + dono + "\".",
                        List.of(new Produto.ErroCampo("codigoBarras", "Já usado em \"" + dono + "\".")));
                }
                String codigo = proximoCodigo(tx, loja, novo.codigoBarras());
                return tx.queryForObject("insert into produtos (id, loja_id, codigo_interno, codigo_barras, nome, preco_centavos) values (?, ?, ?, ?, ?, ?) returning " + CAMPOS,
                    this::ler, uuid7(), loja, codigo, novo.codigoBarras(), novo.nome(), novo.precoCentavos());
            });
        } catch (DuplicateKeyException e) {
            throw new ErroApi(409, "Código já cadastrado nesta loja. Tente de novo.");
        }
    }
}
