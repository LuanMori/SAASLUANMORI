package com.saasluanmori.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.saasluanmori.config.TenantContext;
import com.saasluanmori.config.UsuarioLogado;
import com.saasluanmori.domain.Fornecedor;
import com.saasluanmori.domain.Papel;
import com.saasluanmori.domain.UuidV7;
import com.saasluanmori.teste.BancoDeTeste;
import com.saasluanmori.teste.DadosDeTeste;
import com.saasluanmori.teste.DadosDeTeste.LojaDeTeste;
import com.saasluanmori.teste.TesteComBanco;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * O cadastro de fornecedores pela aplicação, regra por regra ({@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8;
 * {@code legacy/web/src/demo/apiLocal.ts:3164-3223}): o caminho feliz, a permissão {@code compras}, os erros 400, 404 e
 * 409 na ordem do antigo, o histórico na mesma transação, a ordem da lista e a loja de cada um.
 */
class FornecedorServiceTest extends TesteComBanco {

    @Autowired
    private FornecedorService servico;

    private LojaDeTeste loja;
    private LojaDeTeste outra;
    private UsuarioLogado dono;
    private UsuarioLogado vendedor;

    @BeforeEach
    void cadastrar() {
        loja = DadosDeTeste.novaLoja("Pet Shop da Ana");
        outra = DadosDeTeste.novaLoja("Outra loja");
        dono = logado(loja, "ana", "Ana Paula", Papel.DONO, List.of());
        vendedor = logado(loja, "bruno", "Bruno", Papel.VENDEDOR, List.of());
    }

    private static UsuarioLogado logado(LojaDeTeste l, String login, String nome, Papel papel, List<String> permissoes) {
        UUID id = DadosDeTeste.novoUsuario(l.id(), login, nome, papel, null, false);
        if (!permissoes.isEmpty()) {
            DadosDeTeste.executar(l.id().toString(), "UPDATE usuarios SET permissoes = ? WHERE id = ?", permissoes.toArray(String[]::new), id);
        }
        return new UsuarioLogado(l.id(), l.nome(), l.subdominio(), id, papel, permissoes, nome, login, UuidV7.gerar(), false);
    }

    /** Como na requisição: a loja e a pessoa no contexto. */
    private static <T> T como(UsuarioLogado quem, Supplier<T> acao) {
        return TenantContext.comLoja(quem.lojaId(), quem.usuarioId(), acao);
    }

    private static Map<String, List<String>> dados(String... pares) {
        Map<String, List<String>> m = new LinkedHashMap<>();
        for (int i = 0; i < pares.length; i += 2) {
            m.put(pares[i], List.of(pares[i + 1]));
        }
        return m;
    }

    private Fornecedor novo(UsuarioLogado quem, String... pares) {
        return como(quem, () -> servico.cadastrar(quem, dados(pares)));
    }

    private static void recusa(ThrowingCallable acao, int status, String mensagem) {
        assertThatThrownBy(acao).isInstanceOfSatisfying(ErroDeRegra.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.getMessage()).isEqualTo(mensagem);
        });
    }

    /** O histórico da loja, na ordem: "acao|alvo_tipo|alvo_id|detalhes|criado_por". */
    private static List<String> historico(UUID lojaId) throws SQLException {
        List<String> r = new ArrayList<>();
        try (Connection c = BancoDeTeste.conectar(BancoDeTeste.DONO, BancoDeTeste.DONO_SENHA)) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, lojaId.toString());
                ps.execute();
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT acao, alvo_tipo, alvo_id, detalhes::text, criado_por FROM auditoria WHERE acao LIKE 'fornecedor.%' ORDER BY criado_em, id");
                    ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    r.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|" + rs.getString(4) + "|" + rs.getString(5));
                }
            }
            c.rollback();
        }
        return r;
    }

    @Test
    void cadastraComOsDadosConferidosEOHistorico() throws SQLException {
        Fornecedor f = novo(dono, "nome", "  Distribuidora  Pet Sul ", "documento", "11.222.333/0001-81", "telefone", "(41) 3333-4444",
                "contato", " Marcos ", "observacao", "");
        assertThat(f.getNome()).isEqualTo("Distribuidora Pet Sul");
        assertThat(f.getDocumento()).isEqualTo("11222333000181");
        assertThat(f.getTelefone()).isEqualTo("4133334444");
        assertThat(f.getContato()).isEqualTo("Marcos");
        assertThat(f.getObservacao()).isNull();
        assertThat(f.isAtivo()).isTrue();
        assertThat(f.getTenantId()).isEqualTo(loja.id());
        assertThat(f.getCriadoPor()).isEqualTo(dono.usuarioId());
        assertThat(f.getDocumentoFormatado()).isEqualTo("11.222.333/0001-81");
        assertThat(f.getTelefoneFormatado()).isEqualTo("(41) 3333-4444");
        assertThat(historico(loja.id())).containsExactly("fornecedor.cadastrado|fornecedor|" + f.getId() + "|{}|" + dono.usuarioId());
    }

    @Test
    void listaAtivosPrimeiroDepoisPorNomeComoONavegador() {
        Fornecedor zeca = novo(dono, "nome", "Zeca Pet");
        novo(dono, "nome", "ação pet");
        novo(dono, "nome", "Distribuidora PetSul");
        novo(dono, "nome", "Distribuidora Pet Sul");
        novo(dono, "nome", "Éder Rações");
        Fornecedor alvaro = novo(dono, "nome", "Álvaro & Cia");
        como(dono, () -> servico.definirAtivo(dono, alvaro.getId(), false));
        List<String> nomes = como(dono, () -> servico.listar(dono)).stream().map(Fornecedor::getNome).toList();
        assertThat(nomes).containsExactly("ação pet", "Distribuidora Pet Sul", "Distribuidora PetSul", "Éder Rações", "Zeca Pet", "Álvaro & Cia");
        assertThat(zeca.isAtivo()).isTrue();
    }

    @Test
    void soQuemTemComprasCuidaDosFornecedores() {
        String semPermissao = "Compras: só o Dono ou o Administrador.";
        Fornecedor f = novo(dono, "nome", "Pet Sul");
        recusa(() -> como(vendedor, () -> servico.listar(vendedor)), 403, semPermissao);
        recusa(() -> novo(vendedor, "nome", "Pet Norte"), 403, semPermissao);
        recusa(() -> como(vendedor, () -> servico.alterar(vendedor, f.getId(), dados("nome", "X"))), 403, semPermissao);
        recusa(() -> como(vendedor, () -> servico.definirAtivo(vendedor, f.getId(), false)), 403, semPermissao);
        recusa(() -> como(vendedor, () -> servico.buscar(vendedor, f.getId())), 403, semPermissao);
        // a permissão vem antes de tudo: dado inválido e id que não existe continuam 403
        recusa(() -> como(vendedor, () -> servico.alterar(vendedor, null, dados("nome", ""))), 403, semPermissao);

        UsuarioLogado admin = logado(loja, "carla", "Carla", Papel.ADMINISTRADOR, List.of());
        assertThat(novo(admin, "nome", "Pet Leste").getCriadoPor()).isEqualTo(admin.usuarioId());
        UsuarioLogado comCompras = logado(loja, "davi", "Davi", Papel.PERSONALIZADO, List.of("compras"));
        assertThat(como(comCompras, () -> servico.listar(comCompras))).hasSize(2);
        UsuarioLogado semCompras = logado(loja, "eva", "Eva", Papel.PERSONALIZADO, List.of("clientes"));
        recusa(() -> como(semCompras, () -> servico.listar(semCompras)), 403, semPermissao);
    }

    @Test
    void osDadosSaoConferidosComAsMensagensDoAntigo() {
        recusa(() -> novo(dono, "nome", " "), 400, "Informe o nome do fornecedor.");
        recusa(() -> novo(dono, "nome", "Pet", "documento", "11222333000182"), 400, "Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números).");
        recusa(() -> novo(dono, "nome", "Pet", "telefone", "3333-4444"), 400, "Telefone com DDD: 10 ou 11 números.");
        recusa(() -> novo(dono, "lojaId", outra.id().toString(), "nome", "Pet"), 400, "Campo não permitido.");
        assertThatThrownBy(() -> novo(dono, "nome", "", "telefone", "1"))
                .isInstanceOfSatisfying(ErroDeRegra.class, e -> assertThat(e.erros()).extracting(c -> c.campo()).containsExactly("nome", "telefone"));
        assertThat(como(dono, () -> servico.listar(dono))).isEmpty();
    }

    @Test
    void oDocumentoNaoSeRepeteNaLojaNemComODesativado() {
        Fornecedor sul = novo(dono, "nome", "Pet Sul", "documento", "11.222.333/0001-81");
        como(dono, () -> servico.definirAtivo(dono, sul.getId(), false));
        recusa(() -> novo(dono, "nome", "Pet Norte", "documento", "11222333000181"), 409, "Este documento já é do fornecedor \"Pet Sul\".");
        Fornecedor norte = novo(dono, "nome", "Pet Norte", "documento", "529.982.247-25");
        recusa(() -> como(dono, () -> servico.alterar(dono, norte.getId(), dados("nome", "Pet Norte", "documento", "11222333000181"))), 409,
                "Este documento já é do fornecedor \"Pet Sul\".");
        // o próprio documento, numa alteração, não conta como repetido
        assertThat(como(dono, () -> servico.alterar(dono, sul.getId(), dados("nome", "Pet Sul Ltda", "documento", "11222333000181"))).getNome())
                .isEqualTo("Pet Sul Ltda");
        // em outra loja, o mesmo documento pode
        UsuarioLogado daOutra = logado(outra, "ana", "Ana", Papel.DONO, List.of());
        assertThat(novo(daOutra, "nome", "Pet Sul da outra", "documento", "11222333000181").getTenantId()).isEqualTo(outra.id());
    }

    @Test
    void alterarSoGravaSeAlgoMudouEContaOsCampos() throws SQLException {
        Fornecedor f = novo(dono, "nome", "Pet Sul", "telefone", "4133334444", "contato", "Marcos");
        Fornecedor igual = como(dono, () -> servico.alterar(dono, f.getId(), dados("nome", " Pet  Sul ", "telefone", "(41) 3333-4444", "contato", "Marcos")));
        assertThat(igual.getAtualizadoEm()).isEqualTo(f.getAtualizadoEm());
        Fornecedor mudou = como(dono, () -> servico.alterar(dono, f.getId(), dados("nome", "Pet Sul", "telefone", "41999998888", "contato", "Ana",
                "observacao", "entrega às terças")));
        assertThat(mudou.getTelefone()).isEqualTo("41999998888");
        assertThat(mudou.getObservacao()).isEqualTo("entrega às terças");
        assertThat(historico(loja.id())).containsExactly(
                "fornecedor.cadastrado|fornecedor|" + f.getId() + "|{}|" + dono.usuarioId(),
                "fornecedor.alterado|fornecedor|" + f.getId() + "|{\"campos\": [\"telefone\", \"contato\", \"observacao\"]}|" + dono.usuarioId());
        // alterar manda o cadastro inteiro: o campo que não veio fica vazio
        Fornecedor semContato = como(dono, () -> servico.alterar(dono, f.getId(), dados("nome", "Pet Sul", "telefone", "41999998888")));
        assertThat(semContato.getContato()).isNull();
        assertThat(semContato.getObservacao()).isNull();
    }

    @Test
    void desativarEReativarVaoParaOHistoricoSoQuandoMudam() throws SQLException {
        Fornecedor f = novo(dono, "nome", "Pet Sul");
        assertThat(como(dono, () -> servico.definirAtivo(dono, f.getId(), false)).isAtivo()).isFalse();
        assertThat(como(dono, () -> servico.definirAtivo(dono, f.getId(), false)).isAtivo()).isFalse();
        assertThat(como(dono, () -> servico.definirAtivo(dono, f.getId(), true)).isAtivo()).isTrue();
        assertThat(como(dono, () -> servico.definirAtivo(dono, f.getId(), true)).isAtivo()).isTrue();
        assertThat(historico(loja.id())).containsExactly(
                "fornecedor.cadastrado|fornecedor|" + f.getId() + "|{}|" + dono.usuarioId(),
                "fornecedor.desativado|fornecedor|" + f.getId() + "|{}|" + dono.usuarioId(),
                "fornecedor.reativado|fornecedor|" + f.getId() + "|{}|" + dono.usuarioId());
    }

    @Test
    void oDeOutraLojaNaoExisteParaEsta() {
        UsuarioLogado daOutra = logado(outra, "ana", "Ana", Papel.DONO, List.of());
        Fornecedor deLa = novo(daOutra, "nome", "Fornecedor da outra");
        String naoEncontrado = "Fornecedor não encontrado.";
        recusa(() -> como(dono, () -> servico.buscar(dono, deLa.getId())), 404, naoEncontrado);
        recusa(() -> como(dono, () -> servico.alterar(dono, deLa.getId(), dados("nome", "Tomado"))), 404, naoEncontrado);
        recusa(() -> como(dono, () -> servico.definirAtivo(dono, deLa.getId(), false)), 404, naoEncontrado);
        recusa(() -> como(dono, () -> servico.definirAtivo(dono, null, false)), 404, naoEncontrado);
        assertThat(como(dono, () -> servico.listar(dono))).isEmpty();
        // os dados vêm antes do 404 no alterar, como no antigo
        recusa(() -> como(dono, () -> servico.alterar(dono, deLa.getId(), dados("nome", ""))), 400, "Informe o nome do fornecedor.");
        assertThat(como(daOutra, () -> servico.buscar(daOutra, deLa.getId())).getNome()).isEqualTo("Fornecedor da outra");
    }

    @Test
    void doisCadastrosAoMesmoTempoComOMesmoDocumentoPassamUmDepoisDoOutro() throws Exception {
        UsuarioLogado admin = logado(loja, "carla", "Carla", Papel.ADMINISTRADOR, List.of());
        CountDownLatch largada = new CountDownLatch(1);
        ExecutorService duas = Executors.newFixedThreadPool(2);
        try {
            List<Future<String>> resultados = new ArrayList<>();
            for (UsuarioLogado quem : List.of(dono, admin)) {
                resultados.add(duas.submit(() -> {
                    largada.await();
                    try {
                        return novo(quem, "nome", "Pet " + quem.nome(), "documento", "11222333000181").getNome();
                    } catch (ErroDeRegra e) {
                        return e.status() + " " + e.getMessage();
                    }
                }));
            }
            largada.countDown();
            List<String> r = new ArrayList<>();
            for (Future<String> f : resultados) {
                r.add(f.get(30, TimeUnit.SECONDS));
            }
            assertThat(r).filteredOn(s -> s.startsWith("409 Este documento já é do fornecedor \"Pet ")).hasSize(1);
            assertThat(r).filteredOn(s -> s.startsWith("Pet ")).hasSize(1);
        } finally {
            duas.shutdownNow();
        }
        assertThat(como(dono, () -> servico.listar(dono))).hasSize(1);
    }
}
