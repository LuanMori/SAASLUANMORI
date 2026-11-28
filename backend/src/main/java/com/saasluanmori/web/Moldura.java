package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.service.PerfilService;
import org.springframework.stereotype.Component;
import org.springframework.ui.Model;

/**
 * O que toda página da área logada leva para o {@code painel.html}: a barra lateral por papel, a pessoa, a parte
 * escolhida e o tempo da saída por inatividade ({@code legacy/web/src/painel/TelaPainel.tsx:198-339}). Cada parte
 * reconstruída põe o próprio conteúdo no modelo ({@code conteudo}, o nome do modelo Thymeleaf com o fragmento). A
 * pessoa aparece no canto de baixo com a foto do perfil, ou a inicial sem foto ({@code BarraLateral.tsx:92-94}).
 */
@Component
public class Moldura {

    private final Ambiente amb;
    private final PerfilService perfil;

    public Moldura(Ambiente amb, PerfilService perfil) {
        this.amb = amb;
        this.perfil = perfil;
    }

    public void preencher(Model modelo, UsuarioLogado logado, Menu.Secao s) {
        modelo.addAttribute("logado", logado);
        modelo.addAttribute("secao", s);
        modelo.addAttribute("permitido", s.podeVer(logado));
        modelo.addAttribute("reconstruida", PainelController.RECONSTRUIDAS.contains(s));
        modelo.addAttribute("avisoSemServidor", PainelController.AVISO_SEM_SERVIDOR);
        modelo.addAttribute("grupos", Menu.gruposDe(logado));
        modelo.addAttribute("itemCaixa", Menu.ITEM_CAIXA.podeVer(logado) ? Menu.ITEM_CAIXA : null);
        modelo.addAttribute("iniciaisDaLoja", Iniciais.de(logado.lojaNome()));
        modelo.addAttribute("inicialDaPessoa", Iniciais.daPessoa(logado.nome()));
        modelo.addAttribute("fotoDaPessoa", perfil.foto(logado));
        modelo.addAttribute("inatividadeMin", amb.sessaoInatividadeMin());
    }
}
