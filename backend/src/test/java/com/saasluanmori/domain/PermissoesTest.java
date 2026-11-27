package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** A matriz ({@code legacy/core/src/permissoes.ts}; {@code docs/migracao/05-MATRIZ-PERMISSOES.md}). */
class PermissoesTest {

    @Test
    void mensagensDeRecusa() {
        assertThat(Permissoes.mensagemSemPermissao(Permissao.FINANCEIRO)).isEqualTo("Financeiro: só o Dono ou o Administrador.");
        assertThat(Permissoes.mensagemSemPermissao(Permissao.VENDER)).isEqualTo("Vender na Frente de caixa: só o Dono, o Administrador ou o Vendedor.");
        assertThat(Permissoes.mensagemSemPermissao(Permissao.BRINDE)).isEqualTo("Dar brinde (preço R$ 0,00) sem pedir senha: só o Dono.");
        assertThat(Permissoes.mensagemSemPermissao(Permissao.SUPORTE_FERRAMENTAS))
                .isEqualTo("Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção): só o Adm. Sup.");
    }

    @Test
    void papeis() {
        assertThat(Permissoes.pode(Papel.SUPER_ADMIN, List.of(), Permissao.DADOS_RESTAURAR)).isTrue();
        assertThat(Permissoes.pode(Papel.DONO, List.of(), Permissao.DADOS_RESTAURAR)).isFalse();
        assertThat(Permissoes.pode(Papel.DONO, List.of(), Permissao.BRINDE)).isTrue();
        assertThat(Permissoes.pode(Papel.ADMINISTRADOR, List.of(), Permissao.BRINDE)).isFalse();
        assertThat(Permissoes.pode(Papel.ADMINISTRADOR, List.of(), Permissao.USUARIOS)).isTrue();
        assertThat(Permissoes.de(Papel.VENDEDOR, List.of()))
                .containsExactlyInAnyOrder(Permissao.VENDER, Permissao.CAIXA, Permissao.CLIENTES, Permissao.PRODUTOS_CADASTRAR);
    }

    @Test
    void personalizadoSoComAsFuncoesQueSePodemDar() {
        assertThat(Permissoes.de(Papel.PERSONALIZADO, List.of("financeiro", "brinde", "usuarios", "inventada")))
                .containsExactly(Permissao.FINANCEIRO);
        assertThat(Permissoes.CONCEDIVEIS).doesNotContain(Permissao.USUARIOS, Permissao.BRINDE, Permissao.SUPORTE_FERRAMENTAS);
        assertThat(Permissoes.CONCEDIVEIS.get(0)).isEqualTo(Permissao.VENDER);
    }
}
