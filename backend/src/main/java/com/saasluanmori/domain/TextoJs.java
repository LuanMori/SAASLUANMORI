package com.saasluanmori.domain;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * As regras do sistema antigo foram escritas em JavaScript, e algumas funções de texto do Java não fazem exatamente o
 * mesmo. Aqui ficam as equivalentes exatas, para as regras darem o mesmo resultado:
 * <ul>
 *   <li>{@code String.prototype.trim()} tira o espaço em branco do JavaScript (que inclui o espaço não separável
 *       U+00A0, U+202F e U+FEFF), e não o {@code Character.isWhitespace} do Java;</li>
 *   <li>{@code \s} de uma expressão regular do JavaScript é esse mesmo conjunto;</li>
 *   <li>{@code \D} (sem a opção {@code u}) é tudo que não for 0 a 9: os dígitos de outras escritas também saem.</li>
 * </ul>
 * O tamanho de um texto é o {@code length} do JavaScript, em unidades UTF-16, que é o {@link String#length()} do Java.
 */
public final class TextoJs {

    /** O {@code \s} do JavaScript: espaços, tabulação, quebras de linha e os espaços do Unicode. */
    public static final String ESPACO = "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";

    /** {@code CONTROLE} do sistema antigo: os caracteres de controle ({@code legacy/core/src/interno.ts:5}). */
    public static final Pattern CONTROLE = Pattern.compile("[\\u0000-\\u001f\\u007f]");

    private static final Pattern NAS_PONTAS = Pattern.compile("^" + ESPACO + "+|" + ESPACO + "+\\z");
    private static final Pattern ESPACOS = Pattern.compile(ESPACO + "+");
    private static final Pattern NAO_DIGITO = Pattern.compile("[^0-9]");

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

    /**
     * Uma linha de texto como as regras antigas guardam: em NFC ("ç" do Mac = "ç" do Windows), sem espaço nas pontas e
     * com os espaços de dentro juntados num só ({@code v.normalize('NFC').trim().replace(/\s+/g, ' ')},
     * {@code legacy/core/src/fornecedor.ts:54}).
     */
    public static String linha(String texto) {
        return trocarEspacos(trim(Normalizer.normalize(texto, Normalizer.Form.NFC)), " ");
    }

    /** Tem caractere de controle? ({@code CONTROLE.test(texto)}). */
    public static boolean temControle(String texto) {
        return CONTROLE.matcher(texto).find();
    }

    /** {@code soDigitos}: "529.982.247-25" vira "52998224725" ({@code legacy/core/src/interno.ts:9-10}). */
    public static String soDigitos(String texto) {
        return texto == null ? "" : NAO_DIGITO.matcher(texto).replaceAll("");
    }
}
