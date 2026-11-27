package com.saasluanmori.config;

import com.saasluanmori.domain.Tentativas;
import java.io.Serial;
import org.springframework.security.authentication.LockedException;

/** Bloqueado por 5 senhas erradas: recusado sem conferir a senha. */
public class UsuarioBloqueadoException extends LockedException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final long segundos;

    public UsuarioBloqueadoException(long segundos) {
        super(Tentativas.mensagemBloqueado(segundos));
        this.segundos = segundos;
    }

    public long getSegundos() {
        return segundos;
    }
}
