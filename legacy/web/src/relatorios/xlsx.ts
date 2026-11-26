// apps/web/src/relatorios/xlsx.ts
// Planilha do Excel (.xlsx) feita aqui mesmo, sem biblioteca de fora (a demonstração não baixa nada da internet e o
// sistema fica sem dependência nova): o .xlsx é um ZIP com alguns XML dentro (Office Open XML). O ZIP vai "sem
// compressão" (método 0), que todo programa de planilha abre: Excel, LibreOffice, Google Planilhas e o Numbers.
//   - uma aba (worksheet) por planilha, com a primeira linha em negrito, congelada e com filtro;
//   - dinheiro vai como NÚMERO com o formato "R$ #.##0,00" (a pessoa soma e faz conta no Excel); datas como data
//     (dd/mm/aaaa); quantidade com até 3 casas; percentual como %;
//   - texto vai como texto (inlineStr): "=SOMA(...)" digitado num nome nunca vira fórmula no Excel (proteção contra
//     fórmula, DaniPets REL-10).
// Os mesmos objetos `Planilha` desenham as tabelas da aba Relatórios (TabelaDaPlanilha.tsx).

export type TipoColuna = 'texto' | 'dinheiro' | 'numero' | 'inteiro' | 'data' | 'pct';

export interface Coluna {
  titulo: string;
  /** Padrão: texto. */
  tipo?: TipoColuna;
}

/**
 * dinheiro: centavos (inteiro); data: "AAAA-MM-DD"; pct: 0 a 100 (ex.: 35,5); numero: decimal (1,5 kg); inteiro: inteiro;
 * texto: string. null = célula vazia.
 */
export type Celula = string | number | null;

export interface Planilha {
  /** Nome da aba no Excel (até 31 caracteres; os proibidos pelo Excel são trocados). */
  nome: string;
  colunas: Coluna[];
  linhas: Celula[][];
}

// ------------------------------------------------------------------ ZIP (sem compressão)
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Junta os arquivos num ZIP sem compressão, com os nomes em UTF-8. */
export function zipar(arquivos: readonly { nome: string; dados: Uint8Array }[], quando: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = ((quando.getHours() & 31) << 11) | ((quando.getMinutes() & 63) << 5) | Math.floor(quando.getSeconds() / 2);
  const dia = (((Math.max(1980, quando.getFullYear()) - 1980) & 127) << 9) | (((quando.getMonth() + 1) & 15) << 5) | (quando.getDate() & 31);
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão para extrair
    local.setUint16(6, 0x0800, true); // nome em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.dados.length, true);
    c.setUint32(24, a.dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint16(30, 0, true); // extra
    c.setUint16(32, 0, true); // comentário
    c.setUint16(34, 0, true); // disco
    c.setUint16(36, 0, true); // atributos internos
    c.setUint32(38, 0, true); // atributos externos
    c.setUint32(42, posicao, true);
    central.push(new Uint8Array(c.buffer), nome);
    posicao += 30 + nome.length + a.dados.length;
  }
  const tamanhoCentral = central.reduce((s, x) => s + x.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((s, x) => s + x.length, 0));
  let i = 0;
  for (const x of tudo) {
    saida.set(x, i);
    i += x.length;
  }
  return saida;
}

