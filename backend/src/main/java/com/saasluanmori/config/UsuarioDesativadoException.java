package com.saasluanmori.config;

import java.io.Serial;
import org.springframework.security.authentication.DisabledException;

/** Senha certa, mas o acesso está desativado. */
public class UsuarioDesativadoException extends DisabledException {

    @Serial
    private static final long serialVersionUID = 1L;

    public UsuarioDesativadoException(boolean suporte) {
        super(suporte ? "Este acesso de suporte está desativado." : "Seu acesso a esta loja está desativado. Fale com o Dono da loja.");
    }
}
