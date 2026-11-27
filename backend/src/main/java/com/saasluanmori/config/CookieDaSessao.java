package com.saasluanmori.config;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * O cookie da sessão ({@code legacy/api/src/auth/cookies.ts:1-51}). O navegador guarda {@code <loja>.<segredo>}; o
 * banco guarda só o SHA-256 do segredo (quem lê o banco não consegue entrar como ninguém). O id da loja vem junto só
 * para abrir a transação certa: trocar a loja do cookie não acha sessão nenhuma.
 * <ul>
 *   <li>HttpOnly: o JavaScript da página não lê;</li>
 *   <li>SameSite=Strict: outro site não consegue usar a sessão;</li>
 *   <li>Secure + prefixo {@code __Host-}: só por HTTPS, só neste endereço exato;</li>
 *   <li>sem Max-Age: some ao fechar o navegador.</li>
 * </ul>
 */
public final class CookieDaSessao {

    /** O que o cookie traz. */
    public record Lido(UUID lojaId, String segredo) {
    }

    private static final Pattern UUID_TEXTO = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern SEGREDO = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private CookieDaSessao() {
    }

    /** 32 bytes aleatórios (256 bits), em base64url sem preenchimento (43 caracteres). */
    public static String novoSegredo() {
        byte[] b = new byte[32];
        ALEATORIO.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    /** SHA-256 do segredo, em hexadecimal minúsculo (64 caracteres). */
    public static String hashDoSegredo(String segredo) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(segredo.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível.", e);
        }
    }

    public static String valor(UUID lojaId, String segredo) {
        return lojaId + "." + segredo;
    }

    /** Lê o valor: até 200 caracteres, id da loja no formato UUID e segredo com 43 caracteres base64url. */
    public static Optional<Lido> ler(String valor) {
        if (valor == null || valor.length() > 200) {
            return Optional.empty();
        }
        int ponto = valor.indexOf('.');
        if (ponto <= 0) {
            return Optional.empty();
        }
        String loja = valor.substring(0, ponto);
        String segredo = valor.substring(ponto + 1);
        if (!UUID_TEXTO.matcher(loja).matches() || !SEGREDO.matcher(segredo).matches()) {
            return Optional.empty();
        }
        return Optional.of(new Lido(UUID.fromString(loja.toLowerCase(Locale.ROOT)), segredo));
    }

    /**
     * O valor do cookie com este nome no cabeçalho {@code Cookie}. Com cookies repetidos, vale o primeiro (o mais
     * específico, pela regra dos navegadores).
     */
    public static Optional<String> doPedido(HttpServletRequest req, String nome) {
        for (java.util.Enumeration<String> cabecalhos = req.getHeaders("Cookie"); cabecalhos.hasMoreElements();) {
            for (String parte : cabecalhos.nextElement().split(";")) {
                int igual = parte.indexOf('=');
                if (igual > 0 && parte.substring(0, igual).trim().equals(nome)) {
                    return Optional.of(parte.substring(igual + 1).trim());
                }
            }
        }
        return Optional.empty();
    }

    /** O cabeçalho {@code Set-Cookie} da sessão. */
    public static String cabecalho(Ambiente amb, String valor) {
        return amb.nomeDoCookie() + "=" + valor + "; Path=/; HttpOnly; SameSite=Strict" + (amb.cookieSeguro() ? "; Secure" : "");
    }

    /** O cabeçalho {@code Set-Cookie} que apaga a sessão no navegador. */
    public static String apagado(Ambiente amb) {
        return amb.nomeDoCookie() + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (amb.cookieSeguro() ? "; Secure" : "");
    }
}
