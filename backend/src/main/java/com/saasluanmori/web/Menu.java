package com.saasluanmori.web;

import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.Permissao;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Os itens da barra lateral, copiados do DaniPets V9.3.3 ({@code legacy/web/src/painel/menu.tsx:1-206}): "Frente de
 * caixa" em destaque acima do menu e os outros itens em grupos (Operação, Cadastros, Gestão, Sistema). Quem não tem a
 * permissão do item não o vê; grupo sem item visível some junto.
 */
public final class Menu {

    /** Uma parte do sistema: o endereço ({@code /visao-geral}), o rótulo e a permissão (nula = de todos). */
    public enum Secao {
        VISAO_GERAL("visao-geral", "Visão geral", null),
        FRENTE_DE_CAIXA("frente-de-caixa", "Frente de caixa", Permissao.VENDER),
        CAIXA_DO_DIA("caixa-do-dia", "Caixa do dia", Permissao.CAIXA),
        PRODUTOS_E_ESTOQUE("produtos-e-estoque", "Produtos e estoque", null),
        COMPRAS("compras", "Compras", Permissao.COMPRAS),
        CLIENTES("clientes", "Clientes", Permissao.CLIENTES),
        FINANCEIRO("financeiro", "Financeiro", Permissao.FINANCEIRO),
        RELATORIOS("relatorios", "Relatórios", Permissao.RELATORIOS),
        DADOS_E_BACKUP("dados-e-backup", "Dados e backup", Permissao.DADOS),
        USUARIOS("usuarios", "Usuários", Permissao.USUARIOS),
        SUPORTE("suporte", "Suporte", null),
        MEU_USUARIO("meu-usuario", "Meu usuário", null);

        private final String id;
        private final String rotulo;
        private final Permissao permissao;

        Secao(String id, String rotulo, Permissao permissao) {
            this.id = id;
            this.rotulo = rotulo;
            this.permissao = permissao;
        }

        public String getId() {
            return id;
        }

        public String getRotulo() {
            return rotulo;
        }

        public String getEndereco() {
            return "/" + id;
        }

        public boolean podeVer(UsuarioLogado quem) {
            return permissao == null || quem.pode(permissao);
        }

        public static Optional<Secao> doId(String id) {
            return Arrays.stream(values()).filter(s -> s.id.equals(id)).findFirst();
        }
    }

    /** Um grupo da barra. */
    public record Grupo(String titulo, List<Secao> itens) {
    }

    /** Botão em destaque, acima dos grupos. */
    public static final Secao ITEM_CAIXA = Secao.FRENTE_DE_CAIXA;

    public static final List<Grupo> GRUPOS = List.of(
            new Grupo("Operação", List.of(Secao.VISAO_GERAL, Secao.CAIXA_DO_DIA)),
            new Grupo("Cadastros", List.of(Secao.PRODUTOS_E_ESTOQUE, Secao.COMPRAS, Secao.CLIENTES)),
            new Grupo("Gestão", List.of(Secao.FINANCEIRO, Secao.RELATORIOS)),
            new Grupo("Sistema", List.of(Secao.USUARIOS, Secao.DADOS_E_BACKUP, Secao.SUPORTE, Secao.MEU_USUARIO)));

    private Menu() {
    }

    /** Os grupos com só os itens que a pessoa vê (grupo vazio some). */
    public static List<Grupo> gruposDe(UsuarioLogado quem) {
        return GRUPOS.stream()
                .map(g -> new Grupo(g.titulo(), g.itens().stream().filter(s -> s.podeVer(quem)).toList()))
                .filter(g -> !g.itens().isEmpty())
                .toList();
    }
}
