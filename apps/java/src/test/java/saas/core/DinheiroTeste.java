package saas.core;

import java.util.Objects;

/** Testes de paridade da conversão, sem dependências externas. */
public final class DinheiroTeste {
    public static void main(String[] args) {
        Object[][] casos = {
            {"12", 1200}, {"12,5", 1250}, {"12,50", 1250}, {"0,99", 99},
            {"1.234,56", 123456}, {"R$ 1.234,56", 123456}, {"R$\u00a010,00", 1000},
            {"12.50", 1250}, {"12.5", 1250}, {"1.234", 123400}, {"1.234.567", 123456700},
            {"12,", 1200}, {"0.1", 10}, {"", null}, {"   ", null}, {"abc", null},
            {"-5", null}, {"12,345", null}, {"1,2,3", null}, {"1.2.3", null},
            {"1.23,45", null}, {"12.3456", null}, {",50", null}, {"1e3", null},
            {"21474836,48", null}, {"21474836,47", Dinheiro.CENTAVOS_MAX},
            {"0,30", 30}, {"19,99", 1999}, {"12.", 1200}, {"\ufeff12", 1200},
            {"0", 0}, {"000012,00", 1200}, {"999999999999999999999", null}, {"١٢", null}
        };
        for (Object[] caso : casos) {
            Integer atual = Dinheiro.reaisParaCentavos((String) caso[0]);
            if (!Objects.equals(caso[1], atual)) {
                throw new AssertionError(caso[0] + ": esperado " + caso[1] + ", obtido " + atual);
            }
        }
        System.out.println(casos.length + " casos aprovados");
    }
}
