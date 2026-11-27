package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * A ordem alfabética é a do {@code localeCompare('pt-BR')} do sistema antigo (decisão T13). A ordem esperada abaixo saiu
 * do próprio JavaScript, no Chromium 153 e no Node 22 (ICU 78.3), com os mesmos nomes: acentos, maiúsculas, espaço,
 * hífen, ponto, sublinhado, números e letras de outras línguas. O {@code java.text.Collator} erra vários deles.
 */
class OrdemAlfabeticaTest {

    private static final List<String> NOMES = List.of(
            "Distribuidora Pet Sul",
            "distribuidora pet sul",
            "Distribuidora Pet-Sul",
            "Distribuidora PetSul",
            "Distribuidora  Pet",
            "Éder Rações",
            "Eder Racoes",
            "Eder Rações",
            "eder rações",
            "Ômega Pet",
            "Omega Pet",
            "Álvaro & Cia",
            "Alvaro e Cia",
            "Alvaro-Cia",
            "Alvaro.Cia",
            "Alvaro (Cia)",
            "3M do Brasil",
            "10 Irmãos",
            "2 Irmãos",
            "Zé do Milho",
            "Zeca Pet",
            "Çedilha Ltda",
            "Cedilha Ltda",
            "ação pet",
            "Acao Pet",
            "AÇÃO PET",
            "Ação Pet",
            "Mário's Pet",
            "Marios Pet",
            "Mário Pet",
            "Maria Pet",
            "María Pet",
            "Pet_Shop",
            "Pet Shop",
            "PetShop",
            "Pet-Shop",
            "\"Aspas\" Ltda",
            "#1 Pet",
            "@Pet",
            "Ñandu Ltda",
            "Nandu Ltda",
            "Ølsen",
            "Olsen",
            "Straße Pet",
            "Strasse Pet",
            "Ab",
            "AB",
            "aB",
            "ab");

    /** {@code NOMES.slice().sort((a, b) => a.localeCompare(b, 'pt-BR'))} no Chromium e no Node. */
    private static final List<String> ORDEM_DO_JAVASCRIPT = List.of(
            "\"Aspas\" Ltda",
            "@Pet",
            "#1 Pet",
            "10 Irmãos",
            "2 Irmãos",
            "3M do Brasil",
            "ab",
            "aB",
            "Ab",
            "AB",
            "Acao Pet",
            "ação pet",
            "Ação Pet",
            "AÇÃO PET",
            "Alvaro (Cia)",
            "Álvaro & Cia",
            "Alvaro e Cia",
            "Alvaro-Cia",
            "Alvaro.Cia",
            "Cedilha Ltda",
            "Çedilha Ltda",
            "Distribuidora  Pet",
            "distribuidora pet sul",
            "Distribuidora Pet Sul",
            "Distribuidora Pet-Sul",
            "Distribuidora PetSul",
            "Eder Racoes",
            "eder rações",
            "Eder Rações",
            "Éder Rações",
            "Maria Pet",
            "María Pet",
            "Mário Pet",
            "Mário's Pet",
            "Marios Pet",
            "Nandu Ltda",
            "Ñandu Ltda",
            "Olsen",
            "Ølsen",
            "Omega Pet",
            "Ômega Pet",
            "Pet Shop",
            "Pet_Shop",
            "Pet-Shop",
            "PetShop",
            "Strasse Pet",
            "Straße Pet",
            "Zé do Milho",
            "Zeca Pet");

    @Test
    void igualAoLocaleCompareDoNavegador() {
        List<String> lista = new ArrayList<>(NOMES);
        lista.sort(OrdemAlfabetica.PT_BR_COMPARADOR);
        assertThat(lista).containsExactlyElementsOf(ORDEM_DO_JAVASCRIPT);
    }

    @Test
    void oEspacoContaEAMaiusculaSoDesempata() {
        assertThat(OrdemAlfabetica.comparar("Pet Shop", "PetShop")).isNegative();
        assertThat(OrdemAlfabetica.comparar("ab", "AB")).isNegative();
        assertThat(OrdemAlfabetica.comparar("Éder", "Eder")).isPositive();
        assertThat(OrdemAlfabetica.comparar("Ølsen", "Zeca")).isNegative();
        assertThat(OrdemAlfabetica.comparar("Pet Sul", "Pet Sul")).isZero();
    }
}
