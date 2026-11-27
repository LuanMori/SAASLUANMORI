package com.saasluanmori.service;

import com.saasluanmori.domain.AcaoAuditoria;
import com.saasluanmori.domain.RegistroAuditoria;
import com.saasluanmori.repository.AuditoriaRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava no histórico quem fez o quê ({@code legacy/api/src/auditoria/auditoria.ts:1-34}), SEMPRE dentro da transação
 * da própria ação ({@link Propagation#MANDATORY}): se a ação falhar, o registro some junto; se o registro falhar, a ação
 * não acontece. A loja vem do contexto da transação.
 */
@Service
public class HistoricoService {

    /** Para quem é o alvo da ação. */
    public record Alvo(String tipo, UUID id) {

        public static Alvo usuario(UUID id) {
            return new Alvo("usuario", id);
        }

        public static Alvo fornecedor(UUID id) {
            return new Alvo("fornecedor", id);
        }
    }

    private final AuditoriaRepository auditoria;

    public HistoricoService(AuditoriaRepository auditoria) {
        this.auditoria = auditoria;
    }

    /**
     * @param autor    quem fez ({@code null} = o sistema ou uma tentativa sem ninguém logado)
     * @param alvo     sobre quem ou o quê (pode ser nulo)
     * @param detalhes só ids, papéis, códigos, nomes de campos e valores; nunca dado pessoal
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(UUID autor, AcaoAuditoria acao, Alvo alvo, Map<String, Object> detalhes) {
        auditoria.save(new RegistroAuditoria(autor, acao.chave(), alvo == null ? null : alvo.tipo(), alvo == null ? null : alvo.id(), detalhes));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(UUID autor, AcaoAuditoria acao, Alvo alvo) {
        registrar(autor, acao, alvo, Map.of());
    }
}
