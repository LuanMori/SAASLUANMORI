package com.saasluanmori.domain;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * O endereço de cada loja: {@code <subdomínio>.<domínio do SaaS>} ({@code legacy/core/src/loja.ts:1-43}). É por ele que
 * o servidor sabe em qual loja a pessoa está entrando, nunca pelo que a tela manda (quando há {@code DOMINIO_BASE}).
 */
public final class Subdominio {

    public static final Pattern FORMATO = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$");

    /** Endereços que ficam para o próprio sistema (site, painel, API). */
    public static final List<String> RESERVADOS = List.of("www", "app", "api", "login", "admin");

    public static final String MENSAGEM_FORMATO = "O endereço da loja tem até 63 letras minúsculas, números ou hífen (sem acento, sem espaço, sem hífen nas pontas).";

    /** O resultado da validação: o endereço normalizado, ou a mensagem do erro. */
    public record Resultado(String valor, String erro) {
        public boolean ok() {
            return erro == null;
        }
    }

    private Subdominio() {
    }

    public static Resultado validar(String valor) {
        String s = valor == null ? "" : valor.strip().toLowerCase(Locale.ROOT);
        if (!FORMATO.matcher(s).matches()) {
            return new Resultado(null, MENSAGEM_FORMATO);
        }
        if (RESERVADOS.contains(s)) {
            return new Resultado(null, "\"" + s + "\" é reservado. Escolha outro endereço.");
        }
        return new Resultado(s, null);
    }

    /**
     * O subdomínio da loja a partir do endereço acessado (cabeçalho Host), ou nulo se o endereço não for de uma loja
     * deste domínio. "LojaA.NomeDaEmpresa.com.br:443" → "lojaa"; "a.b.nomedaempresa.com.br" → nulo.
     */
    public static String doEndereco(String host, String dominioBase) {
        String h = (host == null ? "" : host).strip().toLowerCase(Locale.ROOT).replaceFirst(":\\d+$", "").replaceFirst("\\.$", "");
        String sufixo = "." + dominioBase.toLowerCase(Locale.ROOT);
        if (!h.endsWith(sufixo)) {
            return null;
        }
        Resultado r = validar(h.substring(0, h.length() - sufixo.length()));
        return r.ok() ? r.valor() : null;
    }
}
