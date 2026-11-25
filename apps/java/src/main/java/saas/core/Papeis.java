package saas.core;

import java.util.Set;

public final class Papeis {
    private Papeis() {}
    public static final Set<String> PAPEIS = Set.of("super_admin", "dono", "administrador", "vendedor");
    public static final Set<String> PAPEIS_DE_LOJA = Set.of("dono", "administrador", "vendedor");
    public static boolean ehPapel(Object valor) {
        return valor instanceof String s && PAPEIS.contains(s);
    }
    public static boolean ehPapelDeLoja(Object valor) {
        return valor instanceof String s && PAPEIS_DE_LOJA.contains(s);
    }
}
