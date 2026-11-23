// apps/web/src/relatorios/xlsx.test.ts — a planilha do Excel feita sem biblioteca: ZIP, XML, tipos e proteção contra fórmula.
import { describe, expect, it } from 'vitest';
import { crc32, gerarXlsx, letraDaColuna, nomesDasAbas, serialDaData, textoXml, zipar } from './xlsx';

/** Lê um ZIP sem compressão (como o que gerarXlsx faz) e confere o CRC de cada arquivo. */
function lerZip(bytes: Uint8Array): Map<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const arquivos = new Map<string, string>();
  let i = 0;
  while (dv.getUint32(i, true) === 0x04034b50) {
    expect(dv.getUint16(8, true)).toBe(0); // sem compressão
    const crc = dv.getUint32(i + 14, true);
    const tamanho = dv.getUint32(i + 18, true);
    const nomeTam = dv.getUint16(i + 26, true);
    const extra = dv.getUint16(i + 28, true);
    const nome = dec.decode(bytes.subarray(i + 30, i + 30 + nomeTam));
    const dados = bytes.subarray(i + 30 + nomeTam + extra, i + 30 + nomeTam + extra + tamanho);
    expect(crc32(dados)).toBe(crc);
    arquivos.set(nome, dec.decode(dados));
    i += 30 + nomeTam + extra + tamanho;
  }
  // diretório central e fim do ZIP
  expect(dv.getUint32(i, true)).toBe(0x02014b50);
  const fim = bytes.length - 22;
  expect(dv.getUint32(fim, true)).toBe(0x06054b50);
  expect(dv.getUint16(fim + 10, true)).toBe(arquivos.size);
  expect(dv.getUint32(fim + 16, true)).toBe(i); // onde começa o diretório central
  return arquivos;
}

describe('peças do .xlsx', () => {
  it('CRC-32 padrão, letras das colunas e data do Excel', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect([1, 26, 27, 52, 703].map(letraDaColuna)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
    expect(serialDaData('2024-01-01')).toBe(45292);
    expect(serialDaData('1900-03-01')).toBe(61);
    expect(serialDaData('23/11/2026')).toBeNull();
  });

  it('nomes de aba que o Excel aceita: sem []:*?/\\, até 31 caracteres e sem repetir', () => {
    expect(nomesDasAbas(['Vendas', 'vendas', 'a/b:c*', '', 'x'.repeat(40)])).toEqual(['Vendas', 'vendas 2', 'a b c', 'Planilha', 'x'.repeat(31)]);
  });

  it('texto no XML: escapa & < > " e tira caracteres de controle', () => {
    expect(textoXml('Ração & Cia <"A">\u0007\tok')).toBe('Ração &amp; Cia &lt;&quot;A&quot;&gt;\tok');
  });

  it('ZIP com nome em UTF-8 que qualquer programa abre', () => {
    const z = lerZip(zipar([{ nome: 'pasta/ação.txt', dados: new TextEncoder().encode('olá') }], new Date(2026, 10, 23, 12, 30, 10)));
    expect(z.get('pasta/ação.txt')).toBe('olá');
  });
});

describe('gerarXlsx', () => {
  it('as partes do arquivo, as abas, os tipos das células e a primeira linha congelada com filtro', () => {
    const bytes = gerarXlsx([
      {
        nome: 'Vendas & Cia',
        colunas: [{ titulo: 'Cliente' }, { titulo: 'Data', tipo: 'data' }, { titulo: 'Total', tipo: 'dinheiro' }, { titulo: 'Qtd.', tipo: 'numero' }, { titulo: 'Margem', tipo: 'pct' }, { titulo: 'Nº', tipo: 'inteiro' }],
        linhas: [
          ['=SOMA(A1:A9)', '2024-01-01', 1234, 1.5, 35.5, 7],
          [null, null, -50, null, null, null],
        ],
      },
      { nome: 'Vazia', colunas: [], linhas: [] },
    ]);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
    const z = lerZip(bytes);
    expect([...z.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(z.get('xl/workbook.xml')).toContain('<sheet name="Vendas &amp; Cia" sheetId="1" r:id="rId1"/><sheet name="Vazia" sheetId="2" r:id="rId2"/>');
    expect(z.get('xl/workbook.xml')).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Vendas &amp; Cia'!$A$1:$F$3</definedName>`);
    const folha = z.get('xl/worksheets/sheet1.xml')!;
    // o texto que parece fórmula vai como texto: o Excel nunca calcula
    expect(folha).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">=SOMA(A1:A9)</t></is></c>');
    expect(folha).not.toContain('<f>');
    expect(folha).toContain('<c r="B2" s="3"><v>45292</v></c>'); // data
    expect(folha).toContain('<c r="C2" s="2"><v>12.34</v></c>'); // R$ 12,34 como número
    expect(folha).toContain('<c r="D2" s="4"><v>1.5</v></c>');
    expect(folha).toContain('<c r="E2" s="5"><v>0.355</v></c>'); // 35,5%
    expect(folha).toContain('<c r="F2" s="6"><v>7</v></c>');
    expect(folha).toContain('<c r="C3" s="2"><v>-0.5</v></c>');
    expect(folha).toContain('<row r="3"><c r="C3"'); // célula vazia não vai
    expect(folha).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Cliente</t></is></c>'); // cabeçalho em negrito
    expect(folha).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(folha).toContain('<autoFilter ref="A1:F3"/>');
    expect(z.get('xl/styles.xml')).toContain('formatCode="&quot;R$&quot;\\ #,##0.00"');
    expect(z.get('[Content_Types].xml')).toContain('/xl/worksheets/sheet2.xml');
  });

  it('sem planilha nenhuma, o arquivo ainda abre (uma aba vazia)', () => {
    const z = lerZip(gerarXlsx([]));
    expect(z.get('xl/workbook.xml')).toContain('<sheet name="Planilha"');
  });
});
