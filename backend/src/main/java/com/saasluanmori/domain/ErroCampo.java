package com.saasluanmori.domain;

/**
 * Um problema num campo do formulário, como as validações do sistema antigo devolviam
 * ({@code legacy/core/src/resultado.ts:5-8}): o nome do campo ({@code "_"} = do formulário todo) e a mensagem exata.
 */
public record ErroCampo(String campo, String mensagem) {
}