// ------------------------------------------------------------------ XML da planilha
/** Tira o que o XML não aceita (caracteres de controle) e escapa & < > ". */
export function textoXml(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 1 → A, 26 → Z, 27 → AA. */
export function letraDaColuna(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** "2026-11-23" → número de série do Excel (dias desde 30/12/1899). */
export function serialDaData(dia: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** Nome de aba que o Excel aceita: sem []:*?/\, até 31 caracteres e sem repetir. */
export function nomesDasAbas(nomes: readonly string[]): string[] {
  const vistos = new Set<string>();
  return nomes.map((n) => {
    const base = (n.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Planilha').slice(0, 31);
    let nome = base;
    for (let i = 2; vistos.has(nome.toLowerCase()); i++) nome = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    vistos.add(nome.toLowerCase());
    return nome;
  });
}

const ESTILO: Record<TipoColuna, number> = { texto: 0, dinheiro: 2, data: 3, numero: 4, pct: 5, inteiro: 6 };

function celulaXml(ref: string, valor: Celula, tipo: TipoColuna): string {
  if (valor === null || valor === '') return '';
  if (tipo === 'texto' || typeof valor === 'string') {
    if (tipo === 'data' && typeof valor === 'string') {
      const serial = serialDaData(valor);
      if (serial !== null) return `<c r="${ref}" s="${ESTILO.data}"><v>${serial}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${textoXml(String(valor))}</t></is></c>`;
  }
  if (!Number.isFinite(valor)) return '';
  const v = tipo === 'dinheiro' ? valor / 100 : tipo === 'pct' ? valor / 100 : valor;
  return `<c r="${ref}" s="${ESTILO[tipo]}"><v>${v}</v></c>`;
}

function larguraDaColuna(p: Planilha, i: number): number {
  const tipo = p.colunas[i]!.tipo ?? 'texto';
  let maior = p.colunas[i]!.titulo.length;
  for (const l of p.linhas.slice(0, 500)) {
    const v = l[i];
    const tam = v === null || v === undefined ? 0 : tipo === 'dinheiro' ? 14 : tipo === 'data' ? 10 : String(v).length;
    if (tam > maior) maior = tam;
  }
  return Math.min(60, Math.max(8, maior + 2));
}

function folhaXml(p: Planilha): string {
  const n = p.colunas.length;
  const ultima = letraDaColuna(Math.max(1, n));
  const cols = p.colunas.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${larguraDaColuna(p, i)}" customWidth="1"/>`).join('');
  const cabeca = `<row r="1">${p.colunas.map((c, i) => `<c r="${letraDaColuna(i + 1)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${textoXml(c.titulo)}</t></is></c>`).join('')}</row>`;
  const linhas = p.linhas
    .map((l, j) => `<row r="${j + 2}">${p.colunas.map((c, i) => celulaXml(`${letraDaColuna(i + 1)}${j + 2}`, l[i] ?? null, c.tipo ?? 'texto')).join('')}</row>`)
    .join('');
  const filtro = n > 0 ? `<autoFilter ref="A1:${ultima}${Math.max(1, p.linhas.length + 1)}"/>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${cabeca}${linhas}</sheetData>${filtro}</worksheet>`
  );
}

const ESTILOS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="#,##0.###"/><numFmt numFmtId="167" formatCode="0.0%"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F4EE"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** O arquivo .xlsx com uma aba para cada planilha. */
export function gerarXlsx(planilhas: readonly Planilha[], quando: Date = new Date()): Uint8Array {
  const lista = planilhas.length ? planilhas : [{ nome: 'Planilha', colunas: [], linhas: [] }];
  const nomes = nomesDasAbas(lista.map((p) => p.nome));
  const enc = new TextEncoder();
  const xml = (s: string) => enc.encode(s);
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    lista.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const filtros = lista
    .map((p, i) =>
      p.colunas.length
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${textoXml(nomes[i]!.replace(/'/g, "''"))}'!$A$1:$${letraDaColuna(p.colunas.length)}$${Math.max(1, p.linhas.length + 1)}</definedName>`
        : '',
    )
    .join('');
  const livro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${nomes.map((n, i) => `<sheet name="${textoXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    (filtros ? `<definedNames>${filtros}</definedNames>` : '') +
    '</workbook>';
  const relsLivro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    lista.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${lista.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';
  return zipar(
    [
      { nome: '[Content_Types].xml', dados: xml(tipos) },
      { nome: '_rels/.rels', dados: xml(rels) },
      { nome: 'xl/workbook.xml', dados: xml(livro) },
      { nome: 'xl/_rels/workbook.xml.rels', dados: xml(relsLivro) },
      { nome: 'xl/styles.xml', dados: xml(ESTILOS_XML) },
      ...lista.map((p, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: xml(folhaXml(p)) })),
    ],
    quando,
  );
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
