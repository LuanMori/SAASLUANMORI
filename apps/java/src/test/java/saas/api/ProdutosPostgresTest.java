package saas.api;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "TESTE_PG_PRODUTOS", matches = "1")
class ProdutosPostgresTest {
    private Produtos produtos;
    private Autenticacao.Contexto lojaA, lojaB;

    private Autenticacao.Contexto criarLoja(JdbcTemplate admin) {
        UUID id = UUID.randomUUID();
        admin.update("insert into lojas (id, nome, auth0_org_id) values (?, ?, ?)", id, "Loja teste", "teste-" + id);
        return new Autenticacao.Contexto(id, UUID.randomUUID(), "vendedor", "vendedor-teste");
    }

    @BeforeEach void prepararLojas() {
        String url = System.getenv("TESTE_JDBC_URL");
        var admin = new JdbcTemplate(new DriverManagerDataSource(url, "postgres", System.getenv("PGPASSWORD")));
        lojaA = criarLoja(admin);
        lojaB = criarLoja(admin);
        var fonte = new DriverManagerDataSource(url, "saas_app", System.getenv("SAAS_APP_DB_PASSWORD"));
        produtos = new Produtos(new Banco(new JdbcTemplate(fonte), new DataSourceTransactionManager(fonte)));
    }

    @Test void preservaValoresCodigosEListagensDeCadaLoja() {
        var dados = Map.of("nome", "  Coleira  ", "precoCentavos", 1290, "codigoBarras", "0001");
        var a = produtos.criar(lojaA, dados);
        var b = produtos.criar(lojaB, dados);
        assertEquals("0002", a.codigoInterno());
        assertEquals("0002", b.codigoInterno());
        assertEquals("0001", a.codigoBarras());
        assertEquals("Coleira", a.nome());
        assertEquals(1290, a.precoCentavos());
        var erro = assertThrows(ErroApi.class, () -> produtos.criar(lojaA, dados));
        assertEquals(409, erro.status);
        assertEquals("codigoBarras", erro.erros.getFirst().campo());
        assertEquals(List.of(a), produtos.listar(lojaA));
        assertEquals(List.of(b), produtos.listar(lojaB));
    }

    @Test void cadastrosSimultaneosReservamCodigosDistintos() throws Exception {
        var pronto = new CountDownLatch(2);
        var iniciar = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var dados = Map.of("nome", "Produto", "precoCentavos", 50);
            java.util.concurrent.Callable<String> cadastrar = () -> {
                pronto.countDown();
                if (!iniciar.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Tempo de espera excedido");
                return produtos.criar(lojaA, dados).codigoInterno();
            };
            var primeiro = executor.submit(cadastrar);
            var segundo = executor.submit(cadastrar);
            assertTrue(pronto.await(5, TimeUnit.SECONDS));
            iniciar.countDown();
            assertEquals(Set.of("0001", "0002"), Set.of(primeiro.get(15, TimeUnit.SECONDS), segundo.get(15, TimeUnit.SECONDS)));
            assertEquals(2, produtos.listar(lojaA).size());
        } finally {
            iniciar.countDown();
            executor.shutdownNow();
        }
    }
}
