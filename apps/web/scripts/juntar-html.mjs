// apps/web/scripts/juntar-html.mjs — junta dist-demo/demo.html + JS + CSS num único arquivo
// (sistema-padrao-demo.html, na raiz do repositório), que abre com dois cliques, sem servidor.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist-demo');
const destino = resolve(web, '../../sistema-padrao-demo.html');

let html = readFileSync(join(dist, 'demo.html'), 'utf8');
const ler = (caminho) => readFileSync(join(dist, caminho.replace(/^\.?\//, '')), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>\n${ler(href)}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  // "</script" dentro do código fecharia a tag antes da hora.
  const codigo = ler(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${codigo}\n</script>`;
});

if (/<(script|link)[^>]+(src|href)="\.?\/?assets\//.test(html)) {
  throw new Error('Sobrou referência a arquivo externo em assets/.');
}

writeFileSync(destino, html);
console.log(`Gerado ${destino} (${Math.round(html.length / 1024)} KB)`);
