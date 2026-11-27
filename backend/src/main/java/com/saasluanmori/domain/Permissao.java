package com.saasluanmori.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * Cada permissão, com o texto que aparece nas mensagens ("Financeiro: só o Dono ou o Administrador."), na mesma ordem
 * da lista do sistema antigo ({@code legacy/core/src/permissoes.ts:20-57}; {@code docs/migracao/05-MATRIZ-PERMISSOES.md}).
 * A ordem vale: é a ordem das funções do Personalizado em toda tela e em todo registro.
 */
public enum Permissao {
    VENDER("vender", "Vender na Frente de caixa"),
    CAIXA("caixa", "Abrir e fechar o caixa"),
    CLIENTES("clientes", "Cadastrar e consultar clientes"),
    CLIENTES_DESATIVAR("clientes.desativar", "Desativar e reativar cliente"),
    CLIENTES_LIMITE("clientes.limite", "Definir o limite de fiado do cliente"),
    CLIENTES_CPF("clientes.cpf", "Ver o CPF completo do cliente"),
    CLIENTES_FIADO("clientes.fiado", "Ver o fiado de todos os clientes (aba Fiado)"),
    PRODUTOS_CADASTRAR("produtos.cadastrar", "Cadastrar produto novo"),
    PRODUTOS_ALTERAR("produtos.alterar", "Alterar, inativar e excluir produto"),
    ESTOQUE_LANCAR("estoque.lancar", "Lançar entrada, ajuste e estoque mínimo"),
    COMPRAS("compras", "Compras"),
    FINANCEIRO("financeiro", "Financeiro"),
    RELATORIOS("relatorios", "Relatórios e vendas de outros dias"),
    DADOS("dados", "Dados e backup"),
    DADOS_RESTAURAR("dados.restaurar", "Restaurar uma cópia de segurança (troca os dados atuais da loja)"),
    LOJA_CONFIGURAR("loja.configurar", "Alterar os dados e as regras da loja"),
    USUARIOS("usuarios", "Cadastrar, alterar e desativar usuários"),
    USUARIOS_DONOS("usuarios.donos", "Cadastrar e alterar outro Dono, ou dar o papel de Dono"),
    USUARIOS_EXCLUIR_DADOS("usuarios.excluir_dados", "Excluir os dados de um usuário desativado (LGPD)"),
    CLIENTES_EXCLUIR_DADOS("clientes.excluir_dados", "Excluir os dados de um cliente (LGPD)"),
    DESCONTO_ACIMA_DO_LIMITE("desconto.acima_do_limite", "Dar desconto acima do limite da loja sem pedir senha"),
    ESTORNO("estorno", "Cancelar venda e devolver itens sem pedir senha"),
    BRINDE("brinde", "Dar brinde (preço R$ 0,00) sem pedir senha"),
    CAIXA_RETIRADA("caixa.retirada", "Fazer a retirada do dono (gaveta) sem pedir senha"),
    CAIXA_DIFERENCA("caixa.diferenca", "Fechar o caixa com diferença acima da tolerância sem pedir senha"),
    CAIXA_DESFAZER("caixa.desfazer", "Desfazer o fechamento do caixa"),
    CAIXA_CIENCIA("caixa.ciencia", "Dar ciência do fechamento com diferença acima da tolerância"),
    FINANCEIRO_BAIXA_CARTAO("financeiro.baixa_cartao", "Escolher se o cartão entra no banco na hora ou fica a receber"),
    DIA_FECHADO_LIBERAR("dia_fechado.liberar", "Liberar lançamento em dia com o caixa já fechado"),
    FIADO_LIBERAR("fiado.liberar", "Liberar venda no fiado acima do limite ou com fiado vencido"),
    SUPORTE_FERRAMENTAS("suporte.ferramentas", "Ferramentas do Adm. Sup (atualizações, ajustes, visões e manutenção)");

    private final String chave;
    private final String texto;

    Permissao(String chave, String texto) {
        this.chave = chave;
        this.texto = texto;
    }

    /** A chave guardada no banco (funções do Personalizado) e usada no histórico ("clientes.cpf"). */
    public String chave() {
        return chave;
    }

    public String texto() {
        return texto;
    }

    public static Optional<Permissao> daChave(String chave) {
        return Arrays.stream(values()).filter(p -> p.chave.equals(chave)).findFirst();
    }
}
