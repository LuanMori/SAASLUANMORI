package saas.core;

import java.util.*;

public final class Produto {
    private Produto() {}
    public static final String MENSAGEM_PRECO_ZERO = "O preço de venda deve ser maior que zero. Brinde é lançado na venda (100% de desconto, com autorização do Dono).";
    private static final Set<String> CAMPOS = Set.of("nome", "codigoBarras", "precoCentavos");
    private static final String ESPACO = "[\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]";
    public record ErroCampo(String campo, String mensagem) {}
    public record NovoProduto(String nome, String codigoBarras, int precoCentavos) {}
    public record Resultado(NovoProduto valor, List<ErroCampo> erros) {
        public Resultado { erros = List.copyOf(erros); }
        public boolean ok() { return erros.isEmpty(); }
    }
    private static String limpar(String s) {
        return s.replaceAll("^" + ESPACO + "+|" + ESPACO + "+$", "");
    }
    public static String formatarCodigoInterno(double numero) {
        if (!Double.isFinite(numero) || numero != Math.rint(numero) || numero < 1 || numero > 9007199254740991L)
            throw new IllegalArgumentException("O código interno deve ser um inteiro maior que zero.");
        return String.format(Locale.ROOT, "%04d", (long) numero);
    }
    public static Resultado validarNovoProduto(Object entrada) {
        if (!(entrada instanceof Map<?, ?> dados))
            return new Resultado(null, List.of(new ErroCampo("_", "Envie um objeto com os dados do produto.")));
        List<ErroCampo> erros = new ArrayList<>();
        for (Object chave : dados.keySet()) {
            if (!(chave instanceof String c) || !CAMPOS.contains(c))
                erros.add(new ErroCampo(String.valueOf(chave), "codigoInterno".equals(chave) ? "O código interno é gerado pelo sistema." : "Campo não permitido."));
        }
        String nome = "";
        if (!(dados.get("nome") instanceof String n))
            erros.add(new ErroCampo("nome", "Informe o nome do produto."));
        else {
            nome = limpar(n);
            if (nome.isEmpty()) erros.add(new ErroCampo("nome", "Informe o nome do produto."));
            else if (nome.length() > 120) erros.add(new ErroCampo("nome", "O nome pode ter até 120 caracteres."));
            else if (nome.chars().anyMatch(c -> c <= 31 || c == 127)) erros.add(new ErroCampo("nome", "O nome contém caracteres inválidos."));
        }
        String codigoBarras = null;
        Object barras = dados.get("codigoBarras");
        if (barras != null) {
            if (!(barras instanceof String b)) erros.add(new ErroCampo("codigoBarras", "O código de barras deve ser enviado como texto."));
            else {
                String c = limpar(b);
                if (!c.isEmpty()) {
                    if (!c.matches("[0-9]+")) erros.add(new ErroCampo("codigoBarras", "O código de barras deve ter só números."));
                    else if (c.length() > 64) erros.add(new ErroCampo("codigoBarras", "O código de barras pode ter até 64 dígitos."));
                    else codigoBarras = c;
                }
            }
        }
        Object bruto = dados.get("precoCentavos");
        double preco = bruto instanceof Number n ? n.doubleValue() : Double.NaN;
        if (!Double.isFinite(preco) || preco != Math.rint(preco)) erros.add(new ErroCampo("precoCentavos", "O preço deve ser um número inteiro de centavos."));
        else if (preco <= 0) erros.add(new ErroCampo("precoCentavos", MENSAGEM_PRECO_ZERO));
        else if (preco > Dinheiro.CENTAVOS_MAX) erros.add(new ErroCampo("precoCentavos", "Preço acima do limite permitido."));
        return erros.isEmpty() ? new Resultado(new NovoProduto(nome, codigoBarras, (int) preco), erros) : new Resultado(null, erros);
    }
}
