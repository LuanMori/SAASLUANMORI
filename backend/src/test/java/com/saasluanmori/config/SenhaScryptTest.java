package com.saasluanmori.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.text.Normalizer;
import org.junit.jupiter.api.Test;

/** O codificador de senhas confere os hashes do servidor antigo e grava no mesmo formato. */
class SenhaScryptTest {

    /** Gerados com o {@code crypto.scrypt} do Node, a mesma função do servidor antigo (sal 00..0f). */
    private static final String ANTIGO_CUSTO_10 = "scrypt$10$8$1$AAECAwQFBgcICQoLDA0ODw$D-dxq_dITMegd0NJywv9utBHSHJS2KTB00rPLqsjPKc";
    private static final String ANTIGO_CUSTO_15 = "scrypt$15$8$1$AAECAwQFBgcICQoLDA0ODw$lxUS-nbR68MgRA3FC07cVY33MGYKQLV3LMM-lwPfjB8";

    private final SenhaScrypt senhas = new SenhaScrypt(10);

    @Test
    void confereOsHashesDoServidorAntigo() {
        assertThat(senhas.matches("Ação-çã-senha", ANTIGO_CUSTO_10)).isTrue();
        assertThat(senhas.matches("senha-certa-123", ANTIGO_CUSTO_15)).isTrue();
        assertThat(senhas.matches("senha-errada-123", ANTIGO_CUSTO_15)).isFalse();
    }

    @Test
    void normalizaEmNfcAntes() {
        String decomposta = Normalizer.normalize("Ação-çã-senha", Normalizer.Form.NFD);
        assertThat(decomposta).isNotEqualTo("Ação-çã-senha");
        assertThat(senhas.matches(decomposta, ANTIGO_CUSTO_10)).isTrue();
    }

    @Test
    void gravaNoFormatoAntigoComSalNovoACadaVez() {
        String a = senhas.encode("minha-senha-boa");
        String b = senhas.encode("minha-senha-boa");
        assertThat(a).matches("^scrypt\\$10\\$8\\$1\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$");
        assertThat(a).isNotEqualTo(b);
        assertThat(senhas.matches("minha-senha-boa", a)).isTrue();
        assertThat(new SenhaScrypt(15).matches("minha-senha-boa", a)).isTrue();
    }

    @Test
    void textoGuardadoForaDoFormatoNuncaConfere() {
        assertThat(senhas.matches("x", null)).isFalse();
        assertThat(senhas.matches("x", "")).isFalse();
        assertThat(senhas.matches("senha-certa-123", ANTIGO_CUSTO_15.replace("scrypt$15", "bcrypt$15"))).isFalse();
        assertThat(senhas.matches("senha-certa-123", ANTIGO_CUSTO_15.replace("$15$", "$9$"))).isFalse();
        assertThat(senhas.matches("senha-certa-123", ANTIGO_CUSTO_15.replace("$1$AAEC", "$5$AAEC"))).isFalse();
        assertThat(senhas.matches("senha-certa-123", "scrypt$15$8$1$AAEC$lxUS")).isFalse();
    }

    @Test
    void custoForaDosLimites() {
        assertThatThrownBy(() -> new SenhaScrypt(9)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SenhaScrypt(21)).isInstanceOf(IllegalArgumentException.class);
    }
}
