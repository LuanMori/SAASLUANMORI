package com.saasluanmori.config;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * O acesso ao banco: a aplicação conecta como {@code saas_app} (sem BYPASSRLS, não é dona das tabelas) e toda
 * transação começa definindo a loja e a pessoa ({@link TenantTransactionManager}). As migrações rodam com a role dona
 * do schema ({@code spring.flyway.user}), como o serviço {@code migracao} do sistema antigo
 * ({@code legacy/raiz/docker-compose.prod.yml}).
 */
@Configuration(proxyBeanMethods = false)
public class BancoConfig {

    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
        return new TenantTransactionManager(emf);
    }

    @Bean
    public Ambiente ambiente(Environment env) {
        return Ambiente.ler(env);
    }
}
