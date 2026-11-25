package saas.api;
import java.time.Duration;
import java.util.Map;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.servlet.config.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.method.HandlerMethod;
import jakarta.servlet.http.*;
@Configuration
public class Configuracao {
    @Bean
    JwtDecoder decoder(@Value("${AUTH0_DOMAIN}") String dominio, @Value("${AUTH0_AUDIENCE}") String audience) {
        if (dominio.isBlank() || dominio.contains("/") || dominio.contains(":") || audience.isBlank())
            throw new IllegalArgumentException("Configuração Auth0 inválida.");
        String issuer = "https://" + dominio + "/";
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(issuer + ".well-known/jwks.json")
            .jwsAlgorithm(SignatureAlgorithm.RS256).build();
        decoder.setClaimSetConverter(MappedJwtClaimSetConverter.withDefaults(Map.of("sub", v -> v, "org_id", v -> v)));
        OAuth2TokenValidator<Jwt> claims = jwt -> {
            if (jwt.getExpiresAt() != null && jwt.getAudience() != null && jwt.getAudience().contains(audience))
                return OAuth2TokenValidatorResult.success();
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
            new JwtTimestampValidator(Duration.ofSeconds(5)), new JwtIssuerValidator(issuer), claims));
        return decoder;
    }
    @Bean
    WebMvcConfigurer web(Autenticacao auth, @Value("${WEB_ORIGINS}") String origens) {
        String[] permitidas = Arrays.stream(origens.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
        if (permitidas.length == 0 || Arrays.asList(permitidas).contains("*")) throw new IllegalArgumentException("WEB_ORIGINS inválido.");
        return new WebMvcConfigurer() {
            @Override public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**").allowedOrigins(permitidas).allowedMethods("GET","POST")
                    .allowedHeaders("Authorization","Content-Type").allowCredentials(false).maxAge(600);
            }
            @Override public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new HandlerInterceptor() {
                    @Override public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
                        if (handler instanceof HandlerMethod && !"/error".equals(req.getServletPath()) && !"OPTIONS".equals(req.getMethod()))
                            req.setAttribute("contexto", auth.verificar(req.getHeader("Authorization")));
                        return true;
                    }
                });
            }
        };
    }
}
