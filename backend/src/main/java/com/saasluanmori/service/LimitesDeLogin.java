package com.saasluanmori.service;

import com.saasluanmori.domain.Tentativas;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * Os limites de tentativa de login que ficam na memória do servidor ({@code legacy/api/src/auth/limites.ts:1-79}):
 * <ul>
 *   <li>por IP: 5 logins errados em 1 minuto bloqueiam aquele IP por 5 minutos;</li>
 *   <li>por login que NÃO existe: o mesmo bloqueio de 5 erradas = 5 minutos do usuário de verdade, para o bloqueio não
 *       revelar quais usuários existem;</li>
 *   <li>uma tentativa por vez para o mesmo {@code loja:login}, sem segurar conexão do banco enquanto espera.</li>
 * </ul>
 * O bloqueio do usuário que existe fica no banco. Cada cópia do servidor conta as suas (como no antigo).
 */
@Component
public class LimitesDeLogin {

    static final int IP_FALHAS = 5;
    static final long IP_JANELA_MS = 60_000;
    static final long IP_BLOQUEIO_MS = Tentativas.BLOQUEIO_MINUTOS * 60_000L;

    /** Teto de entradas guardadas: um ataque com milhões de IPs não esgota a memória. */
    static final int TETO = 50_000;

    private record EstadoIp(Deque<Long> falhas, long bloqueadoAte) {
    }

    private final Map<String, EstadoIp> porIp = new LinkedHashMap<>();
    private final Map<String, Tentativas.Estado> semUsuario = new LinkedHashMap<>();
    private final Map<String, ReentrantLock> filas = new ConcurrentHashMap<>();

    /** Segundos que faltam de bloqueio do IP (0 = liberado). */
    public synchronized long ipBloqueado(String ip, long agora) {
        EstadoIp e = porIp.get(ip);
        return e != null && e.bloqueadoAte() > agora ? Math.ceilDiv(e.bloqueadoAte() - agora, 1000L) : 0;
    }

    public synchronized void registrarFalhaDoIp(String ip, long agora) {
        EstadoIp anterior = porIp.remove(ip); // reinsere no fim: a ordem vira "menos recente primeiro"
        Deque<Long> falhas = new ArrayDeque<>();
        long bloqueadoAte = 0;
        if (anterior != null) {
            bloqueadoAte = anterior.bloqueadoAte();
            for (long t : anterior.falhas()) {
                if (agora - t < IP_JANELA_MS) {
                    falhas.add(t);
                }
            }
        }
        falhas.add(agora);
        if (falhas.size() >= IP_FALHAS) {
            bloqueadoAte = agora + IP_BLOQUEIO_MS;
            falhas.clear();
        }
        porIp.put(ip, new EstadoIp(falhas, bloqueadoAte));
        aparar(porIp);
    }

    public synchronized Tentativas.Situacao situacaoSemUsuario(String chave, Instant agora) {
        return Tentativas.situacao(semUsuario.getOrDefault(chave, Tentativas.SEM_TENTATIVAS), agora);
    }

    /** Mais uma falha de um login que não existe; {@code true} se bloqueou agora. */
    public synchronized boolean registrarFalhaSemUsuario(String chave, Instant agora) {
        Tentativas.AposErro r = Tentativas.aposSenhaErrada(semUsuario.getOrDefault(chave, Tentativas.SEM_TENTATIVAS), agora);
        semUsuario.remove(chave);
        semUsuario.put(chave, r.estado());
        aparar(semUsuario);
        return r.bloqueou();
    }

    /** Roda a tarefa sozinha para a chave (as outras tentativas do mesmo {@code loja:login} esperam a vez). */
    public <T> T umaPorVez(String chave, Supplier<T> tarefa) {
        ReentrantLock trava = filas.computeIfAbsent(chave, k -> new ReentrantLock(true));
        trava.lock();
        try {
            return tarefa.get();
        } finally {
            trava.unlock();
            if (!trava.hasQueuedThreads()) {
                filas.remove(chave, trava);
            }
        }
    }

    private static <V> void aparar(Map<String, V> mapa) {
        if (mapa.size() > TETO) {
            Iterator<String> primeiro = mapa.keySet().iterator();
            primeiro.next();
            primeiro.remove();
        }
    }
}
