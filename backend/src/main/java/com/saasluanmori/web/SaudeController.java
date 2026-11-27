package com.saasluanmori.web;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /saude} (sem login): o que o balanceador e o monitoramento consultam para saber se o servidor está de pé E
 * falando com o banco ({@code legacy/api/src/saude/saude.controller.ts:1-21}). Não mostra versão, banco nem loja.
 */
@RestController
public class SaudeController {

    private final JdbcTemplate jdbc;

    public SaudeController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/saude")
    public ResponseEntity<Map<String, Object>> saude() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(503).body(Map.of("status", 503, "mensagem", "Banco de dados indisponível."));
        }
    }
}
