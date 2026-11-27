package com.saasluanmori.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.core.env.Environment;

/**
 * A configuração que vem do ambiente, com as mesmas variáveis, padrões, limites e mensagens do servidor antigo
 * ({@code legacy/api/src/config/ambiente.ts:1-70}). Falha cedo, citando só os NOMES das variáveis com problema, nunca
 * os valores.
 *
 * @param cookieSeguro         cookie de sessão só por HTTPS (Secure + prefixo {@code __Host-}); padrão ligado
 * @param dominioBase          domínio do SaaS (ex.: nomedaempresa.com.br); com ele, a loja vem do endereço acessado;
 *                             nulo em desenvolvimento (a tela de entrada pede a loja)
 * @param sessaoInatividadeMin minutos sem uso até a sessão cair (padrão 30, de 5 a 1440)
 * @param sessaoMaximaHoras    horas até a sessão cair de qualquer jeito (padrão 12, de 1 a 72)
 * @param saltosDeProxy        quantos proxies confiáveis há na frente do servidor (padrão 1, de 0 a 5): define o IP real
 * @param origensWeb           outras origens liberadas na conferência de origem (pode ficar vazio)
 */
public record Ambiente(
        boolean cookieSeguro,
        String dominioBase,
        int sessaoInatividadeMin,
        int sessaoMaximaHoras,
        int saltosDeProxy,
        List<String> origensWeb) {

    private static final Pattern DOMINIO = Pattern.compile("^[a-z0-9-]+(\\.[a-z0-9-]+)+$");

    public Ambiente {
        origensWeb = List.copyOf(origensWeb);
    }

    /** Lê e confere as variáveis (os nomes são os mesmos do servidor antigo). */
    public static Ambiente ler(Environment env) {
        String seguro = texto(env, "COOKIE_SEGURO").toLowerCase(Locale.ROOT);
        if (!seguro.isEmpty() && !seguro.equals("true") && !seguro.equals("false")) {
            throw new IllegalStateException("COOKIE_SEGURO deve ser true ou false.");
        }
        String dominio = texto(env, "DOMINIO_BASE").toLowerCase(Locale.ROOT).replaceAll("^\\.+|\\.+$", "");
        if (!dominio.isEmpty() && !DOMINIO.matcher(dominio).matches()) {
            throw new IllegalStateException("DOMINIO_BASE inválido (ex.: nomedaempresa.com.br, sem https://).");
        }
        List<String> origens = Arrays.stream(texto(env, "WEB_ORIGINS").split(","))
                .map(String::trim)
                .filter(o -> !o.isEmpty())
                .toList();
        return new Ambiente(
                !seguro.equals("false"),
                dominio.isEmpty() ? null : dominio,
                inteiro(env, "SESSAO_INATIVIDADE_MIN", 30, 5, 24 * 60),
                inteiro(env, "SESSAO_MAXIMA_HORAS", 12, 1, 72),
                inteiro(env, "SALTOS_DE_PROXY", 1, 0, 5),
                origens);
    }

    private static String texto(Environment env, String nome) {
        String v = env.getProperty(nome);
        return v == null ? "" : v.trim();
    }

    private static int inteiro(Environment env, String nome, int padrao, int min, int max) {
        String bruto = texto(env, nome);
        if (bruto.isEmpty()) {
            return padrao;
        }
        try {
            int n = Integer.parseInt(bruto);
            if (n >= min && n <= max) {
                return n;
            }
        } catch (NumberFormatException e) {
            // cai na mensagem abaixo
        }
        throw new IllegalStateException(nome + " inválida (use um número de " + min + " a " + max + ").");
    }

    /** Nome do cookie da sessão ({@code legacy/api/src/auth/cookies.ts:16}). */
    public String nomeDoCookie() {
        return cookieSeguro ? "__Host-sessao" : "sessao";
    }
}
