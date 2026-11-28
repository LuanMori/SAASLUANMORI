package com.saasluanmori.domain;

/**
 * As ações gravadas no histórico, com o texto que a tela mostra ({@code legacy/core/src/auditoria.ts:16-119};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §17). Cada módulo acrescenta as dele quando é reconstruído.
 */
public enum AcaoAuditoria {
    SESSAO_ENTROU("sessao.entrou", "Entrou no sistema"),
    SESSAO_SAIU("sessao.saiu", "Saiu do sistema"),
    SESSAO_SENHA_ERRADA("sessao.senha_errada", "Senha errada"),
    SESSAO_BLOQUEADO("sessao.bloqueado", "Bloqueado por senhas erradas"),
    USUARIO_SENHA_TROCADA("usuario.senha_trocada", "Trocou a própria senha"),
    // Meu usuário (legacy/core/src/auditoria.ts:31); tirou a foto leva {"tirou": true}
    USUARIO_FOTO_ALTERADA("usuario.foto_alterada", "Foto do perfil alterada"),
    // fornecedores (legacy/core/src/auditoria.ts:83-87); alterado leva os campos que mudaram
    FORNECEDOR_CADASTRADO("fornecedor.cadastrado", "Fornecedor cadastrado"),
    FORNECEDOR_ALTERADO("fornecedor.alterado", "Fornecedor alterado"),
    FORNECEDOR_DESATIVADO("fornecedor.desativado", "Fornecedor desativado"),
    FORNECEDOR_REATIVADO("fornecedor.reativado", "Fornecedor reativado");

    private final String chave;
    private final String texto;

    AcaoAuditoria(String chave, String texto) {
        this.chave = chave;
        this.texto = texto;
    }

    /** A chave gravada no banco ("sessao.entrou"). */
    public String chave() {
        return chave;
    }

    public String texto() {
        return texto;
    }
}
