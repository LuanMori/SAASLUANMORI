package com.saasluanmori.repository;

import com.saasluanmori.config.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Uma trava do PostgreSQL por loja e por assunto, solta sozinha no fim da transação (decisão T16 de
 * {@code docs/migracao/06-RISCOS-E-DECISOES.md}; a mesma do servidor antigo, {@code legacy/api/src/produtos/codigos.ts:9-22}):
 * duas pessoas da mesma loja gravando ao mesmo tempo passam uma depois da outra pela conferência; lojas diferentes
 * não esperam uma pela outra.
 */
@Repository
public class TravaDaLoja {

    @PersistenceContext
    private EntityManager em;

    /** {@code pg_advisory_xact_lock(hashtextextended('<assunto>:<loja>', 0))}, dentro da transação de quem chama. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void travar(String assunto) {
        em.createNativeQuery("SELECT CAST(pg_advisory_xact_lock(hashtextextended(:chave, 0)) AS text)")
                .setParameter("chave", assunto + ":" + TenantContext.require())
                .getSingleResult();
    }
}
