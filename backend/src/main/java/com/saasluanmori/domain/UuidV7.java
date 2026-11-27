package com.saasluanmori.domain;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Ids no formato UUID versão 7 (RFC 9562), que crescem com o tempo, como os do sistema antigo
 * ({@code @default(uuid(7))}, {@code legacy/api/prisma/schema.prisma:35,59,89}; decisão T17 de
 * {@code docs/migracao/06-RISCOS-E-DECISOES.md}): 48 bits com os milissegundos desde 1970, a versão, 74 bits sorteados
 * e a variante.
 */
public final class UuidV7 {

    private static final SecureRandom ALEATORIO = new SecureRandom();

    private UuidV7() {
    }

    public static UUID gerar() {
        return gerar(System.currentTimeMillis());
    }

    static UUID gerar(long milissegundos) {
        long sorteioA = ALEATORIO.nextLong();
        long sorteioB = ALEATORIO.nextLong();
        long alto = ((milissegundos & 0xFFFF_FFFF_FFFFL) << 16) | 0x7000L | (sorteioA & 0x0FFFL);
        long baixo = (sorteioB & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(alto, baixo);
    }
}
