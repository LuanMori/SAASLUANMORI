package com.saasluanmori.config;

import jakarta.persistence.EntityManagerFactory;
import java.sql.PreparedStatement;
import org.hibernate.Session;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * O "interceptor JDBC" da regra 1.5 do prompt mestre: no início de cada transação, passa para o banco a loja e a pessoa
 * da requisição. É o {@code SET LOCAL} da regra, escrito como {@code set_config(..., true)}, que vale só até o fim da
 * transação e aceita o valor como parâmetro (decisão T2 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}). Assim o
 * valor não fica grudado na conexão do pool e não vaza para a próxima requisição, de outra loja
 * ({@code legacy/api/src/banco/banco.service.ts:9-11,71-78}).
 *
 * <p>Sem loja no {@link TenantContext}, nada é definido: as tabelas de loja dão erro e só o cadastro de lojas (sem RLS)
 * responde.
 */
public class TenantTransactionManager extends JpaTransactionManager {

    private static final long serialVersionUID = 1L;

    private static final String DEFINIR = "SELECT set_config('app.tenant_id', ?, true), set_config('app.usuario_id', ?, true)";

    public TenantTransactionManager(EntityManagerFactory emf) {
        super(emf);
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);
        TenantContext.atual().ifPresent(contexto -> {
            EntityManagerHolder holder = (EntityManagerHolder) TransactionSynchronizationManager.getResource(obtainEntityManagerFactory());
            if (holder == null) {
                throw new IllegalStateException("Transação sem EntityManager: a loja não pôde ser definida.");
            }
            holder.getEntityManager().unwrap(Session.class).doWork(conexao -> {
                try (PreparedStatement ps = conexao.prepareStatement(DEFINIR)) {
                    ps.setString(1, contexto.tenantId().toString());
                    ps.setString(2, contexto.usuarioId() == null ? "" : contexto.usuarioId().toString());
                    ps.execute();
                }
            });
        });
    }
}
