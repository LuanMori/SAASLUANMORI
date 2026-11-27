package com.saasluanmori.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** O cookie da sessão como o servidor antigo escrevia ({@code legacy/api/src/auth/cookies.ts:1-51}). */
class CookieDaSessaoTest {

    private static Ambiente amb(boolean seguro) {
        return new Ambiente(seguro, null, 30, 12, 1, List.of());
    }

    @Test
    void cabecalhos() {
        assertThat(CookieDaSessao.cabecalho(amb(true), "x")).isEqualTo("__Host-sessao=x; Path=/; HttpOnly; SameSite=Strict; Secure");
        assertThat(CookieDaSessao.cabecalho(amb(false), "x")).isEqualTo("sessao=x; Path=/; HttpOnly; SameSite=Strict");
        assertThat(CookieDaSessao.apagado(amb(true))).isEqualTo("__Host-sessao=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
        assertThat(CookieDaSessao.apagado(amb(false))).isEqualTo("sessao=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    }

    @Test
    void leitura() {
        UUID loja = UUID.randomUUID();
        String segredo = CookieDaSessao.novoSegredo();
        assertThat(segredo).hasSize(43);
        assertThat(CookieDaSessao.ler(loja.toString().toUpperCase() + "." + segredo)).get().isEqualTo(new CookieDaSessao.Lido(loja, segredo));
        assertThat(CookieDaSessao.ler("nao-e-uuid." + segredo)).isEmpty();
        assertThat(CookieDaSessao.ler(loja + "." + segredo + "x")).isEmpty();
        assertThat(CookieDaSessao.ler(loja + segredo)).isEmpty();
        assertThat(CookieDaSessao.ler("x".repeat(201))).isEmpty();
        assertThat(CookieDaSessao.hashDoSegredo("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
