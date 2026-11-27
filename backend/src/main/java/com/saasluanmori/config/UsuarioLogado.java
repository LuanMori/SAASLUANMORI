package com.saasluanmori.config;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.Permissao;
import com.saasluanmori.domain.Permissoes;
import java.util.List;
import java.util.UUID;

/**
 * Quem está logado, montado SÓ a partir da sessão conferida no banco ({@code legacy/api/src/auth/contexto.ts:8-22}).
 * Telas e serviços leem a loja e a pessoa daqui, nunca do corpo, da URL ou de um cabeçalho.
 *
 * @param papel      {@link Papel#SUPER_ADMIN} = o Adm. Sup, que entra em qualquer loja
 * @param permissoes só no Personalizado: as funções escolhidas para ele
 * @param usuario    o login
 */
public record UsuarioLogado(
        UUID lojaId,
        String lojaNome,
        String lojaSubdominio,
        UUID usuarioId,
        Papel papel,
        List<String> permissoes,
        String nome,
        String usuario,
        UUID sessaoId,
        boolean senhaProvisoria) {

    public UsuarioLogado {
        permissoes = List.copyOf(permissoes);
    }

    public boolean pode(Permissao permissao) {
        return Permissoes.pode(papel, permissoes, permissao);
    }

    /** O mesmo, com a senha já criada (depois do primeiro acesso). */
    public UsuarioLogado comSenhaCriada() {
        return new UsuarioLogado(lojaId, lojaNome, lojaSubdominio, usuarioId, papel, permissoes, nome, usuario, sessaoId, false);
    }
}
