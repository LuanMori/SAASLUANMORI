package com.saasluanmori.web;

import java.util.Map;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/** Os textos da marca ({@link Marca}) em toda tela, como {@code ${marca.nome}} (o Thymeleaf não deixa ler classes estáticas). */
@ControllerAdvice
public class MarcaNasTelas {

    private static final Map<String, Object> MARCA = Map.of(
            "nome", Marca.NOME,
            "suporteTexto", Marca.SUPORTE_TEXTO,
            "suporteEmail", Marca.SUPORTE_EMAIL,
            "linha", Marca.LINHA,
            "chamada", Marca.CHAMADA,
            "descricao", Marca.DESCRICAO,
            "recursos", Marca.RECURSOS,
            "versao", Marca.VERSAO);

    @ModelAttribute("marca")
    public Map<String, Object> marca() {
        return MARCA;
    }
}
