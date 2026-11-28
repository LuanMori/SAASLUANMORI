package com.saasluanmori.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import jakarta.servlet.http.Cookie;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * A aba Meu usuário de ponta a ponta no servidor ({@code legacy/web/src/painel/TelaMeuUsuario.tsx};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §4): o perfil e a foto (também na barra lateral e a do Adm. Sup, que vale
 * em toda loja), as entradas e saídas com "por falta de uso" e "em uso agora", e trocar a senha.
 */
@AutoConfigureMockMvc
class TelaMeuUsuarioTest extends TesteComBanco {

    private static final AtomicInteger IPS = new AtomicInteger(10);
    private static final String PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PasswordEncoder senhas;

    private LojaDeTeste loja;
    private UUID ana;

    @BeforeEach
    void cadastrar() {
        loja = DadosDeTeste.novaLoja("Pet Shop da Ana");
        ana = DadosDeTeste.novoUsuario(loja.id(), "ana", "Ana Paula", Papel.DONO, senhas.encode("senha-da-ana-1"), false);
    }

    private MockHttpServletRequestBuilder doMesmoSite(MockHttpServletRequestBuilder r) {
        return r.header("Host", "localhost").header("Origin", "http://localhost").with(req -> {
            req.setRemoteAddr("10.70.0." + IPS.incrementAndGet());
            return req;
        });
    }

    private Cookie entrar(LojaDeTeste l, String usuario, String senha) throws Exception {
        MvcResult r = mvc.perform(doMesmoSite(post("/entrar")).param("loja", l.subdominio()).param("usuario", usuario).param("senha", senha))
                .andExpect(status().isFound()).andReturn();
        MockCookie c = (MockCookie) r.getResponse().getCookie("sessao");
        assertThat(c).isNotNull();
        return new Cookie("sessao", c.getValue());
    }

