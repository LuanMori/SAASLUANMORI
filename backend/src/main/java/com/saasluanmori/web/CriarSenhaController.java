package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.Avisos;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.RegrasDeSenha;
import com.saasluanmori.service.ErroDeRegra;
import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * "Crie a sua senha" no primeiro acesso, com a senha provisória que o Dono entregou
 * ({@code legacy/web/src/painel/TrocarSenha.tsx:24-119}; {@code docs/migracao/01-MAPA-DE-TELAS.md} §2). A pessoa só
 * usa o sistema depois de criar a própria senha. As conferências da tela vêm primeiro, na mesma ordem; depois, as do
 * servidor ({@link SessaoService#trocarSenha}).
 */
@Controller
public class CriarSenhaController {

    private final SessaoService sessoes;
    private final Ambiente amb;

    public CriarSenhaController(SessaoService sessoes, Ambiente amb) {
        this.sessoes = sessoes;
        this.amb = amb;
    }

    @GetMapping("/criar-senha")
    public String tela(@AuthenticationPrincipal UsuarioLogado logado, Model modelo) {
        if (!logado.senhaProvisoria()) {
            return "redirect:/";
        }
        modelo.addAttribute("logado", logado);
        return "criar-senha";
    }

    @PostMapping("/criar-senha")
    public String criar(@AuthenticationPrincipal UsuarioLogado logado, @RequestParam(name = "atual", required = false) String atual,
            @RequestParam(name = "nova", required = false) String nova, @RequestParam(name = "confirmacao", required = false) String confirmacao,
            HttpServletResponse res, Model modelo) {
        String a = atual == null ? "" : atual;
        String n = nova == null ? "" : nova;
        String c = confirmacao == null ? "" : confirmacao;

        // as conferências da tela (FormTrocarSenha, TrocarSenha.tsx:33-42)
        Map<String, String> erros = new LinkedHashMap<>();
        if (a.isEmpty()) {
            erros.put("atual", "Informe a senha atual.");
        }
        Optional<String> regra = RegrasDeSenha.validar(n, logado.usuario(), logado.nome());
        if (regra.isPresent()) {
            erros.put("nova", regra.get());
        } else if (n.equals(a)) {
            erros.put("nova", "A senha nova precisa ser diferente da atual.");
        }
        if (!erros.containsKey("nova") && !c.equals(n)) {
            erros.put("confirmacao", "A confirmação está diferente da senha nova.");
        }
        if (!erros.isEmpty()) {
            return avisos(res, modelo, 422, erros, null, false);
        }

        try {
            sessoes.trocarSenha(logado, a, n);
            res.setHeader("HX-Redirect", "/");
            return "fragmentos/vazio :: vazio";
        } catch (ErroDeRegra e) {
            if (e.status() == 429) {
                // errou a senha atual 5 vezes: bloqueado e as sessões encerradas; volta para a entrada com o aviso
                res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
                res.setHeader("HX-Redirect", "/entrar?aviso=" + Avisos.BLOQUEADO);
                return "fragmentos/vazio :: vazio";
            }
            Map<String, String> doServidor = new LinkedHashMap<>();
            boolean atualErrada = e.erros().stream().anyMatch(x -> x.campo().equals("senhaAtual"));
            if (atualErrada) {
                doServidor.put("atual", "Senha atual errada.");
            }
            return avisos(res, modelo, e.status(), doServidor, e.getMessage(), true);
        }
    }

    private static String avisos(HttpServletResponse res, Model modelo, int status, Map<String, String> erros, String erroGeral, boolean limparAtual) {
        res.setStatus(status);
        modelo.addAttribute("erros", erros);
        modelo.addAttribute("erroGeral", erroGeral);
        modelo.addAttribute("limparAtual", limparAtual);
        return "criar-senha-avisos :: avisos";
    }
}
