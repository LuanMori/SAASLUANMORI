package com.saasluanmori.service;

import com.saasluanmori.config.TenantContext;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.AcaoAuditoria;
import com.saasluanmori.domain.ErroCampo;
import com.saasluanmori.domain.Fornecedor;
import com.saasluanmori.domain.OrdemAlfabetica;
import com.saasluanmori.domain.Permissao;
import com.saasluanmori.domain.Permissoes;
import com.saasluanmori.domain.RegrasDoFornecedor;
import com.saasluanmori.domain.RegrasDoFornecedor.Conferido;
import com.saasluanmori.domain.RegrasDoFornecedor.JaCadastrado;
import com.saasluanmori.domain.RegrasDoFornecedor.NovoFornecedor;
import com.saasluanmori.repository.FornecedorRepository;
import com.saasluanmori.repository.TravaDaLoja;
import com.saasluanmori.service.HistoricoService.Alvo;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O cadastro de fornecedores da loja, com as regras e as mensagens do sistema antigo ({@code legacy/web/src/demo/apiLocal.ts:3164-3223};
 * {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8). Quem cuida: a permissão {@code compras} (Dono e Administrador; o
 * Personalizado, se marcada). As conferências seguem a ordem do antigo: a permissão, os dados (400), se existe (404) e o
 * documento repetido (409). Toda gravação passa pela trava da loja, e o histórico entra na mesma transação. Um
 * {@code id} nulo é o de um endereço que nem trazia um id: depois da permissão (e, no alterar, dos dados), é 404.
 */
@Service
public class FornecedorService {

    /** "Fornecedor não encontrado." ({@code apiLocal.ts:3193,3213}). */
    public static final String NAO_ENCONTRADO = "Fornecedor não encontrado.";

    /** Ativos primeiro, depois por nome em pt-BR ({@code apiLocal.ts:3164-3168}); empate: a ordem do cadastro. */
    private static final Comparator<Fornecedor> ORDEM = Comparator.comparing((Fornecedor f) -> !f.isAtivo())
            .thenComparing(Fornecedor::getNome, OrdemAlfabetica.PT_BR_COMPARADOR);

    private final FornecedorRepository fornecedores;
    private final TravaDaLoja trava;
    private final HistoricoService historico;

    public FornecedorService(FornecedorRepository fornecedores, TravaDaLoja trava, HistoricoService historico) {
        this.fornecedores = fornecedores;
        this.trava = trava;
        this.historico = historico;
    }

    /** {@code listarFornecedores}: todos os da loja, ativos primeiro e por nome. */
    @Transactional(readOnly = true)
    public List<Fornecedor> listar(UsuarioLogado quem) {
        exigir(quem);
        List<Fornecedor> lista = new ArrayList<>(fornecedores.findByTenantIdOrderByCriadoEmAscIdAsc(TenantContext.require()));
        lista.sort(ORDEM);
        return lista;
    }

    /** Um fornecedor da loja, para a janela de alterar ({@code id} nulo = o endereço nem trazia um id: 404). */
    @Transactional(readOnly = true)
    public Fornecedor buscar(UsuarioLogado quem, UUID id) {
        exigir(quem);
        return daLoja(id);
    }

    /** {@code cadastrarFornecedor} ({@code apiLocal.ts:3170-3185}). */
    @Transactional
    public Fornecedor cadastrar(UsuarioLogado quem, Map<String, List<String>> dados) {
        exigir(quem);
        NovoFornecedor valor = conferir(dados);
        trava.travar("fornecedores");
        conferirDocumentoUnico(valor.documento(), null);
        Fornecedor f = fornecedores.save(new Fornecedor(valor));
        historico.registrar(quem.usuarioId(), AcaoAuditoria.FORNECEDOR_CADASTRADO, Alvo.fornecedor(f.getId()));
        return f;
    }

    /**
     * {@code alterarFornecedor} ({@code apiLocal.ts:3187-3205}): o cadastro inteiro, com a mesma conferência; só grava
     * (e só vai para o histórico, com os campos que mudaram) se algo mudou.
     */
    @Transactional
    public Fornecedor alterar(UsuarioLogado quem, UUID id, Map<String, List<String>> dados) {
        exigir(quem);
        NovoFornecedor valor = conferir(dados);
        trava.travar("fornecedores");
        Fornecedor f = daLoja(id);
        conferirDocumentoUnico(valor.documento(), id);
        List<String> campos = f.alterar(valor);
        if (!campos.isEmpty()) {
            historico.registrar(quem.usuarioId(), AcaoAuditoria.FORNECEDOR_ALTERADO, Alvo.fornecedor(id), Map.of("campos", campos));
        }
        return f;
    }

    /**
     * {@code definirFornecedorAtivo} ({@code apiLocal.ts:3207-3222}): desativado, sai das listas de escolha; o que já
     * aponta para ele continua. Já está assim: nada muda.
     */
    @Transactional
    public Fornecedor definirAtivo(UsuarioLogado quem, UUID id, boolean ativo) {
        exigir(quem);
        trava.travar("fornecedores");
        Fornecedor f = daLoja(id);
        if (f.isAtivo() == ativo) {
            return f;
        }
        f.definirAtivo(ativo);
        historico.registrar(quem.usuarioId(), ativo ? AcaoAuditoria.FORNECEDOR_REATIVADO : AcaoAuditoria.FORNECEDOR_DESATIVADO, Alvo.fornecedor(id));
        return f;
    }

    /** O fornecedor desta loja; de outra loja ou inexistente: 404 "Fornecedor não encontrado.". */
    private Fornecedor daLoja(UUID id) {
        return (id == null ? Optional.<Fornecedor>empty() : fornecedores.findByTenantIdAndId(TenantContext.require(), id))
                .orElseThrow(() -> ErroDeRegra.de(404, NAO_ENCONTRADO));
    }

    /** A recusa de quem não tem a permissão {@code compras}: 403 "Compras: só o Dono ou o Administrador.". */
    public ErroDeRegra semPermissao() {
        return ErroDeRegra.de(403, Permissoes.mensagemSemPermissao(Permissao.COMPRAS));
    }

    /** {@code exigir('compras')} ({@code apiLocal.ts:956-960}). */
    private void exigir(UsuarioLogado quem) {
        if (!quem.pode(Permissao.COMPRAS)) {
            throw semPermissao();
        }
    }

    /** 400 com a mensagem do primeiro problema e todos os problemas por campo ({@code apiLocal.ts:3175}). */
    private static NovoFornecedor conferir(Map<String, List<String>> dados) {
        Conferido c = RegrasDoFornecedor.validar(dados);
        if (!c.ok()) {
            throw new ErroDeRegra(400, c.erros().get(0).mensagem(), null, null, c.erros());
        }
        return c.valor();
    }

    /** 409 "Este documento já é do fornecedor "<nome>"." ({@code apiLocal.ts:3177-3178}). */
    private void conferirDocumentoUnico(String documento, UUID ignorarId) {
        if (documento == null) {
            return;
        }
        List<JaCadastrado> comODocumento = fornecedores.findByTenantIdAndDocumento(TenantContext.require(), documento).stream()
                .map(f -> new JaCadastrado(f.getId(), f.getNome(), f.getDocumento()))
                .toList();
        List<ErroCampo> erro = RegrasDoFornecedor.conferirDocumentoUnico(documento, comODocumento, ignorarId);
        if (!erro.isEmpty()) {
            throw new ErroDeRegra(409, erro.get(0).mensagem(), null, null, erro);
        }
    }
}
