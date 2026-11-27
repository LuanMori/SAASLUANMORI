package com.saasluanmori.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * Senha errada demais bloqueia ({@code legacy/core/src/tentativas.ts:1-43}), igual ao DaniPets V9.3.3: 5 senhas erradas
 * seguidas bloqueiam o usuário por 5 minutos. Vale para o login e para a senha de quem autoriza. As mensagens não dizem
 * se o que errou foi o usuário ou a senha.
 */
public final class Tentativas {

    public static final int TENTATIVAS_MAX = 5;
    public static final int BLOQUEIO_MINUTOS = 5;
    public static final int BLOQUEIO_SEGUNDOS = BLOQUEIO_MINUTOS * 60;

    public static final String MENSAGEM_CREDENCIAIS = "Usuário ou senha incorretos.";
    public static final String MENSAGEM_ACABOU_DE_BLOQUEAR = "Muitas tentativas erradas. Este usuário ficou bloqueado por " + BLOQUEIO_MINUTOS + " minutos.";

    /**
     * @param tentativasErradas senhas erradas seguidas (zera ao acertar ou ao bloquear)
     * @param bloqueadoAte      até quando está bloqueado; nulo = não está
     */
    public record Estado(int tentativasErradas, Instant bloqueadoAte) {
    }

    public static final Estado SEM_TENTATIVAS = new Estado(0, null);

    /** @param restanteSegundos arredondado para cima ({@code tentativas.ts:22-26}) */
    public record Situacao(boolean bloqueado, long restanteSegundos) {
    }

    /** Depois de mais uma senha errada: o estado novo e se bloqueou agora. */
    public record AposErro(Estado estado, boolean bloqueou) {
    }

    private Tentativas() {
    }

    public static Situacao situacao(Estado estado, Instant agora) {
        if (estado.bloqueadoAte() == null) {
            return new Situacao(false, 0);
        }
        long milis = Duration.between(agora, estado.bloqueadoAte()).toMillis();
        long restante = Math.ceilDiv(milis, 1000L);
        return restante > 0 ? new Situacao(true, restante) : new Situacao(false, 0);
    }

    /** Mais uma senha errada: na quinta, bloqueia e zera a contagem ({@code tentativas.ts:28-35}). */
    public static AposErro aposSenhaErrada(Estado estado, Instant agora) {
        int tentativas = estado.tentativasErradas() + 1;
        if (tentativas >= TENTATIVAS_MAX) {
            return new AposErro(new Estado(0, agora.plusSeconds(BLOQUEIO_SEGUNDOS)), true);
        }
        return new AposErro(new Estado(tentativas, null), false);
    }

    /** "Muitas tentativas erradas. Tente de novo em 4 min ou peça ao dono para trocar sua senha." */
    public static String mensagemBloqueado(long restanteSegundos) {
        return "Muitas tentativas erradas. Tente de novo em " + quando(restanteSegundos) + " ou peça ao dono para trocar sua senha.";
    }

    /** "N min" (arredondado para cima) a partir de 60 segundos; abaixo disso, "N s" (no mínimo 1). */
    public static String quando(long restanteSegundos) {
        return restanteSegundos >= 60 ? Math.ceilDiv(restanteSegundos, 60L) + " min" : Math.max(1, restanteSegundos) + " s";
    }
}
