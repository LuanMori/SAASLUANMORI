package com.saasluanmori.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Os papéis ({@code legacy/core/src/papeis.ts:11-54}). O Adm. Sup ({@code super_admin}) é o usuário mestre do suporte:
 * não pertence a nenhuma loja, entra em qualquer uma e, para a loja, aparece como "Suporte".
 */
public enum Papel {
    SUPER_ADMIN("super_admin", "Adm. Sup"),
    DONO("dono", "Dono"),
    ADMINISTRADOR("administrador", "Administrador"),
    VENDEDOR("vendedor", "Vendedor"),
    PERSONALIZADO("personalizado", "Personalizado");

    /** Como o Adm. Sup aparece para a loja: no histórico, nas vendas e em tudo o que ele fizer. */
    public static final String NOME_SUPORTE = "Suporte";

    /** Papéis de quem trabalha numa loja, na ordem da tela. */
    public static final List<Papel> DE_LOJA = List.of(DONO, ADMINISTRADOR, VENDEDOR, PERSONALIZADO);

    private final String valor;
    private final String rotulo;

    Papel(String valor, String rotulo) {
        this.valor = valor;
        this.rotulo = rotulo;
    }

    /** O valor guardado no banco e usado nas regras ("dono", "super_admin"...). */
    public String valor() {
        return valor;
    }

    /** "Dono", "Personalizado"... e "Adm. Sup" para o usuário mestre ({@code nomeDoPapel}). */
    public String rotulo() {
        return rotulo;
    }

    public boolean ehDeLoja() {
        return this != SUPER_ADMIN;
    }

    /** Dono, Administrador ou o Adm. Sup (os "gestores" do DaniPets) ({@code papeis.ts:41}). */
    public boolean ehGestor() {
        return this == DONO || this == ADMINISTRADOR || this == SUPER_ADMIN;
    }

    /** Só o Dono; o Adm. Sup vê tudo, então também ({@code papeis.ts:44}). */
    public boolean ehDono() {
        return this == DONO || this == SUPER_ADMIN;
    }

    public static Optional<Papel> deValor(String valor) {
        return Arrays.stream(values()).filter(p -> p.valor.equals(valor)).findFirst();
    }
}
