package com.saasluanmori.config;

import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.DeferredSecurityContext;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Quem está logado vem SÓ da sessão conferida no banco a cada pedido, pelo cookie {@code __Host-sessao}
 * ({@code legacy/api/src/auth/guarda-autenticacao.ts:1-60}), e não da sessão do servidor de aplicação (que criaria um
 * cookie {@code JSESSIONID} que o sistema antigo não tinha; decisão T4 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}).
 * Nada é guardado aqui: a sessão nasce no login e morre no banco.
 */
@Component
public class SessaoSecurityContextRepository implements SecurityContextRepository {

    /** Atributo do pedido: havia um cookie de sessão, mas a sessão não vale mais. */
    public static final String SESSAO_TERMINOU = "saas.sessaoTerminou";

    private final SessaoService sessoes;
    private final Ambiente amb;

    public SessaoSecurityContextRepository(SessaoService sessoes, Ambiente amb) {
        this.sessoes = sessoes;
        this.amb = amb;
    }

    @Override
    public DeferredSecurityContext loadDeferredContext(HttpServletRequest request) {
        Supplier<SecurityContext> carregar = () -> carregar(request);
        return new DeferredSecurityContext() {
            private SecurityContext carregado;

            @Override
            public SecurityContext get() {
                if (carregado == null) {
                    carregado = carregar.get();
                }
                return carregado;
            }

            @Override
            public boolean isGenerated() {
                return get().getAuthentication() == null;
            }
        };
    }

    private SecurityContext carregar(HttpServletRequest request) {
        Optional<String> cookie = CookieDaSessao.doPedido(request, amb.nomeDoCookie());
        Optional<UsuarioLogado> logado = cookie.flatMap(c -> sessoes.validar(request.getHeader("Host"), c));
        if (logado.isEmpty()) {
            if (cookie.isPresent()) {
                request.setAttribute(SESSAO_TERMINOU, Boolean.TRUE);
            }
            return SecurityContextHolder.createEmptyContext();
        }
        return new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(logado.get(), null, List.of()));
    }

    /** Não usado pelo Spring Security 6 (que chama {@link #loadDeferredContext}). */
    @Override
    @Deprecated(forRemoval = false)
    public SecurityContext loadContext(HttpRequestResponseHolder holder) {
        return loadDeferredContext(holder.getRequest()).get();
    }

    @Override
    public void saveContext(SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
        // a sessão é criada no login (SessaoService.entrar) e encerrada no banco
    }

    @Override
    public boolean containsContext(HttpServletRequest request) {
        return CookieDaSessao.doPedido(request, amb.nomeDoCookie()).isPresent();
    }
}
