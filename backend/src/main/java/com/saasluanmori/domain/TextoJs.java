package com.saasluanmori.domain;

import java.util.regex.Pattern;

/**
 * As regras do sistema antigo foram escritas em JavaScript, e algumas funções de texto do Java não fazem exatamente o
 * mesmo. Aqui ficam as equivalentes exatas, para as regras darem o mesmo resultado:
 * <ul>
 *   <li>{@code String.prototype.trim()} tira o espaço em branco do JavaScript (que inclui o espaço não separável
 *       U+00A0, U+202F e U+FEFF), e não o {@code Character.isWhitespace} do Java;</li>
 *   <li>{@code \s} de uma expressão regular do JavaScript é esse mesmo conjunto.</li>
 * </ul>
 */
public final class TextoJs {

    /** O {@code \s} do JavaScript: espaços, tabulação, quebras de linha e os espaços do Unicode. */
    public static final String ESPACO = "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";

    private static final Pattern NAS_PONTAS = Pattern.compile("^" + ESPACO + "+|" + ESPACO + "+\\z");
    private static final Pattern ESPACOS = Pattern.compile(ESPACO + "+");

    private TextoJs() {
    }

    /** {@code texto.trim()}. */
    public static String trim(String texto) {
        return NAS_PONTAS.matcher(texto).replaceAll("");
    }

    /** {@code texto.replace(/\s+/g, troca)}. */
    public static String trocarEspacos(String texto, String troca) {
        return ESPACOS.matcher(texto).replaceAll(troca);
    }
}
