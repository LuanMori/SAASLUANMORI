package com.saasluanmori.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Com senha provisória, a pessoa só cria a própria senha ou sai ({@code legacy/api/src/auth/guarda-autenticacao.ts:51-53};
 * {@code legacy/web/src/App.tsx:108-120}): qualquer outra página vai para "Crie a sua senha"; qualquer outro pedido
 * dá 403 "Crie a sua senha antes de continuar.".
 */
public class SenhaProvisoriaFilter extends OncePerRequestFilter {

    static final String MENSAGEM = "Crie a sua senha antes de continuar.";
    private static final Set<String> LIBERADAS = Set.of("/criar-senha", "/sair", "/entrar", "/saude", "/error");
    /** Os arquivos da página (CSS, scripts, imagens) servem também à tela "Crie a sua senha". */
    private static final List<String> ARQUIVOS = List.of("/css/", "/js/", "/img/", "/webjars/");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        String caminho = req.getRequestURI().substring(req.getContextPath().length());
        boolean liberado = LIBERADAS.contains(caminho) || ARQUIVOS.stream().anyMatch(caminho::startsWith);
        if (!liberado && a != null && a.getPrincipal() instanceof UsuarioLogado logado && logado.senhaProvisoria()) {
            boolean pagina = "GET".equals(req.getMethod()) && !"true".equals(req.getHeader("HX-Request"));
            if (pagina) {
                res.sendRedirect("/criar-senha");
            } else {
                res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                res.setContentType("text/plain;charset=UTF-8");
                res.getOutputStream().write(MENSAGEM.getBytes(StandardCharsets.UTF_8));
            }
            return;
        }
        chain.doFilter(req, res);
    }
}
