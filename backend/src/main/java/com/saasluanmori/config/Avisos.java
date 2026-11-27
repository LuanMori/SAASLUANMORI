package com.saasluanmori.config;

import com.saasluanmori.domain.Tentativas;
import java.util.Optional;

/**
 * Os avisos que a tela de entrada mostra quando a pessoa volta para ela sem querer ({@code legacy/web/src/App.tsx:24,
 * 39-49,116,131}). O endereço leva só o código ({@code /entrar?aviso=...}), nunca o texto.
 */
public final class Avisos {

    public static final String SESSAO_ENCERRADA = "sessao_encerrada";
    public static final String INATIVIDADE = "inatividade";
    public static final String BLOQUEADO = "bloqueado";

    private Avisos() {
    }

    /** O texto do aviso, ou vazio para um código desconhecido. */
    public static Optional<String> texto(String codigo, Ambiente amb) {
        if (codigo == null) {
            return Optional.empty();
        }
        return switch (codigo) {
            case SESSAO_ENCERRADA -> Optional.of("Sua sessão terminou. Entre de novo.");
            case INATIVIDADE -> Optional.of("Sua sessão terminou depois de " + amb.sessaoInatividadeMin() + " minutos sem uso. Entre de novo.");
            case BLOQUEADO -> Optional.of(Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR);
            default -> Optional.empty();
        };
    }
}
