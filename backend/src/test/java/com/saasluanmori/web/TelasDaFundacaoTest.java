package com.saasluanmori.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import jakarta.servlet.http.Cookie;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockCookie;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * As telas da fundação de ponta a ponta no servidor: a entrada, o login com o cookie, a moldura por permissão, as
 * partes ainda não reconstruídas, o Suporte em branco, "Crie a sua senha", sair e os cabeçalhos de segurança.
 */
@AutoConfigureMockMvc
class TelasDaFundacaoTest extends TesteComBanco {

    private static final AtomicInteger IPS = new AtomicInteger(100);
    private static final String ORIGEM = "http://localhost";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PasswordEncoder senhas;

    private LojaDeTeste loja;

    @BeforeEach
    void cadastrar() {
        loja = DadosDeTeste.novaLoja("Pet Shop da Ana");
        DadosDeTeste.novoUsuario(loja.id(), "ana", "Ana Paula", Papel.DONO, senhas.encode("senha-da-ana-1"), false);
        DadosDeTeste.novoUsuario(loja.id(), "bruno", "Bruno", Papel.VENDEDOR, senhas.encode("senha-do-bruno-1"), false);
        DadosDeTeste.novoUsuario(loja.id(), "carla", "Carla", Papel.VENDEDOR, senhas.encode("provisoria-1"), true);
    }

    /** Como o navegador: o cabeçalho Host (o MockMvc não manda) e a origem do próprio site. */
    private MockHttpServletRequestBuilder doMesmoSite(MockHttpServletRequestBuilder r) {
        return r.header("Host", "localhost").header("Origin", ORIGEM).with(req -> {
            req.setRemoteAddr("10.50.0." + IPS.incrementAndGet());
            return req;
        });
    }

    private Cookie entrar(String usuario, String senha) throws Exception {
        MvcResult r = mvc.perform(doMesmoSite(post("/entrar")).param("loja", loja.subdominio()).param("usuario", usuario).param("senha", senha))
                .andExpect(status().isFound())
                .andReturn();
        // o texto exato do cabeçalho é conferido em SessaoServiceTest; aqui, os atributos
        MockCookie c = (MockCookie) r.getResponse().getCookie("sessao");
        assertThat(c).isNotNull();
        assertThat(c.getValue()).matches("^" + loja.id() + "\\.[A-Za-z0-9_-]{43}$");
        assertThat(c.getPath()).isEqualTo("/");
        assertThat(c.isHttpOnly()).isTrue();
        assertThat(c.getSameSite()).isEqualTo("Strict");
        assertThat(c.getMaxAge()).isEqualTo(-1);
        return new Cookie("sessao", c.getValue());
    }

    private static ResultMatcher cookieApagado() {
        return r -> {
            MockCookie c = (MockCookie) r.getResponse().getCookie("sessao");
            assertThat(c).isNotNull();
            assertThat(c.getValue()).isEmpty();
            assertThat(c.getMaxAge()).isZero();
            assertThat(c.isHttpOnly()).isTrue();
            assertThat(c.getSameSite()).isEqualTo("Strict");
        };
    }

    private static String token(String html) {
        Matcher m = Pattern.compile("X-CSRF-TOKEN&quot;:&quot;([^&]+)&quot;").matcher(html);
        assertThat(m.find()).as("token de CSRF na página").isTrue();
        return m.group(1);
    }

