package com.saasluanmori.config;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.Tentativas;
import com.saasluanmori.domain.Usuario;
import com.saasluanmori.repository.SuporteRepository;
import java.io.Serial;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * A pessoa que está tentando entrar, para o {@code DaoAuthenticationProvider}: uma pessoa da loja ou o Adm. Sup.
 * "Bloqueado" (5 senhas erradas) é conferido ANTES da senha; "desativado", só DEPOIS da senha certa (só quem sabe a
 * senha descobre que está desativado) ({@code legacy/api/src/auth/sessao.service.ts:187-205}).
 */
public final class UsuarioDetalhes implements UserDetails {

    @Serial
    private static final long serialVersionUID = 1L;

    private final UUID id;
    private final String login;
    private final String nome;
    private final Papel papel;
    private final transient List<String> permissoes;
    private final boolean ativo;
    private final boolean senhaProvisoria;
    private final transient String senhaHash;
    private final transient Tentativas.Estado tentativas;
    private final long bloqueioRestante;
    private final boolean suporte;

    private UsuarioDetalhes(UUID id, String login, String nome, Papel papel, List<String> permissoes, boolean ativo, boolean senhaProvisoria,
            String senhaHash, Tentativas.Estado tentativas, Instant agora, boolean suporte) {
        this.id = id;
        this.login = login;
        this.nome = nome;
        this.papel = papel;
        this.permissoes = List.copyOf(permissoes);
        this.ativo = ativo;
        this.senhaProvisoria = senhaProvisoria;
        this.senhaHash = senhaHash;
        this.tentativas = tentativas;
        Tentativas.Situacao s = Tentativas.situacao(tentativas, agora);
        this.bloqueioRestante = s.bloqueado() ? s.restanteSegundos() : 0;
        this.suporte = suporte;
    }

    public static UsuarioDetalhes daLoja(Usuario u, Instant agora) {
        List<String> funcoes = u.getPapel() == Papel.PERSONALIZADO ? u.getPermissoes() : List.of();
        return new UsuarioDetalhes(u.getId(), u.getUsuario(), u.getNome(), u.getPapel(), funcoes, u.isAtivo(), u.isSenhaProvisoria(),
                u.getSenhaHash(), u.getTentativas(), agora, false);
    }

    /** O Adm. Sup: aparece como "Suporte", sem funções avulsas e nunca com senha provisória. */
    public static UsuarioDetalhes doSuporte(SuporteRepository.ParaLogin s, Instant agora) {
        return new UsuarioDetalhes(s.id(), s.usuario(), Papel.NOME_SUPORTE, Papel.SUPER_ADMIN, List.of(), s.ativo(), false, s.senhaHash(),
                new Tentativas.Estado(s.tentativasErradas(), s.bloqueadoAte()), agora, true);
    }

    public UUID getId() {
        return id;
    }

    public String getNome() {
        return nome;
    }

    public Papel getPapel() {
        return papel;
    }

    public List<String> getPermissoes() {
        return permissoes;
    }

    public boolean isSenhaProvisoria() {
        return senhaProvisoria;
    }

    public Tentativas.Estado getTentativas() {
        return tentativas;
    }

    /** Segundos que faltam do bloqueio por senhas erradas (0 = não está bloqueado). */
    public long getBloqueioRestante() {
        return bloqueioRestante;
    }

    public boolean isSuporte() {
        return suporte;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of();
    }

    @Override
    public String getPassword() {
        return senhaHash;
    }

    @Override
    public String getUsername() {
        return login;
    }

    @Override
    public boolean isAccountNonLocked() {
        return bloqueioRestante == 0;
    }

    @Override
    public boolean isEnabled() {
        return ativo;
    }
}
