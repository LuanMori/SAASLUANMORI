package saas.api;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Service;
@Service
public class Autenticacao {
    private final JwtDecoder decoder;
    private final Banco banco;
    public Autenticacao(JwtDecoder decoder, Banco banco) { this.decoder = decoder; this.banco = banco; }
    public record Contexto(UUID lojaId, UUID usuarioId, String papel, String auth0Sub) {}
    public Contexto verificar(String cabecalho) {
        String[] partes = cabecalho == null ? new String[0] : cabecalho.split(" ", -1);
        if (partes.length != 2 || !"bearer".equalsIgnoreCase(partes[0]) || partes[1].isEmpty())
            throw new ErroApi(401, "Faça login para continuar.");
        Jwt jwt;
        String sub;
        try {
            jwt = decoder.decode(partes[1]);
            Object valor = jwt.getClaims().get("sub");
            if (!(valor instanceof String s) || s.isEmpty()) throw new IllegalArgumentException();
            sub = s;
        } catch (RuntimeException e) {
            throw new ErroApi(401, "Sessão inválida ou expirada. Faça login novamente.");
        }
        Object org = jwt.getClaims().get("org_id");
        if (!(org instanceof String orgId) || orgId.isEmpty())
            throw new ErroApi(403, "Sua conta não está vinculada a uma loja.");
        Banco.Loja loja = banco.buscarLoja(orgId);
        if (loja == null || !loja.ativa()) throw new ErroApi(403, "Loja não encontrada ou inativa.");
        Banco.Usuario usuario = banco.buscarUsuario(loja.id(), sub);
        if (usuario == null)
            throw new ErroApi(403, "Seu acesso a esta loja ainda não foi liberado. Peça ao dono da loja para cadastrar você.");
        if (!usuario.ativo()) throw new ErroApi(403, "Seu acesso a esta loja está desativado.");
        return new Contexto(loja.id(), usuario.id(), usuario.papel(), sub);
    }
}
