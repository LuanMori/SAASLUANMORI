package com.saasluanmori.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

/**
 * Sem sessão válida, volta para a tela de entrada ({@code legacy/api/src/auth/guarda-autenticacao.ts:39-48};
 * {@code legacy/web/src/App.tsx:74-75}). Se havia um cookie (a sessão terminou no meio do uso), o cookie é apagado e a
 * entrada mostra "Sua sessão terminou. Entre de novo.". Num pedido do HTMX, a tela inteira vai para a entrada.
 */
public class EntradaEntryPoint implements AuthenticationEntryPoint {

    private final Ambiente amb;

    public EntradaEntryPoint(Ambiente amb) {
        this.amb = amb;
    }

    @Override
    public void commence(HttpServletRequest req, HttpServletResponse res, AuthenticationException e) throws IOException {
        boolean terminou = Boolean.TRUE.equals(req.getAttribute(SessaoSecurityContextRepository.SESSAO_TERMINOU));
        if (terminou) {
            res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
        }
        String destino = "/entrar" + (terminou ? "?aviso=" + Avisos.SESSAO_ENCERRADA : "");
        if ("true".equals(req.getHeader("HX-Request"))) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setHeader("HX-Redirect", destino);
            return;
        }
        res.setStatus("GET".equals(req.getMethod()) || "HEAD".equals(req.getMethod()) ? HttpServletResponse.SC_FOUND : HttpServletResponse.SC_SEE_OTHER);
        res.setHeader("Location", destino);
    }
}
