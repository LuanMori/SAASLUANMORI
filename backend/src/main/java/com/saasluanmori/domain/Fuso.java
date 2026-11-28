package com.saasluanmori.domain;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * O fuso das datas e horas da loja: {@code FUSO_PADRAO} do sistema antigo, {@code America/Sao_Paulo}
 * ({@code legacy/core/src/venda.ts:95}), e os textos de {@code dataNoFuso} e {@code horaNoFuso}
 * ({@code legacy/web/src/painel/formato.ts:4-8}): "27/11/2026" e "14:05".
 */
public final class Fuso {

    public static final ZoneId PADRAO = ZoneId.of("America/Sao_Paulo");

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/uuuu");
    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");

    private Fuso() {
    }

    /** {@code dataNoFuso}: "27/11/2026". */
    public static String data(Instant quando, ZoneId fuso) {
        return DATA.format(quando.atZone(fuso));
    }

    /** {@code horaNoFuso}: "14:05". */
    public static String hora(Instant quando, ZoneId fuso) {
        return HORA.format(quando.atZone(fuso));
    }
}
