package com.saasluanmori.web;

import com.saasluanmori.config.UsuarioLogado;
import java.util.EnumSet;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;

/**
 * A área logada: a barra lateral (DaniPets V9.3.3) e a parte escolhida ({@code legacy/web/src/painel/TelaPainel.tsx};
 * {@code docs/migracao/01-MAPA-DE-TELAS.md} §3). As partes que ainda não foram reconstruídas mostram o mesmo aviso que o
 * sistema real antigo mostrava nas partes que o servidor ainda não atendia ({@code legacy/web/src/App.tsx:15-19};
 * {@code TelaPainel.tsx:268-279}); cada módulo, ao chegar, entra em {@link #RECONSTRUIDAS} e ganha o próprio
 * controlador (Compras: {@link ComprasController}). A aba Suporte fica em branco, como no sistema antigo (CLAUDE.md).
 * Mesmo que alguém force o endereço, quem não tem a permissão da parte não vê o conteúdo.
 */
@Controller
public class PainelController {

    /** As partes que já foram reconstruídas (as outras mostram o aviso). A Suporte é em branco de propósito. */
    static final Set<Menu.Secao> RECONSTRUIDAS = EnumSet.of(Menu.Secao.SUPORTE, Menu.Secao.COMPRAS);

    /** {@code MENSAGEM_SEM_SERVIDOR} ({@code legacy/web/src/api.ts:956}). */
    static final String AVISO_SEM_SERVIDOR = "Esta parte ainda não está ligada ao servidor. Por enquanto ela funciona na demonstração (sistema-padrao-demo.html).";

    private final Moldura moldura;

    public PainelController(Moldura moldura) {
        this.moldura = moldura;
    }

    @GetMapping("/{secao:[a-z-]+}")
    public String secao(@PathVariable String secao, @AuthenticationPrincipal UsuarioLogado logado, Model modelo) {
        Menu.Secao s = Menu.Secao.doId(secao).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        moldura.preencher(modelo, logado, s);
        return "painel";
    }
}
