package saas.core;

import java.math.BigInteger;

/** Porta da conversão monetária de packages/core/src/dinheiro.ts. */
public final class Dinheiro {
    public static final int CENTAVOS_MAX = Integer.MAX_VALUE;
    private Dinheiro() {}

    public static Integer reaisParaCentavos(String texto) {
        String limpo = texto.replaceAll("(?i)R\\$", "")
            .replaceAll("[\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]", "");
        if (limpo.isEmpty()) return null;
        String inteiro;
        String fracao;
        if (limpo.contains(",")) {
            String[] partes = limpo.split(",", -1);
            if (partes.length != 2) return null;
            inteiro = partes[0];
            fracao = partes[1];
            if (!inteiro.matches("[0-9]{1,3}(\\.[0-9]{3})*|[0-9]+")) return null;
            inteiro = inteiro.replace(".", "");
        } else if (limpo.matches("[0-9]{1,3}(\\.[0-9]{3})+")) {
            inteiro = limpo.replace(".", "");
            fracao = "";
        } else {
            String[] partes = limpo.split("\\.", -1);
            if (partes.length > 2) return null;
            inteiro = partes[0];
            fracao = partes.length == 2 ? partes[1] : "";
            if (!inteiro.matches("[0-9]+")) return null;
        }
        if (!fracao.matches("[0-9]{0,2}") || inteiro.isEmpty()) return null;
        int decimal = Integer.parseInt((fracao + "00").substring(0, 2));
        BigInteger centavos = new BigInteger(inteiro).multiply(BigInteger.valueOf(100)).add(BigInteger.valueOf(decimal));
        return centavos.compareTo(BigInteger.valueOf(CENTAVOS_MAX)) > 0 ? null : centavos.intValueExact();
    }
}
