package com.saasluanmori.config;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * A loja (tenant) e a pessoa da requisição atual, guardadas na thread. A loja vem SÓ da sessão conferida no banco ou,
 * na entrada, do endereço da loja; nunca do corpo, da URL ou de um cabeçalho escolhido pela tela
 * ({@code legacy/api/src/auth/contexto.ts:1-3}).
 *
 * <p>No início de cada transação, {@link TenantTransactionManager} passa a loja e a pessoa para o banco
 * ({@code set_config('app.tenant_id', ..., true)} e {@code set_config('app.usuario_id', ..., true)}). Sem loja definida,
 * toda consulta a uma tabela de loja dá erro no banco (decisão T2 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}).
 */
public final class TenantContext {

    /** A loja e quem está agindo nela ({@code usuarioId} nulo = o sistema ou alguém que ainda não entrou). */
    public record Contexto(UUID tenantId, UUID usuarioId) {
    }

    private static final ThreadLocal<Contexto> ATUAL = new ThreadLocal<>();

    private TenantContext() {
    }

    /** A loja atual; sem loja definida, erro de programação (nenhuma escrita acontece fora de uma loja). */
    public static UUID require() {
        Contexto c = ATUAL.get();
        if (c == null) {
            throw new IllegalStateException("Nenhuma loja definida para esta operação.");
        }
        return c.tenantId();
    }

    public static Optional<Contexto> atual() {
        return Optional.ofNullable(ATUAL.get());
    }

    /** Quem está agindo, se houver. */
    public static Optional<UUID> usuario() {
        Contexto c = ATUAL.get();
        return c == null ? Optional.empty() : Optional.ofNullable(c.usuarioId());
    }

    public static void definir(UUID tenantId, UUID usuarioId) {
        if (tenantId == null) {
            throw new IllegalArgumentException("A loja não pode ser nula.");
        }
        ATUAL.set(new Contexto(tenantId, usuarioId));
    }

    public static void limpar() {
        ATUAL.remove();
    }

    /** Roda {@code tarefa} com a loja e a pessoa dadas e devolve o contexto anterior no fim (mesmo com erro). */
    public static <T> T comLoja(UUID tenantId, UUID usuarioId, Supplier<T> tarefa) {
        Contexto anterior = ATUAL.get();
        definir(tenantId, usuarioId);
        try {
            return tarefa.get();
        } finally {
            if (anterior == null) {
                ATUAL.remove();
            } else {
                ATUAL.set(anterior);
            }
        }
    }

    /** O mesmo que {@link #comLoja(UUID, UUID, Supplier)}, para tarefas sem resultado. */
    public static void comLoja(UUID tenantId, UUID usuarioId, Runnable tarefa) {
        comLoja(tenantId, usuarioId, () -> {
            tarefa.run();
            return null;
        });
    }
}
