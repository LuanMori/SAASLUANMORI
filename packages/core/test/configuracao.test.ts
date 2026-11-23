// packages/core/test/configuracao.test.ts — dados e regras de cada loja, com os padrões do DaniPets V9.3.3.
import { describe, expect, it } from 'vitest';
import {
  aplicarMudancaNosDados,
  aplicarMudancaNasRegras,
  CATEGORIAS_DESPESA_PADRAO,
  classificarDesconto,
  type DadosDaLoja,
  LIMITES_LOJA,
  MENSAGENS_PADRAO,
  MOTIVOS_AJUSTE_PADRAO,
  normalizarDadosDaLoja,
  normalizarRegras,
  pode,
  preencherModelo,
  regrasPadrao,
} from '../src';

const mensagem = (r: { ok: boolean; erros?: { mensagem: string }[] }) => (!r.ok && r.erros ? r.erros[0]!.mensagem : '');
const campos = (r: { ok: boolean; erros?: { campo: string }[] }) => (!r.ok && r.erros ? r.erros.map((e) => e.campo) : []);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const dados: DadosDaLoja = { nome: 'Loja A', descricao: 'Rações, petiscos e acessórios', logo: null };

describe('regras padrão = as do DaniPets V9.3.3', () => {
  it('números, mensagens, listas, unidades e o campo extra (desligado)', () => {
    const r = regrasPadrao();
    expect(r.venda.descontoSemSenhaPct).toBe(10);
    expect(r.caixa.toleranciaCentavos).toBe(1000);
    expect(r.fiado).toEqual({ prazoDias: 30, vencidoPedeDono: true });
    expect(r.cashback).toEqual({ percentual: 3.5, validadeDias: 31, avisoDias: 7 });
    expect(r.retorno).toEqual({ diasSemComprar: 30, cupomPct: 5, cupomValidadeDias: 7 });
    expect(r.mensagens).toEqual(MENSAGENS_PADRAO);
    expect(r.estoque.motivosAjuste).toEqual(['Perda ou avaria', 'Produto vencido', 'Correção de contagem', 'Outro']);
    expect(r.financeiro.categoriasDespesa).toEqual(CATEGORIAS_DESPESA_PADRAO);
    expect(r.produtos.unidades).toEqual(['un', 'kg']);
    expect(r.clientes.campoExtra).toEqual({ ativo: false, rotulo: 'Pet' });
  });

  it('nada do DaniPets fica preso no texto: o nome da loja entra por {loja}', () => {
    for (const m of Object.values(MENSAGENS_PADRAO)) {
      expect(m).toContain('{loja}');
      expect(m.toLowerCase()).not.toContain('dani');
    }
  });

  it('cada chamada devolve uma cópia (mexer numa não muda a outra)', () => {
    const a = regrasPadrao();
    a.estoque.motivosAjuste.push('Furto');
    expect(regrasPadrao().estoque.motivosAjuste).toEqual(MOTIVOS_AJUSTE_PADRAO);
  });
});

describe('dados da loja', () => {
  it('muda só o que veio e diz o que mudou', () => {
    const r = aplicarMudancaNosDados(dados, { nome: '  Pet  Center  ', descricao: '' });
    expect(r.ok && r.valor).toEqual({ dados: { nome: 'Pet Center', descricao: null, logo: null }, campos: ['nome', 'descricao'] });
    const igual = aplicarMudancaNosDados(dados, { nome: 'Loja A' });
    expect(igual.ok && igual.valor.campos).toEqual([]);
  });

  it('nome obrigatório e com limite; texto em NFC', () => {
    expect(mensagem(aplicarMudancaNosDados(dados, { nome: ' ' }))).toBe('Informe o nome da loja.');
    expect(mensagem(aplicarMudancaNosDados(dados, { nome: 'x'.repeat(81) }))).toMatch(/até 80/);
    expect(mensagem(aplicarMudancaNosDados(dados, { descricao: 'x'.repeat(161) }))).toMatch(/até 160/);
    expect(mensagem(aplicarMudancaNosDados(dados, { descricao: 12 }))).toMatch(/texto/);
    const nfd = 'Pão de Açúcar';
    const r = aplicarMudancaNosDados(dados, { nome: nfd });
    expect(r.ok && r.valor.dados.nome).toBe('Pão de Açúcar'.normalize('NFC'));
  });

  it('logo: só PNG, JPEG ou WebP em data URL, com tamanho máximo; null tira o logo', () => {
    const com = aplicarMudancaNosDados(dados, { logo: PNG });
    expect(com.ok && com.valor.dados.logo).toBe(PNG);
    expect(mensagem(aplicarMudancaNosDados(dados, { logo: 'data:image/svg+xml;base64,PHN2Zz4=' }))).toMatch(/PNG, JPEG ou WebP/);
    expect(mensagem(aplicarMudancaNosDados(dados, { logo: 'https://exemplo.com/logo.png' }))).toMatch(/PNG, JPEG ou WebP/);
    expect(mensagem(aplicarMudancaNosDados(dados, { logo: `data:image/png;base64,${'A'.repeat(LIMITES_LOJA.logoMaxCaracteres)}` }))).toMatch(/grande demais/);
    const sem = aplicarMudancaNosDados({ ...dados, logo: PNG }, { logo: null });
    expect(sem.ok && sem.valor).toEqual({ dados, campos: ['logo'] });
  });

  it('recusa campo estranho e mudança vazia', () => {
    expect(campos(aplicarMudancaNosDados(dados, { subdominio: 'outra' }))).toEqual(['subdominio']);
    expect(mensagem(aplicarMudancaNosDados(dados, {}))).toBe('Nada para alterar.');
    expect(mensagem(aplicarMudancaNosDados(dados, 'x'))).toMatch(/objeto/);
  });

  it('dados guardados por outra versão (ou alterados por fora) voltam ao padrão no que estiver errado', () => {
    expect(normalizarDadosDaLoja(null, dados)).toEqual(dados);
    expect(normalizarDadosDaLoja({ nome: 'Pet Center', logo: 'javascript:alert(1)', descricao: 7 }, dados)).toEqual({ nome: 'Pet Center', descricao: dados.descricao, logo: null });
    expect(normalizarDadosDaLoja({ nome: '', descricao: null, logo: PNG }, dados)).toEqual({ nome: 'Loja A', descricao: null, logo: PNG });
  });
});

