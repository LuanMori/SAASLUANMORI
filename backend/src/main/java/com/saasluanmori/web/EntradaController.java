package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.Avisos;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.config.IpDoCliente;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.Loja;
import com.saasluanmori.service.ErroDeRegra;
import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.springframework.core.env.Environment;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * A tela de entrada ({@code legacy/web/src/telas/TelaEntrada.tsx}; {@code docs/migracao/01-MAPA-DE-TELAS.md} §1) e o
 * envio do login. A loja vem do endereço acessado (com {@code DOMINIO_BASE}). Sem ele (desenvolvimento e teste local),
 * vem de {@code LOJA_DEV} ou de {@code ?loja=} no endereço, como o {@code lojaDev} do sistema antigo
 * ({@code legacy/web/src/configuracao.ts:14-21}).
 */
@Controller
public class EntradaController {

    private final SessaoService sessoes;
    private final Ambiente amb;
    private final String lojaDev;

    public EntradaController(SessaoService sessoes, Ambiente amb, Environment env) {
        this.sessoes = sessoes;
        this.amb = amb;
        String v = env.getProperty("LOJA_DEV", "").trim();
        this.lojaDev = v.isEmpty() ? null : v;
    }

    @GetMapping("/")
    public String inicio() {
        return "redirect:/" + Menu.Secao.VISAO_GERAL.getId();
    }

    @GetMapping("/entrar")
    public String entrada(@RequestParam(name = "loja", required = false) String loja, @RequestParam(name = "aviso", required = false) String aviso,
            @AuthenticationPrincipal UsuarioLogado logado, HttpServletRequest req, HttpServletResponse res, Model modelo) {
        if (logado != null) {
            return "redirect:/";
        }
        // havia um cookie de uma sessão que não vale mais: apaga (o sistema antigo apagava no primeiro pedido)
        if (CookieDaSessao.doPedido(req, amb.nomeDoCookie()).isPresent()) {
            res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
        }
        preencher(modelo, req, loja);
        modelo.addAttribute("erro", Avisos.texto(aviso, amb).orElse(null));
        modelo.addAttribute("usuario", "");
        return "entrar";
    }

    @PostMapping("/entrar")
    public String entrar(@RequestParam(name = "loja", required = false) String loja, @RequestParam(name = "usuario", required = false) String usuario,
            @RequestParam(name = "senha", required = false) String senha, HttpServletRequest req, HttpServletResponse res, Model modelo) {
        String informada = lojaInformada(loja);
        try {
            SessaoService.Resultado r = sessoes.entrar(req.getHeader("Host"), informada, usuario, senha, IpDoCliente.de(req, amb.saltosDeProxy()),
                    CookieDaSessao.doPedido(req, amb.nomeDoCookie()).orElse(null));
            res.addHeader("Set-Cookie", r.cookie());
            return r.logado().senhaProvisoria() ? "redirect:/criar-senha" : "redirect:/";
        } catch (ErroDeRegra e) {
            res.setStatus(e.status());
            if (e.segundos() != null) {
                res.setHeader("Retry-After", String.valueOf(e.segundos()));
            }
            preencher(modelo, req, loja);
            modelo.addAttribute("erro", e.getMessage());
            modelo.addAttribute("usuario", usuario == null ? "" : usuario);
            modelo.addAttribute("focoNaSenha", true);
            return "entrar";
        }
    }

    private void preencher(Model modelo, HttpServletRequest req, String loja) {
        String informada = lojaInformada(loja);
        Optional<Loja> daEntrada = sessoes.lojaParaEntrada(req.getHeader("Host"), informada).loja();
        modelo.addAttribute("loja", daEntrada.orElse(null));
        // sem DOMINIO_BASE, o envio leva a loja de volta (como o corpo do login do sistema antigo)
        modelo.addAttribute("lojaInformada", amb.dominioBase() == null ? informada : null);
    }

    /** Sem DOMINIO_BASE: LOJA_DEV, senão ?loja= (com DOMINIO_BASE a loja vem do endereço e isto não vale). */
    private String lojaInformada(String doEndereco) {
        if (amb.dominioBase() != null) {
            return null;
        }
        return lojaDev != null ? lojaDev : doEndereco;
    }
}
