package com.saasluanmori.repository;

import com.saasluanmori.domain.Sessao;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** As sessões de login da loja. */
public interface SessaoRepository extends JpaRepository<Sessao, UUID> {

    Optional<Sessao> findByTenantIdAndTokenHash(UUID tenantId, String tokenHash);

    /** Encerra as sessões abertas da pessoa (sair de todos os aparelhos) ({@code legacy/api/src/auth/sessoes.ts:6-12}). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Sessao s set s.encerradaEm = :agora, s.atualizadoEm = :agora, s.atualizadoPor = :autor
             where s.tenantId = :tenantId and s.usuarioId = :usuarioId and s.encerradaEm is null""")
    int encerrarTodas(@Param("tenantId") UUID tenantId, @Param("usuarioId") UUID usuarioId, @Param("agora") Instant agora,
            @Param("autor") UUID autor);

    /** Encerra as sessões abertas da pessoa, menos a atual (depois de trocar a senha). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Sessao s set s.encerradaEm = :agora, s.atualizadoEm = :agora, s.atualizadoPor = :autor
             where s.tenantId = :tenantId and s.usuarioId = :usuarioId and s.encerradaEm is null and s.id <> :exceto""")
    int encerrarOutras(@Param("tenantId") UUID tenantId, @Param("usuarioId") UUID usuarioId, @Param("exceto") UUID exceto,
            @Param("agora") Instant agora, @Param("autor") UUID autor);
}
