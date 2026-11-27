package com.saasluanmori;

import com.saasluanmori.comando.Comandos;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Ponto de entrada do sistema reconstruído em Java + HTML + CSS (Spring Boot, Thymeleaf e HTMX).
 * O contrato da reconstrução está em {@code docs/migracao/PROMPT-MESTRE.md}.
 */
@SpringBootApplication
public class SaasLuanMoriApplication {

    /** Sem argumentos, sobe o servidor; com o nome de um comando de administração ({@code db:usuario} ...), roda só ele. */
    public static void main(String[] args) {
        if (args.length > 0 && Comandos.NOMES.contains(args[0])) {
            System.exit(Comandos.executar(args));
        }
        SpringApplication.run(SaasLuanMoriApplication.class, args);
    }
}
