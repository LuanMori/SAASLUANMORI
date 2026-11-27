package com.saasluanmori.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Quem opera o sistema numa loja ({@code legacy/api/prisma/schema.prisma:51-83}). Só entra quem o Dono, o
 * Administrador ou o suporte cadastrou. A mesma pessoa em duas lojas são duas linhas, com senhas independentes.
 * O Adm. Sup não é lido por aqui: a linha dele não tem loja e só as funções {@code app_suporte_*} a enxergam.
 */
@Entity
@DynamicUpdate
@Table(name = "usuarios")
public class Usuario extends BaseTenantEntity {

    /** Login, minúsculo ({@link Login#FORMATO}); único na loja. */
    @Column(name = "usuario", nullable = false)
    private String usuario;

    @Column(name = "nome", nullable = false)
    private String nome;

    @Convert(converter = PapelNoBanco.class)
    @ColumnTransformer(write = "?::papel")
    @Column(name = "papel", nullable = false)
    private Papel papel;

    /** Só no Personalizado: as funções escolhidas para ele. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "permissoes", nullable = false)
    private String[] permissoes = new String[0];

    @Column(name = "ativo", nullable = false)
    private boolean ativo = true;

    /** scrypt no formato do sistema antigo; nulo = ainda sem senha (não entra). */
    @Column(name = "senha_hash")
    private String senhaHash;

    /** Senha criada ou redefinida por outra pessoa: no primeiro acesso, a pessoa cria a dela. */
    @Column(name = "senha_provisoria", nullable = false)
    private boolean senhaProvisoria = true;

    @Column(name = "tentativas_erradas", nullable = false)
    private int tentativasErradas;

    @Column(name = "bloqueado_ate")
    private Instant bloqueadoAte;

    @Column(name = "ultimo_acesso_em")
    private Instant ultimoAcessoEm;

    protected Usuario() {
    }

    public Usuario(String usuario, String nome, Papel papel, String senhaHash) {
        this.usuario = usuario;
        this.nome = nome;
        this.papel = papel;
        this.senhaHash = senhaHash;
    }

    public String getUsuario() {
        return usuario;
    }

    public String getNome() {
        return nome;
    }

    public Papel getPapel() {
        return papel;
    }

    public List<String> getPermissoes() {
        return List.of(permissoes);
    }

    public boolean isAtivo() {
        return ativo;
    }

    public String getSenhaHash() {
        return senhaHash;
    }

    public boolean isSenhaProvisoria() {
        return senhaProvisoria;
    }

    public Tentativas.Estado getTentativas() {
        return new Tentativas.Estado(tentativasErradas, bloqueadoAte);
    }

    public Instant getUltimoAcessoEm() {
        return ultimoAcessoEm;
    }

    /** Grava a contagem de senhas erradas e o bloqueio. */
    public void definirTentativas(Tentativas.Estado estado) {
        this.tentativasErradas = estado.tentativasErradas();
        this.bloqueadoAte = estado.bloqueadoAte();
    }

    /** Entrou: zera as tentativas e grava o último acesso. */
    public void registrarEntrada(Instant agora) {
        definirTentativas(Tentativas.SEM_TENTATIVAS);
        this.ultimoAcessoEm = agora;
    }

    /** Senha nova criada pela própria pessoa: deixa de ser provisória e zera as tentativas. */
    public void trocarSenha(String novoHash) {
        this.senhaHash = novoHash;
        this.senhaProvisoria = false;
        definirTentativas(Tentativas.SEM_TENTATIVAS);
    }
}
