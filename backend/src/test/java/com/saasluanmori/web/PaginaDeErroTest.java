package com.saasluanmori.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.saasluanmori.teste.BancoDeTeste;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** A página de erro do servidor, com o servidor de verdade (o MockMvc não passa pela página de erro do contêiner). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PaginaDeErroTest {

    @LocalServerPort
    private int porta;

    @DynamicPropertySource
    static void banco(DynamicPropertyRegistry registro) {
        BancoDeTeste.preparar(registro);
    }

    @Test
    void enderecoQueNaoExisteMostraAMensagemDoServidorAntigo() throws Exception {
        HttpResponse<String> r = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + porta + "/css/nao-existe.css")).header("Accept", "text/html").build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(404);
        assertThat(r.body()).contains("<p role=\"alert\">Rota não encontrada.</p>", "Tentar de novo", "<title>Nome da empresa</title>");
        assertThat(r.headers().firstValue("Content-Security-Policy")).isPresent();
    }
}
