package com.saasluanmori.domain;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** O login (usuário) da pessoa ({@code legacy/core/src/usuario.ts:21-27,141-150}). */
public final class Login {

    /** Letras minúsculas, números, ponto, hífen e sublinhado; começa com letra ou número; de 2 a 40 caracteres. */
    public static final Pattern FORMATO = Pattern.compile("^[a-z0-9][a-z0-9._-]{1,39}$");

    public static final String MENSAGEM_FORMATO = "O usuário (login) tem de 2 a 40 letras minúsculas ou números, sem espaço (pode ter ponto, hífen e _).";

    private Login() {
    }

    /** O login é guardado e comparado sempre em minúsculas e sem espaço nas pontas. */
    public static String normalizar(String texto) {
        return texto.strip().toLowerCase(Locale.ROOT);
    }

    public static boolean noFormato(String login) {
        return FORMATO.matcher(login).matches();
    }

    /** O login normalizado, ou vazio se estiver fora do formato. */
    public static Optional<String> validar(String valor) {
        String login = valor == null ? "" : normalizar(valor);
        return noFormato(login) ? Optional.of(login) : Optional.empty();
    }
}
