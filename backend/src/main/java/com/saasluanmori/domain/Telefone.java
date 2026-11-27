package com.saasluanmori.domain;

/**
 * Telefone como o sistema antigo confere e mostra ({@code legacy/core/src/cliente.ts:112-126};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §12): fixo com 10 dígitos ou celular com 11 (com 9 depois do DDD), e o
 * DDD sem zero.
 */
public final class Telefone {

    private Telefone() {
    }

    public static boolean valido(String telefone) {
        String d = TextoJs.soDigitos(telefone);
        if (d.length() != 10 && d.length() != 11) {
            return false;
        }
        if (d.charAt(0) == '0' || d.charAt(1) == '0') {
            return false;
        }
        return d.length() == 10 || d.charAt(2) == '9';
    }

    /** Para mostrar: "(11) 98765-4321", "(11) 3456-7890" ou, fora disso, só os dígitos. */
    public static String formatar(String telefone) {
        String d = TextoJs.soDigitos(telefone);
        if (d.length() == 11) {
            return "(" + d.substring(0, 2) + ") " + d.substring(2, 7) + "-" + d.substring(7);
        }
        if (d.length() == 10) {
            return "(" + d.substring(0, 2) + ") " + d.substring(2, 6) + "-" + d.substring(6);
        }
        return d;
    }
}
