package com.saasluanmori.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.UuidV7;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import jakarta.servlet.http.Cookie;
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
 * A aba Compras com os fornecedores, de ponta a ponta no servidor ({@code legacy/web/src/painel/TelaCompras.tsx};
 * {@code docs/migracao/01-MAPA-DE-TELAS.md} §9): a lista, a janela de cadastrar e alterar, os avisos de cada campo, as
 * mensagens de sucesso, desativar e reativar, quem pode, o CSRF e o texto escapado.
 */
@AutoConfigureMockMvc
class TelaComprasTest extends TesteComBanco {

    private static final AtomicInteger IPS = new AtomicInteger(10);
    private static final String ORIGEM = "http://localhost";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PasswordEncoder senhas;

    private LojaDeTeste loja;
    private Cookie ana;
    private String tokenDaAna;

    @BeforeEach
    void cadastrar() throws Exception {
        loja = DadosDeTeste.novaLoja("Pet Shop da Ana");
        DadosDeTeste.novoUsuario(loja.id(), "ana", "Ana Paula", Papel.DONO, senhas.encode("senha-da-ana-1"), false);
        DadosDeTeste.novoUsuario(loja.id(), "bruno", "Bruno", Papel.VENDEDOR, senhas.encode("senha-do-bruno-1"), false);
        ana = entrar("ana", "senha-da-ana-1");
        tokenDaAna = token(pagina("/compras", ana));
    }

    private MockHttpServletRequestBuilder doMesmoSite(MockHttpServletRequestBuilder r) {
        return r.header("Host", "localhost").header("Origin", ORIGEM).with(req -> {
            req.setRemoteAddr("10.60.0." + IPS.incrementAndGet());
            return req;
        });
    }

    /** Um pedido do HTMX: com o cabeçalho dele e o token de CSRF do {@code hx-headers}. */
    private MockHttpServletRequestBuilder htmx(MockHttpServletRequestBuilder r, Cookie sessao, String token) {
        return doMesmoSite(r).cookie(sessao).header("HX-Request", "true").header("X-CSRF-TOKEN", token);
    }

    private Cookie entrar(String usuario, String senha) throws Exception {
        MvcResult r = mvc.perform(doMesmoSite(post("/entrar")).param("loja", loja.subdominio()).param("usuario", usuario).param("senha", senha))
                .andExpect(status().isFound())
                .andReturn();
        MockCookie c = (MockCookie) r.getResponse().getCookie("sessao");
        assertThat(c).isNotNull();
        return new Cookie("sessao", c.getValue());
    }

