package com.saasluanmori.web;

import java.util.List;

/**
 * A identidade do SaaS num lugar só ({@code legacy/web/src/marca.ts:1-24}). Provisória: "Nome da empresa". O título da
 * aba do navegador também sai daqui.
 */
public final class Marca {

    public static final String NOME = "Nome da empresa";

    /** Contato mostrado no botão "Suporte" da tela de entrada. */
    public static final String SUPORTE_TEXTO = "Precisa de ajuda? Fale com o suporte do Nome da empresa.";
    public static final String SUPORTE_EMAIL = "suporte@nomedaempresa.com.br";

    /** A linha embaixo da logo, na tela de entrada. */
    public static final String LINHA = "PDV · Estoque · Financeiro";

    /** A chamada da tela de entrada: cada item, uma linha. */
    public static final List<String> CHAMADA = List.of("Sua loja,", "mais organizada", "e lucrativa.");

    public static final String DESCRICAO = "Um sistema completo para gerenciar vendas (PDV), estoque, financeiro e o dia a dia do seu negócio.";

    /** Um recurso listado na tela de entrada, com o nome do ícone. */
    public record Recurso(String icone, String texto) {
    }

    public static final List<Recurso> RECURSOS = List.of(
            new Recurso("pdv", "PDV e vendas"),
            new Recurso("estoque", "Controle de estoque"),
            new Recurso("financeiro", "Gestão financeira"));

    /** A versão no rodapé da barra lateral, enquanto as atualizações do Adm. Sup não dizem outra. */
    public static final String VERSAO = "V0.1";

    private Marca() {
    }
}