describe('regras da loja', () => {
  it('muda só a parte e o campo enviados e diz o que mudou', () => {
    const r = aplicarMudancaNasRegras(regrasPadrao(), { fiado: { prazoDias: 15 }, cashback: { percentual: 3.5 } });
    expect(r.ok && r.valor.secoes).toEqual(['fiado']);
    expect(r.ok && r.valor.regras.fiado).toEqual({ prazoDias: 15, vencidoPedeDono: true });
    expect(r.ok && r.valor.regras.cashback.percentual).toBe(3.5);
  });

  it('limites do DaniPets em cada número', () => {
    const base = regrasPadrao();
    expect(mensagem(aplicarMudancaNasRegras(base, { cashback: { percentual: 20.5 } }))).toBe('Percentual de cashback: de 0 a 20, com até 2 casas.');
    expect(mensagem(aplicarMudancaNasRegras(base, { cashback: { percentual: 3.555 } }))).toMatch(/até 2 casas/);
    expect(mensagem(aplicarMudancaNasRegras(base, { fiado: { prazoDias: 0 } }))).toBe('Prazo para pagar o fiado (dias): de 1 a 365, sem casas decimais.');
    expect(mensagem(aplicarMudancaNasRegras(base, { fiado: { prazoDias: 1.5 } }))).toMatch(/sem casas/);
    expect(mensagem(aplicarMudancaNasRegras(base, { retorno: { cupomPct: 51 } }))).toMatch(/de 0 a 50/);
    expect(mensagem(aplicarMudancaNasRegras(base, { caixa: { toleranciaCentavos: -1 } }))).toMatch(/de 0 a 100000/);
    expect(mensagem(aplicarMudancaNasRegras(base, { venda: { descontoSemSenhaPct: '10' } }))).toMatch(/de 0 a 50/);
    const ok = aplicarMudancaNasRegras(base, { venda: { descontoSemSenhaPct: 12.5 }, retorno: { diasSemComprar: 3650 }, cashback: { avisoDias: 0 } });
    expect(ok.ok && ok.valor.regras.venda.descontoSemSenhaPct).toBe(12.5);
  });

  it('sim/não, unidades e campo extra do cliente', () => {
    const base = regrasPadrao();
    expect(mensagem(aplicarMudancaNasRegras(base, { fiado: { vencidoPedeDono: 'sim' } }))).toMatch(/sim ou não/);
    const u = aplicarMudancaNasRegras(base, { produtos: { unidades: ['kg', 'un'] } });
    expect(u.ok && u.valor.regras.produtos.unidades).toEqual(['un', 'kg']);
    expect(mensagem(aplicarMudancaNasRegras(base, { produtos: { unidades: [] } }))).toMatch(/pelo menos uma unidade/);
    expect(mensagem(aplicarMudancaNasRegras(base, { produtos: { unidades: ['un', 'lt'] } }))).toMatch(/pelo menos uma unidade/);
    expect(mensagem(aplicarMudancaNasRegras(base, { produtos: { unidades: ['un', 'un'] } }))).toMatch(/pelo menos uma unidade/);
    const pet = aplicarMudancaNasRegras(base, { clientes: { campoExtra: { ativo: true } } });
    expect(pet.ok && pet.valor.regras.clientes.campoExtra).toEqual({ ativo: true, rotulo: 'Pet' });
    const veiculo = aplicarMudancaNasRegras(base, { clientes: { campoExtra: { rotulo: ' Veículo ' } } });
    expect(veiculo.ok && veiculo.valor.regras.clientes.campoExtra.rotulo).toBe('Veículo');
    expect(mensagem(aplicarMudancaNasRegras(base, { clientes: { campoExtra: { rotulo: 'x' } } }))).toMatch(/de 2 a 30/);
    expect(campos(aplicarMudancaNasRegras(base, { clientes: { campoExtra: { cor: 'azul' } } }))).toEqual(['clientes.campoExtra.cor']);
    expect(mensagem(aplicarMudancaNasRegras(base, { clientes: { campoExtra: true } }))).toMatch(/ativo, rotulo/);
  });

  it('listas: sem repetir, sem vazio, com limite de itens e de tamanho', () => {
    const base = regrasPadrao();
    const r = aplicarMudancaNasRegras(base, { estoque: { motivosAjuste: [' Furto ', 'Perda ou avaria'] } });
    expect(r.ok && r.valor.regras.estoque.motivosAjuste).toEqual(['Furto', 'Perda ou avaria']);
    expect(mensagem(aplicarMudancaNasRegras(base, { estoque: { motivosAjuste: ['Furto', 'FURTO'] } }))).toBe('"FURTO" aparece mais de uma vez.');
    expect(mensagem(aplicarMudancaNasRegras(base, { estoque: { motivosAjuste: [] } }))).toMatch(/pelo menos um item/);
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { categoriasDespesa: ['x'] } }))).toMatch(/de 2 a 60/);
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { categoriasDespesa: Array.from({ length: 31 }, (_, i) => `Categoria ${i}`) } }))).toMatch(/até 30 itens/);
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { categoriasDespesa: 'Aluguel' } }))).toBe('Envie uma lista.');
  });

  it('mensagens: não ficam vazias, têm limite e só usam as variáveis que existem', () => {
    const base = regrasPadrao();
    const ok = aplicarMudancaNasRegras(base, { mensagens: { cashback: 'Oi {nome}!\r\nVocê tem {valor} na {loja}.' } });
    expect(ok.ok && ok.valor.regras.mensagens.cashback).toBe('Oi {nome}!\nVocê tem {valor} na {loja}.');
    expect(mensagem(aplicarMudancaNasRegras(base, { mensagens: { retorno: '   ' } }))).toBe('A mensagem não pode ficar vazia.');
    expect(mensagem(aplicarMudancaNasRegras(base, { mensagens: { retorno: 'x'.repeat(1001) } }))).toMatch(/até 1000/);
    expect(mensagem(aplicarMudancaNasRegras(base, { mensagens: { cobranca: 'Oi {nome}, seu cupom: {desconto}' } }))).toBe(
      'Use só {nome}, {loja}, {valor}, {vencimento} (não existe {desconto}).',
    );
    expect(mensagem(aplicarMudancaNasRegras(base, { mensagens: { cobranca: 'Oi\u0000' } }))).toMatch(/inválidos/);
  });

  it('recusa parte ou campo desconhecido e mudança vazia', () => {
    const base = regrasPadrao();
    expect(campos(aplicarMudancaNasRegras(base, { senha: {} }))).toEqual(['senha']);
    expect(campos(aplicarMudancaNasRegras(base, { fiado: { juros: 2 } }))).toEqual(['fiado.juros']);
    expect(mensagem(aplicarMudancaNasRegras(base, { fiado: 30 }))).toMatch(/objeto/);
    expect(mensagem(aplicarMudancaNasRegras(base, {}))).toBe('Nada para alterar.');
    expect(mensagem(aplicarMudancaNasRegras(base, null))).toMatch(/objeto/);
  });

  it('regras guardadas por outra versão (ou alteradas por fora): o que estiver errado volta ao padrão', () => {
    expect(normalizarRegras(undefined)).toEqual(regrasPadrao());
    const r = normalizarRegras({
      cashback: { percentual: 99, validadeDias: 60 },
      fiado: 'x',
      mensagens: { retorno: '', cashback: 'Oi {nome}' },
      produtos: { unidades: ['un'] },
      outra: { coisa: 1 },
      clientes: { campoExtra: { ativo: true, rotulo: 'Veículo' }, extra: 1 },
    });
    expect(r.cashback).toEqual({ percentual: 3.5, validadeDias: 60, avisoDias: 7 });
    expect(r.fiado).toEqual(regrasPadrao().fiado);
    expect(r.mensagens.retorno).toBe(MENSAGENS_PADRAO.retorno);
    expect(r.mensagens.cashback).toBe('Oi {nome}');
    expect(r.produtos.unidades).toEqual(['un']);
    expect(r.clientes.campoExtra).toEqual({ ativo: true, rotulo: 'Veículo' });
  });
});

