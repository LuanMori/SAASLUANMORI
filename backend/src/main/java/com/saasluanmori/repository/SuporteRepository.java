package com.saasluanmori.repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * O Adm. Sup (super_admin) para a aplicação: a linha dele não tem loja e o RLS a esconde; só as três funções
 * {@code SECURITY DEFINER} do banco dão o que o login e a sessão precisam (decisão T3 de
 * {@code docs/migracao/06-RISCOS-E-DECISOES.md}). Roda dentro da transação da loja em que ele está entrando.
 */
@Repository
public class SuporteRepository {

    /** O que {@code app_suporte_para_login} devolve. */
    public record ParaLogin(UUID id, String nome, String usuario, boolean ativo, String senhaHash, boolean senhaProvisoria,
            int tentativasErradas, Instant bloqueadoAte) {
    }

    /** O que {@code app_suporte_por_id} devolve. */
    public record PorId(UUID id, String nome, String usuario, boolean ativo, boolean senhaProvisoria) {
    }

    private final JdbcClient jdbc;

    public SuporteRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ParaLogin> paraLogin(String login) {
        return jdbc.sql("SELECT * FROM app_suporte_para_login(?)")
                .param(login)
                .query((rs, n) -> new ParaLogin(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("usuario"),
                        rs.getBoolean("ativo"), rs.getString("senha_hash"), rs.getBoolean("senha_provisoria"),
                        rs.getInt("tentativas_erradas"), instante(rs.getObject("bloqueado_ate", OffsetDateTime.class))))
                .optional();
    }

    public Optional<PorId> porId(UUID id) {
        return jdbc.sql("SELECT * FROM app_suporte_por_id(?)")
                .param(id)
                .query((rs, n) -> new PorId(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("usuario"),
                        rs.getBoolean("ativo"), rs.getBoolean("senha_provisoria")))
                .optional();
    }

    /** Grava as tentativas, o bloqueio e (se não for nulo) o último acesso. */
    public void registrar(UUID id, int tentativas, Instant bloqueadoAte, Instant ultimoAcesso) {
        jdbc.sql("SELECT app_suporte_registrar(?, ?, ?, ?)")
                .param(id)
                .param(tentativas)
                .param(comFuso(bloqueadoAte))
                .param(comFuso(ultimoAcesso))
                .query((rs, n) -> 0)
                .list();
    }

    private static Instant instante(OffsetDateTime t) {
        return t == null ? null : t.toInstant();
    }

    private static OffsetDateTime comFuso(Instant i) {
        return i == null ? null : i.atOffset(ZoneOffset.UTC);
    }
}
