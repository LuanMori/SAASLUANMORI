// apps/web/src/relatorios/lerPlanilha.ts
// Lê a planilha escolhida para importar (Dados e backup → Importar e exportar): .xlsx (Excel, LibreOffice, Google
// Planilhas) ou .csv. Tudo no próprio navegador, sem biblioteca de fora (como o xlsx.ts, que escreve). Devolve a
// primeira aba como uma tabela, com os títulos na primeira linha; as regras de cada coluna ficam no @saas/core
// (importacao.ts).
//   - .xlsx: um ZIP com XML dentro. Lê o índice do ZIP (diretório central), descompacta com o DecompressionStream do
//     navegador (deflate) e lê a primeira aba com os textos compartilhados (sharedStrings). Número vai como número
//     (dinheiro, quantidade e data do Excel); a regra de cada coluna decide o que ele é;
//   - .csv: separado por ponto e vírgula (Excel em português), vírgula ou tabulação, com aspas; em UTF-8 ou no padrão
//     do Windows (o Excel antigo salva os acentos assim).
// Limites contra arquivo malfeito: 20 MB de arquivo, 80 MB descompactado e o número de linhas da importação.
import { type CelulaImportada, LIMITES_IMPORTACAO } from '@saas/core';

export const PLANILHA_MAX_BYTES = 20 * 1024 * 1024;
const DESCOMPACTADO_MAX_BYTES = 80 * 1024 * 1024;
/** Linhas lidas além do limite da importação: o bastante para o @saas/core avisar que passou. */
const LINHAS_LIDAS_MAX = LIMITES_IMPORTACAO.linhasMax + 2;

export class ErroDePlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDePlanilha';
  }
}

const CORROMPIDA = 'Não foi possível ler a planilha: o arquivo parece corrompido. Abra no Excel e salve de novo como .xlsx ou .csv.';
const MUITAS_LINHAS = `A planilha tem mais de ${LIMITES_IMPORTACAO.linhasMax.toLocaleString('pt-BR')} linhas. Divida em arquivos menores.`;

function lerBytes(arquivo: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(new Uint8Array(leitor.result as ArrayBuffer));
    leitor.onerror = () => reject(new ErroDePlanilha('Não foi possível ler o arquivo.'));
    leitor.readAsArrayBuffer(arquivo);
  });
}

/** Lê o arquivo escolhido: .xlsx (pelo conteúdo, não pelo nome) ou .csv. */
export async function lerArquivoDePlanilha(arquivo: Blob): Promise<CelulaImportada[][]> {
  if (arquivo.size > PLANILHA_MAX_BYTES) throw new ErroDePlanilha('A planilha passa de 20 MB. Divida em arquivos menores.');
  const bytes = await lerBytes(arquivo);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lerXlsx(bytes); // "PK": um ZIP
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ErroDePlanilha('Este arquivo é do Excel antigo (.xls). Abra no Excel e salve como .xlsx ou .csv.');
  }
  return lerCsv(bytes);
}

// ------------------------------------------------------------------ ZIP

interface EntradaDoZip {
  metodo: number;
  compactado: number;
  tamanho: number;
  inicio: number;
}

function indiceDoZip(b: Uint8Array): Map<string, EntradaDoZip> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // o fim do diretório central fica nos últimos bytes (22 + até 65.535 de comentário)
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new ErroDePlanilha(CORROMPIDA);
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const nomes = new TextDecoder();
  const mapa = new Map<string, EntradaDoZip>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) throw new ErroDePlanilha(CORROMPIDA);
    const tamNome = dv.getUint16(p + 28, true);
    const nome = nomes.decode(b.subarray(p + 46, p + 46 + tamNome));
    mapa.set(nome, { metodo: dv.getUint16(p + 10, true), compactado: dv.getUint32(p + 20, true), tamanho: dv.getUint32(p + 24, true), inicio: dv.getUint32(p + 42, true) });
    p += 46 + tamNome + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return mapa;
}

async function descompactar(dados: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ErroDePlanilha('Este navegador não abre .xlsx. Salve a planilha como .csv (no Excel: Arquivo → Salvar como → CSV) e escolha de novo.');
  }
  const entrada = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(dados as BufferSource);
      c.close();
    },
  });
  const leitor = entrada.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > DESCOMPACTADO_MAX_BYTES) throw new ErroDePlanilha('A planilha é grande demais para importar. Divida em arquivos menores.');
    partes.push(value);
  }
  const saida = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) {
    saida.set(parte, p);
    p += parte.length;
  }
  return saida;
}

async function lerDoZip(b: Uint8Array, indice: Map<string, EntradaDoZip>, nome: string): Promise<string | null> {
  const e = indice.get(nome);
  if (!e) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (e.inicio + 30 > b.length || dv.getUint32(e.inicio, true) !== 0x04034b50) throw new ErroDePlanilha(CORROMPIDA);
  const ini = e.inicio + 30 + dv.getUint16(e.inicio + 26, true) + dv.getUint16(e.inicio + 28, true);
  const dados = b.subarray(ini, ini + e.compactado);
  if (e.tamanho > DESCOMPACTADO_MAX_BYTES) throw new ErroDePlanilha('A planilha é grande demais para importar. Divida em arquivos menores.');
  let bytes: Uint8Array;
  if (e.metodo === 0) bytes = dados;
  else if (e.metodo === 8) bytes = await descompactar(dados).catch((x: unknown) => Promise.reject(x instanceof ErroDePlanilha ? x : new ErroDePlanilha(CORROMPIDA)));
  else throw new ErroDePlanilha(CORROMPIDA);
  return new TextDecoder().decode(bytes);
}

