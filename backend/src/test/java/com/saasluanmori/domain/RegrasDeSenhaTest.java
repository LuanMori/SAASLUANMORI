package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** {@code validarSenhaNova} do sistema antigo ({@code legacy/core/src/usuario.ts:70-82}). */
class RegrasDeSenhaTest {

    @Test
    void tamanho() {
        assertThat(RegrasDeSenha.validar("1234567", null, null)).contains("A senha precisa ter pelo menos 8 caracteres.");
        assertThat(RegrasDeSenha.validar(null, null, null)).contains("A senha precisa ter pelo menos 8 caracteres.");
        assertThat(RegrasDeSenha.validar("a".repeat(129), null, null)).contains("A senha pode ter até 128 caracteres.");
        assertThat(RegrasDeSenha.validar("boa-senha-9", null, null)).isEmpty();
    }

    @Test
    void senhasFaceis() {
        assertThat(RegrasDeSenha.validar("Flamengo", null, null)).contains("Esta senha é fácil de adivinhar. Escolha outra.");
        assertThat(RegrasDeSenha.validar("aaaaaaaa", null, null)).contains("Esta senha é fácil de adivinhar. Escolha outra.");
        // como no JavaScript: o emoji são duas unidades UTF-16 diferentes, então não é "um caractere repetido"
        assertThat(RegrasDeSenha.validar("😀😀😀😀", null, null)).isEmpty();
    }

    @Test
    void naoPodeTerOLoginNemONome() {
        assertThat(RegrasDeSenha.validar("xxanaclaraxx", "anaclara", null)).contains("A senha não pode ter o seu usuário ou o seu nome.");
        // login com menos de 4 caracteres não conta
        assertThat(RegrasDeSenha.validar("xxanaxxxyyy", "ana", null)).isEmpty();
        // o nome sem espaços, inclusive o espaço não separável
        assertThat(RegrasDeSenha.validar("12anapaula34", null, " Ana Paula ")).contains("A senha não pode ter o seu usuário ou o seu nome.");
    }
}
