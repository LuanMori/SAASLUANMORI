package com.saasluanmori.config;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.Base64;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Senhas com scrypt, no MESMO formato do servidor antigo ({@code legacy/api/src/auth/senhas.ts:1-62}; decisão T1 de
 * {@code docs/migracao/06-RISCOS-E-DECISOES.md}): {@code scrypt$<logN>$<r>$<p>$<sal base64url>$<hash base64url>}, sal
 * de 16 bytes por senha, hash de 32 bytes, senha normalizada em NFC antes ("ç" do Mac = "ç" do Windows) e comparação em
 * tempo constante. O custo vai junto no texto guardado: dá para subir o custo depois sem perder as senhas antigas.
 * As senhas gravadas pelo servidor antigo continuam valendo.
 */
public class SenhaScrypt implements PasswordEncoder {

    /** N = 2^15, r = 8, p = 1 (~32 MB e dezenas de milissegundos por senha). */
    public static final int LOG_N_PADRAO = 15;

    private static final int R = 8;
    private static final int P = 1;
    private static final int SAL = 16;
    private static final int TAMANHO = 32;
    private static final byte[] TROCA = "�".getBytes(StandardCharsets.UTF_8);

    private final int logN;
    private final SecureRandom aleatorio = new SecureRandom();
    private volatile String hashFalso;

    /** @param logN o custo das senhas novas (de 10 a 20; 15 em produção, 10 nos testes automatizados) */
    public SenhaScrypt(int logN) {
        if (logN < 10 || logN > 20) {
            throw new IllegalArgumentException("Custo do scrypt fora de 10 a 20.");
        }
        this.logN = logN;
    }

    private record Guardado(int logN, int r, int p, byte[] sal, byte[] hash) {
    }

    @Override
    public String encode(CharSequence senha) {
        byte[] sal = new byte[SAL];
        aleatorio.nextBytes(sal);
        byte[] hash = scrypt(senha, sal, logN, R, P, TAMANHO);
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        return "scrypt$" + logN + "$" + R + "$" + P + "$" + b64.encodeToString(sal) + "$" + b64.encodeToString(hash);
    }

    /**
     * Confere a senha. Sem hash ou com um hash que não se lê (usuário sem senha ou inexistente), gasta o mesmo tempo
     * com um hash falso e responde "não confere": pelo tempo de resposta não dá para saber se o usuário existe.
     */
    @Override
    public boolean matches(CharSequence senha, String guardado) {
        Guardado g = guardado == null ? null : ler(guardado);
        if (g == null) {
            Guardado falso = ler(hashFalso());
            scrypt(senha, falso.sal(), falso.logN(), falso.r(), falso.p(), falso.hash().length);
            return false;
        }
        byte[] calculado = scrypt(senha, g.sal(), g.logN(), g.r(), g.p(), g.hash().length);
        return MessageDigest.isEqual(calculado, g.hash());
    }

    private String hashFalso() {
        String h = hashFalso;
        if (h == null) {
            byte[] lixo = new byte[16];
            aleatorio.nextBytes(lixo);
            h = encode(java.util.HexFormat.of().formatHex(lixo));
            hashFalso = h;
        }
        return h;
    }

    /** Lê o texto guardado; nulo se estiver fora do formato ({@code senhas.ts:37-46}). */
    private static Guardado ler(String guardado) {
        String[] partes = guardado.split("\\$", -1);
        if (partes.length != 6 || !partes[0].equals("scrypt")) {
            return null;
        }
        try {
            int n = Integer.parseInt(partes[1]);
            int r = Integer.parseInt(partes[2]);
            int p = Integer.parseInt(partes[3]);
            if (n < 10 || n > 20 || r < 1 || r > 16 || p < 1 || p > 4) {
                return null;
            }
            byte[] sal = Base64.getUrlDecoder().decode(partes[4]);
            byte[] hash = Base64.getUrlDecoder().decode(partes[5]);
            if (sal.length < SAL || hash.length < TAMANHO) {
                return null;
            }
            return new Guardado(n, r, p, sal, hash);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static byte[] scrypt(CharSequence senha, byte[] sal, int logN, int r, int p, int tamanho) {
        byte[] bytes = utf8(Normalizer.normalize(senha, Normalizer.Form.NFC));
        try {
            return SCrypt.generate(bytes, sal, 1 << logN, r, p, tamanho);
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    /**
     * UTF-8 como o Node faz com o texto da senha: um caractere sem par (metade de um emoji) vira U+FFFD, e não "?" como
     * no {@code getBytes} do Java.
     */
    private static byte[] utf8(String texto) {
        CharsetEncoder codificador = StandardCharsets.UTF_8.newEncoder()
                .onMalformedInput(CodingErrorAction.REPLACE)
                .onUnmappableCharacter(CodingErrorAction.REPLACE)
                .replaceWith(TROCA);
        try {
            ByteBuffer b = codificador.encode(CharBuffer.wrap(texto));
            byte[] r = new byte[b.remaining()];
            b.get(r);
            return r;
        } catch (CharacterCodingException e) {
            throw new IllegalStateException("Senha que não se converte em UTF-8.", e);
        }
    }
}
