package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.Avisos;
import com.saasluanmori.config.CookieDaSessao;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.Acessos;
import com.saasluanmori.domain.Acessos.Acesso;
import com.saasluanmori.domain.Acessos.ComoSaiu;
import com.saasluanmori.domain.Fuso;
import com.saasluanmori.service.ErroDeRegra;
import com.saasluanmori.service.PerfilService;
import com.saasluanmori.service.SessaoService;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * A aba Meu usuário ({@code legacy/web/src/painel/TelaMeuUsuario.tsx}; {@code docs/migracao/01-MAPA-DE-TELAS.md} §4),
 * para todos os papéis: o perfil com a foto, as entradas e saídas e trocar a senha. Cada pessoa vê e muda só o que é
 * dela: a pessoa vem da sessão, nunca do formulário.
 */
@Controller
@RequestMapping("/meu-usuario")
public class MeuUsuarioController {

    /** "Foto salva…" e "Foto tirada." ({@code TelaMeuUsuario.tsx:89}). */
    static final String FOTO_SALVA = "Foto salva. Ela aparece também no canto da barra lateral.";
    static final String FOTO_TIRADA = "Foto tirada.";
    /** {@code TelaMeuUsuario.tsx:251}. */
    static final String SENHA_TROCADA = "Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa.";

    private static final List<String> SCRIPTS = List.of("/js/foto.js", "/js/formulario.js");

    /** O fuso das datas da loja ({@code FUSO_PADRAO}). */
    private static final ZoneId FUSO = Fuso.PADRAO;

    /** Uma linha de "Entradas e saídas" pronta para a tela ({@code LinhaDoAcesso}, {@code TelaMeuUsuario.tsx:203-233}). */
    public record LinhaDoAcesso(String dia, String entrada, String saida, boolean porFaltaDeUso, boolean atual, String tempo) {
    }

    private final Moldura moldura;
    private final PerfilService perfil;
    private final SessaoService sessoes;
    private final Ambiente amb;

    public MeuUsuarioController(Moldura moldura, PerfilService perfil, SessaoService sessoes, Ambiente amb) {
        this.moldura = moldura;
        this.perfil = perfil;
        this.sessoes = sessoes;
        this.amb = amb;
    }

    @GetMapping
    public String tela(@AuthenticationPrincipal UsuarioLogado logado, Model modelo) {
        moldura.preencher(modelo, logado, Menu.Secao.MEU_USUARIO);
        modelo.addAttribute("scripts", SCRIPTS);
        modelo.addAttribute("conteudo", "meu-usuario/meu-usuario");
        modelo.addAttribute("foto", modelo.getAttribute("fotoDaPessoa"));
        modelo.addAttribute("maxAcessos", Acessos.MAX);
        Instant agora = Instant.now();
        modelo.addAttribute("acessos", perfil.acessos(logado).stream().map(a -> linha(a, agora, FUSO)).toList());
        return "painel";
    }

    /**
     * Salvar a foto escolhida, ou tirar a foto (sem foto no pedido) ({@code gravar}, {@code TelaMeuUsuario.tsx:78-95}):
     * deu certo, o cartão volta com o aviso e a barra lateral troca a foto; recusa, só o aviso de erro (a foto escolhida
     * continua na tela).
     */
    @PostMapping("/foto")
    public String foto(@AuthenticationPrincipal UsuarioLogado logado, @RequestParam MultiValueMap<String, String> corpo, Model modelo,
            HttpServletResponse res) {
        try {
            String salva = perfil.salvarFoto(logado, corpo.get("foto"));
            modelo.addAttribute("logado", logado);
            modelo.addAttribute("foto", salva);
            modelo.addAttribute("fotoDaPessoa", salva);
            modelo.addAttribute("inicialDaPessoa", Iniciais.daPessoa(logado.nome()));
            modelo.addAttribute("avisoPerfil", salva != null ? FOTO_SALVA : FOTO_TIRADA);
            return "meu-usuario/meu-usuario :: perfilSalvo";
        } catch (ErroDeRegra e) {
            if (e.status() == 401) {
                return sessaoTerminou(res);
            }
            res.setStatus(e.status());
            res.setHeader("HX-Reswap", "none");
            modelo.addAttribute("erroDaFoto", e.getMessage());
            return "meu-usuario/meu-usuario :: erroDaFoto";
        }
    }

