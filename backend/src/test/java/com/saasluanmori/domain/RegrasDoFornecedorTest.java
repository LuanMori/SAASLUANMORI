package com.saasluanmori.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.saasluanmori.domain.RegrasDoFornecedor.Conferido;
import com.saasluanmori.domain.RegrasDoFornecedor.JaCadastrado;
import com.saasluanmori.domain.RegrasDoFornecedor.NovoFornecedor;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * As regras do cadastro do fornecedor, uma a uma, com as mesmas entradas e saídas dos testes do sistema antigo
 * ({@code legacy/core/test/fornecedor.test.ts}) e de {@code docs/migracao/03-REGRAS-DE-NEGOCIO.md} §8.
 */
class RegrasDoFornecedorTest {

    /** Os campos como um formulário manda: cada nome com um valor. */
    private static Map<String, List<String>> campos(String... pares) {
        Map<String, List<String>> m = new LinkedHashMap<>();
        for (int i = 0; i < pares.length; i += 2) {
            m.put(pares[i], List.of(pares[i + 1]));
        }
        return m;
    }

    private static String mensagem(Conferido c) {
        return c.ok() ? "" : c.erros().get(0).mensagem();
    }

    @Test
    void nomeObrigatorioDocumentoETelefoneOpcionaisGuardadosSoComNumeros() {
        Conferido r = RegrasDoFornecedor.validar(campos("nome", "  Distribuidora  Pet Sul ", "documento", "11.222.333/0001-81", "telefone", "(41) 3333-4444",
                "contato", " Marcos ", "observacao", ""));
        assertThat(r.ok()).isTrue();
        assertThat(r.valor()).isEqualTo(new NovoFornecedor("Distribuidora Pet Sul", "11222333000181", "4133334444", "Marcos", null));

        Conferido so = RegrasDoFornecedor.validar(campos("nome", "Feira do Bairro"));
        assertThat(so.valor()).isEqualTo(new NovoFornecedor("Feira do Bairro", null, null, null, null));

        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", " ")))).isEqualTo("Informe o nome do fornecedor.");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "x")))).isEqualTo("Informe o nome do fornecedor.");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos()))).isEqualTo("Informe o nome do fornecedor.");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "x".repeat(121))))).isEqualTo("O nome pode ter até 120 caracteres.");
        assertThat(RegrasDoFornecedor.validar(campos("nome", "x".repeat(120))).ok()).isTrue();
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "Pet\u0001Sul")))).isEqualTo("O nome contém caracteres inválidos.");
    }

    @Test
    void oNomeVemEmNfcSemEspacosSobrandoEContaComoNoJavaScript() {
        // "e" + acento agudo combinado vira "é"; tabulação e quebra de linha viram um espaço; o espaço não separável sai
        Conferido r = RegrasDoFornecedor.validar(campos("nome", " Rações\tdo\n\nZé "));
        assertThat(r.valor().nome()).isEqualTo("Rações do Zé");
        // o JavaScript conta em unidades UTF-16: um emoji tem tamanho 2 e já basta
        assertThat(RegrasDoFornecedor.validar(campos("nome", "😀")).ok()).isTrue();
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "😀".repeat(61))))).isEqualTo("O nome pode ter até 120 caracteres.");
    }

    @Test
    void confereCnpjECpfEOTelefoneComDdd() {
        assertThat(Documento.cnpjValido("11222333000181")).isTrue();
        assertThat(Documento.cnpjValido("11222333000182")).isFalse();
        assertThat(Documento.cnpjValido("11111111111111")).isFalse();
        assertThat(Documento.cpfValido("52998224725")).isTrue();
        assertThat(Documento.cpfValido("52998224726")).isFalse();
        assertThat(Documento.cpfValido("00000000000")).isFalse();
        assertThat(RegrasDoFornecedor.validar(campos("nome", "Pessoa física", "documento", "529.982.247-25")).valor().documento()).isEqualTo("52998224725");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "documento", "11222333000182"))))
                .isEqualTo("Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números).");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "documento", "123")))).startsWith("Documento inválido");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "documento", "111.111.111-11")))).startsWith("Documento inválido");
        // sem nenhum número, o documento fica vazio (não é erro)
        assertThat(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "documento", "abc")).valor().documento()).isNull();

        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "telefone", "3333-4444")))).isEqualTo("Telefone com DDD: 10 ou 11 números.");
        assertThat(Telefone.valido("4133334444")).isTrue();
        assertThat(Telefone.valido("41999998888")).isTrue();
        // celular precisa do 9 depois do DDD; o DDD não tem zero
        assertThat(Telefone.valido("41899998888")).isFalse();
        assertThat(Telefone.valido("0133334444")).isFalse();
        assertThat(Telefone.valido("1033334444")).isFalse();
        assertThat(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "telefone", " - ")).valor().telefone()).isNull();
    }

    @Test
    void contatoEObservacaoSaoTextosOpcionaisComLimite() {
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "observacao", "x".repeat(301))))).isEqualTo("Use até 300 caracteres.");
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "contato", "x".repeat(81))))).isEqualTo("Use até 80 caracteres.");
        assertThat(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "contato", "x".repeat(80))).ok()).isTrue();
        assertThat(mensagem(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "contato", "a\u007fb")))).isEqualTo("O texto contém caracteres inválidos.");
        // no formulário, "não é texto" é o campo mandado mais de uma vez (no JSON antigo, uma lista)
        Map<String, List<String>> duas = new LinkedHashMap<>(campos("nome", "X Ltda"));
        duas.put("contato", List.of("Marcos", "Ana"));
        assertThat(mensagem(RegrasDoFornecedor.validar(duas))).isEqualTo("Envie um texto.");
        assertThat(RegrasDoFornecedor.validar(campos("nome", "X Ltda", "contato", "   ")).valor().contato()).isNull();
    }

    @Test
    void outroCampoERecusadoEOsProblemasVemNaOrdemDoAntigo() {
        Conferido r = RegrasDoFornecedor.validar(campos("lojaId", "outra", "nome", "", "documento", "1", "telefone", "2", "contato", "x".repeat(81),
                "observacao", "x".repeat(301)));
        assertThat(r.erros()).containsExactly(
                new ErroCampo("lojaId", "Campo não permitido."),
                new ErroCampo("nome", "Informe o nome do fornecedor."),
                new ErroCampo("documento", "Documento inválido: confira o CNPJ (14 números) ou o CPF (11 números)."),
                new ErroCampo("telefone", "Telefone com DDD: 10 ou 11 números."),
                new ErroCampo("contato", "Use até 80 caracteres."),
                new ErroCampo("observacao", "Use até 300 caracteres."));
    }

    @Test
    void oDocumentoNaoSeRepeteNaLojaEAFormatacaoParaMostrar() {
        UUID a = UUID.randomUUID();
        List<JaCadastrado> lista = List.of(new JaCadastrado(a, "Pet Sul", "11222333000181"));
        assertThat(RegrasDoFornecedor.conferirDocumentoUnico("11222333000181", lista, null))
                .containsExactly(new ErroCampo("documento", "Este documento já é do fornecedor \"Pet Sul\"."));
        assertThat(RegrasDoFornecedor.conferirDocumentoUnico("11222333000181", lista, a)).isEmpty();
        assertThat(RegrasDoFornecedor.conferirDocumentoUnico(null, lista, null)).isEmpty();
        assertThat(Documento.formatar("11222333000181")).isEqualTo("11.222.333/0001-81");
        assertThat(Documento.formatar("52998224725")).isEqualTo("529.982.247-25");
        assertThat(Documento.formatar(null)).isEmpty();
        assertThat(Telefone.formatar("41999998888")).isEqualTo("(41) 99999-8888");
        assertThat(Telefone.formatar("4133334444")).isEqualTo("(41) 3333-4444");
    }

    @Test
    void alterarDizOsCamposQueMudaramNaOrdemDoAntigo() {
        Fornecedor f = new Fornecedor(new NovoFornecedor("Pet Sul", null, "4133334444", "Marcos", null));
        assertThat(f.alterar(new NovoFornecedor("Pet Sul", null, "4133334444", "Marcos", null))).isEmpty();
        assertThat(f.alterar(new NovoFornecedor("Pet Sul", null, "41999998888", "Ana", null))).containsExactly("telefone", "contato");
        assertThat(f.getContato()).isEqualTo("Ana");
    }
}
