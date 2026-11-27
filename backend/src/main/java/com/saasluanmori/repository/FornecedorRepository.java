package com.saasluanmori.repository;

import com.saasluanmori.domain.Fornecedor;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Os fornecedores da loja. Toda consulta filtra pela loja (regra 1.5); o RLS do banco confere de novo. */
public interface FornecedorRepository extends JpaRepository<Fornecedor, UUID> {

    /** Todos os da loja na ordem em que foram cadastrados (a ordem da lista guardada no sistema antigo). */
    List<Fornecedor> findByTenantIdOrderByCriadoEmAscIdAsc(UUID tenantId);

    Optional<Fornecedor> findByTenantIdAndId(UUID tenantId, UUID id);

    /** Quem já tem o documento na loja (no máximo um: o banco não deixa repetir). */
    List<Fornecedor> findByTenantIdAndDocumento(UUID tenantId, String documento);
}
