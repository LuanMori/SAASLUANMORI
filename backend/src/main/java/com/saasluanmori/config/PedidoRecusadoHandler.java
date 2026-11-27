package com.saasluanmori.config;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.access.AccessDeniedHandlerImpl;

/**
 * O pedido recusado pela segurança (na prática, o token de CSRF da página não é o da sessão atual: a pessoa saiu e
 * entrou de novo em outra aba). Num pedido do HTMX, a página recarrega com a sessão atual, em vez de a página de erro
 * entrar no meio da tela; nos outros pedidos, a página de erro 403 de sempre (decisão T18).
 */
public class PedidoRecusadoHandler implements AccessDeniedHandler {

    private final AccessDeniedHandler padrao = new AccessDeniedHandlerImpl();

    @Override
    public void handle(HttpServletRequest req, HttpServletResponse res, AccessDeniedException e) throws IOException, ServletException {
        if ("true".equals(req.getHeader("HX-Request"))) {
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setHeader("HX-Refresh", "true");
            return;
        }
        padrao.handle(req, res, e);
    }
}
