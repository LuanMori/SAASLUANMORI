package com.saasluanmori.domain;

import com.saasluanmori.config.TenantContext;
import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Transient;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.data.domain.Persistable;

/**
 * Base de toda entidade de loja (regra 1.5 do prompt mestre): a loja ({@code tenant_id}), quem criou, quando, quem
 * alterou por último e quando. A loja vem SEMPRE do {@link TenantContext} na hora de gravar, nunca de quem chamou: uma
 * tela não consegue gravar na loja de outra. O banco confere de novo pelo RLS ({@code WITH CHECK}).
 *
 * <p>O id (UUID versão 7) nasce com o objeto; {@link #isNew()} diz ao Spring Data se é para inserir ou alterar.
 * Loja, id e criação nunca mudam ({@code updatable = false}): o banco nem dá permissão de alterar essas colunas.
 */
@MappedSuperclass
public abstract class BaseTenantEntity implements Persistable<UUID> {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UuidV7.gerar();

    @Column(name = "tenant_id", updatable = false)
    private UUID tenantId;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private Instant criadoEm;

    @Column(name = "criado_por", updatable = false)
    private UUID criadoPor;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm;

    @Column(name = "atualizado_por")
    private UUID atualizadoPor;

    @Transient
    private boolean novo = true;

    @Transient
    private boolean autorDefinido;

    /** Quem criou é quem está no {@link TenantContext} na hora de gravar. */
    protected BaseTenantEntity() {
    }

    /**
     * Quem criou, quando não é quem está no {@link TenantContext}: no histórico, a tentativa de entrar com a senha
     * errada fica sem autor ({@code null} = o sistema), e a entrada certa fica com quem entrou.
     */
    protected BaseTenantEntity(UUID autor) {
        this.criadoPor = autor;
        this.autorDefinido = true;
    }

    /** O instante com a precisão do banco (milissegundos, {@code TIMESTAMPTZ(3)}). */
    public static Instant agora() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    @PrePersist
    void antesDeGravar() {
        tenantId = TenantContext.require();
        Instant agora = agora();
        criadoEm = agora;
        atualizadoEm = agora;
        if (!autorDefinido) {
            criadoPor = TenantContext.usuario().orElse(null);
        }
        atualizadoPor = criadoPor;
    }

    @PreUpdate
    void antesDeAlterar() {
        atualizadoEm = agora();
        atualizadoPor = TenantContext.usuario().orElse(null);
    }

    @PostLoad
    @PostPersist
    void marcarGravado() {
        novo = false;
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return novo;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public UUID getCriadoPor() {
        return criadoPor;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }

    public UUID getAtualizadoPor() {
        return atualizadoPor;
    }
}
