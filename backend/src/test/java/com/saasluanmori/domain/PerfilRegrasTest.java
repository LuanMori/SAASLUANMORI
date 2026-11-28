package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.saasluanmori.domain.Acessos.Acesso;
import com.saasluanmori.domain.Acessos.ComoSaiu;
import com.saasluanmori.domain.Acessos.RegistroDeSessao;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/**
 * A foto do perfil e as entradas e saídas, com os mesmos casos dos testes do sistema antigo
 * ({@code legacy/core/test/perfil.test.ts}; {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §4).
 */
class PerfilRegrasTest {

    private static final String PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    @Test
    void aFotoAceitaPngJpegEWebpEVazioTiraAFoto() {
        assertThat(FotoDoPerfil.ler(List.of(PNG))).isEqualTo(new FotoDoPerfil.Lida(PNG, null));
        assertThat(FotoDoPerfil.ler(List.of("data:image/jpeg;base64,/9j/4AAQ")).ok()).isTrue();
        assertThat(FotoDoPerfil.ler(List.of("data:image/webp;base64,UklGRg==")).ok()).isTrue();
        assertThat(FotoDoPerfil.ler(null)).isEqualTo(new FotoDoPerfil.Lida(null, null));
        assertThat(FotoDoPerfil.ler(List.of())).isEqualTo(new FotoDoPerfil.Lida(null, null));
        assertThat(FotoDoPerfil.ler(List.of(""))).isEqualTo(new FotoDoPerfil.Lida(null, null));
    }

    @Test
    void aFotoRecusaOutroFormatoEAGrandeDemais() {
        ErroCampo formato = new ErroCampo("foto", "A foto precisa ser uma imagem PNG, JPEG ou WebP.");
        for (String v : List.of("data:image/svg+xml;base64,PHN2Zz4=", "https://exemplo.com/foto.png", "data:image/png;base64,<script>",
                // o $ do JavaScript não aceita a quebra de linha no fim
                PNG + "\n")) {
            assertThat(FotoDoPerfil.ler(List.of(v)).erro()).as(v).isEqualTo(formato);
        }
        // no formulário, "não é texto" é o campo mandado mais de uma vez
        assertThat(FotoDoPerfil.ler(List.of(PNG, PNG)).erro()).isEqualTo(formato);
        String grande = "data:image/jpeg;base64," + "A".repeat(FotoDoPerfil.MAX_CARACTERES);
        assertThat(FotoDoPerfil.ler(List.of(grande)).erro()).isEqualTo(new ErroCampo("foto", "A foto é grande demais. Use uma imagem menor (até 100 KB)."));
        String noLimite = "data:image/jpeg;base64," + "A".repeat(FotoDoPerfil.MAX_CARACTERES - "data:image/jpeg;base64,".length());
        assertThat(FotoDoPerfil.ler(List.of(noLimite)).ok()).isTrue();
    }

    private static RegistroDeSessao entrou(String quando) {
        return new RegistroDeSessao("sessao.entrou", Instant.parse(quando), Map.of());
    }

    private static RegistroDeSessao saiu(String quando, String motivo) {
        return new RegistroDeSessao("sessao.saiu", Instant.parse(quando), motivo == null ? Map.of() : Map.of("motivo", motivo));
    }

    private static Instant t(String quando) {
        return Instant.parse(quando);
    }

    @Test
    void cadaEntradaComASaidaSeguinteDaMaisRecenteParaAMaisAntiga() {
        List<Acesso> r = Acessos.daPessoa(List.of(
                entrou("2026-11-24T11:00:00.000Z"),
                saiu("2026-11-24T15:30:00.000Z", null),
                entrou("2026-11-25T11:02:00.000Z"),
                saiu("2026-11-25T13:10:00.000Z", "inatividade"),
                // outras ações não entram
                new RegistroDeSessao("venda.desconto", t("2026-11-25T13:20:00.000Z"), Map.of()),
                entrou("2026-11-25T17:00:00.000Z")), Acessos.MAX);
        assertThat(r).containsExactly(
                new Acesso(t("2026-11-25T17:00:00.000Z"), null, null, true),
                new Acesso(t("2026-11-25T11:02:00.000Z"), t("2026-11-25T13:10:00.000Z"), ComoSaiu.INATIVIDADE, false),
                new Acesso(t("2026-11-24T11:00:00.000Z"), t("2026-11-24T15:30:00.000Z"), ComoSaiu.SAIR, false));
    }

