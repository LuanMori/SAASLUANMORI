package com.saasluanmori.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

/**
 * Uma loja (o tenant). É achada pelo subdomínio do endereço ({@code lojaa.nomedaempresa.com.br} → {@code lojaa}).
 * A tabela não tem RLS (é o cadastro das lojas) e a aplicação só lê: as lojas são cadastradas pelo comando de
 * administração {@code loja} (o {@code db:seed} do sistema antigo).
 */
@Entity
@Immutable
@Table(name = "lojas")
public class Loja {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "nome", nullable = false)
    private String nome;

    @Column(name = "subdominio", nullable = false)
    private String subdominio;

    @Column(name = "ativa", nullable = false)
    private boolean ativa;

    protected Loja() {
    }

    public UUID getId() {
        return id;
    }

    public String getNome() {
        return nome;
    }

    public String getSubdominio() {
        return subdominio;
    }

    public boolean isAtiva() {
        return ativa;
    }
}
