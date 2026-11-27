package com.saasluanmori.web;

import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** A ilustração da loja da tela de entrada, gerada por código ({@link IlustracaoLoja}). */
@RestController
public class IlustracaoController {

    @GetMapping(value = "/img/ilustracao-loja.svg", produces = "image/svg+xml")
    public ResponseEntity<String> ilustracao() {
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml;charset=UTF-8"))
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS))
                .body(IlustracaoLoja.svg());
    }
}
