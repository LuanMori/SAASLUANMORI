package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Login, endereço da loja, tentativas e o trim do JavaScript. */
class TextoELoginTest {

    @Test
    void trimComoNoJavaScript() {
        assertThat(TextoJs.trim("  ana ﻿")).isEqualTo("ana");
        // o NEL (U+0085) não é espaço no JavaScript
        assertThat(TextoJs.trim("ana \u0085")).isEqualTo("ana \u0085");
    }

    @Test
    void login() {
        assertThat(Login.validar("  Ana.Paula ")).contains("ana.paula");
        assertThat(Login.validar("a")).isEmpty();
        assertThat(Login.validar("_ana")).isEmpty();
        assertThat(Login.validar("a".repeat(41))).isEmpty();
    }

    @Test
    void enderecoDaLoja() {
        assertThat(Subdominio.validar("LojaA").valor()).isEqualTo("lojaa");
        assertThat(Subdominio.validar("-loja").erro()).isEqualTo(Subdominio.MENSAGEM_FORMATO);
        assertThat(Subdominio.validar("admin").erro()).isEqualTo("\"admin\" é reservado. Escolha outro endereço.");
        assertThat(Subdominio.doEndereco("LojaA.NomeDaEmpresa.com.br:443", "nomedaempresa.com.br")).isEqualTo("lojaa");
        assertThat(Subdominio.doEndereco("lojaa.nomedaempresa.com.br.", "nomedaempresa.com.br")).isEqualTo("lojaa");
        assertThat(Subdominio.doEndereco("a.b.nomedaempresa.com.br", "nomedaempresa.com.br")).isNull();
        assertThat(Subdominio.doEndereco("lojaa.outro.com.br", "nomedaempresa.com.br")).isNull();
    }

    @Test
    void tentativasEBloqueio() {
        Instant agora = Instant.parse("2026-11-27T12:00:00Z");
        Tentativas.Estado e = Tentativas.SEM_TENTATIVAS;
        for (int i = 1; i <= 4; i++) {
            Tentativas.AposErro r = Tentativas.aposSenhaErrada(e, agora);
            assertThat(r.bloqueou()).isFalse();
            e = r.estado();
        }
        Tentativas.AposErro quinta = Tentativas.aposSenhaErrada(e, agora);
        assertThat(quinta.bloqueou()).isTrue();
        assertThat(quinta.estado()).isEqualTo(new Tentativas.Estado(0, agora.plusSeconds(300)));
        assertThat(Tentativas.situacao(quinta.estado(), agora.plusMillis(1))).isEqualTo(new Tentativas.Situacao(true, 300));
        assertThat(Tentativas.situacao(quinta.estado(), agora.plusSeconds(300))).isEqualTo(new Tentativas.Situacao(false, 0));
        assertThat(Tentativas.mensagemBloqueado(241)).isEqualTo("Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.");
        assertThat(Tentativas.mensagemBloqueado(59)).isEqualTo("Muitas tentativas erradas. Tente de novo em 59 s ou peça ao dono para trocar sua senha.");
        assertThat(Tentativas.mensagemBloqueado(0)).isEqualTo("Muitas tentativas erradas. Tente de novo em 1 s ou peça ao dono para trocar sua senha.");
    }

    @Test
    void uuidVersao7() {
        java.util.UUID id = UuidV7.gerar(0x0123_4567_89ABL);
        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
        assertThat(id.getMostSignificantBits() >>> 16).isEqualTo(0x0123_4567_89ABL);
    }
}
