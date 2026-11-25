import test from 'node:test';
import assert from 'node:assert/strict';
import { reaisParaCentavos, formatarCentavos, validarNovoProduto } from '@saas/core';
test('conversão monetária e limites', () => {
  for (const [entrada, esperado] of [['12,5',1250],['R$ 1.234,56',123456],['12.50',1250],['1.234',123400],['12,',1200],['0,99',99],['21474836,47',2147483647],['21474836,48',null],['-1',null],['1e3',null],['',null],['12,345',null]]) assert.equal(reaisParaCentavos(entrada),esperado);
  assert.equal(formatarCentavos(1250),'R$\u00a012,50');
});
test('cadastro, campos e erros', () => {
  assert.deepEqual(validarNovoProduto({nome:' X ',codigoBarras:' 001\r\n',precoCentavos:1}),{ok:true,valor:{nome:'X',codigoBarras:'001',precoCentavos:1}});
  const resultado=validarNovoProduto({nome:'',codigoBarras:'ABC',precoCentavos:0,lojaId:'outra'});
  assert.equal(resultado.ok,false);
  assert.deepEqual(resultado.erros.map(e=>e.campo).sort(),['codigoBarras','lojaId','nome','precoCentavos']);
});
