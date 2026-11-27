package com.saasluanmori.domain;

/**
 * CNPJ e CPF como o sistema antigo confere e mostra ({@code legacy/core/src/fornecedor.ts:33-52} e
 * {@code legacy/core/src/cliente.ts:99-110}; {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8): só os dígitos contam,
 * os dois dígitos verificadores precisam estar certos e um número com todos os dígitos iguais não vale.
 */
public final class Documento {

    private static final int[] PESOS_12 = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
    private static final int[] PESOS_13 = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

    private Documento() {
    }

    /** CNPJ com os dígitos verificadores certos (14 dígitos, não todos iguais). */
    public static boolean cnpjValido(String cnpj) {
        String d = TextoJs.soDigitos(cnpj);
        if (d.length() != 14 || todosIguais(d)) {
            return false;
        }
        return digitoDoCnpj(d.substring(0, 12)) == valor(d, 12) && digitoDoCnpj(d.substring(0, 13)) == valor(d, 13);
    }

    /** CPF com os dois dígitos verificadores certos (11 dígitos, não todos iguais). */
    public static boolean cpfValido(String cpf) {
        String d = TextoJs.soDigitos(cpf);
        if (d.length() != 11 || todosIguais(d)) {
            return false;
        }
        return digitoDoCpf(d, 9) == valor(d, 9) && digitoDoCpf(d, 10) == valor(d, 10);
    }

    /** Para mostrar: "12.345.678/0001-95", "529.982.247-25" ou, fora disso, só os dígitos. */
    public static String formatar(String documento) {
        String d = TextoJs.soDigitos(documento);
        if (d.length() == 14) {
            return d.substring(0, 2) + "." + d.substring(2, 5) + "." + d.substring(5, 8) + "/" + d.substring(8, 12) + "-" + d.substring(12);
        }
        if (d.length() == 11) {
            return d.substring(0, 3) + "." + d.substring(3, 6) + "." + d.substring(6, 9) + "-" + d.substring(9);
        }
        return d;
    }

    private static int digitoDoCnpj(String base) {
        int[] pesos = base.length() == 12 ? PESOS_12 : PESOS_13;
        int soma = 0;
        for (int i = 0; i < pesos.length; i++) {
            soma += pesos[i] * valor(base, i);
        }
        int r = soma % 11;
        return r < 2 ? 0 : 11 - r;
    }

    private static int digitoDoCpf(String d, int n) {
        int soma = 0;
        for (int i = 0; i < n; i++) {
            soma += valor(d, i) * (n + 1 - i);
        }
        int r = soma * 10 % 11;
        return r == 10 ? 0 : r;
    }

    private static boolean todosIguais(String d) {
        return d.chars().allMatch(c -> c == d.charAt(0));
    }

    private static int valor(String d, int i) {
        return d.charAt(i) - '0';
    }
}
