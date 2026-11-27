package com.saasluanmori.teste;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Base dos testes que sobem a aplicação inteira com o banco de teste ({@link BancoDeTeste}). */
@SpringBootTest
public abstract class TesteComBanco {

    @DynamicPropertySource
    static void banco(DynamicPropertyRegistry registro) {
        BancoDeTeste.preparar(registro);
    }
}
