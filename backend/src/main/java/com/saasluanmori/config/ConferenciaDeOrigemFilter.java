package com.saasluanmori.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Pedido que muda dados vindo de OUTRO site é recusado ({@code legacy/api/src/http/requisicao.ts:7-8,47-70}). O cookie
 * já é SameSite=Strict e as páginas levam o token de CSRF; isto é mais uma camada (cobre também um subdomínio vizinho).
 */
public class ConferenciaDeOrigemFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(ConferenciaDeOrigemFilter.class);
    private static final Set<String> SO_LEITURA = Set.of("GET", "HEAD", "OPTIONS");
    static final String MENSAGEM = "Pedido vindo de outro site recusado.";

    private final Set<String> liberadas;

    public ConferenciaDeOrigemFilter(Ambiente amb) {
        this.liberadas = Set.copyOf(amb.origensWeb());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        if (!SO_LEITURA.contains(req.getMethod()) && recusar(req)) {
            LOG.warn("origem_recusada metodo={}", req.getMethod());
            res.setStatus(403);
            res.setContentType("text/plain;charset=UTF-8");
            res.getOutputStream().write(MENSAGEM.getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(req, res);
    }

    private boolean recusar(HttpServletRequest req) {
        String origem = req.getHeader("Origin");
        if (origem == null) {
            return "cross-site".equals(req.getHeader("Sec-Fetch-Site"));
        }
        return !liberadas.contains(origem) && !mesmoEndereco(origem, req.getHeader("Host"));
    }

    private static boolean mesmoEndereco(String origem, String host) {
        if (host == null || host.isEmpty()) {
            return false;
        }
        try {
            URI u = URI.create(origem);
            String autoridade = u.getRawAuthority();
            return autoridade != null && autoridade.equalsIgnoreCase(host);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
