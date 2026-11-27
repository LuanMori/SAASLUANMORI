package com.saasluanmori.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.UUID;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import org.springframework.stereotype.Component;

/**
 * O token de CSRF fica ligado à sessão do banco (decisão T5 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}): é
 * calculado a partir do segredo do cookie da sessão, que só o navegador da pessoa tem (o cookie é HttpOnly e
 * SameSite=Strict) — sem cookie novo e sem coluna nova. A página leva o token no {@code hx-headers} do layout e nos
 * formulários; outro site não consegue montá-lo. Sem sessão (a tela de entrada), o token é sorteado e não vale para
 * nada: o envio da entrada fica fora do token e é protegido como no antigo (SameSite=Strict e a conferência de origem).
 */
@Component
public class SessaoCsrfTokenRepository implements CsrfTokenRepository {

    static final String CABECALHO = "X-CSRF-TOKEN";
    static final String PARAMETRO = "_csrf";

    private final Ambiente amb;

    public SessaoCsrfTokenRepository(Ambiente amb) {
        this.amb = amb;
    }

    @Override
    public CsrfToken generateToken(HttpServletRequest request) {
        CsrfToken daSessao = loadToken(request);
        return daSessao != null ? daSessao : new DefaultCsrfToken(CABECALHO, PARAMETRO, UUID.randomUUID().toString());
    }

    @Override
    public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
        // calculado de novo a cada pedido a partir da sessão
    }

    @Override
    public CsrfToken loadToken(HttpServletRequest request) {
        return CookieDaSessao.doPedido(request, amb.nomeDoCookie())
                .flatMap(CookieDaSessao::ler)
                .map(lido -> (CsrfToken) new DefaultCsrfToken(CABECALHO, PARAMETRO, derivar(lido.segredo())))
                .orElse(null);
    }

    /** SHA-256 de "csrf:" + o segredo da sessão, em base64url (diferente do hash guardado no banco). */
    static String derivar(String segredo) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(("csrf:" + segredo).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível.", e);
        }
    }
}
