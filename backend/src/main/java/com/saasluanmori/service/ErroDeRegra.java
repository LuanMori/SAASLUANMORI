package com.saasluanmori.service;

import com.saasluanmori.domain.ErroCampo;
import java.io.Serial;
import java.util.List;

/**
 * Uma recusa de regra, com o status HTTP, a mensagem EXATA do sistema antigo, o código e os erros por campo
 * ({@code legacy/api/src/http/filtro-erros.ts:1-27}): {@code { status, mensagem, codigo?, erros? }}. No 429, os segundos
 * vão no cabeçalho {@code Retry-After}.
 */
public class ErroDeRegra extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final int status;
    private final String codigo;
    private final Long segundos;
    private final transient List<ErroCampo> erros;

    public ErroDeRegra(int status, String mensagem, String codigo, Long segundos, List<ErroCampo> erros) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
        this.segundos = segundos;
        this.erros = List.copyOf(erros);
    }

    public static ErroDeRegra de(int status, String mensagem) {
        return new ErroDeRegra(status, mensagem, null, null, List.of());
    }

    public static ErroDeRegra de(int status, String mensagem, String codigo) {
        return new ErroDeRegra(status, mensagem, codigo, null, List.of());
    }

    /** 429 "muitas tentativas", com o tempo de espera. */
    public static ErroDeRegra muitasTentativas(String mensagem, long segundos) {
        return new ErroDeRegra(429, mensagem, "muitas_tentativas", segundos, List.of());
    }

    /** 400 com o erro de um campo. */
    public static ErroDeRegra noCampo(String mensagem, String campo, String mensagemDoCampo) {
        return new ErroDeRegra(400, mensagem, null, null, List.of(new ErroCampo(campo, mensagemDoCampo)));
    }

    public int status() {
        return status;
    }

    public String codigo() {
        return codigo;
    }

    /** Segundos de espera (só no 429). */
    public Long segundos() {
        return segundos;
    }

    public List<ErroCampo> erros() {
        return erros;
    }
}
