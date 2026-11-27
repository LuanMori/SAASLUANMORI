package com.saasluanmori.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Uma linha do histórico: quem fez o quê, em qual loja e quando ({@code legacy/api/src/auditoria/auditoria.ts:1-34}).
 * Gravada na MESMA transação da ação; só acrescenta (o banco nem dá permissão de alterar ou apagar). Sem dado pessoal
 * em {@code detalhes}: só ids, papéis, códigos, nomes de campos e valores. Quem fez fica em {@code criado_por}
 * ({@code null} = o sistema ou uma tentativa sem ninguém logado).
 */
@Entity
@Immutable
@Table(name = "auditoria")
public class RegistroAuditoria extends BaseTenantEntity {

    @Column(name = "acao", nullable = false, updatable = false)
    private String acao;

    @Column(name = "alvo_tipo", updatable = false)
    private String alvoTipo;

    @Column(name = "alvo_id", updatable = false)
    private UUID alvoId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "detalhes", nullable = false, updatable = false)
    private Map<String, Object> detalhes = new LinkedHashMap<>();

    protected RegistroAuditoria() {
    }

    public RegistroAuditoria(UUID autor, String acao, String alvoTipo, UUID alvoId, Map<String, Object> detalhes) {
        super(autor);
        this.acao = acao;
        this.alvoTipo = alvoTipo;
        this.alvoId = alvoId;
        this.detalhes = new LinkedHashMap<>(detalhes);
    }

    public String getAcao() {
        return acao;
    }

    public String getAlvoTipo() {
        return alvoTipo;
    }

    public UUID getAlvoId() {
        return alvoId;
    }

    public Map<String, Object> getDetalhes() {
        return Map.copyOf(detalhes);
    }
}
