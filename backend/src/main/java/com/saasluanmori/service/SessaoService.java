package com.saasluanmori.service;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.config.TenantContext;
import com.saasluanmori.config.UserDetailsServiceImpl;
import com.saasluanmori.config.UsuarioBloqueadoException;
import com.saasluanmori.config.UsuarioDesativadoException;
import com.saasluanmori.config.UsuarioDetalhes;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.AcaoAuditoria;
import com.saasluanmori.domain.BaseTenantEntity;
import com.saasluanmori.domain.Login;
import com.saasluanmori.domain.Loja;
import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.RegrasDeSenha;
import com.saasluanmori.domain.Sessao;
import com.saasluanmori.domain.Subdominio;
import com.saasluanmori.domain.Tentativas;
import com.saasluanmori.domain.Usuario;
import com.saasluanmori.repository.LojaRepository;
import com.saasluanmori.repository.SessaoRepository;
import com.saasluanmori.repository.SuporteRepository;
import com.saasluanmori.repository.UsuarioRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Login próprio: usuário e senha guardados no banco da loja ({@code legacy/api/src/auth/sessao.service.ts:1-450};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §1). Entrar:
 * <ol>
 *   <li>IP bloqueado (5 erros em 1 min)? → 429;</li>
 *   <li>a loja vem do ENDEREÇO acessado (com {@code DOMINIO_BASE}), nunca do que a tela manda;</li>
 *   <li>uma tentativa por vez para o mesmo usuário, sem segurar conexão do banco;</li>
 *   <li>usuário bloqueado (5 senhas erradas = 5 min)? → 429, sem nem conferir a senha;</li>
 *   <li>a senha é conferida FORA da transação (pelo {@code DaoAuthenticationProvider} com o scrypt);</li>
 *   <li>errou: conta no banco com a linha travada → 401 (na 5ª, 429); usuário que NÃO existe responde igual, no
 *       mesmo tempo e com o mesmo bloqueio;</li>
 *   <li>acertou, mas desativado → 403 (só quem sabe a senha descobre);</li>
 *   <li>acertou: zera a contagem, cria a sessão (segredo novo a cada login) e grava no histórico.</li>
 * </ol>
 * O Adm. Sup entra em QUALQUER loja com o login dele: a linha dele não aparece para a aplicação (RLS); as funções
 * {@code app_suporte_*} do banco dão só o que o login e a sessão precisam.
 */
@Service
public class SessaoService {

    private static final Logger LOG = LoggerFactory.getLogger(SessaoService.class);

    /** A loja da tela de entrada e se a tela precisa pedir o endereço (sem {@code DOMINIO_BASE}). */
    public record Entrada(Optional<Loja> loja, boolean informarLoja) {
    }

    /** Entrou: o cabeçalho {@code Set-Cookie} e quem está logado. */
    public record Resultado(String cookie, UsuarioLogado logado) {
    }

    /** O tamanho máximo lido de cada campo: senha real tem até 128; o resto só não pode travar o scrypt. */
    static final int CORTE = 1024;

    private final Ambiente amb;
    private final LojaRepository lojas;
    private final UsuarioRepository usuarios;
    private final SessaoRepository sessoes;
    private final SuporteRepository suporte;
    private final HistoricoService historico;
    private final ComLoja comLoja;
    private final LimitesDeLogin limites;
    private final AuthenticationManager autenticador;
    private final UserDetailsServiceImpl detalhes;
    private final PasswordEncoder senhas;

    public SessaoService(Ambiente amb, LojaRepository lojas, UsuarioRepository usuarios, SessaoRepository sessoes, SuporteRepository suporte,
            HistoricoService historico, ComLoja comLoja, LimitesDeLogin limites, AuthenticationManager autenticador, UserDetailsServiceImpl detalhes,
            PasswordEncoder senhas) {
        this.amb = amb;
        this.lojas = lojas;
        this.usuarios = usuarios;
        this.sessoes = sessoes;
        this.suporte = suporte;
        this.historico = historico;
        this.comLoja = comLoja;
        this.limites = limites;
        this.autenticador = autenticador;
        this.detalhes = detalhes;
        this.senhas = senhas;
    }

