package com.saasluanmori.web;

import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.ErroCampo;
import com.saasluanmori.domain.Fornecedor;
import com.saasluanmori.domain.Permissao;
import com.saasluanmori.domain.RegrasDoFornecedor;
import com.saasluanmori.service.ErroDeRegra;
import com.saasluanmori.service.FornecedorService;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * A aba Compras ({@code legacy/web/src/painel/TelaCompras.tsx}; {@code docs/migracao/01-MAPA-DE-TELAS.md} §9). Por
 * enquanto, com os fornecedores (módulo de referência): listar, cadastrar, alterar, desativar e reativar, com as mesmas
 * mensagens. As ações vão pelo HTMX: deu certo, a parte inteira volta com o aviso no alto, como o {@code concluir} da
 * tela antiga ({@code :73-78}); recusa na janela, só os avisos voltam (o que foi digitado fica nos campos); recusa fora
 * da janela, a parte volta com o erro no alto ({@code :80-88}). As regras e a ordem das conferências ficam no
 * {@link FornecedorService}; aqui só se monta a tela.
 */
@Controller
@RequestMapping("/compras")
public class ComprasController {

    /** O campo escondido do token de CSRF não é um dado do fornecedor. */
    private static final String CAMPO_CSRF = "_csrf";

    /** Os scripts da aba: a janela por cima da tela e os formulários. */
    private static final List<String> SCRIPTS = List.of("/js/janela.js", "/js/formulario.js");

    /** Onde a resposta entra quando a parte inteira volta (o pedido pode ter saído de dentro da janela). */
    private static final String A_PARTE = "closest .compras";

    private final Moldura moldura;
    private final FornecedorService fornecedores;

    public ComprasController(Moldura moldura, FornecedorService fornecedores) {
        this.moldura = moldura;
        this.fornecedores = fornecedores;
    }

    @GetMapping
    public String tela(@AuthenticationPrincipal UsuarioLogado logado, Model modelo) {
        moldura.preencher(modelo, logado, Menu.Secao.COMPRAS);
        modelo.addAttribute("scripts", SCRIPTS);
        if (logado.pode(Permissao.COMPRAS)) {
            aba(modelo, logado, null, null);
            modelo.addAttribute("conteudo", "compras/compras");
        }
        return "painel";
    }

    /** A janela "Cadastrar fornecedor", vazia. */
    @GetMapping("/fornecedores/novo")
    public String novo(@AuthenticationPrincipal UsuarioLogado logado, Model modelo, HttpServletResponse res) {
        if (!logado.pode(Permissao.COMPRAS)) {
            return recusaNaAba(res, modelo, logado, fornecedores.semPermissao());
        }
        janela(modelo, "Cadastrar fornecedor", "Cadastrar fornecedor", "/compras/fornecedores", "", "", "", "", "");
        return "compras/janela-fornecedor :: janela";
    }

    /** A janela "Alterar fornecedor: <nome>", com o cadastro atual (documento e telefone já formatados). */
    @GetMapping("/fornecedores/{id}")
    public String alterarJanela(@AuthenticationPrincipal UsuarioLogado logado, @PathVariable String id, Model modelo, HttpServletResponse res) {
        try {
            Fornecedor f = fornecedores.buscar(logado, idDe(id));
            janela(modelo, "Alterar fornecedor: " + f.getNome(), "Salvar alterações", "/compras/fornecedores/" + f.getId(), f.getNome(),
                    f.getDocumento() == null ? "" : f.getDocumentoFormatado(), f.getTelefone() == null ? "" : f.getTelefoneFormatado(),
                    f.getContato() == null ? "" : f.getContato(), f.getObservacao() == null ? "" : f.getObservacao());
            return "compras/janela-fornecedor :: janela";
        } catch (ErroDeRegra e) {
            return recusaNaAba(res, modelo, logado, e);
        }
    }

    @PostMapping("/fornecedores")
    public String cadastrar(@AuthenticationPrincipal UsuarioLogado logado, @RequestParam MultiValueMap<String, String> corpo, Model modelo,
            HttpServletResponse res) {
        try {
            Fornecedor f = fornecedores.cadastrar(logado, dadosDe(corpo));
            return concluido(res, modelo, logado, f.getNome() + " cadastrado.");
        } catch (ErroDeRegra e) {
            return recusaNaJanela(res, modelo, e);
        }
    }

    @PostMapping("/fornecedores/{id}")
    public String alterar(@AuthenticationPrincipal UsuarioLogado logado, @PathVariable String id, @RequestParam MultiValueMap<String, String> corpo,
            Model modelo, HttpServletResponse res) {
        try {
            Fornecedor f = fornecedores.alterar(logado, idDe(id), dadosDe(corpo));
            return concluido(res, modelo, logado, f.getNome() + ": alterações salvas.");
        } catch (ErroDeRegra e) {
            return recusaNaJanela(res, modelo, e);
        }
    }

