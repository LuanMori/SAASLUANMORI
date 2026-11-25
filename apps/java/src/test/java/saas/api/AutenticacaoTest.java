package saas.api;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutenticacaoTest {
    final Banco banco = mock(Banco.class);
    final JwtDecoder decoder = mock(JwtDecoder.class);
    final Autenticacao auth = new Autenticacao(decoder, banco);
    final UUID loja = UUID.randomUUID();
    final UUID usuario = UUID.randomUUID();
    Jwt token(boolean temOrg) {
        var b = Jwt.withTokenValue("token").header("alg","RS256").subject("auth0|pessoa")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300));
        if (temOrg) b.claim("org_id","org_A");
        return b.build();
    }
    @Test void semBearer() {
        assertEquals(401, assertThrows(ErroApi.class, () -> auth.verificar(null)).status);
        verifyNoInteractions(decoder,banco);
    }
    @Test void semOrg() {
        when(decoder.decode("token")).thenReturn(token(false));
        assertEquals(403, assertThrows(ErroApi.class, () -> auth.verificar("Bearer token")).status);
        verifyNoInteractions(banco);
    }
    @Test void lojaInativa() {
        when(decoder.decode("token")).thenReturn(token(true));
        when(banco.buscarLoja("org_A")).thenReturn(new Banco.Loja(loja,false));
        assertEquals(403, assertThrows(ErroApi.class, () -> auth.verificar("Bearer token")).status);
        verify(banco,never()).buscarUsuario(any(),any());
    }
    @Test void somenteUsuarioCadastradoEAtivo() {
        when(decoder.decode("token")).thenReturn(token(true));
        when(banco.buscarLoja("org_A")).thenReturn(new Banco.Loja(loja,true));
        assertEquals(403, assertThrows(ErroApi.class, () -> auth.verificar("Bearer token")).status);
        when(banco.buscarUsuario(loja,"auth0|pessoa")).thenReturn(new Banco.Usuario(usuario,"vendedor",false));
        assertEquals(403, assertThrows(ErroApi.class, () -> auth.verificar("Bearer token")).status);
        when(banco.buscarUsuario(loja,"auth0|pessoa")).thenReturn(new Banco.Usuario(usuario,"vendedor",true));
        assertEquals(new Autenticacao.Contexto(loja,usuario,"vendedor","auth0|pessoa"),auth.verificar("Bearer token"));
    }
}
