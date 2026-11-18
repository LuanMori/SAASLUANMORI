// apps/web/scripts/juntar-html.mjs — junta dist-demo/demo.html + JS + CSS num único arquivo
// (sistema-padrao-demo.html, na raiz do repositório), que abre com dois cliques, sem servidor.
//
// Segurança e acentos (revisão de 18/11/2026, itens 4.5 e 5.2):
//   - CSP no próprio HTML: só roda o script e o estilo que estão AQUI (conferidos pelo hash SHA-256),
//     nada de fora, e a página não fala com servidor nenhum (connect-src 'none');
//   - BOM UTF-8 no começo: programas que adivinham a codificação (alguns visualizadores do Windows,
//     anexos de e-mail) abrem com os acentos certos, em vez de "Ã§".
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist-demo');
const destino = resolve(web, '../../sistema-padrao-demo.html');

let html = readFileSync(join(dist, 'demo.html'), 'utf8');
// No esqueleto que o Vite gerou, só pode haver o script e o estilo que este arquivo embute (com hash).
if (/<script(?![^>]*\ssrc=)[^>]*>|<style[\s>]/i.test(html)) {
  throw new Error('O demo.html tem script ou estilo inline que a CSP não conhece: atualize juntar-html.mjs.');
}
const ler = (caminho) => readFileSync(join(dist, caminho.replace(/^\.?\//, '')), 'utf8');
const hash = (texto) => `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`;
const hashes = { script: [], style: [] };

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const conteudo = `\n${ler(href)}\n`;
  hashes.style.push(hash(conteudo));
  return `<style>${conteudo}</style>`;
});
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  // "</script" dentro do código fecharia a tag antes da hora.
  const conteudo = `\n${ler(src).replace(/<\/script/gi, '<\\/script')}\n`;
  hashes.script.push(hash(conteudo));
  return `<script type="module">${conteudo}</script>`;
});

if (/<(script|link)[^>]+(src|href)="\.?\/?assets\//.test(html)) {
  throw new Error('Sobrou referência a arquivo externo em assets/.');
}
if (hashes.script.length === 0 || hashes.style.length === 0) throw new Error('Script ou estilo não encontrado no demo.html.');

const csp = [
  "default-src 'none'",
  `script-src ${hashes.script.join(' ')}`,
  `style-src ${hashes.style.join(' ')}`,
  'img-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
html = html.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error('Não achei onde colocar a CSP (meta charset).');

writeFileSync(destino, `﻿${html}`, 'utf8');
console.log(`Gerado ${destino} (${Math.round(html.length / 1024)} KB, com CSP e BOM UTF-8)`);