    @Test
    void duasEntradasSeguidasESaidaSemEntrada() {
        List<Acesso> r = Acessos.daPessoa(List.of(
                saiu("2026-11-20T12:00:00.000Z", null),
                entrou("2026-11-21T11:00:00.000Z"),
                entrou("2026-11-22T11:00:00.000Z"),
                saiu("2026-11-22T12:00:00.000Z", null)), Acessos.MAX);
        assertThat(r).containsExactly(
                new Acesso(t("2026-11-22T11:00:00.000Z"), t("2026-11-22T12:00:00.000Z"), ComoSaiu.SAIR, false),
                new Acesso(t("2026-11-21T11:00:00.000Z"), null, null, false),
                new Acesso(null, t("2026-11-20T12:00:00.000Z"), ComoSaiu.SAIR, false));
    }

    @Test
    void foraDeOrdemOrganizaPeloHorarioEMostraSoAsMaisRecentes() {
        List<RegistroDeSessao> registros = new ArrayList<>(IntStream.range(0, 40)
                .mapToObj(i -> entrou(String.format("2026-11-%02dT10:%02d:00.000Z", i % 28 + 1, i)))
                .toList());
        Collections.reverse(registros);
        List<Acesso> r = Acessos.daPessoa(registros, 5);
        assertThat(r).hasSize(5);
        assertThat(r.get(0).atual()).isTrue();
        assertThat(r).extracting(Acesso::entrada).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(Acessos.daPessoa(List.of(), Acessos.MAX)).isEmpty();
    }

    @Test
    void oTempoDeCadaAcessoEOTextoDaDuracao() {
        Instant agora = t("2026-11-25T18:30:00.000Z");
        assertThat(Acessos.minutos(new Acesso(t("2026-11-25T11:02:00.000Z"), t("2026-11-25T13:10:00.000Z"), ComoSaiu.SAIR, false), agora)).isEqualTo(128);
        assertThat(Acessos.minutos(new Acesso(t("2026-11-25T17:00:00.000Z"), null, null, true), agora)).isEqualTo(90);
        assertThat(Acessos.minutos(new Acesso(t("2026-11-21T11:00:00.000Z"), null, null, false), agora)).isNull();
        assertThat(Acessos.minutos(new Acesso(null, t("2026-11-20T12:00:00.000Z"), ComoSaiu.SAIR, false), agora)).isNull();
        // segundos não contam; relógio para trás não vira tempo negativo
        assertThat(Acessos.minutos(new Acesso(t("2026-11-25T18:00:00.000Z"), t("2026-11-25T18:00:59.999Z"), ComoSaiu.SAIR, false), agora)).isZero();
        assertThat(Acessos.minutos(new Acesso(t("2026-11-25T18:00:00.000Z"), t("2026-11-25T17:59:00.000Z"), ComoSaiu.SAIR, false), agora)).isNull();
        assertThat(List.of(0, 45, 60, 128, 600).stream().map(Acessos::formatarDuracao))
                .containsExactly("menos de 1 min", "45 min", "1 h", "2 h 08 min", "10 h");
    }

    @Test
    void asDatasEHorasNoFusoDaLoja() {
        // 02:30 UTC é 23:30 do dia anterior em São Paulo
        assertThat(Fuso.data(t("2026-11-25T02:30:00Z"), Fuso.PADRAO)).isEqualTo("24/11/2026");
        assertThat(Fuso.hora(t("2026-11-25T02:30:00Z"), Fuso.PADRAO)).isEqualTo("23:30");
        assertThat(Fuso.hora(t("2026-11-25T03:05:00Z"), Fuso.PADRAO)).isEqualTo("00:05");
    }
}
