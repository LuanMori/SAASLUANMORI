// apps/web/src/telas/ilustracaoLoja.ts — a ilustração da loja na tela de entrada (modelo do Luan, 24/11/2026), em
// perspectiva isométrica: a loja com toldo listrado, letreiro, vitrine e porta; a prateleira com caixas e a planta; o
// caixa com o monitor do gráfico; caixas e uma planta na frente.
// É desenhada por código (SVG), sem imagem de fora: a página não carrega nada de outro endereço. Para mudar uma peça,
// mexa nas medidas abaixo (x para a direita e para baixo, y para a esquerda e para baixo, z para cima).

type P3 = readonly [number, number, number];

const C = Math.cos(Math.PI / 6);
const S = 0.5;
const r = (n: number) => Math.round(n * 10) / 10;
const tela = ([x, y, z]: P3): [number, number] => [(x - y) * C, (x + y) * S - z];
const pontos = (ps: readonly P3[]) =>
  ps
    .map(tela)
    .map(([a, b]) => `${r(a)},${r(b)}`)
    .join(' ');
const poligono = (ps: readonly P3[], cor: string) => `<polygon points="${pontos(ps)}" fill="${cor}"/>`;

/** Uma caixa: topo, frente (y = y1, vira para a esquerda) e lado (x = x1, vira para a direita). */
function caixa(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, topo: string, frente: string, lado: string): string {
  return [
    poligono(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      frente,
    ),
    poligono(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      lado,
    ),
    poligono(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      topo,
    ),
  ].join('');
}

/** Desenho 2D (u para a direita, v para baixo) colado num plano em 3D: origem o, um passo de u e um passo de v. */
function noPlano(o: P3, u: P3, v: P3, desenho: string): string {
  const [ox, oy] = tela(o);
  const [ux, uy] = tela([o[0] + u[0], o[1] + u[1], o[2] + u[2]]);
  const [vx, vy] = tela([o[0] + v[0], o[1] + v[1], o[2] + v[2]]);
  return `<g transform="matrix(${r(ux - ox)} ${r(uy - oy)} ${r(vx - ox)} ${r(vy - oy)} ${r(ox)} ${r(oy)})">${desenho}</g>`;
}
/** Na frente (plano y fixo): u = x, v = descendo. */
const naFrente = (x: number, y: number, z: number, d: string) => noPlano([x, y, z], [1, 0, 0], [0, 0, -1], d);
/** No lado (plano x fixo): u = indo para o fundo (y diminui), v = descendo. */
const noLado = (x: number, y: number, z: number, d: string) => noPlano([x, y, z], [0, -1, 0], [0, 0, -1], d);

const V = { escuro: '#0a6b47', medio: '#1f8f5c', claro: '#2fa86c', folha: '#3dbb7b', folhaClara: '#6fd3a0', vidro: '#d3f0e1', vidroEsc: '#b5e3cb' };
const PAPELAO = { topo: '#f3d6a6', frente: '#e6bb7f', lado: '#d2a265', fita: '#c8955a' };

/** Caixa de papelão com a fita no topo. */
function papelao(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): string {
  const meio = (x0 + x1) / 2;
  return (
    caixa(x0, x1, y0, y1, z0, z1, PAPELAO.topo, PAPELAO.frente, PAPELAO.lado) +
    poligono(
      [
        [meio - 2, y0, z1],
        [meio + 2, y0, z1],
        [meio + 2, y1, z1],
        [meio - 2, y1, z1],
      ],
      PAPELAO.fita,
    ) +
    naFrente(meio - 2, y1, z1, `<rect x="0" y="0" width="4" height="${r((z1 - z0) * 0.35)}" fill="${PAPELAO.fita}"/>`)
  );
}

