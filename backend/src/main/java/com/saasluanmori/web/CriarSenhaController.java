package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.Avisos;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.service.ErroDeRegra;
import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
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
        String a = FormularioDeSenha.texto(atual);
        String n = FormularioDeSenha.texto(nova);
        String c = FormularioDeSenha.texto(confirmacao);

        // as conferências da tela (FormTrocarSenha, TrocarSenha.tsx:33-42)
        Map<String, String> erros = FormularioDeSenha.conferir(logado, a, n, c);
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
            return avisos(res, modelo, e.status(), FormularioDeSenha.doServidor(e), e.getMessage(), true);
        }
    }

    static String avisos(HttpServletResponse res, Model modelo, int status, Map<String, String> erros, String erroGeral, boolean limparAtual) {
        res.setStatus(status);
        modelo.addAttribute("erros", erros);
        modelo.addAttribute("erroGeral", erroGeral);
        modelo.addAttribute("limparAtual", limparAtual);
        return "criar-senha-avisos :: avisos";
    }
}
