package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.Avisos;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * Sair: encerra a sessão deste navegador, grava a saída no histórico e apaga o cookie
 * ({@code legacy/api/src/auth/sessao.controller.ts:57-63}). Depois de N minutos sem uso, a tela sai sozinha e a entrada
 * mostra "Sua sessão terminou depois de 30 minutos sem uso. Entre de novo." ({@code legacy/web/src/App.tsx:131}).
 */
@Controller
public class SairController {

    private final SessaoService sessoes;
    private final Ambiente amb;

    public SairController(SessaoService sessoes, Ambiente amb) {
        this.sessoes = sessoes;
        this.amb = amb;
    }

    @PostMapping("/sair")
    public String sair(@RequestParam(name = "aviso", required = false) String aviso, HttpServletRequest req, HttpServletResponse res) {
        CookieDaSessao.doPedido(req, amb.nomeDoCookie()).ifPresent(sessoes::sair);
        res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
        return Avisos.INATIVIDADE.equals(aviso) ? "redirect:/entrar?aviso=" + Avisos.INATIVIDADE : "redirect:/entrar";
    }
}