    private String pagina(String endereco, Cookie sessao) throws Exception {
        return mvc.perform(get(endereco).cookie(sessao)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static String token(String html) {
        Matcher m = Pattern.compile("X-CSRF-TOKEN&quot;:&quot;([^&]+)&quot;").matcher(html);
        assertThat(m.find()).as("token de CSRF na página").isTrue();
        return m.group(1);
    }

    /** O HTML sem as quebras de linha e a indentação do modelo (o navegador também não as mostra). */
    private static String junto(String html) {
        return html.replaceAll(">\\s+<", "><").replaceAll("\\s+", " ");
    }

    private MvcResult cadastrarFornecedor(String... pares) throws Exception {
        MockHttpServletRequestBuilder r = htmx(post("/compras/fornecedores"), ana, tokenDaAna);
        for (int i = 0; i < pares.length; i += 2) {
            r.param(pares[i], pares[i + 1]);
        }
        return mvc.perform(r).andReturn();
    }

    private UUID idDe(String nome) throws Exception {
        Matcher m = Pattern.compile("aria-label=\"Alterar " + Pattern.quote(nome) + "\" hx-get=\"/compras/fornecedores/([0-9a-f-]{36})\"").matcher(pagina("/compras", ana));
        assertThat(m.find()).as("botão Alterar de " + nome).isTrue();
        return UUID.fromString(m.group(1));
    }

    @Test
    void aAbaVaziaComOsCartoesDoModuloComprasAvisando() throws Exception {
        String html = junto(pagina("/compras", ana));
        assertThat(html).contains(
                "<main class=\"painel-conteudo\" aria-label=\"Compras\"><div class=\"rel compras\">",
                "<header class=\"vg-topo pe-topo\"><div><h1>Compras</h1><p class=\"suave\">Compras por nota fiscal, contas a pagar, validade dos lotes e os fornecedores da loja.</p></div>",
                ">+ Cadastrar fornecedor</button>",
                "<section class=\"card card-plano\" aria-labelledby=\"pagar-titulo\"><div class=\"card-cabeca\"><h2 id=\"pagar-titulo\">Contas a pagar</h2></div><p class=\"vazio\">"
                        + PainelController.AVISO_SEM_SERVIDOR + "</p></section>",
                "<h2 id=\"compras-titulo\">Histórico de compras</h2></div><p class=\"vazio\">" + PainelController.AVISO_SEM_SERVIDOR
                        + "</p><p class=\"card-rodape\">Compra lançada errada: abra os itens e use “Estornar”; depois lance a compra certa. Bonificação (sem custo): entrada em Produtos e estoque.</p>",
                "<div class=\"card-cabeca\"><h2 id=\"forn-titulo\">Fornecedores</h2><span class=\"suave\">0 ativos</span></div>",
                "<p class=\"vazio\">Nenhum fornecedor cadastrado ainda. Use “+ Cadastrar fornecedor”.</p>",
                "<p class=\"card-rodape\">Desativar tira o fornecedor da lista de escolha; os produtos e as compras que já apontam para ele continuam com ele.</p>",
                "<script src=\"/js/janela.js\"></script>", "<script src=\"/js/formulario.js\"></script>");
        // a compra em si chega com o módulo Compras
        assertThat(html).doesNotContain("+ Registrar compra", "alerta alerta-erro");
        // o item Compras da barra fica marcado
        assertThat(html).containsPattern("class=\"nav active\" aria-current=\"page\" data-ir=\"/compras\"");
    }

    @Test
    void aJanelaDeCadastrarIgualAoModalAntigo() throws Exception {
        String html = junto(mvc.perform(htmx(get("/compras/fornecedores/novo"), ana, tokenDaAna)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString());
        assertThat(html).startsWith("<div class=\"modal-fundo\"><div class=\"modal-caixa\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"forn-janela-titulo\">"
                + "<h2 id=\"forn-janela-titulo\" class=\"modal-titulo\">Cadastrar fornecedor</h2>");
        assertThat(html).contains(
                "<form class=\"modal-form\" novalidate autocomplete=\"off\" hx-swap=\"none\" data-salvando=\"Salvando…\" hx-post=\"/compras/fornecedores\">",
                "<div class=\"campo\"><label for=\"forn-nome\">Nome do fornecedor</label><input id=\"forn-nome\" name=\"nome\" value=\"\" aria-invalid=\"false\" maxlength=\"120\" placeholder=\"Ex.: Distribuidora Pet Sul\">",
                "<div class=\"modal-grade\"><div class=\"campo\"><label for=\"forn-documento\">CNPJ ou CPF (opcional)</label><input id=\"forn-documento\" name=\"documento\" value=\"\" aria-invalid=\"false\" inputmode=\"numeric\" maxlength=\"18\">",
                "<label for=\"forn-telefone\">Telefone com DDD (opcional)</label><input id=\"forn-telefone\" name=\"telefone\" value=\"\" aria-invalid=\"false\" inputmode=\"tel\" maxlength=\"16\">",
                "<label for=\"forn-contato\">Contato (opcional)</label><input id=\"forn-contato\" name=\"contato\" value=\"\" aria-invalid=\"false\" maxlength=\"80\" placeholder=\"Ex.: Marcos, representante\">",
                "<label for=\"forn-observacao\">Observação (opcional)</label><input id=\"forn-observacao\" name=\"observacao\" value=\"\" aria-invalid=\"false\" maxlength=\"300\" placeholder=\"Ex.: entrega às terças\">",
                "<div class=\"modal-acoes\"><button type=\"submit\" class=\"botao botao-primario\">Cadastrar fornecedor</button><button type=\"button\" class=\"botao\" data-fechar>Cancelar</button></div>");
    }

    @Test
    void cadastrarVoltaAAbaComOAvisoEOFornecedorNaLista() throws Exception {
        MvcResult r = cadastrarFornecedor("nome", " Distribuidora  Pet Sul ", "documento", "11222333000181", "telefone", "41999998888", "contato", "Marcos",
                "observacao", "entrega às terças");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getHeader("HX-Retarget")).isEqualTo("closest .compras");
        assertThat(r.getResponse().getHeader("HX-Reswap")).isEqualTo("outerHTML");
        String html = junto(r.getResponse().getContentAsString());
        assertThat(html).startsWith("<div class=\"rel compras\">");
        assertThat(html).contains("</header><p class=\"alerta\" role=\"status\">Distribuidora Pet Sul cadastrado.</p>", "<span class=\"suave\">1 ativo</span>",
                "<thead><tr><th>Fornecedor</th><th>CNPJ / CPF</th><th>Telefone</th><th>Contato</th><th>Ações</th></tr></thead>",
                "<td data-rotulo=\"Fornecedor\" class=\"pe-nome\">Distribuidora Pet Sul<small class=\"suave pe-detalhe\">entrega às terças</small></td>",
                "<td data-rotulo=\"CNPJ / CPF\" class=\"mono\">11.222.333/0001-81</td><td data-rotulo=\"Telefone\">(41) 99999-8888</td><td data-rotulo=\"Contato\">Marcos</td>",
                "<td data-rotulo=\"Ações\" class=\"pe-acoes\"><button type=\"button\" class=\"botao\" hx-target=\"closest .compras\" hx-swap=\"beforeend\" data-abre-janela aria-label=\"Alterar Distribuidora Pet Sul\"",
                ">Alterar</button><button type=\"button\" class=\"botao\" hx-target=\"closest .compras\" hx-swap=\"outerHTML\" aria-label=\"Desativar Distribuidora Pet Sul\" hx-post=\"/compras/fornecedores/",
                ">Desativar</button></td>");
        // sem documento, telefone e contato: o travessão
        String outro = junto(cadastrarFornecedor("nome", "Feira do Bairro").getResponse().getContentAsString());
        assertThat(outro).contains("<td data-rotulo=\"CNPJ / CPF\" class=\"mono\">—</td><td data-rotulo=\"Telefone\">—</td><td data-rotulo=\"Contato\">—</td>",
                "<span class=\"suave\">2 ativos</span>");
    }

    @Test
    void aRecusaNaJanelaVoltaSoComOsAvisosDeCadaCampo() throws Exception {
        MvcResult r = cadastrarFornecedor("nome", "", "documento", "123", "telefone", "3333-4444", "contato", "Marcos");
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(r.getResponse().getHeader("HX-Retarget")).isNull();
        String html = junto(r.getResponse().getContentAsString());
        assertThat(html).contains(
                "<span id=\"forn-erro-nome\" hx-swap-oob=\"true\" data-erro-campo class=\"campo-erro\">Informe o nome do fornecedor.</span>",
                "<span id=\"forn-erro-documento\" hx-swap-oob=\"true\" data-erro-campo class=\"campo-erro\">Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números).</span>",
                "<span id=\"forn-erro-telefone\" hx-swap-oob=\"true\" data-erro-campo class=\"campo-erro\">Telefone com DDD: 10 ou 11 números.</span>",
                "<span id=\"forn-erro-contato\" hx-swap-oob=\"true\" data-erro-campo hidden=\"hidden\"></span>",
                "<p id=\"forn-alerta\" hx-swap-oob=\"true\" data-alerta hidden></p>");
        // campo que não é do cadastro: o aviso geral da janela
        String outro = junto(cadastrarFornecedor("nome", "Pet Sul", "lojaId", UUID.randomUUID().toString()).getResponse().getContentAsString());
        assertThat(outro).contains("<p id=\"forn-alerta\" hx-swap-oob=\"true\" data-alerta class=\"alerta alerta-erro\" role=\"alert\">Campo não permitido.</p>");
    }

    @Test
    void oDocumentoRepetidoAvisaDeQuemEle() throws Exception {
        cadastrarFornecedor("nome", "Pet Sul", "documento", "11.222.333/0001-81");
        MvcResult r = cadastrarFornecedor("nome", "Pet Norte", "documento", "11222333000181");
        assertThat(r.getResponse().getStatus()).isEqualTo(409);
        assertThat(junto(r.getResponse().getContentAsString()))
                .contains("<span id=\"forn-erro-documento\" hx-swap-oob=\"true\" data-erro-campo class=\"campo-erro\">Este documento já é do fornecedor &quot;Pet Sul&quot;.</span>");
    }

    @Test
    void alterarAbreComOCadastroAtualESalva() throws Exception {
        cadastrarFornecedor("nome", "Pet Sul", "documento", "52998224725", "telefone", "4133334444", "contato", "Marcos");
        UUID id = idDe("Pet Sul");
        String janela = junto(mvc.perform(htmx(get("/compras/fornecedores/" + id), ana, tokenDaAna)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString());
        assertThat(janela).contains("<h2 id=\"forn-janela-titulo\" class=\"modal-titulo\">Alterar fornecedor: Pet Sul</h2>",
                "hx-post=\"/compras/fornecedores/" + id + "\"", "name=\"documento\" value=\"529.982.247-25\"", "name=\"telefone\" value=\"(41) 3333-4444\"",
                "name=\"contato\" value=\"Marcos\"", "name=\"observacao\" value=\"\"", ">Salvar alterações</button>");

        MvcResult r = mvc.perform(htmx(post("/compras/fornecedores/" + id), ana, tokenDaAna).param("nome", "Pet Sul Ltda").param("documento", "529.982.247-25")
                .param("telefone", "(41) 3333-4444").param("contato", "Ana").param("observacao", "")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getHeader("HX-Retarget")).isEqualTo("closest .compras");
        assertThat(junto(r.getResponse().getContentAsString())).contains("<p class=\"alerta\" role=\"status\">Pet Sul Ltda: alterações salvas.</p>",
                "<td data-rotulo=\"Contato\">Ana</td>");
    }

    @Test
    void desativarEReativarComAsMensagensDoAntigo() throws Exception {
        cadastrarFornecedor("nome", "Pet Sul");
        UUID id = idDe("Pet Sul");
        String desativado = junto(mvc.perform(htmx(post("/compras/fornecedores/" + id + "/desativar"), ana, tokenDaAna)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(desativado).contains("<p class=\"alerta\" role=\"status\">Pet Sul foi desativado: não aparece mais na lista de escolha.</p>",
                "<span class=\"suave\">0 ativos</span>", "<tr class=\"pe-inativo\"><td data-rotulo=\"Fornecedor\" class=\"pe-nome\">Pet Sul<span class=\"tag-cancelada\">desativado</span></td>",
                "aria-label=\"Reativar Pet Sul\"", ">Reativar</button>");
        String reativado = junto(mvc.perform(htmx(post("/compras/fornecedores/" + id + "/reativar"), ana, tokenDaAna)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(reativado).contains("<p class=\"alerta\" role=\"status\">Pet Sul foi reativado.</p>", "<span class=\"suave\">1 ativo</span>",
                "<tr><td data-rotulo=\"Fornecedor\" class=\"pe-nome\">Pet Sul</td>");
    }

    @Test
    void oDeOutraLojaOuUmEnderecoQualquerNaoEncontra() throws Exception {
        LojaDeTeste outra = DadosDeTeste.novaLoja("Outra loja");
        UUID deLa = UuidV7.gerar();
        DadosDeTeste.executar(outra.id().toString(), "INSERT INTO fornecedores (id, tenant_id, nome) VALUES (?, ?, 'Fornecedor da outra')", deLa, outra.id());
        for (String endereco : new String[] {"/compras/fornecedores/" + deLa + "/desativar", "/compras/fornecedores/nao-e-um-id/reativar"}) {
            MvcResult r = mvc.perform(htmx(post(endereco), ana, tokenDaAna)).andReturn();
            assertThat(r.getResponse().getStatus()).isEqualTo(404);
            assertThat(r.getResponse().getHeader("HX-Retarget")).isEqualTo("closest .compras");
            assertThat(junto(r.getResponse().getContentAsString())).contains("</header><p class=\"alerta alerta-erro\" role=\"alert\">Fornecedor não encontrado.</p>");
        }
        MvcResult janela = mvc.perform(htmx(post("/compras/fornecedores/" + deLa), ana, tokenDaAna).param("nome", "Tomado")).andReturn();
        assertThat(janela.getResponse().getStatus()).isEqualTo(404);
        assertThat(junto(janela.getResponse().getContentAsString()))
                .contains("<p id=\"forn-alerta\" hx-swap-oob=\"true\" data-alerta class=\"alerta alerta-erro\" role=\"alert\">Fornecedor não encontrado.</p>");
        assertThat(pagina("/compras", ana)).doesNotContain("Fornecedor da outra");
    }

    @Test
    void oVendedorNaoVeEMesmoForcandoORecebeARecusa() throws Exception {
        Cookie bruno = entrar("bruno", "senha-do-bruno-1");
        String html = pagina("/compras", bruno);
        assertThat(html).containsPattern("<main class=\"painel-conteudo\" aria-label=\"Compras\">\\s*</main>").doesNotContain(">Compras<");
        String token = token(html);
        MvcResult r = mvc.perform(htmx(post("/compras/fornecedores"), bruno, token).param("nome", "Pet Norte")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(junto(r.getResponse().getContentAsString()))
                .contains("<p id=\"forn-alerta\" hx-swap-oob=\"true\" data-alerta class=\"alerta alerta-erro\" role=\"alert\">Compras: só o Dono ou o Administrador.</p>");
        // fora da janela, só o erro (a parte não lista nada para quem não pode)
        MvcResult fora = mvc.perform(htmx(get("/compras/fornecedores/novo"), bruno, token)).andReturn();
        assertThat(fora.getResponse().getStatus()).isEqualTo(403);
        String parte = junto(fora.getResponse().getContentAsString());
        assertThat(parte).contains("</header><p class=\"alerta alerta-erro\" role=\"alert\">Compras: só o Dono ou o Administrador.</p></div>")
                .doesNotContain("Fornecedores", "+ Cadastrar fornecedor");
    }

    @Test
    void semOTokenDeCsrfORecusaEOHtmxRecarregaAPagina() throws Exception {
        MvcResult htmxSemToken = mvc.perform(doMesmoSite(post("/compras/fornecedores")).cookie(ana).header("HX-Request", "true").param("nome", "Pet Sul"))
                .andReturn();
        assertThat(htmxSemToken.getResponse().getStatus()).isEqualTo(403);
        assertThat(htmxSemToken.getResponse().getHeader("HX-Refresh")).isEqualTo("true");
        mvc.perform(doMesmoSite(post("/compras/fornecedores")).cookie(ana).param("nome", "Pet Sul")).andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("HX-Refresh"));
        assertThat(pagina("/compras", ana)).contains("Nenhum fornecedor cadastrado ainda.");
    }

    @Test
    void oTextoDoFornecedorSaiEscapado() throws Exception {
        cadastrarFornecedor("nome", "<script>alert(1)</script>", "observacao", "\"><img src=x>");
        String html = pagina("/compras", ana);
        assertThat(html).contains("&lt;script&gt;alert(1)&lt;/script&gt;", "&quot;&gt;&lt;img src=x&gt;").doesNotContain("<script>alert(1)", "<img src=x>");
    }
}