describe('uso das regras', () => {
  it('o limite de desconto da loja muda quem precisa de senha', () => {
    expect(classificarDesconto(1000, 880).tipo).toBe('acima-do-limite'); // 12% passa dos 10% do DaniPets
    expect(classificarDesconto(1000, 880, 12.5).tipo).toBe('dentro-do-limite');
    expect(classificarDesconto(1000, 999, 0).tipo).toBe('acima-do-limite'); // limite 0: todo desconto pede senha
  });

  it('preencherModelo troca as variáveis e deixa as desconhecidas', () => {
    expect(preencherModelo(MENSAGENS_PADRAO.cashback, { nome: 'Maria', loja: 'Loja A', valor: 'R$ 3,50', validade: '20/12/2026' })).toBe(
      'Olá, Maria! Aqui é da Loja A. Você tem R$ 3,50 de cashback para usar até 20/12/2026. Aproveite na sua próxima compra!',
    );
    expect(preencherModelo('{nome} e {outra}', { nome: 'Ana' })).toBe('Ana e {outra}');
    expect(preencherModelo('{toString}', {})).toBe('{toString}');
  });

  it('alterar os dados e as regras: Dono e Administrador; o Vendedor só lê', () => {
    expect(pode('dono', 'loja.configurar')).toBe(true);
    expect(pode('administrador', 'loja.configurar')).toBe(true);
    expect(pode('vendedor', 'loja.configurar')).toBe(false);
  });
});