    private String pagina(String endereco, Cookie sessao) throws Exception {
        return mvc.perform(get(endereco).cookie(sessao)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static String token(String html) {
        Matcher m = Pattern.compile("X-CSRF-TOKEN&quot;:&quot;([^&]+)&quot;").matcher(html);
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    private MockHttpServletRequestBuilder htmx(MockHttpServletRequestBuilder r, Cookie sessao) throws Exception {
        return doMesmoSite(r).cookie(sessao).header("HX-Request", "true").header("X-CSRF-TOKEN", token(pagina("/meu-usuario", sessao)));
    }

    private static String junto(String html) {
        return html.replaceAll(">\\s+<", "><").replaceAll("\\s+", " ");
    }

    /** O histórico de uma ação nesta loja: "detalhes|criado_por". */
    private List<String> historico(String acao) throws SQLException {
        List<String> r = new ArrayList<>();
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, loja.id().toString());
                ps.execute();
            }
            try (PreparedStatement ps = c.prepareStatement("SELECT detalhes::text, criado_por FROM auditoria WHERE acao = ? ORDER BY criado_em, id")) {
                ps.setString(1, acao);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        r.add(rs.getString(1) + "|" + rs.getString(2));
                    }
                }
            }
            c.rollback();
        }
        return r;
    }

    @Test
    void aAbaComOsTresCartoesComoNoAntigo() throws Exception {
        String html = junto(pagina("/meu-usuario", entrar(loja, "ana", "senha-da-ana-1")));
        assertThat(html).contains(
                "<main class=\"painel-conteudo\" aria-label=\"Meu usuário\"><div class=\"rel mu\"><header class=\"vg-topo\"><div><h1>Meu usuário</h1>"
                        + "<p class=\"suave\">A sua foto, as suas entradas e saídas do sistema e a sua senha.</p></div></header>",
                "<section class=\"card db-card\" aria-labelledby=\"mu-perfil-titulo\" data-perfil data-avisos><h2 id=\"mu-perfil-titulo\">Perfil</h2>"
                        + "<div class=\"mu-perfil\"><div class=\"mu-foto\"><span aria-hidden=\"true\">A</span></div>",
                "<dl class=\"mu-dados\"><div><dt>Nome</dt><dd>Ana Paula</dd></div><div><dt>Usuário (login)</dt><dd>ana</dd></div><div><dt>Papel</dt><dd>Dono</dd></div></dl>",
                "<div class=\"mu-foto-acoes\"><label class=\"botao db-arquivo\">Escolher uma foto<input type=\"file\" accept=\"image/png,image/jpeg,image/webp\" aria-label=\"Escolher a foto do perfil\" data-foto-arquivo></label>"
                        + "<span class=\"modal-dica\">PNG, JPEG ou WebP. A foto é cortada em quadrado e reduzida aqui mesmo, no navegador.</span></div>",
                "<div class=\"card-cabeca\"><h2 id=\"mu-acessos-titulo\">Entradas e saídas</h2><span class=\"suave\">as 30 mais recentes</span></div>",
                "<thead><tr><th scope=\"col\">Dia</th><th scope=\"col\">Entrada</th><th scope=\"col\">Saída</th><th scope=\"col\">Tempo</th></tr></thead>",
                "<td data-rotulo=\"Saída\"><strong class=\"mu-agora\">em uso agora</strong></td><td data-rotulo=\"Tempo\">menos de 1 min</td>",
                "<p class=\"card-rodape\">Saída “não registrada”: o sistema foi fechado sem clicar em Sair. Depois de um tempo sem uso, o sistema sai sozinho (“por falta de uso”).</p>",
                "<h2 id=\"mu-senha-titulo\">Trocar a senha</h2><p class=\"suave db-sub\">A senha vale para entrar no sistema e para autorizar operações no caixa. Depois da troca, a sua sessão em outros aparelhos termina.</p>",
                "<label for=\"ts-atual\">Senha atual</label>", ">Trocar a senha</button>",
                "<script src=\"/js/foto.js\"></script>", "<script src=\"/js/formulario.js\"></script>");
        assertThat(html).containsPattern("<tr class=\"mu-atual\"><td class=\"mu-dia\">\\d{2}/\\d{2}/\\d{4}</td><td data-rotulo=\"Entrada\">\\d{2}:\\d{2}</td>");
        assertThat(html).doesNotContain(">Tirar a foto<");
    }

    @Test
    void salvarATirarAFotoComOAvisoNaBarraENoHistorico() throws Exception {
        Cookie sessao = entrar(loja, "ana", "senha-da-ana-1");
        MvcResult r = mvc.perform(htmx(post("/meu-usuario/foto"), sessao).param("foto", PNG)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String salvo = junto(r.getResponse().getContentAsString());
        assertThat(salvo).contains("<div class=\"mu-foto\"><img src=\"" + PNG + "\" alt=\"A sua foto\"></div>",
                "<label class=\"botao db-arquivo\">Trocar a foto<input", ">Tirar a foto</button>",
                "<p class=\"alerta\" role=\"status\">Foto salva. Ela aparece também no canto da barra lateral.</p>",
                "<span id=\"barra-avatar\" class=\"sideuser-avatar\" aria-hidden=\"true\" hx-swap-oob=\"true\"><img src=\"" + PNG + "\" alt=\"\"></span>");
        // a barra lateral de qualquer parte mostra a foto
        assertThat(pagina("/visao-geral", sessao)).contains("<span id=\"barra-avatar\" class=\"sideuser-avatar\" aria-hidden=\"true\"><img src=\"" + PNG + "\" alt=\"\"></span>");
        // a mesma foto não grava de novo
        mvc.perform(htmx(post("/meu-usuario/foto"), sessao).param("foto", PNG)).andExpect(status().isOk());
        String tirada = junto(mvc.perform(htmx(post("/meu-usuario/foto"), sessao)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(tirada).contains("<div class=\"mu-foto\"><span aria-hidden=\"true\">A</span></div>", "<p class=\"alerta\" role=\"status\">Foto tirada.</p>",
                "<span id=\"barra-avatar\" class=\"sideuser-avatar\" aria-hidden=\"true\" hx-swap-oob=\"true\">A</span>");
        assertThat(historico("usuario.foto_alterada")).containsExactly("{}|" + ana, "{\"tirou\": true}|" + ana);
    }

    @Test
    void aFotoRecusadaSoTrazOAviso() throws Exception {
        Cookie sessao = entrar(loja, "ana", "senha-da-ana-1");
        MvcResult r = mvc.perform(htmx(post("/meu-usuario/foto"), sessao).param("foto", "data:image/svg+xml;base64,PHN2Zz4=")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(r.getResponse().getHeader("HX-Reswap")).isEqualTo("none");
        assertThat(junto(r.getResponse().getContentAsString())).isEqualTo(
                "<p id=\"mu-perfil-erro\" hx-swap-oob=\"true\" data-alerta class=\"alerta alerta-erro\" role=\"alert\">A foto precisa ser uma imagem PNG, JPEG ou WebP.</p>");
        assertThat(historico("usuario.foto_alterada")).isEmpty();
    }

    @Test
    void asEntradasESaidasComOBotaoSairEAFaltaDeUso() throws Exception {
        Cookie primeira = entrar(loja, "ana", "senha-da-ana-1");
        mvc.perform(doMesmoSite(post("/sair")).cookie(primeira).param("aviso", "inatividade").header("X-CSRF-TOKEN", token(pagina("/meu-usuario", primeira))))
                .andExpect(status().isFound());
        Cookie segunda = entrar(loja, "ana", "senha-da-ana-1");
        mvc.perform(doMesmoSite(post("/sair")).cookie(segunda).header("X-CSRF-TOKEN", token(pagina("/meu-usuario", segunda)))).andExpect(status().isFound());
        Cookie agora = entrar(loja, "ana", "senha-da-ana-1");
        String html = junto(pagina("/meu-usuario", agora));
        Matcher linhas = Pattern.compile("<tr( class=\"mu-atual\")?><td class=\"mu-dia\">[^<]+</td><td data-rotulo=\"Entrada\">[^<]+</td><td data-rotulo=\"Saída\">(.*?)</td>")
                .matcher(html);
        List<String> saidas = new ArrayList<>();
        while (linhas.find()) {
            saidas.add((linhas.group(1) == null ? "" : "atual: ") + linhas.group(2).replaceAll("\\d{2}:\\d{2}", "hh:mm"));
        }
        assertThat(saidas).containsExactly("atual: <strong class=\"mu-agora\">em uso agora</strong>", "hh:mm",
                "hh:mm<small class=\"mu-como\"> por falta de uso</small>");
        assertThat(historico("sessao.saiu")).containsExactly("{\"motivo\": \"inatividade\"}|" + ana, "{}|" + ana);
        // a entrada de uma pessoa não aparece para outra
        DadosDeTeste.novoUsuario(loja.id(), "bruno", "Bruno", Papel.VENDEDOR, senhas.encode("senha-do-bruno-1"), false);
        String doBruno = junto(pagina("/meu-usuario", entrar(loja, "bruno", "senha-do-bruno-1")));
        assertThat(Pattern.compile("<td class=\"mu-dia\">").matcher(doBruno).results().count()).isEqualTo(1);
    }

    @Test
    void trocarASenhaComOsAvisosEEncerrandoOsOutrosAparelhos() throws Exception {
        Cookie outroAparelho = entrar(loja, "ana", "senha-da-ana-1");
        Cookie sessao = entrar(loja, "ana", "senha-da-ana-1");
        MvcResult curta = mvc.perform(htmx(post("/meu-usuario/senha"), sessao).param("atual", "").param("nova", "curta").param("confirmacao", "")).andReturn();
        assertThat(curta.getResponse().getStatus()).isEqualTo(422);
        assertThat(junto(curta.getResponse().getContentAsString())).contains("<span id=\"cs-erro-atual\" hx-swap-oob=\"true\" class=\"campo-erro\">Informe a senha atual.</span>",
                "<span id=\"cs-erro-nova\" hx-swap-oob=\"true\" class=\"campo-erro\">");
        MvcResult errada = mvc.perform(htmx(post("/meu-usuario/senha"), sessao).param("atual", "nao-e-esta").param("nova", "uma frase boa").param("confirmacao", "uma frase boa"))
                .andReturn();
        assertThat(errada.getResponse().getStatus()).isEqualTo(400);
        assertThat(junto(errada.getResponse().getContentAsString())).contains("<span id=\"cs-erro-atual\" hx-swap-oob=\"true\" class=\"campo-erro\">Senha atual errada.</span>",
                "<p id=\"cs-alerta\" hx-swap-oob=\"true\" data-alerta class=\"alerta alerta-erro\" role=\"alert\">A senha atual não confere.</p>",
                "<input id=\"ts-atual\" hx-swap-oob=\"true\" name=\"atual\" type=\"password\" value=\"\"");
        MvcResult certa = mvc.perform(htmx(post("/meu-usuario/senha"), sessao).param("atual", "senha-da-ana-1").param("nova", "uma frase boa").param("confirmacao", "uma frase boa"))
                .andReturn();
        assertThat(certa.getResponse().getStatus()).isEqualTo(200);
        assertThat(certa.getResponse().getHeader("HX-Retarget")).isEqualTo("closest section");
        assertThat(junto(certa.getResponse().getContentAsString())).startsWith("<section class=\"card db-card\" aria-labelledby=\"mu-senha-titulo\">")
                .contains("<p class=\"alerta mu-senha-aviso\" role=\"status\">Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa.</p>");
        // esta sessão continua; a do outro aparelho terminou
        pagina("/meu-usuario", sessao);
        mvc.perform(get("/meu-usuario").cookie(outroAparelho)).andExpect(status().isFound());
        entrar(loja, "ana", "uma frase boa");
    }

    @Test
    void oAdmSupTemAFotoEmTodaLojaENaoTrocaASenhaPelaLoja() throws Exception {
        String login = "suporte" + IPS.incrementAndGet();
        DadosDeTeste.novoSuporte(login, senhas.encode("senha-do-suporte-1"));
        Cookie aqui = entrar(loja, login, "senha-do-suporte-1");
        String perfil = junto(pagina("/meu-usuario", aqui));
        assertThat(perfil).contains("<dd>Suporte</dd>", "<dd>" + login + "</dd>", "<dd>Adm. Sup</dd>");
        mvc.perform(htmx(post("/meu-usuario/foto"), aqui).param("foto", PNG)).andExpect(status().isOk());
        LojaDeTeste outra = DadosDeTeste.novaLoja("Outra loja");
        assertThat(pagina("/meu-usuario", entrar(outra, login, "senha-do-suporte-1"))).contains("<img src=\"" + PNG + "\" alt=\"A sua foto\">");
        MvcResult senha = mvc.perform(htmx(post("/meu-usuario/senha"), aqui).param("atual", "senha-do-suporte-1").param("nova", "uma frase boa")
                .param("confirmacao", "uma frase boa")).andReturn();
        assertThat(senha.getResponse().getStatus()).isEqualTo(403);
        assertThat(junto(senha.getResponse().getContentAsString())).contains("A senha do suporte é trocada pelo script db:suporte, não pela loja.");
    }
}
