// apps/web/src/relatorios/lerPlanilha.test.ts — ler a planilha para importar (.xlsx e .csv), no próprio navegador.
import { describe, expect, it } from 'vitest';
import { ErroDePlanilha, lerArquivoDePlanilha } from './lerPlanilha';
import { crc32, gerarXlsx } from './xlsx';

const blob = (bytes: Uint8Array | string) => new Blob([typeof bytes === 'string' ? new TextEncoder().encode(bytes) : (bytes as BlobPart)]);

async function compactar(dados: Uint8Array): Promise<Uint8Array> {
  const leitor = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(dados as BufferSource);
      c.close();
    },
  })
    .pipeThrough(new CompressionStream('deflate-raw'))
    .getReader();
  const partes: number[] = [];
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(...value);
  }
  return Uint8Array.from(partes);
}

/** Um ZIP compactado (deflate), como o Excel salva. */
async function zipCompactado(arquivos: { nome: string; texto: string }[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = enc.encode(a.texto);
    const comp = await compactar(dados);
    const local = new Uint8Array(30 + nome.length);
    const dl = new DataView(local.buffer);
    dl.setUint32(0, 0x04034b50, true);
    dl.setUint16(4, 20, true);
    dl.setUint16(8, 8, true);
    dl.setUint32(14, crc32(dados), true);
    dl.setUint32(18, comp.length, true);
    dl.setUint32(22, dados.length, true);
    dl.setUint16(26, nome.length, true);
    local.set(nome, 30);
    const cab = new Uint8Array(46 + nome.length);
    const dc = new DataView(cab.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(10, 8, true);
    dc.setUint32(16, crc32(dados), true);
    dc.setUint32(20, comp.length, true);
    dc.setUint32(24, dados.length, true);
    dc.setUint16(28, nome.length, true);
    dc.setUint32(42, pos, true);
    cab.set(nome, 46);
    partes.push(local, comp);
    central.push(cab);
    pos += local.length + comp.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const df = new DataView(fim.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, arquivos.length, true);
  df.setUint16(10, arquivos.length, true);
  df.setUint32(12, tamCentral, true);
  df.setUint32(16, pos, true);
  const tudo = [...partes, ...central, fim];
  const saida = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const parte of tudo) {
    saida.set(parte, p);
    p += parte.length;
  }
  return saida;
}

describe('ler .xlsx', () => {
  it('a planilha que o próprio sistema gera (Exportar) volta igual: texto, dinheiro e data como número', async () => {
    const bytes = gerarXlsx([
      {
        nome: 'Clientes',
        colunas: [{ titulo: 'Nome' }, { titulo: 'Limite de fiado', tipo: 'dinheiro' }, { titulo: 'Nascimento', tipo: 'data' }, { titulo: 'CPF' }],
        linhas: [
          ['Maria & Cia <teste>', 20000, '1990-05-17', '529.982.247-25'],
          ['João', 0, null, null],
        ],
      },
      { nome: 'Outra aba', colunas: [{ titulo: 'Nada' }], linhas: [['x']] },
    ]);
    expect(await lerArquivoDePlanilha(blob(bytes))).toEqual([
      ['Nome', 'Limite de fiado', 'Nascimento', 'CPF'],
      ['Maria & Cia <teste>', 200, 33010, '529.982.247-25'],
      ['João', 0],
    ]);
  });

  it('compactada como o Excel salva: textos compartilhados, prefixo de namespace, célula pulada, sim/não e linha vazia no meio', async () => {
    const S = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const bytes = await zipCompactado([
      { nome: '[Content_Types].xml', texto: '<Types/>' },
      { nome: 'xl/workbook.xml', texto: `<x:workbook ${S} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="Produtos" sheetId="1" r:id="rId7"/></x:sheets></x:workbook>` },
      {
        nome: 'xl/_rels/workbook.xml.rels',
        texto: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Target="/xl/worksheets/dados.xml"/></Relationships>',
      },
      { nome: 'xl/sharedStrings.xml', texto: `<x:sst ${S}><x:si><x:t>Nome</x:t></x:si><x:si><x:r><x:t>Ração </x:t></x:r><x:r><x:t>3 kg</x:t></x:r></x:si><x:si><x:t>Preço de venda</x:t></x:si></x:sst>` },
      {
        nome: 'xl/worksheets/dados.xml',
        texto:
          `<x:worksheet ${S}><x:sheetData>` +
          '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>2</x:v></x:c></x:row>' +
          '<x:row r="2"><x:c r="A2" t="s"><x:v>1</x:v></x:c><x:c r="B2" t="b"><x:v>1</x:v></x:c><x:c r="C2"><x:v>24.9</x:v></x:c></x:row>' +
          '<x:row r="4"><x:c r="A4" t="inlineStr"><x:is><x:t>Areia</x:t></x:is></x:c><x:c r="C4" t="str"><x:v>R$ 10,00</x:v></x:c><x:c r="D4" t="e"><x:v>#DIV/0!</x:v></x:c></x:row>' +
          '<x:row r="9" spans="1:3"/>' +
          '</x:sheetData></x:worksheet>',
      },
    ]);
    expect(await lerArquivoDePlanilha(blob(bytes))).toEqual([
      ['Nome', null, 'Preço de venda'],
      ['Ração 3 kg', true, 24.9],
      [],
      ['Areia', null, 'R$ 10,00', null],
    ]);
  });

  it('arquivo quebrado e o .xls antigo: a mensagem diz o que fazer', async () => {
    await expect(lerArquivoDePlanilha(blob(Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0])))).rejects.toThrow(/parece corrompido/);
    await expect(lerArquivoDePlanilha(blob(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))).rejects.toThrow('Este arquivo é do Excel antigo (.xls). Abra no Excel e salve como .xlsx ou .csv.');
    await expect(lerArquivoDePlanilha(blob(Uint8Array.from([0x50, 0x4b, 3, 4])))).rejects.toBeInstanceOf(ErroDePlanilha);
  });
});

describe('ler .csv', () => {
  it('ponto e vírgula do Excel em português, com aspas, aspas dobradas e quebra de linha dentro do campo', async () => {
    const csv = '﻿Nome;Preço de venda;Observação\r\n"Ração ""Premium"" 15 kg";189,90;"linha 1\nlinha 2"\r\nAreia;24,90;\r\n\r\n\r\n';
    expect(await lerArquivoDePlanilha(blob(csv))).toEqual([
      ['Nome', 'Preço de venda', 'Observação'],
      ['Ração "Premium" 15 kg', '189,90', 'linha 1\nlinha 2'],
      ['Areia', '24,90', null],
    ]);
  });

  it('vírgula ou tabulação também; os acentos do Excel antigo (Windows) não se perdem', async () => {
    expect(await lerArquivoDePlanilha(blob('Nome,CPF\nMaria,"529.982.247-25"\n'))).toEqual([
      ['Nome', 'CPF'],
      ['Maria', '529.982.247-25'],
    ]);
    expect(await lerArquivoDePlanilha(blob('Nome\tTelefone\nJoão\t41 99999-8888'))).toEqual([
      ['Nome', 'Telefone'],
      ['João', '41 99999-8888'],
    ]);
    // "Ração;Preço" em windows-1252: ç = E7, ã = E3
    const latin = Uint8Array.from([0x52, 0x61, 0xe7, 0xe3, 0x6f, 0x3b, 0x50, 0x72, 0x65, 0xe7, 0x6f]);
    expect(await lerArquivoDePlanilha(blob(latin))).toEqual([['Ração', 'Preço']]);
  });
});
