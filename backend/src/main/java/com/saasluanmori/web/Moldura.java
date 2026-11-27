package com.saasluanmori.web;

import com.saasluanmori.config.Ambiente;
import com.saasluanmori.config.UsuarioLogado;
import org.springframework.stereotype.Component;
import org.springframework.ui.Model;

/**
 * O que toda página da área logada leva para o {@code painel.html}: a barra lateral por papel, a pessoa, a parte
 * escolhida e o tempo da saída por inatividade ({@code legacy/web/src/painel/TelaPainel.tsx:198-339}). Cada parte
 * reconstruída põe o próprio conteúdo no modelo ({@code conteudo}, o nome do modelo Thymeleaf com o fragmento).
 */
@Component
public class Moldura {

    private final Ambiente amb;

    public Moldura(Ambiente amb) {
        this.amb = amb;
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
        modelo.addAttribute("inatividadeMin", amb.sessaoInatividadeMin());
    }
}