    @PostMapping("/fornecedores/{id}/desativar")
    public String desativar(@AuthenticationPrincipal UsuarioLogado logado, @PathVariable String id, Model modelo, HttpServletResponse res) {
        return definirAtivo(logado, id, false, modelo, res);
    }

    @PostMapping("/fornecedores/{id}/reativar")
    public String reativar(@AuthenticationPrincipal UsuarioLogado logado, @PathVariable String id, Model modelo, HttpServletResponse res) {
        return definirAtivo(logado, id, true, modelo, res);
    }

    /** {@code alternarAtivo} ({@code TelaCompras.tsx:80-88}). */
    private String definirAtivo(UsuarioLogado logado, String id, boolean ativo, Model modelo, HttpServletResponse res) {
        try {
            Fornecedor f = fornecedores.definirAtivo(logado, idDe(id), ativo);
            String texto = ativo ? f.getNome() + " foi reativado." : f.getNome() + " foi desativado: não aparece mais na lista de escolha.";
            aba(modelo, logado, texto, null);
            return "compras/compras :: conteudo";
        } catch (ErroDeRegra e) {
            return recusaNaAba(res, modelo, logado, e);
        }
    }

    /** Deu certo: a parte inteira volta, com o aviso no alto; a janela some junto ({@code concluir}, {@code :73-78}). */
    private String concluido(HttpServletResponse res, Model modelo, UsuarioLogado logado, String aviso) {
        aba(modelo, logado, aviso, null);
        res.setHeader("HX-Retarget", A_PARTE);
        res.setHeader("HX-Reswap", "outerHTML");
        return "compras/compras :: conteudo";
    }

    /**
     * Recusa fora da janela: a parte volta com o erro no alto ({@code setAviso(null); setErro(...)}). Sem a permissão,
     * a parte não lista nada e mostra só o erro, como a tela antiga quando o servidor recusava a lista ({@code :114-117}).
     */
    private String recusaNaAba(HttpServletResponse res, Model modelo, UsuarioLogado logado, ErroDeRegra e) {
        res.setStatus(e.status());
        res.setHeader("HX-Retarget", A_PARTE);
        res.setHeader("HX-Reswap", "outerHTML");
        if (logado.pode(Permissao.COMPRAS)) {
            aba(modelo, logado, null, e.getMessage());
        } else {
            modelo.addAttribute("erro", e.getMessage());
        }
        return "compras/compras :: conteudo";
    }

    /**
     * Recusa dentro da janela: o primeiro aviso de cada campo e o aviso geral; sem avisos por campo, a mensagem vai no
     * aviso geral ({@code TelaCompras.tsx:397,409-411,423-424}).
     */
    private static String recusaNaJanela(HttpServletResponse res, Model modelo, ErroDeRegra e) {
        List<ErroCampo> erros = e.erros().isEmpty() ? List.of(new ErroCampo("_", e.getMessage())) : e.erros();
        Map<String, String> porCampo = new LinkedHashMap<>();
        String geral = null;
        for (ErroCampo erro : erros) {
            if (RegrasDoFornecedor.CAMPOS.contains(erro.campo())) {
                porCampo.putIfAbsent(erro.campo(), erro.mensagem());
            } else if (geral == null) {
                geral = erro.mensagem();
            }
        }
        res.setStatus(e.status());
        modelo.addAttribute("campos", RegrasDoFornecedor.CAMPOS);
        modelo.addAttribute("erros", porCampo);
        modelo.addAttribute("erroGeral", geral);
        return "compras/avisos-fornecedor :: avisos";
    }

    /** O conteúdo da aba: os fornecedores (ativos primeiro, por nome), o total de ativos e os avisos. */
    private void aba(Model modelo, UsuarioLogado logado, String aviso, String erro) {
        List<Fornecedor> lista = fornecedores.listar(logado);
        modelo.addAttribute("fornecedores", lista);
        modelo.addAttribute("ativos", Formato.plural(lista.stream().filter(Fornecedor::isAtivo).count(), "ativo", "ativos"));
        modelo.addAttribute("aviso", aviso);
        modelo.addAttribute("erro", erro);
        modelo.addAttribute("avisoSemServidor", PainelController.AVISO_SEM_SERVIDOR);
    }

    private static void janela(Model modelo, String titulo, String botao, String acao, String nome, String documento, String telefone, String contato,
            String observacao) {
        modelo.addAttribute("titulo", titulo);
        modelo.addAttribute("botao", botao);
        modelo.addAttribute("acao", acao);
        modelo.addAttribute("dados", Map.of("nome", nome, "documento", documento, "telefone", telefone, "contato", contato, "observacao", observacao));
    }

    /** Os campos enviados, na ordem, sem o token de CSRF. */
    private static Map<String, List<String>> dadosDe(MultiValueMap<String, String> corpo) {
        Map<String, List<String>> dados = new LinkedHashMap<>(corpo);
        dados.remove(CAMPO_CSRF);
        return dados;
    }

    /** O id do endereço; um texto que não é id fica nulo e não é de nenhum fornecedor (404, como no antigo). */
    private static UUID idDe(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
