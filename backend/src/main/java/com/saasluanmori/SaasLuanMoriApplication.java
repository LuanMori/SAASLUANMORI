package com.saasluanmori;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Ponto de entrada do sistema reconstruído em Java + HTML + CSS (Spring Boot, Thymeleaf e HTMX).
 * O contrato da reconstrução está em {@code docs/migracao/PROMPT-MESTRE.md}.
 */
@SpringBootApplication
public class SaasLuanMoriApplication {

    public static void main(String[] args) {
        SpringApplication.run(SaasLuanMoriApplication.class, args);
    }
}
