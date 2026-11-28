package com.saasluanmori.web;

import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.RegrasDeSenha;
import com.saasluanmori.service.ErroDeRegra;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * O formulário de senha do sistema antigo ({@code FormTrocarSenha}, {@code legacy/web/src/painel/TrocarSenha.tsx:24-99}),
 * o mesmo em "Crie a sua senha" (primeiro acesso) e em "Trocar a senha" (aba Meu usuário): as conferências da tela vêm
 * primeiro, na mesma ordem; depois, as do servidor. Os avisos voltam nos marcadores {@code cs-erro-*} e {@code cs-alerta}
 * ({@code criar-senha-avisos.html}).
 */
final class FormularioDeSenha {

    private FormularioDeSenha() {
    }

    /** As conferências da tela ({@code TrocarSenha.tsx:33-42}): campo → aviso; vazio = pode enviar. */
    static Map<String, String> conferir(UsuarioLogado logado, String atual, String nova, String confirmacao) {
        Map<String, String> erros = new LinkedHashMap<>();
        if (atual.isEmpty()) {
            erros.put("atual", "Informe a senha atual.");
        }
        Optional<String> regra = RegrasDeSenha.validar(nova, logado.usuario(), logado.nome());
        if (regra.isPresent()) {
            erros.put("nova", regra.get());
        } else if (nova.equals(atual)) {
            erros.put("nova", "A senha nova precisa ser diferente da atual.");
        }
        if (!erros.containsKey("nova") && !confirmacao.equals(nova)) {
            erros.put("confirmacao", "A confirmação está diferente da senha nova.");
        }
        return erros;
    }

    /** A recusa do servidor ({@code TrocarSenha.tsx:51-53}): a senha atual errada vai no campo dela. */
    static Map<String, String> doServidor(ErroDeRegra e) {
        Map<String, String> erros = new LinkedHashMap<>();
        if (e.erros().stream().anyMatch(x -> x.campo().equals("senhaAtual"))) {
            erros.put("atual", "Senha atual errada.");
        }
        return erros;
    }

    static String texto(String v) {
        return v == null ? "" : v;
    }
}