/** Planta num vaso branco: o vaso em caixa e as folhas desenhadas na tela, saindo do centro do vaso. */
function planta(cx: number, cy: number, z0: number, tamanho: number): string {
  const l = tamanho * 0.42;
  const vaso = caixa(cx - l, cx + l, cy - l, cy + l, z0, z0 + tamanho * 0.9, '#f4f7f5', '#ffffff', '#e3e9e5');
  const [bx, by] = tela([cx, cy, z0 + tamanho * 0.9]);
  const folha = (ang: number, comp: number, cor: string) => {
    const rad = (ang * Math.PI) / 180;
    const px = bx + Math.sin(rad) * comp;
    const py = by - Math.cos(rad) * comp;
    const nx = Math.cos(rad) * comp * 0.28;
    const ny = Math.sin(rad) * comp * 0.28;
    return `<path d="M${r(bx)},${r(by)} Q${r((bx + px) / 2 + nx)},${r((by + py) / 2 + ny)} ${r(px)},${r(py)} Q${r((bx + px) / 2 - nx)},${r((by + py) / 2 - ny)} ${r(bx)},${r(by)}Z" fill="${cor}"/>`;
  };
  const t = tamanho * 1.9;
  return (
    vaso +
    [folha(-62, t * 0.8, V.medio), folha(58, t * 0.78, V.medio), folha(-32, t, V.folha), folha(30, t * 0.95, V.folha), folha(-8, t * 1.12, V.claro), folha(12, t * 0.7, V.folhaClara)].join(
      '',
    )
  );
}

