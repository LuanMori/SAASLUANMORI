package com.saasluanmori.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/**
 * O token de CSRF para os pedidos do HTMX: vai no {@code hx-headers} do {@code <body>} de toda página (decisão 2.4 do
 * prompt mestre). Os formulários comuns levam o token num campo escondido (o Thymeleaf põe sozinho).
 */
@ControllerAdvice
public class CabecalhosHtmx {

    @ModelAttribute("cabecalhosHtmx")
    public String cabecalhos(HttpServletRequest req) {
        Object t = req.getAttribute(CsrfToken.class.getName());
        if (!(t instanceof CsrfToken token)) {
            return "{}";
        }
        return "{\"" + token.getHeaderName() + "\":\"" + token.getToken() + "\"}";
    }
}
