package com.saasluanmori.domain;

import com.ibm.icu.text.Collator;
import com.ibm.icu.util.ULocale;
import java.util.Comparator;

/**
 * A ordem alfabética do sistema antigo: {@code a.localeCompare(b, 'pt-BR')} do navegador, que vem do ICU (decisão T13
 * de {@code docs/migracao/06-RISCOS-E-DECISOES.md}; 03 §21, item 12). O {@code java.text.Collator} do Java NÃO serve:
 * ele ignora espaços e pontuação ("Distribuidora PetSul" vem antes de "distribuidora pet sul") e põe "Ølsen" depois do
 * "Z". O ICU4J dá a mesma ordem do Chromium e do Node, conferida por teste com nomes difíceis.
 */
public final class OrdemAlfabetica {

    /** Congelado: pode ser usado por várias requisições ao mesmo tempo. */
    private static final Collator PT_BR = Collator.getInstance(new ULocale("pt-BR")).freeze();

    /** {@code (a, b) => a.localeCompare(b, 'pt-BR')}. */
    public static final Comparator<String> PT_BR_COMPARADOR = PT_BR::compare;

    private OrdemAlfabetica() {
    }

    public static int comparar(String a, String b) {
        return PT_BR.compare(a, b);
    }
}
