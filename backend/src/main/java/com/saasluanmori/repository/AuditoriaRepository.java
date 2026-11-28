package com.saasluanmori.repository;

import com.saasluanmori.domain.RegistroAuditoria;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** O histórico da loja (só acrescenta e lê). */
public interface AuditoriaRepository extends JpaRepository<RegistroAuditoria, UUID> {

    List<RegistroAuditoria> findByTenantIdOrderByCriadoEmDescIdDesc(UUID tenantId);

    /** As entradas e saídas da pessoa nesta loja, da mais recente para trás (aba Meu usuário). */
    @Query("select r from RegistroAuditoria r where r.tenantId = :loja and r.criadoPor = :pessoa and r.acao in ('sessao.entrou', 'sessao.saiu')"
            + " order by r.criadoEm desc, r.id desc")
    List<RegistroAuditoria> sessoesDe(@Param("loja") UUID loja, @Param("pessoa") UUID pessoa, Pageable quantos);
}