// ------------------------------------------------------------------ XLSX

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function documentoXml(texto: string): Document {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new ErroDePlanilha(CORROMPIDA);
  return doc;
}
/** Os elementos pelo nome local (com ou sem prefixo de namespace). */
const elementos = (raiz: Document | Element, nome: string) => Array.from(raiz.getElementsByTagNameNS('*', nome));
const filhos = (el: Element, nome: string) => Array.from(el.children).filter((f) => f.localName === nome);

/** "B12" -> coluna 1 (a primeira é 0). */
function colunaDaReferencia(ref: string): number {
  let n = 0;
  for (const letra of /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? '') n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
}

/** O texto de um <si> ou <is>: as partes <t> dele (sem o texto fonético <rPh>). */
const textoRico = (el: Element) =>
  elementos(el, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');

/** O caminho da primeira aba: workbook.xml → workbook.xml.rels. */
async function caminhoDaPrimeiraAba(b: Uint8Array, indice: Map<string, EntradaDoZip>): Promise<string> {
  const livro = await lerDoZip(b, indice, 'xl/workbook.xml');
  const rels = await lerDoZip(b, indice, 'xl/_rels/workbook.xml.rels');
  if (livro && rels) {
    const aba = elementos(documentoXml(livro), 'sheet')[0];
    const id = aba?.getAttributeNS(NS_REL, 'id') || aba?.getAttribute('r:id');
    const alvo = elementos(documentoXml(rels), 'Relationship').find((r) => r.getAttribute('Id') === id)?.getAttribute('Target');
    if (alvo) return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

export async function lerXlsx(b: Uint8Array): Promise<CelulaImportada[][]> {
  const indice = indiceDoZip(b);
  const aba = await lerDoZip(b, indice, await caminhoDaPrimeiraAba(b, indice));
  if (aba === null) throw new ErroDePlanilha('Não achei nenhuma aba com dados na planilha.');
  const compartilhados = await lerDoZip(b, indice, 'xl/sharedStrings.xml');
  const textos = compartilhados ? elementos(documentoXml(compartilhados), 'si').map(textoRico) : [];

  const tabela: CelulaImportada[][] = [];
  let ultimaComDados = 0;
  elementos(documentoXml(aba), 'row').forEach((linha, posicao) => {
    const r = Number(linha.getAttribute('r')) || posicao + 1;
    const celulas: CelulaImportada[] = [];
    for (const c of filhos(linha, 'c')) {
      const ref = c.getAttribute('r');
      const col = ref ? colunaDaReferencia(ref) : celulas.length;
      if (col < 0 || col >= LIMITES_IMPORTACAO.colunasMax) continue;
      const tipo = c.getAttribute('t');
      const v = filhos(c, 'v')[0]?.textContent ?? '';
      let valor: CelulaImportada = null;
      if (tipo === 's') valor = textos[Number(v)] ?? null;
      else if (tipo === 'inlineStr') valor = filhos(c, 'is')[0] ? textoRico(filhos(c, 'is')[0]!) : null;
      else if (tipo === 'str' || tipo === 'd') valor = v;
      else if (tipo === 'b') valor = v === '1';
      else if (tipo !== 'e' && v.trim() !== '') valor = Number.isFinite(Number(v)) ? Number(v) : v;
      if (valor === '') valor = null;
      celulas[col] = valor;
    }
    for (let i = 0; i < celulas.length; i++) if (celulas[i] === undefined) celulas[i] = null;
    if (celulas.some((x) => x !== null)) {
      if (r > LINHAS_LIDAS_MAX) throw new ErroDePlanilha(MUITAS_LINHAS);
      tabela[r - 1] = celulas;
      ultimaComDados = Math.max(ultimaComDados, r);
    }
  });
  // linhas vazias no meio continuam no lugar (o número de cada linha bate com o do Excel)
  return Array.from({ length: ultimaComDados }, (_, i) => tabela[i] ?? []);
}

// ------------------------------------------------------------------ CSV

function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** O separador da primeira linha: ponto e vírgula, tabulação ou vírgula (o que aparecer mais, fora de aspas). */
function separador(texto: string): string {
  const conta: Record<string, number> = { ';': 0, '\t': 0, ',': 0 };
  let aspas = false;
  for (const c of texto) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && (c === '\n' || c === '\r')) break;
    else if (!aspas && c in conta) conta[c]! += 1;
  }
  return [';', '\t', ','].reduce((melhor, s) => (conta[s]! > conta[melhor]! ? s : melhor), ';');
}

export function lerCsv(bytes: Uint8Array): CelulaImportada[][] {
  const texto = decodificar(bytes);
  const sep = separador(texto);
  const linhas: CelulaImportada[][] = [];
  let linha: CelulaImportada[] = [];
  let campo = '';
  let aspas = false;
  let entreAspas = false;
  const fecharCampo = () => {
    linha.push(campo === '' && !entreAspas ? null : campo);
    campo = '';
    entreAspas = false;
  };
  const fecharLinha = () => {
    fecharCampo();
    if (linhas.length >= LINHAS_LIDAS_MAX) throw new ErroDePlanilha(MUITAS_LINHAS);
    linhas.push(linha.slice(0, LIMITES_IMPORTACAO.colunasMax));
    linha = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else aspas = false;
    } else if (c === '"' && campo === '') {
      aspas = true;
      entreAspas = true;
    } else if (c === sep) fecharCampo();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fecharLinha();
    } else campo += c;
  }
  if (campo !== '' || linha.length > 0 || entreAspas) fecharLinha();
  // linhas totalmente vazias no fim (o Excel costuma deixar) saem
  while (linhas.length > 0 && linhas[linhas.length - 1]!.every((x) => x === null || x === '')) linhas.pop();
  return linhas.map((l) => l.map((x) => (x === '' ? null : x)));
}
