package saas.core;

import java.util.*;

public final class CoreTeste {
    private static int total;
    private static void igual(Object esperado, Object atual) {
        total++;
        if (!Objects.equals(esperado, atual)) throw new AssertionError("Esperado: " + esperado + "; obtido: " + atual);
    }
    private static void erro(String campo, Object entrada) {
        igual(true, Produto.validarNovoProduto(entrada).erros().stream().anyMatch(e -> e.campo().equals(campo)));
    }
    public static void main(String[] args) {
        igual(new Produto.NovoProduto("Ração Premium 15kg", null, 18990), Produto.validarNovoProduto(Map.of("nome", "  Ração Premium 15kg  ", "precoCentavos", 18990)).valor());
        igual("0078912345678", Produto.validarNovoProduto(Map.of("nome", "Areia", "codigoBarras", " 0078912345678\r\n", "precoCentavos", 2500)).valor().codigoBarras());
        for (String b : List.of("", "   ")) igual(null, Produto.validarNovoProduto(Map.of("nome", "X", "codigoBarras", b, "precoCentavos", 1)).valor().codigoBarras());
        var comNull = new HashMap<String,Object>(); comNull.put("nome","X"); comNull.put("precoCentavos",1); comNull.put("codigoBarras",null);
        igual(null, Produto.validarNovoProduto(comNull).valor().codigoBarras());
        for (Object b : List.of("COL-01", "789 123", "78912.3", "7891234567895a", "-123", "٣٤٥", 7891234567895L, "1".repeat(65)))
            erro("codigoBarras", Map.of("nome", "X", "codigoBarras", b, "precoCentavos", 100));
        igual(true, Produto.validarNovoProduto(Map.of("nome","X","codigoBarras","1".repeat(64),"precoCentavos",1)).ok());
        igual(List.of(new Produto.ErroCampo("precoCentavos", Produto.MENSAGEM_PRECO_ZERO)), Produto.validarNovoProduto(Map.of("nome","Brinde","precoCentavos",0)).erros());
        igual(List.of(new Produto.ErroCampo("codigoInterno","O código interno é gerado pelo sistema.")), Produto.validarNovoProduto(Map.of("nome","X","precoCentavos",100,"codigoInterno","0001")).erros());
        for (String c : List.of("lojaId","id","codigo")) erro(c, Map.of("nome","X","precoCentavos",100,c,"qualquer"));
        erro("_", null);
        for (Object e : List.of("texto",42,List.of())) erro("_", e);
        erro("nome", Map.of("precoCentavos",100));
        for (Object n : List.of(123,"   ","a".repeat(121),"linha1\nlinha2")) erro("nome",Map.of("nome",n,"precoCentavos",100));
        igual(true,Produto.validarNovoProduto(Map.of("nome","a".repeat(120),"precoCentavos",1)).ok());
        erro("precoCentavos", Map.of("nome","X"));
        for (Object p : List.of("100",10.5,-1,2147483648L,Double.NaN)) erro("precoCentavos",Map.of("nome","X","precoCentavos",p));
        igual(true,Produto.validarNovoProduto(Map.of("nome","X","precoCentavos",Integer.MAX_VALUE)).ok());
        igual(List.of("codigoBarras","extra","nome","precoCentavos"),Produto.validarNovoProduto(Map.of("nome","","codigoBarras","ABC","precoCentavos",0,"extra",1)).erros().stream().map(Produto.ErroCampo::campo).sorted().toList());
        for (long n : new long[]{1,42,9999,10000,123456789,999999999999999L}) igual(String.format(Locale.ROOT,"%04d",n),Produto.formatarCodigoInterno(n));
        for (double n : new double[]{0,-1,1.5,Double.NaN,9007199254740992d,1e18}) {
            boolean falhou=false; try { Produto.formatarCodigoInterno(n); } catch (IllegalArgumentException e) { falhou=true; }
            igual(true,falhou);
        }
        for (String p : List.of("dono","administrador","vendedor")) { igual(true,Papeis.ehPapel(p)); igual(true,Papeis.ehPapelDeLoja(p)); }
        igual(true,Papeis.ehPapel("super_admin")); igual(false,Papeis.ehPapelDeLoja("super_admin"));
        igual(false,Papeis.ehPapel("root")); igual(false,Papeis.ehPapel(1)); igual(false,Papeis.ehPapelDeLoja(null));
        System.out.println(total + " verificações de produto e papéis aprovadas");
    }
}
