package com.saasluanmori.web;

import java.util.ArrayList;
import java.util.List;

/**
 * A ilustração da loja na tela de entrada, em perspectiva isométrica: a loja com toldo listrado, letreiro, vitrine e
 * porta; a prateleira com caixas e a planta; o caixa com o monitor do gráfico; caixas e uma planta na frente
 * ({@code legacy/web/src/telas/ilustracaoLoja.ts:1-228}; decisão T14 de {@code docs/migracao/06-RISCOS-E-DECISOES.md}).
 * Desenhada por código, sem imagem de fora, e com o MESMO texto SVG do sistema antigo: os números são escritos como o
 * JavaScript escreve ("12", "12.5", nunca "12.0") e o seno e o cosseno são os do {@link StrictMath} (o fdlibm, o mesmo
 * algoritmo do motor do navegador). Medidas: x para a direita e para baixo, y para a esquerda e para
 * baixo, z para cima.
 */
public final class IlustracaoLoja {

    private static final double C = StrictMath.cos(Math.PI / 6);
    private static final double S = 0.5;

    private static final String ESCURO = "#0a6b47";
    private static final String MEDIO = "#1f8f5c";
    private static final String CLARO = "#2fa86c";
    private static final String FOLHA = "#3dbb7b";
    private static final String FOLHA_CLARA = "#6fd3a0";
    private static final String VIDRO = "#d3f0e1";
    private static final String VIDRO_ESC = "#b5e3cb";

    private static final String PAPELAO_TOPO = "#f3d6a6";
    private static final String PAPELAO_FRENTE = "#e6bb7f";
    private static final String PAPELAO_LADO = "#d2a265";
    private static final String PAPELAO_FITA = "#c8955a";

    /** O ícone da loja (o mesmo traço da logo), em 2D, num quadrado de 40 × 40. */
    private static final String ICONE_LOJA =
            "<path d=\"M7 15.5 10 8h20l3 7.5\" fill=\"none\" stroke=\"" + MEDIO + "\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>"
                    + "<path d=\"M7 15.5c0 2.2 1.8 4 4 4s4-1.8 4-4c0 2.2 1.8 4 4 4h2c2.2 0 4-1.8 4-4 0 2.2 1.8 4 4 4s4-1.8 4-4\" fill=\"none\" stroke=\""
                    + MEDIO + "\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>"
                    + "<path d=\"M10 20v12h20V20M17 32v-6h6v6\" fill=\"none\" stroke=\"" + MEDIO
                    + "\" stroke-width=\"2.6\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>";

    private static final String SVG = desenhar();

    private IlustracaoLoja() {
    }

    /** O SVG completo (texto). */
    public static String svg() {
        return SVG;
    }

    // ------------------------------------------------------------------ números como o JavaScript

    /** {@code Math.round(n * 10) / 10}. */
    static double r(double n) {
        return Math.round(n * 10) / 10.0;
    }

    /** O número como o JavaScript o escreve num texto: inteiros sem ".0" (e sem "-0"), decimais no menor formato. */
    static String js(double n) {
        if (n == Math.rint(n) && Math.abs(n) < 1e15) {
            return Long.toString((long) n);
        }
        return Double.toString(n);
    }

    private static String rj(double n) {
        return js(r(n));
    }

    private static double[] tela(double x, double y, double z) {
        return new double[] {(x - y) * C, (x + y) * S - z};
    }

    private static String poligono(double[][] ps, String cor) {
        List<String> p = new ArrayList<>();
        for (double[] ponto : ps) {
            double[] t = tela(ponto[0], ponto[1], ponto[2]);
            p.add(rj(t[0]) + "," + rj(t[1]));
        }
        return "<polygon points=\"" + String.join(" ", p) + "\" fill=\"" + cor + "\"/>";
    }

    /** Uma caixa: topo, frente (y = y1, vira para a esquerda) e lado (x = x1, vira para a direita). */
    private static String caixa(double x0, double x1, double y0, double y1, double z0, double z1, String topo, String frente, String lado) {
        return poligono(new double[][] {{x0, y1, z0}, {x1, y1, z0}, {x1, y1, z1}, {x0, y1, z1}}, frente)
                + poligono(new double[][] {{x1, y0, z0}, {x1, y1, z0}, {x1, y1, z1}, {x1, y0, z1}}, lado)
                + poligono(new double[][] {{x0, y0, z1}, {x1, y0, z1}, {x1, y1, z1}, {x0, y1, z1}}, topo);
    }

