package com.saasluanmori.web;

import com.saasluanmori.domain.TextoJs;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** A logo provisória da loja na barra: "Pet Shop da Ana" → "PA"; "Loja A" → "LA" ({@code BarraLateral.tsx:30-38}). */
public final class Iniciais {

    private static final Pattern UMA_LETRA = Pattern.compile("^[A-Z0-9]$");

    private Iniciais() {
    }

    public static String de(String nome) {
        String limpo = TextoJs.trim(nome);
        List<String> partes = new ArrayList<>();
        for (String p : limpo.split(TextoJs.ESPACO + "+", -1)) {
            if (p.length() > 2 || UMA_LETRA.matcher(p).matches()) {
                partes.add(p);
            }
        }
        List<String> escolhidas = partes.size() > 1 ? List.of(partes.get(0), partes.get(partes.size() - 1)) : partes;
        StringBuilder letras = new StringBuilder();
        for (String p : escolhidas) {
            letras.append(p.isEmpty() ? "" : String.valueOf(p.charAt(0)));
        }
        String r = letras.length() > 0 ? letras.toString() : limpo.isEmpty() ? "" : String.valueOf(limpo.charAt(0));
        r = r.toUpperCase(Locale.ROOT);
        return r.isEmpty() ? "?" : r;
    }

    /** A inicial da pessoa no avatar ({@code BarraLateral.tsx:93}): a primeira letra do nome, maiúscula, ou "?". */
    public static String daPessoa(String nome) {
        String limpo = TextoJs.trim(nome);
        return limpo.isEmpty() ? "?" : String.valueOf(limpo.charAt(0)).toUpperCase(Locale.ROOT);
    }
}
