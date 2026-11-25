import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const [referencia, artefatos] = process.argv.slice(2);
const carregar = createRequire(resolve(process.env.COMPARADOR, 'package.json'));
const { chromium } = carregar('playwright-core');
const { PNG } = carregar('pngjs');

function compararPixels(original, atual, contexto) {
  const a = PNG.sync.read(original);
  const b = PNG.sync.read(atual);
  assert.deepEqual([a.width, a.height], [b.width, b.height], contexto);
  let alterados = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let maiorDiferenca = 0;
    for (let canal = 0; canal < 4; canal++) {
      maiorDiferenca = Math.max(maiorDiferenca, Math.abs(a.data[i + canal] - b.data[i + canal]));
    }
    if (maiorDiferenca === 0) continue;
    const pixel = i / 4;
    assert.ok(maiorDiferenca <= 1, contexto + ': cor diferente em ' + (pixel % a.width) + ',' + Math.floor(pixel / a.width));
    alterados++;
  }
  // O Chrome pode arredondar a cobertura de bordas curvas em 1 nível de 255.
  assert.ok(alterados <= a.width * a.height * 0.0003, contexto + ': ' + alterados + ' pixels diferentes');
  console.log(contexto + ': geometria idêntica, ' + alterados + ' pixels com arredondamento');
}

async function geometria(page) {
  return page.locator('.app *').evaluateAll(elementos => elementos
    .filter(el => el.getClientRects().length > 0)
    .map(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return [el.tagName, x, y, width, height];
    }));
}
const entrada = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TelaProdutos } from '../src/telas/TelaProdutos';
import '../src/estilos.css';
const produto = { id:'1', codigoInterno:'0001', codigoBarras:'0000123', nome:'Coleira', precoCentavos:1290, ativo:true };
const api = { listarProdutos:async()=>[produto], criarProduto:async dados=>({...produto,...dados,id:'2',codigoInterno:'0002'}) };
createRoot(document.querySelector('#raiz')).render(<React.StrictMode><TelaProdutos api={api}
  sessao={{loja:'Loja Centro',nome:'Maria'}} aoSair={()=>{}} intervaloMs={60000}/></React.StrictMode>);
`;
async function preparar(root) {
  const dir = await mkdtemp(join(root, 'comparar-'));
  let servidor;
  try {
    await writeFile(join(dir,'index.html'),'<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="raiz"></div><script type="module" src="./entrada.tsx"></script></body></html>');
    await writeFile(join(dir,'entrada.tsx'),entrada);
    servidor = await createServer({root,configFile:join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
    await servidor.listen();
    const porta = servidor.httpServer.address().port;
    return { url:'http://127.0.0.1:'+porta+'/'+dir.slice(root.length+1)+'/index.html', fechar:async()=>{await servidor.close();await rm(dir,{recursive:true});} };
  } catch (erro) {
    await servidor?.close();
    await rm(dir,{recursive:true});
    throw erro;
  }
}
const servidores=[];
let navegador;
try {
  servidores.push(await preparar(resolve(referencia,'apps/web')));
  servidores.push(await preparar(resolve('apps/web')));
  await mkdir(artefatos,{recursive:true});
  navegador=await chromium.launch({channel:'chrome',headless:true});
  for(const largura of [390,1280]) {
    const paginas=[];
    const erros=[];
    for(const servidor of servidores) {
      const page=await navegador.newPage({viewport:{width:largura,height:850},locale:'pt-BR'});
      paginas.push(page);
      page.on('pageerror',e=>erros.push(e.message));
      await page.goto(servidor.url);
      await page.getByRole('cell',{name:'Coleira',exact:true}).waitFor();
    }
    async function comparar(estado) {
      const fotos=[];
      for(const [i,page] of paginas.entries()) {
        await page.mouse.move(0,0);
        const foto=await page.screenshot({animations:'disabled',caret:'hide',fullPage:true});
        await writeFile(join(artefatos,largura+'-'+estado+'-'+['original','html'][i]+'.png'),foto);
        fotos.push(foto);
      }
      const contexto = largura + 'px, estado ' + estado;
      assert.deepEqual(await geometria(paginas[0]), await geometria(paginas[1]), contexto);
      compararPixels(fotos[0], fotos[1], contexto);
    }
    await comparar('lista');
    for(const page of paginas){
      await page.getByRole('button',{name:'Cadastrar'}).click();
      await page.getByText('Informe um preço válido (ex.: 12,90).').waitFor();
    }
    await comparar('erro');
    for(const page of paginas){
      await page.getByLabel('Nome',{exact:true}).fill('Areia');
      await page.getByLabel('Código de barras (opcional)').press('Enter');
      assert.equal(await page.locator('#preco').evaluate(el=>el===document.activeElement),true);
      await page.getByLabel('Preço (R$)').fill('23,45');
      await page.getByRole('button',{name:'Cadastrar'}).click();
      await page.getByRole('cell',{name:'Areia',exact:true}).waitFor();
    }
    await comparar('cadastro');
    assert.deepEqual(erros,[]);
    for(const page of paginas) await page.close();
  }
} finally {
  await navegador?.close();
  for(const servidor of servidores) await servidor.fechar();
}
