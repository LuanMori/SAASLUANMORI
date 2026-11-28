package com.saasluanmori.service;

import com.saasluanmori.config.TenantContext;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.AcaoAuditoria;
import com.saasluanmori.domain.Acessos;
import com.saasluanmori.domain.Acessos.Acesso;
import com.saasluanmori.domain.Acessos.RegistroDeSessao;
import com.saasluanmori.domain.BaseTenantEntity;
import com.saasluanmori.domain.FotoDoPerfil;
import com.saasluanmori.domain.Papel;
import com.saasluanmori.repository.AuditoriaRepository;
import com.saasluanmori.repository.SuporteRepository;
import com.saasluanmori.repository.UsuarioRepository;
import com.saasluanmori.service.HistoricoService.Alvo;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A aba Meu usuário: a foto do perfil e as entradas e saídas da própria pessoa ({@code legacy/web/src/demo/usuariosDemo.ts:583-606};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §4). Todo papel tem a aba; cada pessoa vê e muda só o que é dela (a
 * pessoa vem da sessão, nunca do formulário). A foto do Adm. Sup, que não tem loja, passa pelas funções dele no banco.
 */
@Service
public class PerfilService {

    private final UsuarioRepository usuarios;
    private final SuporteRepository suporte;
    private final AuditoriaRepository auditoria;
    private final HistoricoService historico;

    public PerfilService(UsuarioRepository usuarios, SuporteRepository suporte, AuditoriaRepository auditoria, HistoricoService historico) {
        this.usuarios = usuarios;
        this.suporte = suporte;
        this.auditoria = auditoria;
        this.historico = historico;
    }

    /** A foto da pessoa ({@code meuPerfil().foto}); {@code null} = sem foto (aparece a inicial). */
    @Transactional(readOnly = true)
    public String foto(UsuarioLogado quem) {
        if (quem.papel() == Papel.SUPER_ADMIN) {
            return suporte.foto(quem.usuarioId());
        }
        return usuarios.fotoDe(TenantContext.require(), quem.usuarioId()).orElse(null);
    }

    /**
     * {@code salvarMinhaFoto} ({@code usuariosDemo.ts:588-601}): confere a foto, e a igual à atual não grava nada; tirar
     * a foto vai para o histórico com {@code {"tirou": true}}. Devolve a foto que ficou.
     */
    @Transactional
    public String salvarFoto(UsuarioLogado quem, List<String> valores) {
        FotoDoPerfil.Lida lida = FotoDoPerfil.ler(valores);
        if (!lida.ok()) {
            throw new ErroDeRegra(400, lida.erro().mensagem(), null, null, List.of(lida.erro()));
        }
        String nova = lida.valor();
        if (Objects.equals(foto(quem), nova)) {
            return nova;
        }
        boolean gravou = quem.papel() == Papel.SUPER_ADMIN
                ? suporte.definirFoto(quem.usuarioId(), nova)
                : usuarios.definirFoto(TenantContext.require(), quem.usuarioId(), nova, BaseTenantEntity.agora()) == 1;
        if (!gravou) {
            throw ErroDeRegra.de(401, "Sua sessão terminou. Entre de novo.", "sessao_encerrada");
        }
        historico.registrar(quem.usuarioId(), AcaoAuditoria.USUARIO_FOTO_ALTERADA, Alvo.usuario(quem.usuarioId()),
                nova == null ? Map.of("tirou", true) : Map.of());
        return nova;
    }

    /** {@code meusAcessos} ({@code usuariosDemo.ts:603-606}): as {@link Acessos#MAX} mais recentes, da mais nova para trás. */
    @Transactional(readOnly = true)
    public List<Acesso> acessos(UsuarioLogado quem) {
        List<RegistroDeSessao> registros = new ArrayList<>(auditoria
                .sessoesDe(TenantContext.require(), quem.usuarioId(), PageRequest.of(0, Acessos.REGISTROS_PARA_MAX))
                .stream()
                .map(r -> new RegistroDeSessao(r.getAcao(), r.getCriadoEm(), r.getDetalhes()))
                .toList());
        // vieram da mais recente para trás; a montagem é na ordem em que foram gravados
        Collections.reverse(registros);
        return Acessos.daPessoa(registros, Acessos.MAX);
    }
}