    // ------------------------------------------------------------------ loja da tela de entrada

    /** Com {@code DOMINIO_BASE}, a loja é a do endereço; sem ele (desenvolvimento), a informada. */
    public Optional<Loja> lojaDoPedido(String host, String informada) {
        String sub;
        if (amb.dominioBase() != null) {
            sub = Subdominio.doEndereco(host, amb.dominioBase());
        } else {
            Subdominio.Resultado v = Subdominio.validar(informada);
            sub = v.ok() ? v.valor() : null;
        }
        return sub == null ? Optional.empty() : lojas.findBySubdominio(sub).filter(Loja::isAtiva);
    }

    /** A loja que a tela de entrada mostra ({@code sessao.service.ts:127-131}). */
    public Entrada lojaParaEntrada(String host, String informada) {
        Optional<Loja> loja = amb.dominioBase() != null || informada != null ? lojaDoPedido(host, informada) : Optional.empty();
        return new Entrada(loja, amb.dominioBase() == null);
    }

    // ------------------------------------------------------------------ entrar

    public Resultado entrar(String host, String lojaInformada, String usuario, String senha, String ip, String cookieAnterior) {
        if (vazio(usuario) || vazio(senha)) {
            throw ErroDeRegra.de(400, "Informe o usuário e a senha.");
        }
        String senhaLida = cortar(senha);
        barrarIp(ip);
        Loja loja = lojaDoPedido(host, lojaInformada).orElse(null);
        if (loja == null) {
            falhaDoIp(ip);
            throw ErroDeRegra.de(404, "Loja não encontrada. Confira o endereço.", "loja_nao_encontrada");
        }
        String login = Login.normalizar(cortar(usuario));
        Optional<CookieDaSessao.Lido> anterior = CookieDaSessao.ler(cookieAnterior);
        return limites.umaPorVez(loja.getId() + ":" + login, () -> entrarNaLoja(loja, login, senhaLida, ip, anterior));
    }