    @Test
    void aEntradaMostraALojaEOsCabecalhosDeSeguranca() throws Exception {
        MvcResult r = mvc.perform(get("/entrar").param("loja", loja.subdominio()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                        + "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
                .andExpect(header().string("Cross-Origin-Opener-Policy", "same-origin"))
                .andExpect(header().exists("X-Request-Id"))
                .andReturn();
        String html = r.getResponse().getContentAsString();
        assertThat(html).contains("Bem-vindo de volta!", "aria-label=\"Loja: Pet Shop da Ana\"", "Esqueceu a senha?", "Suporte", "<title>Nome da empresa</title>");
        // nenhum script nem estilo embutido (a CSP recusaria)
        assertThat(html).doesNotContain("<style", "style=\"", "onclick", "onsubmit");
        assertThat(html).doesNotContainPattern("<script>[^<]");
        // sem sessão do servidor de aplicação
        assertThat(r.getResponse().getHeaders("Set-Cookie")).noneMatch(c -> c.startsWith("JSESSIONID"));
    }

    @Test
    void enderecoQueNaoEDeLojaNenhuma() throws Exception {
        mvc.perform(get("/entrar").param("loja", "nao-existe"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Endereço não encontrado")))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("entrada-suporte-botao"))));
    }

    @Test
    void senhaErradaVoltaParaAEntradaComOAvisoEOUsuario() throws Exception {
        String html = mvc.perform(doMesmoSite(post("/entrar")).param("loja", loja.subdominio()).param("usuario", "ana").param("senha", "errada-123"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("<p class=\"alerta alerta-erro\" role=\"alert\">Usuário ou senha incorretos.</p>", "value=\"ana\"");
        assertThat(html).containsPattern("id=\"entrada-senha\"[^>]*autofocus");
    }

    @Test
    void aMolduraMostraSoOQueOPapelPodeVer() throws Exception {
        String dono = mvc.perform(get("/visao-geral").cookie(entrar("ana", "senha-da-ana-1"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(dono).contains("Frente de caixa", "Financeiro", "Relatórios", "Usuários", "Dados e backup", "Ana Paula", "<small>Dono</small>", "V0.1 • Nome da empresa",
                ">PA</div>", PainelController.AVISO_SEM_SERVIDOR);

        Cookie bruno = entrar("bruno", "senha-do-bruno-1");
        String vendedor = mvc.perform(get("/visao-geral").cookie(bruno)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(vendedor).contains("Frente de caixa", "Caixa do dia", "Produtos e estoque", "Clientes", "Suporte", "Meu usuário")
                .doesNotContain(">Financeiro<", ">Relatórios<", ">Usuários<", ">Dados e backup<", ">Compras<", ">Gestão<");
        // mesmo forçando o endereço, o conteúdo não aparece para quem não pode
        String forcado = mvc.perform(get("/financeiro").cookie(bruno)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(forcado).doesNotContain(PainelController.AVISO_SEM_SERVIDOR);
        // a aba Suporte fica em branco
        String suporte = mvc.perform(get("/suporte").cookie(bruno)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(suporte).containsPattern("<main class=\"painel-conteudo\" aria-label=\"Suporte\">\\s*</main>");
    }

    @Test
    void semSessaoVaiParaAEntrada() throws Exception {
        mvc.perform(get("/visao-geral")).andExpect(status().isFound()).andExpect(redirectedUrl("/entrar"));
        // havia um cookie, mas a sessão não vale: apaga e avisa
        mvc.perform(get("/visao-geral").cookie(new Cookie("sessao", loja.id() + "." + "a".repeat(43))))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("/entrar?aviso=sessao_encerrada"))
                .andExpect(cookieApagado());
        mvc.perform(get("/entrar").param("loja", loja.subdominio()).param("aviso", "sessao_encerrada"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Sua sessão terminou. Entre de novo.")));
        // pelo HTMX, a página inteira vai para a entrada
        mvc.perform(get("/visao-geral").header("HX-Request", "true"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("HX-Redirect", "/entrar"));
    }

    @Test
    void sairEncerraASessaoEApagaOCookie() throws Exception {
        Cookie c = entrar("ana", "senha-da-ana-1");
        String html = mvc.perform(get("/visao-geral").cookie(c)).andReturn().getResponse().getContentAsString();
        String tk = token(html);
        mvc.perform(doMesmoSite(post("/sair")).cookie(c).param("_csrf", tk).param("aviso", "inatividade"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("/entrar?aviso=inatividade"))
                .andExpect(cookieApagado());
        mvc.perform(get("/visao-geral").cookie(c)).andExpect(redirectedUrl("/entrar?aviso=sessao_encerrada"));
        mvc.perform(get("/entrar").param("loja", loja.subdominio()).param("aviso", "inatividade"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Sua sessão terminou depois de 30 minutos sem uso. Entre de novo.")));
    }

    @Test
    void pedidoDeOutroSiteESemTokenSaoRecusados() throws Exception {
        Cookie c = entrar("ana", "senha-da-ana-1");
        mvc.perform(post("/sair").cookie(c).header("Host", "localhost").header("Origin", "http://outro.site"))
                .andExpect(status().isForbidden())
                .andExpect(content().string("Pedido vindo de outro site recusado."));
        mvc.perform(doMesmoSite(post("/sair")).cookie(c)).andExpect(status().isForbidden());
        // o envio da entrada não leva token, mas também passa pela conferência de origem
        mvc.perform(post("/entrar").header("Host", "localhost").header("Origin", "http://outro.site").param("usuario", "ana").param("senha", "senha-da-ana-1"))
                .andExpect(status().isForbidden());
    }

    @Test
    void comSenhaProvisoriaSoCriaASenhaOuSai() throws Exception {
        Cookie c = entrar("carla", "provisoria-1");
        mvc.perform(get("/visao-geral").cookie(c)).andExpect(redirectedUrl("/criar-senha"));
        // os arquivos da página continuam servindo (o CSS e os scripts da tela "Crie a sua senha")
        mvc.perform(get("/css/app.css").cookie(c)).andExpect(status().isOk());
        mvc.perform(get("/js/criar-senha.js").cookie(c)).andExpect(status().isOk());
        mvc.perform(get("/img/ilustracao-loja.svg").cookie(c)).andExpect(status().isOk());
        String html = mvc.perform(get("/criar-senha").cookie(c)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Crie a sua senha", "Olá, Carla.", "Senha provisória que você recebeu", "method=\"post\"");
        String tk = token(html);
        mvc.perform(doMesmoSite(post("/visao-geral")).cookie(c).header("X-CSRF-TOKEN", tk))
                .andExpect(status().isForbidden())
                .andExpect(content().string("Crie a sua senha antes de continuar."));

        String aviso = mvc.perform(doMesmoSite(post("/criar-senha")).cookie(c).header("X-CSRF-TOKEN", tk).header("HX-Request", "true")
                        .param("atual", "provisoria-1").param("nova", "12345678").param("confirmacao", "12345678"))
                .andExpect(status().isUnprocessableEntity())
                .andReturn().getResponse().getContentAsString().replaceAll("\\s+", " ");
        assertThat(aviso).contains("id=\"cs-erro-nova\" hx-swap-oob=\"true\" class=\"campo-erro\">Esta senha é fácil de adivinhar. Escolha outra.</span>");

        String recusa = mvc.perform(doMesmoSite(post("/criar-senha")).cookie(c).header("X-CSRF-TOKEN", tk).header("HX-Request", "true")
                        .param("atual", "errada-123").param("nova", "uma senha boa").param("confirmacao", "uma senha boa"))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString().replaceAll("\\s+", " ");
        assertThat(recusa).contains(">Senha atual errada.</span>", "role=\"alert\">A senha atual não confere.</p>", "id=\"ts-atual\" hx-swap-oob=\"true\"");

        mvc.perform(doMesmoSite(post("/criar-senha")).cookie(c).header("X-CSRF-TOKEN", tk).header("HX-Request", "true")
                        .param("atual", "provisoria-1").param("nova", "uma senha boa").param("confirmacao", "uma senha boa"))
                .andExpect(status().isOk())
                .andExpect(header().string("HX-Redirect", "/"));
        mvc.perform(get("/visao-geral").cookie(c)).andExpect(status().isOk());
    }

    @Test
    void saudeEIlustracao() throws Exception {
        mvc.perform(get("/saude")).andExpect(status().isOk()).andExpect(content().json("{\"status\":\"ok\"}"));
        String svg = mvc.perform(get("/img/ilustracao-loja.svg"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/svg+xml;charset=UTF-8"))
                .andReturn().getResponse().getContentAsString();
        assertThat(svg).startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-262 -140 552 350\">").endsWith("</svg>");
    }

    @Test
    void parteQueNaoExisteDa404() throws Exception {
        Cookie c = entrar("ana", "senha-da-ana-1");
        // a página de erro em si é conferida com o servidor de verdade (PaginaDeErroTest)
        mvc.perform(get("/nao-existe").cookie(c).accept("text/html")).andExpect(status().isNotFound());
    }
}
