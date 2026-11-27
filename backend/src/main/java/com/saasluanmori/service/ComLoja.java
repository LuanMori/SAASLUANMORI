package com.saasluanmori.service;

import com.saasluanmori.config.TenantContext;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Uma transação numa loja, com quem está agindo ({@code comLoja} do servidor antigo,
 * {@code legacy/api/src/banco/banco.service.ts:71-78}): define a loja e a pessoa no {@link TenantContext} ANTES de
 * a transação começar, para o banco receber as duas no início dela.
 */
@Component
public class ComLoja {

    private final TransactionTemplate transacao;

    public ComLoja(PlatformTransactionManager transacoes) {
        this.transacao = new TransactionTemplate(transacoes);
    }

    public <T> T executar(UUID loja, UUID usuario, Supplier<T> tarefa) {
        return TenantContext.comLoja(loja, usuario, () -> transacao.execute(status -> tarefa.get()));
    }

    public void executar(UUID loja, UUID usuario, Runnable tarefa) {
        executar(loja, usuario, () -> {
            tarefa.run();
            return null;
        });
    }
}
