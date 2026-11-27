package com.saasluanmori.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.header.writers.CrossOriginOpenerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;

/**
 * Segurança (decisões 2.4 do prompt mestre e T1, T4, T5 e T6 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}):
 * <ul>
 *   <li>login próprio pelo {@link DaoAuthenticationProvider} com o {@link SenhaScrypt} (formato antigo) e o
 *       {@link UserDetailsServiceImpl}; bloqueado é conferido antes da senha e desativado só depois;</li>
 *   <li>quem está logado vem da sessão do banco pelo cookie {@code __Host-sessao} (sem sessão do servidor);</li>
 *   <li>CSRF ligado, com o token ligado à sessão; o envio da entrada fica fora do token (exclusão pontual da decisão
 *       2.4) e é protegido pelo SameSite=Strict e pela conferência de origem, que vale para todo pedido;</li>
 *   <li>a mesma CSP e os mesmos cabeçalhos do nginx do sistema antigo ({@code legacy/web/nginx/seguranca.conf:1-13}).</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
            + "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
    static final String PERMISSOES_DO_NAVEGADOR = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

    /** O custo das senhas novas: {@code SAAS_SENHA_LOG_N} (padrão 15; os testes automatizados usam 10). */
    @Bean
    public PasswordEncoder passwordEncoder(Environment env) {
        String custo = env.getProperty("SAAS_SENHA_LOG_N", String.valueOf(SenhaScrypt.LOG_N_PADRAO)).trim();
        try {
            return new SenhaScrypt(Integer.parseInt(custo));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("SAAS_SENHA_LOG_N inválida (use um número de 10 a 20).", e);
        }
    }

    @Bean
    public DaoAuthenticationProvider provedorDeLogin(UserDetailsServiceImpl usuarios, PasswordEncoder senhas) {
        DaoAuthenticationProvider p = new DaoAuthenticationProvider();
        p.setPasswordEncoder(senhas);
        p.setUserDetailsService(usuarios);
        p.setHideUserNotFoundExceptions(false);
        p.setPreAuthenticationChecks(u -> {
            if (!u.isAccountNonLocked()) {
                throw new UsuarioBloqueadoException(((UsuarioDetalhes) u).getBloqueioRestante());
            }
        });
        p.setPostAuthenticationChecks(u -> {
            if (!u.isEnabled()) {
                throw new UsuarioDesativadoException(((UsuarioDetalhes) u).isSuporte());
            }
        });
        return p;
    }

    @Bean
    public AuthenticationManager authenticationManager(DaoAuthenticationProvider provedor) {
        return new ProviderManager(provedor);
    }

    @Bean
    public SecurityFilterChain filtros(HttpSecurity http, SessaoSecurityContextRepository contexto, SessaoCsrfTokenRepository csrf, Ambiente amb)
            throws Exception {
        http
                .securityContext(c -> c.securityContextRepository(contexto))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(c -> c.requestCache(new NullRequestCache()))
                .csrf(c -> c.csrfTokenRepository(csrf).ignoringRequestMatchers("/entrar"))
                .formLogin(f -> f.disable())
                .httpBasic(b -> b.disable())
                .logout(l -> l.disable())
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/entrar", "/sair", "/saude", "/error", "/css/**", "/js/**", "/img/**", "/webjars/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(new EntradaEntryPoint(amb)).accessDeniedHandler(new PedidoRecusadoHandler()))
                .headers(h -> h
                        .contentSecurityPolicy(c -> c.policyDirectives(CSP))
                        .frameOptions(f -> f.deny())
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .addHeaderWriter(new StaticHeadersWriter("Permissions-Policy", PERMISSOES_DO_NAVEGADOR))
                        .crossOriginOpenerPolicy(c -> c.policy(CrossOriginOpenerPolicyHeaderWriter.CrossOriginOpenerPolicy.SAME_ORIGIN))
                        .httpStrictTransportSecurity(s -> s.includeSubDomains(true).maxAgeInSeconds(31_536_000).requestMatcher(AnyRequestMatcher.INSTANCE))
                        .xssProtection(x -> x.disable()))
                .addFilterBefore(new ConferenciaDeOrigemFilter(amb), CsrfFilter.class)
                .addFilterAfter(new TenantFilter(), AuthorizationFilter.class)
                .addFilterAfter(new SenhaProvisoriaFilter(), TenantFilter.class);
        return http.build();
    }
}
