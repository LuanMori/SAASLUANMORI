package com.saasluanmori.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.hibernate.annotations.DynamicUpdate;

/**
 * Um fornecedor da loja ({@code legacy/core/src/fornecedor.ts:13-29}; {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8).
 * As regras com as mensagens da tela ficam em {@link RegrasDoFornecedor}; as anotações abaixo são a última barreira
 * antes do banco (que confere o formato de novo). Não se apaga: desativado, sai das listas de escolha, e o que já aponta
 * para ele continua.
 */
@Entity
@DynamicUpdate
@Table(name = "fornecedores")
public class Fornecedor extends BaseTenantEntity {

    @NotNull
    @Size(min = RegrasDoFornecedor.NOME_MIN, max = RegrasDoFornecedor.NOME_MAX)
    @Column(name = "nome", nullable = false)
    private String nome;

    /** CNPJ (14 dígitos) ou CPF (11), só os números. */
    @Pattern(regexp = "[0-9]{11}|[0-9]{14}")
    @Column(name = "documento")
    private String documento;

    /** Só os números, com o DDD. */
    @Pattern(regexp = "[0-9]{10,11}")
    @Column(name = "telefone")
    private String telefone;

    /** Nome da pessoa de contato (vendedor, representante). */
    @Size(max = RegrasDoFornecedor.CONTATO_MAX)
    @Column(name = "contato")
    private String contato;

    @Size(max = RegrasDoFornecedor.OBSERVACAO_MAX)
    @Column(name = "observacao")
    private String observacao;

    @Column(name = "ativo", nullable = false)
    private boolean ativo = true;

    /** Para o JPA. */
    protected Fornecedor() {
    }

    /** Um fornecedor novo, ativo, com o cadastro já conferido. */
    public Fornecedor(RegrasDoFornecedor.NovoFornecedor dados) {
        aplicar(dados);
    }

    /**
     * Troca o cadastro inteiro (alterar envia todos os campos) e devolve os campos que mudaram, na ordem do antigo
     * ({@code apiLocal.ts:3196}); nenhum = nada a gravar.
     */
    public List<String> alterar(RegrasDoFornecedor.NovoFornecedor dados) {
        List<String> campos = new ArrayList<>();
        for (String campo : RegrasDoFornecedor.CAMPOS) {
            if (!Objects.equals(valor(campo), dados.valor(campo))) {
                campos.add(campo);
            }
        }
        if (!campos.isEmpty()) {
            aplicar(dados);
        }
        return List.copyOf(campos);
    }

    private void aplicar(RegrasDoFornecedor.NovoFornecedor dados) {
        this.nome = dados.nome();
        this.documento = dados.documento();
        this.telefone = dados.telefone();
        this.contato = dados.contato();
        this.observacao = dados.observacao();
    }

    private String valor(String campo) {
        return switch (campo) {
            case "nome" -> nome;
            case "documento" -> documento;
            case "telefone" -> telefone;
            case "contato" -> contato;
            case "observacao" -> observacao;
            default -> throw new IllegalArgumentException("Campo desconhecido: " + campo);
        };
    }

    public void definirAtivo(boolean ativo) {
        this.ativo = ativo;
    }

    public String getNome() {
        return nome;
    }

    public String getDocumento() {
        return documento;
    }

    public String getTelefone() {
        return telefone;
    }

    public String getContato() {
        return contato;
    }

    public String getObservacao() {
        return observacao;
    }

    public boolean isAtivo() {
        return ativo;
    }

    /** Para mostrar: "12.345.678/0001-95" ou "529.982.247-25". */
    public String getDocumentoFormatado() {
        return documento == null ? null : Documento.formatar(documento);
    }

    /** Para mostrar: "(11) 98765-4321". */
    public String getTelefoneFormatado() {
        return telefone == null ? null : Telefone.formatar(telefone);
    }
}