    /** Desenho 2D (u para a direita, v para baixo) colado num plano em 3D: origem o, um passo de u e um passo de v. */
    private static String noPlano(double[] o, double[] u, double[] v, String desenho) {
        double[] po = tela(o[0], o[1], o[2]);
        double[] pu = tela(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
        double[] pv = tela(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
        return "<g transform=\"matrix(" + rj(pu[0] - po[0]) + " " + rj(pu[1] - po[1]) + " " + rj(pv[0] - po[0]) + " " + rj(pv[1] - po[1]) + " "
                + rj(po[0]) + " " + rj(po[1]) + ")\">" + desenho + "</g>";
    }

    /** Na frente (plano y fixo): u = x, v = descendo. */
    private static String naFrente(double x, double y, double z, String d) {
        return noPlano(new double[] {x, y, z}, new double[] {1, 0, 0}, new double[] {0, 0, -1}, d);
    }

    /** No lado (plano x fixo): u = indo para o fundo (y diminui), v = descendo. */
    private static String noLado(double x, double y, double z, String d) {
        return noPlano(new double[] {x, y, z}, new double[] {0, -1, 0}, new double[] {0, 0, -1}, d);
    }

    /** Caixa de papelão com a fita no topo. */
    private static String papelao(double x0, double x1, double y0, double y1, double z0, double z1) {
        double meio = (x0 + x1) / 2;
        return caixa(x0, x1, y0, y1, z0, z1, PAPELAO_TOPO, PAPELAO_FRENTE, PAPELAO_LADO)
                + poligono(new double[][] {{meio - 2, y0, z1}, {meio + 2, y0, z1}, {meio + 2, y1, z1}, {meio - 2, y1, z1}}, PAPELAO_FITA)
                + naFrente(meio - 2, y1, z1, "<rect x=\"0\" y=\"0\" width=\"4\" height=\"" + rj((z1 - z0) * 0.35) + "\" fill=\"" + PAPELAO_FITA + "\"/>");
    }

    /** Planta num vaso branco: o vaso em caixa e as folhas desenhadas na tela, saindo do centro do vaso. */
    private static String planta(double cx, double cy, double z0, double tamanho) {
        double l = tamanho * 0.42;
        String vaso = caixa(cx - l, cx + l, cy - l, cy + l, z0, z0 + tamanho * 0.9, "#f4f7f5", "#ffffff", "#e3e9e5");
        double[] b = tela(cx, cy, z0 + tamanho * 0.9);
        double t = tamanho * 1.9;
        return vaso + folha(b, -62, t * 0.8, MEDIO) + folha(b, 58, t * 0.78, MEDIO) + folha(b, -32, t, FOLHA) + folha(b, 30, t * 0.95, FOLHA)
                + folha(b, -8, t * 1.12, CLARO) + folha(b, 12, t * 0.7, FOLHA_CLARA);
    }

    private static String folha(double[] b, double ang, double comp, String cor) {
        double bx = b[0];
        double by = b[1];
        double rad = (ang * Math.PI) / 180;
        double px = bx + StrictMath.sin(rad) * comp;
        double py = by - StrictMath.cos(rad) * comp;
        double nx = StrictMath.cos(rad) * comp * 0.28;
        double ny = StrictMath.sin(rad) * comp * 0.28;
        return "<path d=\"M" + rj(bx) + "," + rj(by) + " Q" + rj((bx + px) / 2 + nx) + "," + rj((by + py) / 2 + ny) + " " + rj(px) + "," + rj(py)
                + " Q" + rj((bx + px) / 2 - nx) + "," + rj((by + py) / 2 - ny) + " " + rj(bx) + "," + rj(by) + "Z\" fill=\"" + cor + "\"/>";
    }

    private static String loja() {
        StringBuilder p = new StringBuilder();
        // paredes: frente (y = 100) e lado (x = 150)
        p.append(caixa(0, 150, 0, 100, 0, 108, "#ffffff", "#ffffff", "#e6ede9"));
        // vitrine grande na frente, com prateleiras e produtos
        p.append(naFrente(0, 100, 108,
                "<rect x=\"12\" y=\"46\" width=\"78\" height=\"50\" rx=\"2\" fill=\"" + VIDRO + "\" stroke=\"" + MEDIO + "\" stroke-width=\"3.2\"/>"
                        + "<path d=\"M14 64h74M14 80h74\" stroke=\"" + VIDRO_ESC + "\" stroke-width=\"2\"/>"
                        + "<rect x=\"20\" y=\"54\" width=\"9\" height=\"10\" rx=\"1.5\" fill=\"" + FOLHA_CLARA + "\"/><rect x=\"33\" y=\"57\" width=\"12\" height=\"7\" rx=\"1.5\" fill=\""
                        + VIDRO_ESC + "\"/>"
                        + "<rect x=\"60\" y=\"53\" width=\"8\" height=\"11\" rx=\"1.5\" fill=\"" + VIDRO_ESC + "\"/><rect x=\"71\" y=\"56\" width=\"11\" height=\"8\" rx=\"1.5\" fill=\""
                        + FOLHA_CLARA + "\"/>"
                        + "<rect x=\"24\" y=\"71\" width=\"14\" height=\"9\" rx=\"1.5\" fill=\"" + VIDRO_ESC + "\"/><rect x=\"52\" y=\"70\" width=\"10\" height=\"10\" rx=\"1.5\" fill=\""
                        + FOLHA_CLARA + "\"/>"
                        + "<path d=\"M24 50 31 58M30 49 34 53\" stroke=\"#ffffff\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.8\"/>"
                        // porta
                        + "<rect x=\"102\" y=\"38\" width=\"36\" height=\"70\" rx=\"2\" fill=\"" + VIDRO + "\" stroke=\"" + MEDIO + "\" stroke-width=\"3.6\"/>"
                        + "<path d=\"M108 74v10\" stroke=\"" + MEDIO + "\" stroke-width=\"3\" stroke-linecap=\"round\"/>"
                        + "<path d=\"M110 46 118 56\" stroke=\"#ffffff\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.8\"/>"));
        // janela do lado
        p.append(noLado(150, 100, 108,
                "<rect x=\"22\" y=\"34\" width=\"54\" height=\"46\" rx=\"2\" fill=\"" + VIDRO + "\" stroke=\"" + MEDIO + "\" stroke-width=\"3\"/>"
                        + "<path d=\"M24 52h50M24 66h50\" stroke=\"" + VIDRO_ESC + "\" stroke-width=\"2\"/>"
                        + "<rect x=\"30\" y=\"42\" width=\"9\" height=\"10\" rx=\"1.5\" fill=\"" + VIDRO_ESC + "\"/><rect x=\"56\" y=\"58\" width=\"11\" height=\"8\" rx=\"1.5\" fill=\""
                        + FOLHA_CLARA + "\"/>"));
        // telhado verde
        p.append(caixa(-7, 157, -7, 107, 108, 120, "#3cb97c", MEDIO, ESCURO));
        // toldo listrado com a borda recortada, inclinado para a frente
        int listras = 8;
        double largura = 164.0 / listras;
        StringBuilder toldo = new StringBuilder();
        for (int i = 0; i < listras; i++) {
            String cor = i % 2 == 0 ? CLARO : "#ffffff";
            toldo.append("<rect x=\"").append(rj(i * largura)).append("\" y=\"0\" width=\"").append(rj(largura)).append("\" height=\"1\" fill=\"").append(cor).append("\"/>");
            toldo.append("<path d=\"M").append(rj(i * largura)).append(",1 a").append(rj(largura / 2)).append(" 0.22 0 0 0 ").append(rj(largura)).append(" 0Z\" fill=\"")
                    .append(cor).append("\"/>");
        }
        toldo.append("<path d=\"M0,1 H164\" stroke=\"").append(ESCURO).append("\" stroke-width=\"0.04\" opacity=\"0.35\"/>");
        p.append(noPlano(new double[] {-7, 102, 104}, new double[] {1, 0, 0}, new double[] {0, 26, -24}, toldo.toString()));
        // letreiro em cima do telhado, com o ícone da loja
        p.append(caixa(50, 104, 58, 70, 120, 170, "#f4f8f6", "#ffffff", "#e3eae6"));
        p.append(naFrente(50, 70, 170, "<g transform=\"translate(7 5) scale(1)\">" + ICONE_LOJA + "</g>"));
        return p.toString();
    }

    /** A prateleira à direita (estante aberta: quatro colunas finas e as tábuas), com caixas e a planta em cima. */
    private static String prateleira() {
        StringBuilder p = new StringBuilder();
        double x0 = 182;
        double x1 = 232;
        double y0 = 18;
        double y1 = 62;
        // colunas do fundo primeiro (ficam atrás das tábuas)
        p.append(coluna(x0, y0)).append(coluna(x1 - 4, y0));
        for (double z : new double[] {6, 48, 90, 132}) {
            p.append(caixa(x0, x1, y0, y1, z, z + 4, "#4cc58a", MEDIO, ESCURO));
            if (z < 132) {
                p.append(papelao(x0 + 6, x0 + 24, y0 + 10, y1 - 6, z + 4, z + 26));
                p.append(papelao(x0 + 27, x1 - 6, y0 + 12, y1 - 8, z + 4, z + 22));
            }
        }
        // colunas da frente por cima
        p.append(coluna(x0, y1 - 4)).append(coluna(x1 - 4, y1 - 4));
        p.append(planta(207, 40, 136, 16));
        return p.toString();
    }

    private static String coluna(double x, double y) {
        return caixa(x, x + 4, y, y + 4, 0, 138, CLARO, MEDIO, ESCURO);
    }

    /** O caixa (balcão) com o monitor mostrando o gráfico. */
    private static String balcao() {
        StringBuilder p = new StringBuilder();
        double x0 = 176;
        double x1 = 246;
        double y0 = 100;
        double y1 = 132;
        p.append(caixa(x0, x1, y0, y1, 0, 40, "#ffffff", CLARO, "#e3eae6"));
        p.append(naFrente(x0, y1, 40, "<rect x=\"0\" y=\"0\" width=\"" + js(x1 - x0) + "\" height=\"9\" fill=\"#ffffff\"/>"));
        // pé do monitor e a tela inclinada, virada para a frente
        p.append(caixa(206, 218, 110, 120, 40, 46, "#3b4741", "#2a3530", "#222b27"));
        String grafico = "<rect x=\"0\" y=\"0\" width=\"52\" height=\"36\" rx=\"3\" fill=\"#23302a\"/><rect x=\"3\" y=\"3\" width=\"46\" height=\"30\" rx=\"2\" fill=\"" + CLARO
                + "\"/>"
                + "<rect x=\"10\" y=\"20\" width=\"6\" height=\"9\" fill=\"#ffffff\"/><rect x=\"20\" y=\"15\" width=\"6\" height=\"14\" fill=\"#ffffff\"/><rect x=\"30\" y=\"10\" width=\"6\" height=\"19\" fill=\"#ffffff\"/><rect x=\"40\" y=\"6\" width=\"6\" height=\"23\" fill=\"#ffffff\" opacity=\"0.9\"/>";
        p.append(noPlano(new double[] {188, 116, 84}, new double[] {1, 0, 0}, new double[] {0, 0.35, -1.05}, grafico));
        return p.toString();
    }

    private static String sombra(double x, double y, double rx, double ry, double o) {
        double[] s = tela(x, y, 0);
        return "<ellipse cx=\"" + rj(s[0]) + "\" cy=\"" + rj(s[1]) + "\" rx=\"" + js(rx) + "\" ry=\"" + js(ry) + "\" fill=\"#0b7f55\" opacity=\"" + js(o) + "\"/>";
    }

    private static String desenhar() {
        String corpo = sombra(90, 80, 250, 96, 0.08) + sombra(80, 60, 150, 58, 0.06) + loja() + prateleira() + balcao() + planta(-40, 74, 0, 22)
                + papelao(-52, -20, 118, 150, 0, 28) + papelao(-48, -24, 121, 147, 28, 50) + papelao(-16, 16, 132, 162, 0, 26);
        // enquadramento: os limites do desenho, com folga (medidos no navegador)
        int esquerda = -262;
        int direita = 290;
        int topo = -140;
        int base = 210;
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"" + esquerda + " " + topo + " " + (direita - esquerda) + " " + (base - topo) + "\">" + corpo
                + "</svg>";
    }
}
