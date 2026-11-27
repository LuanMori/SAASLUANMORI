package com.saasluanmori.config;

import com.saasluanmori.domain.BaseTenantEntity;
import com.saasluanmori.domain.Login;
import com.saasluanmori.domain.Usuario;
import com.saasluanmori.repository.SuporteRepository;
import com.saasluanmori.repository.UsuarioRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Acha quem está entrando na loja do {@link TenantContext} ({@code legacy/api/src/auth/sessao.service.ts:171-185}):
 * login fora do formato nem é procurado; ninguém da loja com esse login → procura o Adm. Sup pela função
 * {@code app_suporte_para_login}; nem assim → "não existe".
 */
@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UsuarioRepository usuarios;
    private final SuporteRepository suporte;
    private final TransactionTemplate transacao;

    public UserDetailsServiceImpl(UsuarioRepository usuarios, SuporteRepository suporte, PlatformTransactionManager transacoes) {
        this.usuarios = usuarios;
        this.suporte = suporte;
        this.transacao = new TransactionTemplate(transacoes);
        this.transacao.setReadOnly(true);
    }

    @Override
    public UserDetails loadUserByUsername(String login) {
        return procurar(login).orElseThrow(() -> new UsernameNotFoundException("Usuário não encontrado."));
    }

    /** A pessoa da loja com esse login, ou o Adm. Sup, ou vazio. */
    public Optional<UsuarioDetalhes> procurar(String login) {
        if (!Login.noFormato(login)) {
            return Optional.empty();
        }
        UUID loja = TenantContext.require();
        return transacao.execute(status -> {
            Optional<Usuario> daLoja = usuarios.findByTenantIdAndUsuario(loja, login);
            if (daLoja.isPresent()) {
                return daLoja.filter(u -> u.getPapel().ehDeLoja()).map(u -> UsuarioDetalhes.daLoja(u, BaseTenantEntity.agora()));
            }
            return suporte.paraLogin(login).map(s -> UsuarioDetalhes.doSuporte(s, BaseTenantEntity.agora()));
        });
    }
}
