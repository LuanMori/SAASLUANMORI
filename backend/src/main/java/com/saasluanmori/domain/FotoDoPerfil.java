package com.saasluanmori.domain;

import java.util.List;
import java.util.regex.Pattern;

/**
 * A foto do perfil (aba Meu usuário), com a conferência do sistema antigo ({@code legacy/core/src/perfil.ts:11-29};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §4): uma imagem PNG, JPEG ou WebP em data URL (base64), já reduzida pelo
 * navegador, com até 150.000 caracteres. Vazia = sem foto (tira a que havia). O banco confere o mesmo formato.
 */
public final class FotoDoPerfil {

    /** {@code LIMITES_FOTO.maxCaracteres}. */
    public static final int MAX_CARACTERES = 150_000;

    public static final String MENSAGEM_FORMATO = "A foto precisa ser uma imagem PNG, JPEG ou WebP.";
    public static final String MENSAGEM_GRANDE = "A foto é grande demais. Use uma imagem menor (até 100 KB).";

    /** {@code FORMATO_FOTO}; {@code \z} porque o {@code $} do JavaScript não aceita uma quebra de linha no fim. */
    private static final Pattern FORMATO = Pattern.compile("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}\\z");

    /** A foto conferida ({@code null} = sem foto) ou o problema. */
    public record Lida(String valor, ErroCampo erro) {

        public boolean ok() {
            return erro == null;
        }
    }

    private FotoDoPerfil() {
    }

    /**
     * {@code lerFotoDoPerfil}: o campo do formulário com os valores enviados. Sem valor ou vazio = sem foto; mais de
     * um valor não é um texto (a mensagem do formato, como no antigo).
     */
    public static Lida ler(List<String> valores) {
        if (valores == null || valores.isEmpty() || valores.size() == 1 && valores.get(0).isEmpty()) {
            return new Lida(null, null);
        }
        if (valores.size() != 1 || !FORMATO.matcher(valores.get(0)).find()) {
            return new Lida(null, new ErroCampo("foto", MENSAGEM_FORMATO));
        }
        String foto = valores.get(0);
        if (foto.length() > MAX_CARACTERES) {
            return new Lida(null, new ErroCampo("foto", MENSAGEM_GRANDE));
        }
        return new Lida(foto, null);
    }
}
