package com.saasluanmori.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.Tentativas;
import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Entrar, a sessão a cada pedido, sair e trocar a senha (docs/migracao/03-REGRAS-DE-NEGOCIO.md §1). */
class SessaoServiceTest extends TesteComBanco {

    private static final AtomicInteger IPS = new AtomicInteger();

    @Autowired
    private SessaoService sessoes;

    @Autowired
    private PasswordEncoder senhas;

    private LojaDeTeste loja;
    private UUID ana;
    private String ip;

    @BeforeEach
    void cadastrar() {
        loja = DadosDeTeste.novaLoja("Pet Shop da Ana");
        ana = DadosDeTeste.novoUsuario(loja.id(), "ana", "Ana Paula", Papel.DONO, senhas.encode("senha-da-ana-1"), false);
        ip = "10.0.0." + IPS.incrementAndGet();
    }

    private SessaoService.Resultado entrar(String login, String senha) {
        return sessoes.entrar("localhost", loja.subdominio(), login, senha, ip, null);
    }

    private static void recusa(ThrowingCallable acao, int status, String mensagem) {
        assertThatThrownBy(acao).isInstanceOfSatisfying(ErroDeRegra.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.getMessage()).isEqualTo(mensagem);
        });
    }

    @Test
    void entraComASenhaCerta() throws SQLException {
        SessaoService.Resultado r = entrar(" Ana ", "senha-da-ana-1");
        assertThat(r.cookie()).matches("^sessao=" + loja.id() + "\\.[A-Za-z0-9_-]{43}; Path=/; HttpOnly; SameSite=Strict$");
        UsuarioLogado u = r.logado();
        assertThat(u.usuarioId()).isEqualTo(ana);
        assertThat(u.papel()).isEqualTo(Papel.DONO);
        assertThat(u.nome()).isEqualTo("Ana Paula");
        assertThat(u.lojaNome()).isEqualTo("Pet Shop da Ana");
        assertThat(u.senhaProvisoria()).isFalse();
        assertThat(historico()).containsExactly("sessao.entrou|" + ana + "|");
        assertThat(texto("SELECT (ultimo_acesso_em IS NOT NULL)::text || tentativas_erradas FROM usuarios WHERE id = '" + ana + "'")).isEqualTo("true0");
        assertThat(texto("SELECT round(extract(epoch FROM expira_em - criado_em) / 3600)::text FROM sessoes WHERE usuario_id = '" + ana + "'")).isEqualTo("12");
    }

    @Test
    void camposVaziosELojaQueNaoExiste() {
        recusa(() -> entrar("", "x"), 400, "Informe o usuário e a senha.");
        recusa(() -> entrar("ana", null), 400, "Informe o usuário e a senha.");
        recusa(() -> sessoes.entrar("localhost", "nao-existe", "ana", "senha-da-ana-1", ip, null), 404, "Loja não encontrada. Confira o endereço.");
        DadosDeTeste.desativarLoja(loja.id());
        recusa(() -> entrar("ana", "senha-da-ana-1"), 404, "Loja não encontrada. Confira o endereço.");
    }

    @Test
    void senhaErradaContaEBloqueiaNaQuinta() throws SQLException {
        for (int i = 1; i <= 4; i++) {
            recusa(() -> entrar("ana", "errada-123"), 401, Tentativas.MENSAGEM_CREDENCIAIS);
            ip = "10.1.0." + IPS.incrementAndGet(); // o limite por IP não entra nesta conta
        }
        assertThatThrownBy(() -> entrar("ana", "errada-123")).isInstanceOfSatisfying(ErroDeRegra.class, e -> {
            assertThat(e.status()).isEqualTo(429);
            assertThat(e.getMessage()).isEqualTo("Muitas tentativas erradas. Este usuário ficou bloqueado por 5 minutos.");
            assertThat(e.segundos()).isEqualTo(300);
        });
        // bloqueado: nem a senha certa entra, e a senha nem é conferida
        recusa(() -> entrar("ana", "senha-da-ana-1"), 429, "Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.");
        assertThat(historico()).containsExactly("sessao.senha_errada||" + ana, "sessao.senha_errada||" + ana, "sessao.senha_errada||" + ana,
                "sessao.senha_errada||" + ana, "sessao.bloqueado||" + ana);
    }

    @Test
    void desativadoSoDescobreQuemSabeASenha() {
        DadosDeTeste.desativarUsuario(loja.id(), ana);
        recusa(() -> entrar("ana", "errada-123"), 401, Tentativas.MENSAGEM_CREDENCIAIS);
        recusa(() -> entrar("ana", "senha-da-ana-1"), 403, "Seu acesso a esta loja está desativado. Fale com o Dono da loja.");
    }

    @Test
    void loginQueNaoExisteRespondeIgualEBloqueiaIgual() {
        for (int i = 1; i <= 4; i++) {
            recusa(() -> entrar("ninguem", "qualquer-1"), 401, Tentativas.MENSAGEM_CREDENCIAIS);
            ip = "10.2.0." + IPS.incrementAndGet();
        }
        recusa(() -> entrar("ninguem", "qualquer-1"), 429, Tentativas.MENSAGEM_ACABOU_DE_BLOQUEAR);
        recusa(() -> entrar("ninguem", "qualquer-1"), 429, "Muitas tentativas erradas. Tente de novo em 5 min ou peça ao dono para trocar sua senha.");
    }

    @Test
    void cincoErrosDoMesmoIpBloqueiamAquelaRede() {
        for (int i = 1; i <= 5; i++) {
            String login = "x" + i + "zz";
            recusa(() -> entrar(login, "qualquer-1"), 401, Tentativas.MENSAGEM_CREDENCIAIS);
        }
        recusa(() -> entrar("ana", "senha-da-ana-1"), 429, "Muitas tentativas de login erradas a partir desta rede. Tente de novo em 5 min.");
    }

    @Test
    void oSuporteEntraEmQualquerLoja() throws SQLException {
        String login = "suporte" + IPS.incrementAndGet();
        UUID sup = DadosDeTeste.novoSuporte(login, senhas.encode("senha-do-suporte-1"));
        UsuarioLogado u = entrar(login, "senha-do-suporte-1").logado();
        assertThat(u.papel()).isEqualTo(Papel.SUPER_ADMIN);
        assertThat(u.nome()).isEqualTo("Suporte");
        assertThat(u.lojaId()).isEqualTo(loja.id());
        assertThat(historico()).containsExactly("sessao.entrou|" + sup + "|");
        LojaDeTeste outra = DadosDeTeste.novaLoja("Outra loja");
        assertThat(sessoes.entrar("localhost", outra.subdominio(), login, "senha-do-suporte-1", ip, null).logado().lojaId()).isEqualTo(outra.id());

        recusa(() -> entrar(login, "errada-123"), 401, Tentativas.MENSAGEM_CREDENCIAIS);
        DadosDeTeste.desativarSuporte(sup);
        recusa(() -> entrar(login, "senha-do-suporte-1"), 403, "Este acesso de suporte está desativado.");
    }

    @Test
    void aSessaoValeACadaPedidoAteSair() throws SQLException {
        String cookie = valor(entrar("ana", "senha-da-ana-1").cookie());
        assertThat(sessoes.validar("localhost", cookie)).get().extracting(UsuarioLogado::usuarioId).isEqualTo(ana);
        // trocar a loja do cookie não acha sessão nenhuma
        assertThat(sessoes.validar("localhost", UUID.randomUUID() + cookie.substring(cookie.indexOf('.')))).isEmpty();
        sessoes.sair(cookie);
        assertThat(sessoes.validar("localhost", cookie)).isEmpty();
        assertThat(historico()).containsExactly("sessao.entrou|" + ana + "|", "sessao.saiu|" + ana + "|");
    }

    @Test
    void trintaMinutosSemUsoEncerramASessao() throws SQLException {
        String cookie = valor(entrar("ana", "senha-da-ana-1").cookie());
        DadosDeTeste.executar(loja.id().toString(), "UPDATE sessoes SET ultimo_uso_em = now() - interval '30 minutes' WHERE usuario_id = ?", ana);
        assertThat(sessoes.validar("localhost", cookie)).isEmpty();
        assertThat(texto("SELECT (encerrada_em IS NOT NULL)::text FROM sessoes WHERE usuario_id = '" + ana + "'")).isEqualTo("true");
    }

    @Test
    void criarASenhaNoPrimeiroAcesso() throws SQLException {
        UUID bruno = DadosDeTeste.novoUsuario(loja.id(), "bruno", "Bruno", Papel.VENDEDOR, senhas.encode("provisoria1"), true);
        SessaoService.Resultado primeira = entrar("bruno", "provisoria1");
        SessaoService.Resultado segunda = sessoes.entrar("localhost", loja.subdominio(), "bruno", "provisoria1", "10.9.9.9", null);
        UsuarioLogado b = segunda.logado();
        assertThat(b.senhaProvisoria()).isTrue();

        recusa(() -> sessoes.trocarSenha(b, "errada-123", "nova-senha-boa"), 400, "A senha atual não confere.");
        recusa(() -> sessoes.trocarSenha(b, "provisoria1", "12345678"), 400, "Esta senha é fácil de adivinhar. Escolha outra.");
        recusa(() -> sessoes.trocarSenha(b, "provisoria1", "provisoria1"), 400, "A senha nova precisa ser diferente da atual.");
        recusa(() -> sessoes.trocarSenha(b, "", "x"), 400, "Informe a senha atual e a senha nova.");

        UsuarioLogado depois = sessoes.trocarSenha(b, "provisoria1", "nova-senha-boa");
        assertThat(depois.senhaProvisoria()).isFalse();
        // a outra sessão (outro aparelho) terminou; a atual continua
        assertThat(sessoes.validar("localhost", valor(primeira.cookie()))).isEmpty();
        assertThat(sessoes.validar("localhost", valor(segunda.cookie()))).get().extracting(UsuarioLogado::senhaProvisoria).isEqualTo(false);
        assertThat(historico()).contains("usuario.senha_trocada|" + bruno + "|" + bruno);
    }

    @Test
    void oSuporteNaoTrocaASenhaPelaLoja() {
        String login = "suporte" + IPS.incrementAndGet();
        DadosDeTeste.novoSuporte(login, senhas.encode("senha-do-suporte-1"));
        UsuarioLogado u = entrar(login, "senha-do-suporte-1").logado();
        recusa(() -> sessoes.trocarSenha(u, "senha-do-suporte-1", "outra-senha-boa"), 403, "A senha do suporte é trocada pelo script db:suporte, não pela loja.");
    }

    private static String valor(String setCookie) {
        return setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
    }

    /** O histórico da loja, do mais antigo para o mais novo: "acao|quem fez|alvo". */
    private List<String> historico() throws SQLException {
        List<String> r = new ArrayList<>();
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, loja.id().toString());
                ps.execute();
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT acao, coalesce(criado_por::text, ''), coalesce(alvo_id::text, '') FROM auditoria WHERE tenant_id = ? ORDER BY criado_em, id")) {
                ps.setObject(1, loja.id());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        r.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3));
                    }
                }
            }
            c.rollback();
        }
        return r;
    }

    private String texto(String sql) throws SQLException {
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, loja.id().toString());
                ps.execute();
            }
            try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getString(1);
            } finally {
                c.rollback();
            }
        }
    }
}
