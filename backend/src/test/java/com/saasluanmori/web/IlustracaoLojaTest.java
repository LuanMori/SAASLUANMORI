package com.saasluanmori.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * A ilustração gerada em Java é a MESMA da demonstração congelada, byte a byte. A referência foi tirada da própria
 * demonstração aberta no navegador ({@code legacy/demo/sistema-padrao-demo.html}, decisão D5 de
 * {@code docs/migracao/06-RISCOS-E-DECISOES.md}) e guardada em {@code src/test/resources}.
 */
class IlustracaoLojaTest {

    @Test
    void igualADaDemonstracao() throws IOException {
        String referencia;
        try (InputStream in = getClass().getResourceAsStream("/ilustracao-loja-da-demonstracao.svg")) {
            assertThat(in).isNotNull();
            referencia = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        assertThat(IlustracaoLoja.svg()).isEqualTo(referencia);
    }

    @Test
    void numerosComoNoJavaScript() {
        assertThat(IlustracaoLoja.js(12)).isEqualTo("12");
        assertThat(IlustracaoLoja.js(-0.0)).isEqualTo("0");
        assertThat(IlustracaoLoja.js(12.5)).isEqualTo("12.5");
        assertThat(IlustracaoLoja.js(IlustracaoLoja.r(0.30000000000000004))).isEqualTo("0.3");
        assertThat(IlustracaoLoja.r(-1.25)).isEqualTo(-1.2);
        assertThat(IlustracaoLoja.r(1.25)).isEqualTo(1.3);
    }
}
