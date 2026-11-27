package com.saasluanmori.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * O cadastro do fornecedor com as regras EXATAS do sistema antigo ({@code legacy/core/src/fornecedor.ts:31-102};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8): as mesmas conferências, na mesma ordem, com as mesmas mensagens.
 *
 * <p>Os dados chegam como os campos de um formulário: cada nome com os valores enviados. Um campo com um valor é um
 * texto; com mais de um, é o "não é texto" do antigo (no JSON, uma lista); campo que não veio é o {@code undefined}.
 */
public final class RegrasDoFornecedor {

    /** {@code LIMITES_FORNECEDOR} ({@code fornecedor.ts:31}). */
    public static final int NOME_MIN = 2;
    public static final int NOME_MAX = 120;
    public static final int CONTATO_MAX = 80;
    public static final int OBSERVACAO_MAX = 300;

    /** Os campos do cadastro, na ordem do antigo (é a ordem dos campos alterados no histórico). */
    public static final List<String> CAMPOS = List.of("nome", "documento", "telefone", "contato", "observacao");

    private static final Set<String> PERMITIDOS = Set.copyOf(CAMPOS);

    /** O cadastro conferido: o nome em uma linha; documento e telefone só com os dígitos; vazio = {@code null}. */
    public record NovoFornecedor(String nome, String documento, String telefone, String contato, String observacao) {

        /** O valor de cada campo, pelo nome ({@link #CAMPOS}). */
        public String valor(String campo) {
            return switch (campo) {
                case "nome" -> nome;
                case "documento" -> documento;
                case "telefone" -> telefone;
                case "contato" -> contato;
                case "observacao" -> observacao;
                default -> throw new IllegalArgumentException("Campo desconhecido: " + campo);
            };
        }
    }

    /** O resultado da conferência: o cadastro ({@code erros} vazio) ou os problemas, na ordem do antigo. */
    public record Conferido(NovoFornecedor valor, List<ErroCampo> erros) {

        public boolean ok() {
            return erros.isEmpty();
        }
    }

    /** Um fornecedor que já existe na loja, para conferir o documento. */
    public record JaCadastrado(UUID id, String nome, String documento) {
    }

    private RegrasDoFornecedor() {
    }

    /** {@code validarFornecedor} ({@code fornecedor.ts:68-93}). */
    public static Conferido validar(Map<String, List<String>> entrada) {
        List<ErroCampo> erros = new ArrayList<>();
        for (String k : entrada.keySet()) {
            if (!PERMITIDOS.contains(k)) {
                erros.add(new ErroCampo(k, "Campo não permitido."));
            }
        }
        String nome = linha(entrada.get("nome"));
        if (nome.length() < NOME_MIN) {
            erros.add(new ErroCampo("nome", "Informe o nome do fornecedor."));
        } else if (nome.length() > NOME_MAX) {
            erros.add(new ErroCampo("nome", "O nome pode ter até " + NOME_MAX + " caracteres."));
        } else if (TextoJs.temControle(nome)) {
            erros.add(new ErroCampo("nome", "O nome contém caracteres inválidos."));
        }

        String documento = null;
        String d = digitos(entrada.get("documento"));
        if (!d.isEmpty()) {
            boolean invalido = d.length() == 14 ? !Documento.cnpjValido(d) : d.length() != 11 || !Documento.cpfValido(d);
            if (invalido) {
                erros.add(new ErroCampo("documento", "Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números)."));
            } else {
                documento = d;
            }
        }
        String telefone = null;
        String t = digitos(entrada.get("telefone"));
        if (!t.isEmpty()) {
            if (!Telefone.valido(t)) {
                erros.add(new ErroCampo("telefone", "Telefone com DDD: 10 ou 11 números."));
            } else {
                telefone = t;
            }
        }
        String contato = textoOpcional(entrada.get("contato"), "contato", CONTATO_MAX, erros);
        String observacao = textoOpcional(entrada.get("observacao"), "observacao", OBSERVACAO_MAX, erros);
        return erros.isEmpty()
                ? new Conferido(new NovoFornecedor(nome, documento, telefone, contato, observacao), List.of())
                : new Conferido(null, List.copyOf(erros));
    }

    /**
     * {@code conferirDocumentoUnico} ({@code fornecedor.ts:95-102}): o mesmo CNPJ ou CPF não se repete entre os
     * fornecedores da loja (ativos e desativados). Devolve o erro, se houver.
     *
     * @param ignorarId o próprio fornecedor, numa alteração ({@code null} num cadastro novo)
     */
    public static List<ErroCampo> conferirDocumentoUnico(String documento, List<JaCadastrado> daLoja, UUID ignorarId) {
        if (documento == null) {
            return List.of();
        }
        return daLoja.stream()
                .filter(f -> !f.id().equals(ignorarId) && documento.equals(f.documento()))
                .findFirst()
                .map(f -> List.of(new ErroCampo("documento", "Este documento já é do fornecedor \"" + f.nome() + "\".")))
                .orElse(List.of());
    }

    /** {@code linha(v)}: texto vira uma linha; o que não é texto vira vazio ({@code fornecedor.ts:54}). */
    private static String linha(List<String> v) {
        return v == null || v.size() != 1 ? "" : TextoJs.linha(v.get(0));
    }

    /** {@code soDigitos(v)}: {@code String(v ?? '')}, e uma lista vira os itens separados por vírgula. */
    private static String digitos(List<String> v) {
        return v == null ? "" : TextoJs.soDigitos(String.join(",", v));
    }

    /** {@code textoOpcional} ({@code fornecedor.ts:56-66}). */
    private static String textoOpcional(List<String> v, String campo, int max, List<ErroCampo> erros) {
        if (v == null) {
            return null;
        }
        if (v.size() != 1) {
            erros.add(new ErroCampo(campo, "Envie um texto."));
            return null;
        }
        String t = TextoJs.linha(v.get(0));
        if (t.length() > max) {
            erros.add(new ErroCampo(campo, "Use até " + max + " caracteres."));
        } else if (TextoJs.temControle(t)) {
            erros.add(new ErroCampo(campo, "O texto contém caracteres inválidos."));
        }
        return t.isEmpty() ? null : t;
    }
}