/** O ícone da loja (o mesmo traço da logo), em 2D, num quadrado de 40 × 40. */
const ICONE_LOJA =
  `<path d="M7 15.5 10 8h20l3 7.5" fill="none" stroke="${V.medio}" stroke-width="2.6" stroke-linejoin="round"/>` +
  `<path d="M7 15.5c0 2.2 1.8 4 4 4s4-1.8 4-4c0 2.2 1.8 4 4 4h2c2.2 0 4-1.8 4-4 0 2.2 1.8 4 4 4s4-1.8 4-4" fill="none" stroke="${V.medio}" stroke-width="2.6" stroke-linejoin="round"/>` +
  `<path d="M10 20v12h20V20M17 32v-6h6v6" fill="none" stroke="${V.medio}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;

function loja(): string {
  const partes: string[] = [];
  // paredes: frente (y = 100) e lado (x = 150)
  partes.push(caixa(0, 150, 0, 100, 0, 108, '#ffffff', '#ffffff', '#e6ede9'));
  // vitrine grande na frente, com prateleiras e produtos
  partes.push(
    naFrente(
      0,
      100,
      108,
      `<rect x="12" y="46" width="78" height="50" rx="2" fill="${V.vidro}" stroke="${V.medio}" stroke-width="3.2"/>` +
        `<path d="M14 64h74M14 80h74" stroke="${V.vidroEsc}" stroke-width="2"/>` +
        `<rect x="20" y="54" width="9" height="10" rx="1.5" fill="${V.folhaClara}"/><rect x="33" y="57" width="12" height="7" rx="1.5" fill="${V.vidroEsc}"/>` +
        `<rect x="60" y="53" width="8" height="11" rx="1.5" fill="${V.vidroEsc}"/><rect x="71" y="56" width="11" height="8" rx="1.5" fill="${V.folhaClara}"/>` +
        `<rect x="24" y="71" width="14" height="9" rx="1.5" fill="${V.vidroEsc}"/><rect x="52" y="70" width="10" height="10" rx="1.5" fill="${V.folhaClara}"/>` +
        `<path d="M24 50 31 58M30 49 34 53" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>` +
        // porta
        `<rect x="102" y="38" width="36" height="70" rx="2" fill="${V.vidro}" stroke="${V.medio}" stroke-width="3.6"/>` +
        `<path d="M108 74v10" stroke="${V.medio}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M110 46 118 56" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`,
    ),
  );
  // janela do lado
  partes.push(
    noLado(
      150,
      100,
      108,
      `<rect x="22" y="34" width="54" height="46" rx="2" fill="${V.vidro}" stroke="${V.medio}" stroke-width="3"/>` +
        `<path d="M24 52h50M24 66h50" stroke="${V.vidroEsc}" stroke-width="2"/>` +
        `<rect x="30" y="42" width="9" height="10" rx="1.5" fill="${V.vidroEsc}"/><rect x="56" y="58" width="11" height="8" rx="1.5" fill="${V.folhaClara}"/>`,
    ),
  );
  // telhado verde
  partes.push(caixa(-7, 157, -7, 107, 108, 120, '#3cb97c', V.medio, V.escuro));
  // toldo listrado com a borda recortada, inclinado para a frente
  const listras = 8;
  const largura = 164 / listras;
  let toldo = '';
  for (let i = 0; i < listras; i++) {
    const cor = i % 2 === 0 ? V.claro : '#ffffff';
    toldo += `<rect x="${r(i * largura)}" y="0" width="${r(largura)}" height="1" fill="${cor}"/>`;
    toldo += `<path d="M${r(i * largura)},1 a${r(largura / 2)} 0.22 0 0 0 ${r(largura)} 0Z" fill="${cor}"/>`;
  }
  toldo += `<path d="M0,1 H164" stroke="${V.escuro}" stroke-width="0.04" opacity="0.35"/>`;
  partes.push(noPlano([-7, 102, 104], [1, 0, 0], [0, 26, -24], toldo));
  // letreiro em cima do telhado, com o ícone da loja
  partes.push(caixa(50, 104, 58, 70, 120, 170, '#f4f8f6', '#ffffff', '#e3eae6'));
  partes.push(naFrente(50, 70, 170, `<g transform="translate(7 5) scale(1)">${ICONE_LOJA}</g>`));
  return partes.join('');
}

/** A prateleira à direita (estante aberta: quatro colunas finas e as tábuas), com caixas e a planta em cima. */
function prateleira(): string {
  const p: string[] = [];
  const [x0, x1, y0, y1] = [182, 232, 18, 62];
  const coluna = (x: number, y: number) => caixa(x, x + 4, y, y + 4, 0, 138, V.claro, V.medio, V.escuro);
  // colunas do fundo primeiro (ficam atrás das tábuas)
  p.push(coluna(x0, y0), coluna(x1 - 4, y0));
  for (const z of [6, 48, 90, 132]) {
    p.push(caixa(x0, x1, y0, y1, z, z + 4, '#4cc58a', V.medio, V.escuro));
    if (z < 132) {
      p.push(papelao(x0 + 6, x0 + 24, y0 + 10, y1 - 6, z + 4, z + 26));
      p.push(papelao(x0 + 27, x1 - 6, y0 + 12, y1 - 8, z + 4, z + 22));
    }
  }
  // colunas da frente por cima
  p.push(coluna(x0, y1 - 4), coluna(x1 - 4, y1 - 4));
  p.push(planta(207, 40, 136, 16));
  return p.join('');
}

/** O caixa (balcão) com o monitor mostrando o gráfico. */
function balcao(): string {
  const p: string[] = [];
  const [x0, x1, y0, y1] = [176, 246, 100, 132];
  p.push(caixa(x0, x1, y0, y1, 0, 40, '#ffffff', V.claro, '#e3eae6'));
  p.push(naFrente(x0, y1, 40, `<rect x="0" y="0" width="${x1 - x0}" height="9" fill="#ffffff"/>`));
  // pé do monitor e a tela inclinada, virada para a frente
  p.push(caixa(206, 218, 110, 120, 40, 46, '#3b4741', '#2a3530', '#222b27'));
  const grafico =
    `<rect x="0" y="0" width="52" height="36" rx="3" fill="#23302a"/><rect x="3" y="3" width="46" height="30" rx="2" fill="${V.claro}"/>` +
    `<rect x="10" y="20" width="6" height="9" fill="#ffffff"/><rect x="20" y="15" width="6" height="14" fill="#ffffff"/><rect x="30" y="10" width="6" height="19" fill="#ffffff"/><rect x="40" y="6" width="6" height="23" fill="#ffffff" opacity="0.9"/>`;
  p.push(noPlano([188, 116, 84], [1, 0, 0], [0, 0.35, -1.05], grafico));
  return p.join('');
}

let cache: string | null = null;

/** O SVG completo da ilustração (texto), guardado depois da primeira vez. */
export function desenhoDaLoja(): string {
  if (cache) return cache;
  const sombra = (x: number, y: number, rx: number, ry: number, o: number) => {
    const [sx, sy] = tela([x, y, 0]);
    return `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="${rx}" ry="${ry}" fill="#0b7f55" opacity="${o}"/>`;
  };
  const corpo = [
    sombra(90, 80, 250, 96, 0.08),
    sombra(80, 60, 150, 58, 0.06),
    loja(),
    prateleira(),
    balcao(),
    planta(-40, 74, 0, 22),
    papelao(-52, -20, 118, 150, 0, 28),
    papelao(-48, -24, 121, 147, 28, 50),
    papelao(-16, 16, 132, 162, 0, 26),
  ].join('');
  // enquadramento: os limites do desenho, com folga (medidos no navegador)
  const [esquerda, direita, topo, base] = [-262, 290, -140, 210];
  cache = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esquerda} ${topo} ${direita - esquerda} ${base - topo}">${corpo}</svg>`;
  return cache;
}

/** Para usar no <img>: data URI (a política da página permite imagens data:). */
export const ILUSTRACAO_LOJA = () => `data:image/svg+xml,${encodeURIComponent(desenhoDaLoja())}`;
