package com.saasluanmori.repository;

import com.saasluanmori.domain.Usuario;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Os usuários da loja. Toda consulta filtra pela loja (regra 1.5); o RLS do banco confere de novo. */
public interface UsuarioRepository extends JpaRepository<Usuario, UUID> {

    Optional<Usuario> findByTenantIdAndUsuario(UUID tenantId, String usuario);

    Optional<Usuario> findByTenantIdAndId(UUID tenantId, UUID id);

    /**
     * Lê o usuário TRAVANDO a linha ({@code FOR UPDATE}) até o fim da transação: duas tentativas ao mesmo tempo não
     * contam a mesma senha errada uma vez só ({@code legacy/api/src/auth/sessoes.ts:14-22}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from Usuario u where u.tenantId = :tenantId and u.id = :id")
    Optional<Usuario> travar(@Param("tenantId") UUID tenantId, @Param("id") UUID id);
}
