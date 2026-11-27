package com.saasluanmori.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

/**
 * Sessão de login ({@code legacy/api/prisma/schema.prisma:85-103}). O segredo fica só no cookie (HttpOnly) do
 * navegador; aqui fica o SHA-256 dele. Expira por inatividade (30 min) ou depois de 12 h; sair, desativar o usuário ou
 * redefinir a senha encerram a sessão. A aplicação só lê, cria e encerra (não estende a validade).
 */
@Entity
@DynamicUpdate
@Table(name = "sessoes")
public class Sessao extends BaseTenantEntity {

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private UUID usuarioId;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Column(name = "ultimo_uso_em", nullable = false)
    private Instant ultimoUsoEm;

    @Column(name = "expira_em", nullable = false, updatable = false)
    private Instant expiraEm;

    @Column(name = "encerrada_em")
    private Instant encerradaEm;

    protected Sessao() {
    }

    public Sessao(UUID usuarioId, String tokenHash, Instant agora, Instant expiraEm) {
        super(usuarioId);
        this.usuarioId = usuarioId;
        this.tokenHash = tokenHash;
        this.ultimoUsoEm = agora;
        this.expiraEm = expiraEm;
    }

    public UUID getUsuarioId() {
        return usuarioId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getUltimoUsoEm() {
        return ultimoUsoEm;
    }

    public Instant getExpiraEm() {
        return expiraEm;
    }

    public Instant getEncerradaEm() {
        return encerradaEm;
    }

    public boolean isEncerrada() {
        return encerradaEm != null;
    }

    public void encerrar(Instant agora) {
        this.encerradaEm = agora;
    }

    public void registrarUso(Instant agora) {
        this.ultimoUsoEm = agora;
    }
}
