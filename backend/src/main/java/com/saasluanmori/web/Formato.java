package com.saasluanmori.web;

/** Os textos de quantidade das telas antigas ({@code legacy/web/src/painel/formato.ts}). */
public final class Formato {

    private Formato() {
    }

    /** {@code plural(n, um, varios)}: "1 ativo", "2 ativos", "0 ativos" ({@code formato.ts:45}). */
    public static String plural(long n, String um, String varios) {
        return n + " " + (n == 1 ? um : varios);
    }
}