    /**
     * Trocar a senha ({@code FormTrocarSenha} com "Senha atual"): as conferências da tela e depois as do servidor, como em
     * "Crie a sua senha"; deu certo, o cartão volta com o aviso e o formulário vazio ({@code TelaMeuUsuario.tsx:246-253}).
     * Na quinta senha atual errada, a pessoa é bloqueada e volta para a entrada com o aviso.
     */
    @PostMapping("/senha")
    public String senha(@AuthenticationPrincipal UsuarioLogado logado, @RequestParam(name = "atual", required = false) String atual,
            @RequestParam(name = "nova", required = false) String nova, @RequestParam(name = "confirmacao", required = false) String confirmacao,
            Model modelo, HttpServletResponse res) {
        String a = FormularioDeSenha.texto(atual);
        String n = FormularioDeSenha.texto(nova);
        String c = FormularioDeSenha.texto(confirmacao);
        Map<String, String> erros = FormularioDeSenha.conferir(logado, a, n, c);
        if (!erros.isEmpty()) {
            return CriarSenhaController.avisos(res, modelo, 422, erros, null, false);
        }
        try {
            sessoes.trocarSenha(logado, a, n);
            modelo.addAttribute("avisoSenha", SENHA_TROCADA);
            res.setHeader("HX-Retarget", "closest section");
            res.setHeader("HX-Reswap", "outerHTML");
            return "meu-usuario/meu-usuario :: senha";
        } catch (ErroDeRegra e) {
            if (e.status() == 429) {
                // errou a senha atual 5 vezes: bloqueado e as sessões encerradas; volta para a entrada com o aviso
                res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
                res.setHeader("HX-Redirect", "/entrar?aviso=" + Avisos.BLOQUEADO);
                return "fragmentos/vazio :: vazio";
            }
            return CriarSenhaController.avisos(res, modelo, e.status(), FormularioDeSenha.doServidor(e), e.getMessage(), true);
        }
    }

    /** A pessoa não existe mais (a sessão terminou): a tela inteira volta para a entrada com o aviso. */
    private String sessaoTerminou(HttpServletResponse res) {
        res.addHeader("Set-Cookie", CookieDaSessao.apagado(amb));
        res.setHeader("HX-Redirect", "/entrar?aviso=" + Avisos.SESSAO_ENCERRADA);
        return "fragmentos/vazio :: vazio";
    }

    /** A linha da tabela ({@code LinhaDoAcesso}, {@code TelaMeuUsuario.tsx:203-233}). */
    static LinhaDoAcesso linha(Acesso a, Instant agora, ZoneId fuso) {
        String dia = Fuso.data(a.entrada() != null ? a.entrada() : a.saida(), fuso);
        Integer minutos = Acessos.minutos(a, agora);
        // saída em outro dia (passou da meia-noite): mostra o dia junto
        String diaDaSaida = a.saida() != null && a.entrada() != null && !Fuso.data(a.saida(), fuso).equals(dia)
                ? " (" + Fuso.data(a.saida(), fuso).substring(0, 5) + ")"
                : "";
        String saida = a.saida() == null ? null : Fuso.hora(a.saida(), fuso) + diaDaSaida;
        return new LinhaDoAcesso(dia, a.entrada() == null ? "—" : Fuso.hora(a.entrada(), fuso), saida, a.como() == ComoSaiu.INATIVIDADE, a.atual(),
                minutos == null ? "—" : Acessos.formatarDuracao(minutos));
    }
}
