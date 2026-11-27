package com.saasluanmori.repository;

import com.saasluanmori.domain.RegistroAuditoria;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** O histórico da loja (só acrescenta e lê). */
public interface AuditoriaRepository extends JpaRepository<RegistroAuditoria, UUID> {

    List<RegistroAuditoria> findByTenantIdOrderByCriadoEmDescIdDesc(UUID tenantId);
}
