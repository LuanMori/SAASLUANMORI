package com.saasluanmori.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * As entradas e saídas da pessoa (aba Meu usuário; DaniPets USR-07, "Meus acessos"), montadas do histórico como no
 * sistema antigo ({@code legacy/core/src/perfil.ts:31-98}; {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §4): cada
 * "Entrou no sistema" com o "Saiu do sistema" seguinte. A saída é pelo botão Sair ou por falta de uso. Duas entradas
 * seguidas: a primeira ficou sem saída registrada. A última entrada sem saída é a sessão de agora.
 */
public final class Acessos {

    /** {@code ACESSOS_MAX}: quantas a aba mostra. */
    public static final int MAX = 30;

    /** Quantos registros do histórico bastam para as {@link #MAX} mais recentes (cada uma usa um ou dois). */
    public static final int REGISTROS_PARA_MAX = 2 * MAX + 1;

    /** Como a pessoa saiu. */
    public enum ComoSaiu { SAIR, INATIVIDADE }

    /**
     * Uma entrada e a saída dela.
     *
     * @param entrada {@code null} = a entrada não está no histórico
     * @param saida   {@code null} = sem saída registrada (a sessão de agora, ou o sistema foi fechado sem clicar em Sair)
     * @param como    {@code null} = sem saída registrada
     * @param atual   a sessão de agora: a entrada mais recente, ainda sem saída
     */
    public record Acesso(Instant entrada, Instant saida, ComoSaiu como, boolean atual) {
    }

    /** O que o histórico guarda de cada entrada e saída da pessoa ({@code sessao.entrou} ou {@code sessao.saiu}). */
    public record RegistroDeSessao(String acao, Instant criadoEm, Map<String, Object> detalhes) {
    }

    private Acessos() {
    }

    /**
     * {@code acessosDaPessoa}: da mais recente para a mais antiga, no máximo {@code limite}. Os registros vêm na ordem em
     * que foram gravados; o empate de horário fica na ordem recebida.
     */
    public static List<Acesso> daPessoa(List<RegistroDeSessao> registros, int limite) {
        List<RegistroDeSessao> ordem = new ArrayList<>(registros.stream()
                .filter(r -> "sessao.entrou".equals(r.acao()) || "sessao.saiu".equals(r.acao()))
                .toList());
        ordem.sort((a, b) -> a.criadoEm().compareTo(b.criadoEm()));
        List<Acesso> lista = new ArrayList<>();
        Acesso aberto = null;
        for (RegistroDeSessao r : ordem) {
            if ("sessao.entrou".equals(r.acao())) {
                if (aberto != null) {
                    lista.add(aberto);
                }
                aberto = new Acesso(r.criadoEm(), null, null, false);
                continue;
            }
            ComoSaiu como = r.detalhes() != null && "inatividade".equals(r.detalhes().get("motivo")) ? ComoSaiu.INATIVIDADE : ComoSaiu.SAIR;
            lista.add(aberto != null ? new Acesso(aberto.entrada(), r.criadoEm(), como, false) : new Acesso(null, r.criadoEm(), como, false));
            aberto = null;
        }
        if (aberto != null) {
            lista.add(new Acesso(aberto.entrada(), null, null, true));
        }
        Collections.reverse(lista);
        return List.copyOf(lista.subList(0, Math.min(lista.size(), Math.max(0, limite))));
    }

    /**
     * {@code minutosDoAcesso}: quanto tempo a pessoa ficou, em minutos inteiros; {@code agora} conta para a sessão de
     * agora. {@code null} = não dá para saber.
     */
    public static Integer minutos(Acesso a, Instant agora) {
        if (a.entrada() == null) {
            return null;
        }
        Instant fim = a.saida() != null ? a.saida() : a.atual() ? agora : null;
        if (fim == null) {
            return null;
        }
        long min = Math.floorDiv(Duration.between(a.entrada(), fim).toMillis(), 60_000L);
        return min >= 0 ? (int) min : null;
    }

    /** {@code formatarDuracao}: "menos de 1 min", "45 min", "2 h", "2 h 05 min". */
    public static String formatarDuracao(int minutos) {
        if (minutos < 1) {
            return "menos de 1 min";
        }
        int h = minutos / 60;
        int m = minutos % 60;
        if (h == 0) {
            return m + " min";
        }
        return m == 0 ? h + " h" : h + " h " + String.format("%02d", m) + " min";
    }
}
