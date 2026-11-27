package com.saasluanmori.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Põe a loja e a pessoa da sessão conferida no {@link TenantContext} para o resto do pedido, e limpa no fim (a thread
 * volta para o servidor e atende outra loja depois). Também deixa as duas no pedido, para a linha de log.
 */
public class TenantFilter extends OncePerRequestFilter {

    public static final String LOJA = "saas.loja";
    public static final String USUARIO = "saas.usuario";

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a != null && a.getPrincipal() instanceof UsuarioLogado logado) {
            req.setAttribute(LOJA, logado.lojaId());
            req.setAttribute(USUARIO, logado.usuarioId());
            TenantContext.definir(logado.lojaId(), logado.usuarioId());
            try {
                chain.doFilter(req, res);
            } finally {
                TenantContext.limpar();
            }
            return;
        }
        chain.doFilter(req, res);
    }
}
