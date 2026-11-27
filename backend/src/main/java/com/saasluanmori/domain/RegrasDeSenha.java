package com.saasluanmori.domain;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * A regra da senha nova (criar, redefinir ou trocar), {@code validarSenhaNova} ({@code legacy/core/src/usuario.ts:21,
 * 33-82}). Sem regra de "maiúscula, número e símbolo": tamanho e fugir das senhas óbvias protegem mais (NIST 800-63B).
 */
public final class RegrasDeSenha {

    public static final int MINIMO = 8;
    public static final int MAXIMO = 128;

    /** As senhas mais usadas no Brasil e no mundo (com 8+ caracteres): recusadas mesmo tendo o tamanho. */
    static final Set<String> SENHAS_COMUNS = Set.of(
            "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344", "123123123",
            "abcd1234", "abc12345", "password", "password1", "senha123", "senha1234", "senhasenha", "mudar123", "trocar123",
            "qwerty123", "qwertyui", "asdfghjk", "iloveyou", "brasil123", "flamengo", "corinthians", "palmeiras", "admin123",
            "administrador", "vendedor", "petshop123");

    private RegrasDeSenha() {
    }

    /**
     * A mensagem do primeiro problema, na ordem do sistema antigo, ou vazio se a senha serve.
     *
     * @param usuario o login da pessoa (pode ser nulo)
     * @param nome    o nome da pessoa (pode ser nulo)
     */
    public static Optional<String> validar(String senha, String usuario, String nome) {
        if (senha == null || senha.length() < MINIMO) {
            return Optional.of("A senha precisa ter pelo menos " + MINIMO + " caracteres.");
        }
        if (senha.length() > MAXIMO) {
            return Optional.of("A senha pode ter até " + MAXIMO + " caracteres.");
        }
        String minuscula = senha.toLowerCase(Locale.ROOT);
        if (SENHAS_COMUNS.contains(minuscula) || umCaractereRepetido(senha)) {
            return Optional.of("Esta senha é fácil de adivinhar. Escolha outra.");
        }
        String login = usuario == null || usuario.isEmpty() ? "" : Login.normalizar(usuario);
        String nomeJunto = nome == null || nome.isEmpty() ? "" : TextoJs.trocarEspacos(TextoJs.trim(nome).toLowerCase(Locale.ROOT), "");
        if ((!login.isEmpty() && minuscula.contains(login) && login.length() >= 4) || (nomeJunto.length() >= 4 && minuscula.contains(nomeJunto))) {
            return Optional.of("A senha não pode ter o seu usuário ou o seu nome.");
        }
        return Optional.empty();
    }

    /**
     * {@code /^(.)\1+$/} do JavaScript: dois ou mais caracteres (unidades UTF-16) iguais ao primeiro, que não pode ser
     * uma quebra de linha (o {@code .} do JavaScript não casa com ela).
     */
    private static boolean umCaractereRepetido(String senha) {
        char primeiro = senha.charAt(0);
        if (senha.length() < 2 || "\n\r  ".indexOf(primeiro) >= 0) {
            return false;
        }
        return senha.chars().allMatch(c -> c == primeiro);
    }
}
