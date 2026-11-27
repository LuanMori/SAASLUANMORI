package com.saasluanmori.domain;

import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * QUEM PODE FAZER O QUÊ, num lugar só ({@code legacy/core/src/permissoes.ts:1-173};
 * {@code docs/migracao/05-MATRIZ-PERMISSOES.md}). Telas e serviços perguntam aqui: {@code pode(quem, FINANCEIRO)}.
 * Ninguém compara papel solto para liberar uma ação. Matriz do DaniPets V9.3.3:
 * <ul>
 *   <li>Adm. Sup: tudo, em qualquer loja;</li>
 *   <li>Dono: tudo, menos as ferramentas do Adm. Sup;</li>
 *   <li>Administrador: tudo, menos o que é só do Dono ou do Adm. Sup;</li>
 *   <li>Vendedor: vender, caixa, clientes e cadastrar produto novo;</li>
 *   <li>Personalizado: só as funções escolhidas para ele, dentre as que se podem dar.</li>
 * </ul>
 */
public final class Permissoes {

    /** Só o Dono, como no DaniPets. */
    static final Set<Permissao> SO_DONO = EnumSet.of(
            Permissao.BRINDE,
            Permissao.USUARIOS_DONOS,
            Permissao.USUARIOS_EXCLUIR_DADOS,
            Permissao.CLIENTES_EXCLUIR_DADOS,
            Permissao.CAIXA_CIENCIA,
            Permissao.FINANCEIRO_BAIXA_CARTAO,
            Permissao.DIA_FECHADO_LIBERAR,
            Permissao.FIADO_LIBERAR);

    /** Só o Adm. Sup (as ferramentas dele e restaurar uma cópia de segurança). */
    static final Set<Permissao> SO_ADM_SUP = EnumSet.of(Permissao.DADOS_RESTAURAR, Permissao.SUPORTE_FERRAMENTAS);

    /** O que se pode dar a um Personalizado, na ordem da lista: tudo, menos o que é só do Dono ou do Adm. Sup e a gestão de usuários. */
    public static final List<Permissao> CONCEDIVEIS = Arrays.stream(Permissao.values())
            .filter(p -> !SO_DONO.contains(p) && !SO_ADM_SUP.contains(p) && p != Permissao.USUARIOS)
            .toList();

    private static final Map<Papel, Set<Permissao>> PODE = Map.of(
            Papel.SUPER_ADMIN, EnumSet.allOf(Permissao.class),
            Papel.DONO, todasMenos(SO_ADM_SUP),
            Papel.ADMINISTRADOR, todasMenos(union(SO_DONO, SO_ADM_SUP)),
            Papel.VENDEDOR, EnumSet.of(Permissao.VENDER, Permissao.CAIXA, Permissao.CLIENTES, Permissao.PRODUTOS_CADASTRAR));

    private Permissoes() {
    }

    /**
     * Tudo o que a pessoa pode. O Personalizado tem só as funções dele que se podem dar (uma função só do Dono gravada
     * por fora não vale).
     */
    public static Set<Permissao> de(Papel papel, Collection<String> funcoes) {
        if (papel == null) {
            return Set.of();
        }
        if (papel == Papel.PERSONALIZADO) {
            Set<Permissao> marcadas = EnumSet.noneOf(Permissao.class);
            for (String f : funcoes) {
                Permissao.daChave(f).filter(CONCEDIVEIS::contains).ifPresent(marcadas::add);
            }
            return marcadas;
        }
        return PODE.getOrDefault(papel, Set.of());
    }

    public static boolean pode(Papel papel, Collection<String> funcoes, Permissao permissao) {
        return de(papel, funcoes).contains(permissao);
    }

    /** Quem tem a permissão, para escrever a mensagem de recusa: Dono, Administrador e Vendedor, nessa ordem. */
    public static List<Papel> quemPode(Permissao permissao) {
        return List.of(Papel.DONO, Papel.ADMINISTRADOR, Papel.VENDEDOR).stream()
                .filter(p -> PODE.get(p).contains(permissao))
                .toList();
    }

    /** "Financeiro: só o Dono ou o Administrador." ({@code permissoes.ts:167-173}). */
    public static String mensagemSemPermissao(Permissao permissao) {
        List<String> papeis = quemPode(permissao).stream().map(Permissoes::comArtigo).toList();
        String lista;
        if (papeis.size() <= 1) {
            // nenhum papel de loja: é das ferramentas do Adm. Sup
            lista = papeis.isEmpty() ? "o Adm. Sup" : papeis.get(0);
        } else {
            lista = String.join(", ", papeis.subList(0, papeis.size() - 1)) + " ou " + papeis.get(papeis.size() - 1);
        }
        return permissao.texto() + ": só " + lista + ".";
    }

    private static String comArtigo(Papel p) {
        return switch (p) {
            case DONO -> "o Dono";
            case ADMINISTRADOR -> "o Administrador";
            case VENDEDOR -> "o Vendedor";
            default -> throw new IllegalArgumentException(p.valor());
        };
    }

    private static Set<Permissao> todasMenos(Set<Permissao> fora) {
        Set<Permissao> r = EnumSet.allOf(Permissao.class);
        r.removeAll(fora);
        return r;
    }

    private static Set<Permissao> union(Set<Permissao> a, Set<Permissao> b) {
        return Arrays.stream(Permissao.values()).filter(p -> a.contains(p) || b.contains(p)).collect(Collectors.toCollection(() -> EnumSet.noneOf(Permissao.class)));
    }

    /** As chaves de uma lista de funções, na ordem da lista de permissões. */
    public static List<String> chaves(Collection<Permissao> permissoes) {
        return Arrays.stream(Permissao.values()).filter(permissoes::contains).map(Permissao::chave).toList();
    }

    /** Uma permissão pela chave, só se for das que se podem dar a um Personalizado. */
    public static Optional<Permissao> concedivel(String chave) {
        return Permissao.daChave(chave).filter(CONCEDIVEIS::contains);
    }
}