describe('nomes das contas do Financeiro (pedido do Luan, 23/11/2026)', () => {
  it('padrão: Caixa físico e Conta bancária; muda só a que veio; vazio volta ao padrão', () => {
    const base = regrasPadrao();
    expect(base.financeiro.nomesContas).toEqual({ caixa: 'Caixa físico', banco: 'Conta bancária' });
    const r = aplicarMudancaNasRegras(base, { financeiro: { nomesContas: { banco: '  Banco   Itaú ' } } });
    expect(r.ok && r.valor.regras.financeiro.nomesContas).toEqual({ caixa: 'Caixa físico', banco: 'Banco Itaú' });
    expect(r.ok && r.valor.secoes).toEqual(['financeiro']);
    expect(r.ok && r.valor.regras.financeiro.categoriasDespesa).toEqual(CATEGORIAS_DESPESA_PADRAO); // as categorias ficam
    const volta = r.ok ? aplicarMudancaNasRegras(r.valor.regras, { financeiro: { nomesContas: { banco: '' } } }) : r;
    expect(volta.ok && volta.valor.regras.financeiro.nomesContas.banco).toBe('Conta bancária');
  });

  it('de 2 a 30 caracteres, conta conhecida e nomes diferentes', () => {
    const base = regrasPadrao();
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { nomesContas: { banco: 'B' } } }))).toBe('O nome da conta tem de 2 a 30 caracteres.');
    expect(campos(aplicarMudancaNasRegras(base, { financeiro: { nomesContas: { banco: 'x'.repeat(31) } } }))).toEqual(['financeiro.nomesContas.banco']);
    expect(campos(aplicarMudancaNasRegras(base, { financeiro: { nomesContas: { poupanca: 'Poupança' } } }))).toEqual(['financeiro.nomesContas.poupanca']);
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { nomesContas: { banco: 'caixa físico' } } }))).toBe('As duas contas precisam de nomes diferentes.');
    expect(mensagem(aplicarMudancaNasRegras(base, { financeiro: { nomesContas: 'Banco' } }))).toMatch(/caixa, banco/);
  });

  it('guardado por outra versão sem os nomes (ou com nome inválido): volta ao padrão, sem perder o resto', () => {
    const antigas = { financeiro: { categoriasDespesa: ['Aluguel', 'Outras'] } };
    expect(normalizarRegras(antigas).financeiro).toEqual({ categoriasDespesa: ['Aluguel', 'Outras'], nomesContas: { caixa: 'Caixa físico', banco: 'Conta bancária' } });
    const ruins = { financeiro: { nomesContas: { banco: 'B', caixa: 'Gaveta' } } };
    expect(normalizarRegras(ruins).financeiro.nomesContas).toEqual({ caixa: 'Caixa físico', banco: 'Conta bancária' });
  });
});
