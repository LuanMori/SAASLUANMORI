package com.saasluanmori.web;

import com.saasluanmori.config.TenantFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Vale para todo pedido, antes de tudo ({@code legacy/api/src/http/requisicao.ts:1-45}):
 * <ul>
 *   <li>{@code X-Request-Id}: o id que liga a linha de log ao erro que a pessoa viu (aceita o que o proxy mandar, se for
 *       um id razoável; senão cria um);</li>
 *   <li>uma linha de log ao terminar: rota (o padrão, nunca o endereço com os valores), status, tempo, loja e usuário —
 *       só ids. {@code /saude} respondendo ok só aparece no nível debug.</li>
 * </ul>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequisicaoFilter extends OncePerRequestFilter {

    public static final String ID = "saas.idRequisicao";
    private static final Logger LOG = LoggerFactory.getLogger("requisicao");
    private static final Pattern ID_VALIDO = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String recebido = req.getHeader("X-Request-Id");
        String id = recebido != null && ID_VALIDO.matcher(recebido).matches() ? recebido : UUID.randomUUID().toString();
        req.setAttribute(ID, id);
        res.setHeader("X-Request-Id", id);
        long inicio = System.nanoTime();
        try {
            chain.doFilter(req, res);
        } finally {
            long ms = Math.round((System.nanoTime() - inicio) / 1e6);
            Object padrao = req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String rota = padrao == null ? "(sem rota)" : padrao.toString();
            int status = res.getStatus();
            String linha = "{\"evento\":\"requisicao\",\"id\":\"" + id + "\",\"metodo\":\"" + req.getMethod() + "\",\"rota\":\"" + rota
                    + "\",\"status\":" + status + ",\"ms\":" + ms + ",\"loja\":" + json(req.getAttribute(TenantFilter.LOJA))
                    + ",\"usuario\":" + json(req.getAttribute(TenantFilter.USUARIO)) + "}";
            if (status >= 500) {
                LOG.error(linha);
            } else if ("/saude".equals(rota) && status == 200) {
                LOG.debug(linha);
            } else {
                LOG.info(linha);
            }
        }
    }

    private static String json(Object valor) {
        return valor == null ? "null" : "\"" + valor + "\"";
    }
}