    private Resultado entrarNaLoja(Loja loja, String login, String senha, String ip, Optional<CookieDaSessao.Lido> anterior) {
        barrarIp(ip); // pode ter sido bloqueado enquanto esperava a vez
        Instant agora = BaseTenantEntity.agora();
        Optional<UsuarioDetalhes> candidato = TenantContext.comLoja(loja.getId(), null, () -> detalhes.procurar(login));
        if (candidato.isEmpty()) {
            return falhaSemUsuario(loja.getId() + ":" + login, senha, ip, agora);
        }
        UsuarioDetalhes c = candidato.get();
        Authentication autenticado;
        try {
            autenticado = TenantContext.comLoja(loja.getId(), null,
                    () -> autenticador.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(login, senha)));
        } catch (UsuarioBloqueadoException e) {
            throw ErroDeRegra.muitasTentativas(e.getMessage(), e.getSegundos());
        } catch (UsuarioDesativadoException e) {
            throw ErroDeRegra.de(403, e.getMessage(), "usuario_desativado");
        } catch (UsernameNotFoundException e) {
            return falhaSemUsuario(loja.getId() + ":" + login, senha, ip, agora);
        } catch (BadCredentialsException e) {
            throw c.isSuporte() ? senhaErradaDoSuporte(loja, c, ip) : senhaErrada(loja, c, ip);
        }
        UsuarioDetalhes u = (UsuarioDetalhes) autenticado.getPrincipal();
        return u.isSuporte() ? abrirSessaoDoSuporte(loja, u, anterior) : abrirSessao(loja, u, anterior);
    }

    private record AposErro(boolean bloqueou, long segundos) {
    }

    /** Senha errada de quem existe: conta no banco com a linha travada e grava no histórico. */
    private ErroDeRegra senhaErrada(Loja loja, UsuarioDetalhes c, String ip) {
        falhaDoIp(ip);
        AposErro r = comLoja.executar(loja.getId(), null, () -> {
            Usuario atual = usuarios.travar(loja.getId(), c.getId()).orElseThrow(() -> credenciais());
            Tentativas.Situacao ja = Tentativas.situacao(atual.getTentativas(), BaseTenantEntity.agora());
            if (ja.bloqueado()) {
                return new AposErro(true, ja.restanteSegundos());
            }
            Tentativas.AposErro apos = Tentativas.aposSenhaErrada(atual.getTentativas(), BaseTenantEntity.agora());
            atual.definirTentativas(apos.estado());
            historico.registrar(null, apos.bloqueou() ? AcaoAuditoria.SESSAO_BLOQUEADO : AcaoAuditoria.SESSAO_SENHA_ERRADA,
                    HistoricoService.Alvo.usuario(c.getId()));
            return new AposErro(apos.bloqueou(), Tentativas.BLOQUEIO_SEGUNDOS);
        });
        return r.bloqueou() ? ErroDeRegra.muitasTentativas(Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR, r.segundos()) : credenciais();
    }

    /** O Adm. Sup errou a senha: as mesmas regras, gravadas pela função do banco. */
    private ErroDeRegra senhaErradaDoSuporte(Loja loja, UsuarioDetalhes c, String ip) {
        falhaDoIp(ip);
        Tentativas.AposErro apos = Tentativas.aposSenhaErrada(c.getTentativas(), BaseTenantEntity.agora());
        comLoja.executar(loja.getId(), null, () -> {
            suporte.registrar(c.getId(), apos.estado().tentativasErradas(), apos.estado().bloqueadoAte(), null);
            historico.registrar(null, apos.bloqueou() ? AcaoAuditoria.SESSAO_BLOQUEADO : AcaoAuditoria.SESSAO_SENHA_ERRADA, null);
        });
        return apos.bloqueou() ? ErroDeRegra.muitasTentativas(Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR, Tentativas.BLOQUEIO_SEGUNDOS) : credenciais();
    }

    /** Usuário que não existe: o mesmo tempo (scrypt de mentira), a mesma resposta e o mesmo bloqueio. */
    private Resultado falhaSemUsuario(String chave, String senha, String ip, Instant agora) {
        Tentativas.Situacao situacao = limites.situacaoSemUsuario(chave, agora);
        if (situacao.bloqueado()) {
            throw ErroDeRegra.muitasTentativas(Tentativas.mensagemBloqueado(situacao.restanteSegundos()), situacao.restanteSegundos());
        }
        senhas.matches(senha, null);
        falhaDoIp(ip);
        if (limites.registrarFalhaSemUsuario(chave, agora)) {
            throw ErroDeRegra.muitasTentativas(Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR, Tentativas.BLOQUEIO_SEGUNDOS);
        }
        throw credenciais();
    }

    private Resultado abrirSessao(Loja loja, UsuarioDetalhes u, Optional<CookieDaSessao.Lido> anterior) {
        String segredo = CookieDaSessao.novoSegredo();
        UUID sessaoId = comLoja.executar(loja.getId(), u.getId(), () -> {
            Usuario atual = usuarios.travar(loja.getId(), u.getId()).orElseThrow(() -> credenciais());
            Tentativas.Situacao ja = Tentativas.situacao(atual.getTentativas(), BaseTenantEntity.agora());
            if (ja.bloqueado()) {
                throw ErroDeRegra.muitasTentativas(Tentativas.mensagemBloqueado(ja.restanteSegundos()), ja.restanteSegundos());
            }
            atual.registrarEntrada(BaseTenantEntity.agora());
            return criarSessao(loja, u.getId(), segredo, anterior);
        });
        List<String> funcoes = u.getPapel() == Papel.PERSONALIZADO ? u.getPermissoes() : List.of();
        UsuarioLogado logado = new UsuarioLogado(loja.getId(), loja.getNome(), loja.getSubdominio(), u.getId(), u.getPapel(), funcoes, u.getNome(),
                u.getUsername(), sessaoId, u.isSenhaProvisoria());
        return new Resultado(CookieDaSessao.cabecalho(amb, CookieDaSessao.valor(loja.getId(), segredo)), logado);
    }

    private Resultado abrirSessaoDoSuporte(Loja loja, UsuarioDetalhes u, Optional<CookieDaSessao.Lido> anterior) {
        String segredo = CookieDaSessao.novoSegredo();
        UUID sessaoId = comLoja.executar(loja.getId(), u.getId(), () -> {
            suporte.registrar(u.getId(), 0, null, BaseTenantEntity.agora());
            return criarSessao(loja, u.getId(), segredo, anterior);
        });
        UsuarioLogado logado = new UsuarioLogado(loja.getId(), loja.getNome(), loja.getSubdominio(), u.getId(), Papel.SUPER_ADMIN, List.of(),
                Papel.NOME_SUPORTE, u.getUsername(), sessaoId, false);
        return new Resultado(CookieDaSessao.cabecalho(amb, CookieDaSessao.valor(loja.getId(), segredo)), logado);
    }

    /** Dentro da transação: encerra a sessão anterior deste navegador, cria a nova e grava a entrada no histórico. */
    private UUID criarSessao(Loja loja, UUID usuarioId, String segredo, Optional<CookieDaSessao.Lido> anterior) {
        Instant agora = BaseTenantEntity.agora();
        anterior.filter(a -> a.lojaId().equals(loja.getId()))
                .flatMap(a -> sessoes.findByTenantIdAndTokenHash(loja.getId(), CookieDaSessao.hashDoSegredo(a.segredo())))
                .filter(s -> !s.isEncerrada())
                .ifPresent(s -> s.encerrar(agora)); // a sessão antiga deste navegador não fica valendo em paralelo
        Sessao nova = sessoes.save(new Sessao(usuarioId, CookieDaSessao.hashDoSegredo(segredo), agora,
                agora.plus(Duration.ofHours(amb.sessaoMaximaHoras()))));
        historico.registrar(usuarioId, AcaoAuditoria.SESSAO_ENTROU, null);
        return nova.getId();
    }

    // ------------------------------------------------------------------ a sessão a cada pedido

    /**
     * Confere o cookie no banco: sessão aberta, dentro das 12 h, usada nos últimos 30 min, pessoa ativa e com papel
     * válido, loja ativa e (com {@code DOMINIO_BASE}) no endereço da própria loja. A sessão que falha é encerrada. O
     * último uso é gravado no máximo uma vez por minuto ({@code sessao.service.ts:308-365}).
     */
    public Optional<UsuarioLogado> validar(String host, String valorDoCookie) {
        Optional<CookieDaSessao.Lido> lido = CookieDaSessao.ler(valorDoCookie);
        if (lido.isEmpty()) {
            return Optional.empty();
        }
        UUID lojaId = lido.get().lojaId();
        String hash = CookieDaSessao.hashDoSegredo(lido.get().segredo());
        return comLoja.executar(lojaId, null, () -> {
            Optional<Sessao> achada = sessoes.findByTenantIdAndTokenHash(lojaId, hash);
            if (achada.isEmpty()) {
                return Optional.<UsuarioLogado>empty();
            }
            Sessao s = achada.get();
            Instant agora = BaseTenantEntity.agora();
            Loja loja = lojas.findById(s.getTenantId()).orElse(null);
            Optional<Usuario> daLoja = usuarios.findByTenantIdAndId(lojaId, s.getUsuarioId());
            Optional<SuporteRepository.PorId> sup = daLoja.isPresent() ? Optional.empty() : suporte.porId(s.getUsuarioId());
            boolean venceu = s.isEncerrada() || !s.getExpiraEm().isAfter(agora)
                    || !s.getUltimoUsoEm().plus(Duration.ofMinutes(amb.sessaoInatividadeMin())).isAfter(agora);
            boolean outroEndereco = loja != null && amb.dominioBase() != null
                    && !Objects.equals(Subdominio.doEndereco(host, amb.dominioBase()), loja.getSubdominio());
            boolean pessoaValida = daLoja.map(u -> u.isAtivo() && u.getPapel().ehDeLoja()).orElse(false) || sup.map(SuporteRepository.PorId::ativo).orElse(false);
            if (venceu || outroEndereco || loja == null || !loja.isAtiva() || !pessoaValida) {
                if (!s.isEncerrada()) {
                    s.encerrar(agora);
                }
                return Optional.<UsuarioLogado>empty();
            }
            if (Duration.between(s.getUltimoUsoEm(), agora).toMillis() >= 60_000) {
                s.registrarUso(agora);
            }
            UsuarioLogado logado = daLoja.map(u -> new UsuarioLogado(lojaId, loja.getNome(), loja.getSubdominio(), u.getId(), u.getPapel(),
                    u.getPapel() == Papel.PERSONALIZADO ? u.getPermissoes() : List.of(), u.getNome(), u.getUsuario(), s.getId(), u.isSenhaProvisoria()))
                    .orElseGet(() -> new UsuarioLogado(lojaId, loja.getNome(), loja.getSubdominio(), sup.get().id(), Papel.SUPER_ADMIN, List.of(),
                            Papel.NOME_SUPORTE, sup.get().usuario(), s.getId(), false));
            return Optional.of(logado);
        });
    }

    // ------------------------------------------------------------------ sair e trocar a senha

    /** Encerra a sessão deste navegador e grava a saída no histórico (pelo botão Sair). */
    public void sair(String valorDoCookie) {
        sair(valorDoCookie, false);
    }

    /**
     * Encerra a sessão deste navegador e grava a saída no histórico. {@code porFaltaDeUso}: a tela saiu sozinha depois
     * de N minutos sem uso, e a saída leva {@code {"motivo": "inatividade"}}, como na demonstração
     * ({@code legacy/web/src/demo/usuariosDemo.ts:309-314}); a aba Meu usuário mostra "por falta de uso".
     */
    public void sair(String valorDoCookie, boolean porFaltaDeUso) {
        Optional<CookieDaSessao.Lido> lido = CookieDaSessao.ler(valorDoCookie);
        if (lido.isEmpty()) {
            return;
        }
        UUID lojaId = lido.get().lojaId();
        String hash = CookieDaSessao.hashDoSegredo(lido.get().segredo());
        comLoja.executar(lojaId, null, () -> sessoes.findByTenantIdAndTokenHash(lojaId, hash)
                .filter(s -> !s.isEncerrada())
                .ifPresent(s -> {
                    s.encerrar(BaseTenantEntity.agora());
                    historico.registrar(s.getUsuarioId(), AcaoAuditoria.SESSAO_SAIU, null,
                            porFaltaDeUso ? Map.of("motivo", "inatividade") : Map.of());
                }));
    }

    private record SenhaGuardada(String hash, Tentativas.Estado tentativas) {
    }

    /**
     * "Trocar minha senha" (e criar a própria senha no primeiro acesso) ({@code sessao.service.ts:389-449}). Pede a
     * senha atual: quem pega o computador destravado não troca a senha de ninguém. Senha atual errada conta como
     * tentativa errada; na quinta, bloqueia e encerra todas as sessões da pessoa. Depois da troca, as OUTRAS sessões
     * da pessoa (outros aparelhos) são encerradas.
     */
    public UsuarioLogado trocarSenha(UsuarioLogado ctx, String senhaAtual, String senhaNova) {
        if (vazio(senhaAtual) || vazio(senhaNova)) {
            throw ErroDeRegra.de(400, "Informe a senha atual e a senha nova.");
        }
        String atual = cortar(senhaAtual);
        String nova = cortar(senhaNova);
        if (ctx.papel() == Papel.SUPER_ADMIN) {
            throw ErroDeRegra.de(403, "A senha do suporte é trocada pelo script db:suporte, não pela loja.", "suporte");
        }
        SenhaGuardada guardada = comLoja.executar(ctx.lojaId(), null, () -> usuarios.findByTenantIdAndId(ctx.lojaId(), ctx.usuarioId())
                .map(u -> new SenhaGuardada(u.getSenhaHash(), u.getTentativas()))
                .orElse(null));
        if (guardada == null) {
            throw ErroDeRegra.de(401, "Sua sessão terminou. Entre de novo.", "sessao_encerrada");
        }
        Tentativas.Situacao situacao = Tentativas.situacao(guardada.tentativas(), BaseTenantEntity.agora());
        if (situacao.bloqueado()) {
            throw ErroDeRegra.muitasTentativas(Tentativas.mensagemBloqueado(situacao.restanteSegundos()), situacao.restanteSegundos());
        }

        if (!senhas.matches(atual, guardada.hash())) {
            boolean bloqueou = comLoja.executar(ctx.lojaId(), ctx.usuarioId(), () -> {
                Usuario t = usuarios.travar(ctx.lojaId(), ctx.usuarioId()).orElseThrow(() -> ErroDeRegra.de(401, "Sua sessão terminou. Entre de novo.", "sessao_encerrada"));
                if (Tentativas.situacao(t.getTentativas(), BaseTenantEntity.agora()).bloqueado()) {
                    return true;
                }
                Tentativas.AposErro apos = Tentativas.aposSenhaErrada(t.getTentativas(), BaseTenantEntity.agora());
                t.definirTentativas(apos.estado());
                if (apos.bloqueou()) {
                    sessoes.encerrarTodas(ctx.lojaId(), ctx.usuarioId(), BaseTenantEntity.agora(), null);
                    historico.registrar(null, AcaoAuditoria.SESSAO_BLOQUEADO, HistoricoService.Alvo.usuario(ctx.usuarioId()));
                }
                return apos.bloqueou();
            });
            if (bloqueou) {
                throw ErroDeRegra.muitasTentativas(Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR, Tentativas.BLOQUEIO_SEGUNDOS);
            }
            throw ErroDeRegra.noCampo("A senha atual não confere.", "senhaAtual", "Senha atual errada.");
        }

        Optional<String> problema = RegrasDeSenha.validar(nova, ctx.usuario(), ctx.nome());
        if (problema.isPresent()) {
            throw ErroDeRegra.noCampo(problema.get(), "senhaNova", problema.get());
        }
        if (nova.equals(atual)) {
            throw ErroDeRegra.noCampo("A senha nova precisa ser diferente da atual.", "senhaNova", "Igual à atual.");
        }

        String hash = senhas.encode(nova);
        comLoja.executar(ctx.lojaId(), ctx.usuarioId(), () -> {
            Usuario t = usuarios.findByTenantIdAndId(ctx.lojaId(), ctx.usuarioId())
                    .orElseThrow(() -> ErroDeRegra.de(401, "Sua sessão terminou. Entre de novo.", "sessao_encerrada"));
            t.trocarSenha(hash);
            sessoes.encerrarOutras(ctx.lojaId(), ctx.usuarioId(), ctx.sessaoId(), BaseTenantEntity.agora(), ctx.usuarioId());
            historico.registrar(ctx.usuarioId(), AcaoAuditoria.USUARIO_SENHA_TROCADA, HistoricoService.Alvo.usuario(ctx.usuarioId()));
        });
        return ctx.comSenhaCriada();
    }

    // ------------------------------------------------------------------ ajudas

    private void barrarIp(String ip) {
        long segundos = limites.ipBloqueado(ip, System.currentTimeMillis());
        if (segundos > 0) {
            throw ErroDeRegra.muitasTentativas("Muitas tentativas de login erradas a partir desta rede. Tente de novo em " + Tentativas.quando(segundos) + ".",
                    segundos);
        }
    }

    private void falhaDoIp(String ip) {
        long agora = System.currentTimeMillis();
        limites.registrarFalhaDoIp(ip, agora);
        if (limites.ipBloqueado(ip, agora) > 0) {
            LOG.warn("ip_bloqueado ip={}", ip);
        }
    }

    private static ErroDeRegra credenciais() {
        return ErroDeRegra.de(401, Tentativas.MENSAGEM_CREDENCIAIS, "credenciais");
    }

    private static boolean vazio(String v) {
        return v == null || v.isEmpty();
    }

    private static String cortar(String v) {
        return v.length() > CORTE ? v.substring(0, CORTE) : v;
    }
}
