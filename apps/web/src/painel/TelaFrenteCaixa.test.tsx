// apps/web/src/painel/TelaFrenteCaixa.test.tsx
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPainel } from '../api';
import { criarApiLocal } from '../demo/apiLocal';
import { darEstoque } from '../testes/estoque';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';

/** formatarCentavos usa espaço não separável depois de "R$"; nos testes comparamos com espaço comum. */
const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FUSO = 'America/Sao_Paulo';
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };

async function criarLoja(operador: OperadorComPapel = BRUNO, agora?: () => Date) {
  const base = criarApiLocal({ lojaId: 'pdv', operador, exemplos: false, atrasoMs: 0, agora });
  const racao = await base.criarProduto({ nome: 'Ração Gatos 3 kg', codigoBarras: '7891000200209', precoCentavos: 7990 });
  const petisco = await base.criarProduto({ nome: 'Petisco Bifinho', codigoBarras: '7897000400403', precoCentavos: 750 });
  await base.criarProduto({ nome: 'Petisco Ossinho', codigoBarras: null, precoCentavos: 500 });
  await darEstoque('pdv', 100); // produto novo começa sem estoque
  await base.abrirCaixa({ fundoCentavos: 10000 }); // só vende com o caixa do dia aberto (Caixa do dia)
  return { base, racao, petisco };
}

async function montar({ operador = BRUNO, chave = 'carrinho-teste' }: { operador?: OperadorComPapel; chave?: string | null } = {}) {
  const loja = await criarLoja(operador);
  return abrir(loja.base, operador, chave, loja);
}

async function abrir(base: ApiPainel, operador: OperadorComPapel, chave: string | null, extra: object = {}, { semCaixa = false } = {}) {
  // a Frente de caixa só vende com o caixa de hoje aberto: abre, se ainda não estiver (menos no teste do caixa fechado)
  if (!semCaixa && (await base.lerSituacaoDoCaixa()).estado === 'nao_aberto') await base.abrirCaixa({ fundoCentavos: 10000 });
  const api = { ...base, criarVenda: vi.fn(base.criarVenda) };
  const aoSair = vi.fn();
  const ui = render(
    <TelaFrenteCaixa api={api} operador={{ nome: operador.nome, papel: operador.papel }} loja={{ nome: 'Loja T' }} fuso={FUSO} chaveCarrinho={chave} aoSair={aoSair} />,
  );
  await screen.findByPlaceholderText('Bipe o código ou digite o nome (3*código = 3 un.)');
  return { api, aoSair, ui, ...extra };
}

/** As vendas gravadas na loja dos testes, vistas pelo Dono (o Vendedor só recebe as de hoje). */
const vendasDoPdv = () => criarApiLocal({ lojaId: 'pdv', operador: ANA, exemplos: false, atrasoMs: 0 }).listarVendas();
const leitor = () => screen.getByLabelText('Código ou nome do produto');
const bipar = (codigo: string) => userEvent.type(leitor(), `${codigo}{Enter}`);
const linhas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const total = () => txt(screen.getByTestId('pdv-total').textContent);
const finalizar = () => userEvent.click(screen.getByRole('button', { name: 'FINALIZAR · F2' }));
const janela = () => screen.getByRole('dialog');

describe('Frente de caixa · cabeçalho e leitor', () => {
  it('mostra loja, CAIXA e operador; "← Painel" sai', async () => {
    const { aoSair } = await montar();
    expect(screen.getByText('Loja T')).toBeTruthy();
    expect(screen.getByText('CAIXA')).toBeTruthy();
    expect(screen.getByText('Bruno').closest('.pdv-pilula')?.textContent).toBe('Operador: Bruno');
    await userEvent.click(screen.getByRole('button', { name: '← Painel' }));
    expect(aoSair).toHaveBeenCalledOnce();
  });

  it('leitor: Enter adiciona; "3*código" soma 3; o mesmo código de novo soma 1; ÚLTIMO ITEM mostra a conta', async () => {
    await montar();
    await bipar('7897000400403');
    await bipar('3*7897000400403');
    expect(linhas()).toHaveLength(1);
    expect((screen.getByLabelText('Quantidade de Petisco Bifinho', { selector: 'input' }) as HTMLInputElement).value).toBe('4');
    expect(txt(screen.getByTestId('pdv-ultimo').nextElementSibling?.textContent)).toBe('4 × R$ 7,50 = R$ 30,00');
    expect(total()).toBe('R$ 30,00');
    expect((leitor() as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(leitor());
  });

  it('código que não existe e quantidade quebrada avisam e não adicionam', async () => {
    await montar();
    await bipar('000000');
    expect(screen.getByRole('alert').textContent).toBe('Código "000000" não encontrado (ou produto inativo).');
    await bipar('0,5*7897000400403');
    expect(screen.getByRole('alert').textContent).toMatch(/quantidade inteira/);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('uma barra só: o nome sem acento acha o produto; com vários, pede para escolher na lista', async () => {
    await montar();
    expect(screen.queryByLabelText('Buscar produto')).toBeNull(); // a segunda barra saiu (pedido do Luan)
    await bipar('racao');
    expect(linhas()[0]!.textContent).toMatch(/Ração Gatos 3 kg/);
    expect((leitor() as HTMLInputElement).value).toBe('');
    await userEvent.type(leitor(), 'petisco');
    const lista = screen.getByRole('list', { name: 'Produtos encontrados' });
    expect(within(lista).getAllByRole('button').map((b) => b.querySelector('.pdv-sug-nome')?.firstChild?.textContent)).toEqual(['Petisco Bifinho', 'Petisco Ossinho']);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Mais de um produto encontrado: escolha na lista.');
    expect((leitor() as HTMLInputElement).value).toBe('petisco'); // o texto fica para escolher ou corrigir
    await userEvent.click(within(lista).getByText('Petisco Ossinho'));
    expect(linhas()).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Produtos encontrados' })).toBeNull();
    expect(document.activeElement).toBe(leitor());
  });

  it('setas andam na lista; "2*nome" põe 2 do escolhido; F3 volta para a barra; Esc limpa', async () => {
    await montar();
    await userEvent.type(leitor(), '2*petisco');
    await userEvent.keyboard('{ArrowDown}');
    const botoes = within(screen.getByRole('list', { name: 'Produtos encontrados' })).getAllByRole('button');
    expect(document.activeElement).toBe(botoes[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(botoes[1]);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(leitor()); // a seta de cima, no primeiro, volta para a barra
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect((screen.getByLabelText('Quantidade de Petisco Ossinho', { selector: 'input' }) as HTMLInputElement).value).toBe('2');
    expect(document.activeElement).toBe(leitor());

    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{F3}');
    expect(document.activeElement).toBe(leitor());
    await userEvent.type(leitor(), 'coleira');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Nenhum produto encontrado para “coleira”.');
    expect((leitor() as HTMLInputElement).value).toBe('coleira'); // digitado à mão: fica para corrigir
    await userEvent.keyboard('{Escape}');
    expect((leitor() as HTMLInputElement).value).toBe('');
    expect(linhas()).toHaveLength(1);
  });

  it('produto a granel: a lista mostra o saldo em kg e o preço por kg; "1,5*nome" põe 1,5 kg', async () => {
    const api = criarApiLocal({ lojaId: 'granel', operador: BRUNO, exemplos: false, atrasoMs: 0 });
    await api.criarProduto({ nome: 'Ração a granel', codigoBarras: null, precoCentavos: 1990, unidade: 'kg' });
    await darEstoque('granel', 25000); // 25 kg (o estoque guarda gramas)
    await abrir(api, BRUNO, null);
    await userEvent.type(leitor(), '1,5*granel');
    const item = within(screen.getByRole('list', { name: 'Produtos encontrados' })).getByRole('button');
    expect(txt(item.textContent)).toBe('0001Ração a granelsaldo 25 kgR$ 19,90/kg');
    await userEvent.click(item);
    expect(txt(screen.getByTestId('pdv-ultimo').nextElementSibling?.textContent)).toBe('1,5 kg × R$ 19,90/kg = R$ 29,85');
  });

  it('começo do código também acha; código inteiro (leitor) entra direto, mesmo com outros parecidos', async () => {
    await montar();
    await userEvent.type(leitor(), '789');
    expect(within(screen.getByRole('list', { name: 'Produtos encontrados' })).getAllByRole('button')).toHaveLength(2);
    await userEvent.clear(leitor());
    await bipar('7891000200209');
    expect(linhas()[0]!.textContent).toMatch(/Ração Gatos 3 kg/);
    expect(screen.queryByRole('list', { name: 'Produtos encontrados' })).toBeNull();
  });

  it('quantidade com + e −; chegar a zero tira o item; × remove', async () => {
    await montar();
    await bipar('7897000400403');
    await bipar('7891000200209');
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar Petisco Bifinho' }));
    expect(total()).toBe('R$ 94,90');
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Petisco Bifinho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Petisco Bifinho' }));
    expect(linhas()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Remover Ração Gatos 3 kg' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Bipe o primeiro produto')).toBeTruthy();
  });
});

describe('Frente de caixa · pagamento e finalizar', () => {
  it('Pix vem marcado; F2 finaliza; a tela manda só produto, quantidade e pagamento', async () => {
    const { api } = await montar();
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');
    await bipar('7897000400403');
    await userEvent.keyboard('{F2}');
    expect(txt((await screen.findByText(/Venda #00001 finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 7,50 em Pix.');
    expect(api.criarVenda).toHaveBeenCalledWith({
      itens: [{ produtoId: expect.any(String), quantidade: 1, desconto: null }],
      pagamentos: [{ forma: 'pix', valorCentavos: 750 }],
      recebidoDinheiroCentavos: null,
    });
    expect(screen.queryByRole('table')).toBeNull();
    expect(total()).toBe('R$ 0,00');
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true'); // continua marcada
  });

  it('F4 = dinheiro: pede o recebido, mostra o que falta e o troco', async () => {
    const { api } = await montar();
    await bipar('7891000200209');
    await userEvent.keyboard('{F4}');
    expect(screen.getByRole('button', { name: /^Dinheiro/ }).getAttribute('aria-pressed')).toBe('true');
    await finalizar();
    expect(txt(screen.getByRole('alert').textContent)).toBe('Informe o valor recebido em dinheiro (igual ou maior que R$ 79,90).');
    const recebido = screen.getByLabelText(/RECEBIDO EM DINHEIRO/);
    await userEvent.type(recebido, '50');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('Faltam R$ 29,90');
    await userEvent.clear(recebido);
    await userEvent.type(recebido, '100');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('R$ 20,10');
    await finalizar();
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 79,90 em Dinheiro. Troco: R$ 20,10.');
    expect(api.criarVenda.mock.calls[0]![0].recebidoDinheiroCentavos).toBe(10000);
  });

  it('troco: atalhos "Exato" e quantias redondas preenchem o recebido; Enter no recebido finaliza', async () => {
    const { api } = await montar();
    await bipar('7891000200209'); // R$ 79,90
    await userEvent.keyboard('{F4}');
    const atalhos = within(screen.getByRole('group', { name: 'Atalhos do valor recebido' }));
    expect(atalhos.getAllByRole('button').map((b) => txt(b.textContent))).toEqual(['Exato', 'R$ 80,00', 'R$ 100,00']);
    await userEvent.click(atalhos.getByRole('button', { name: 'Exato' }));
    expect((screen.getByLabelText(/RECEBIDO EM DINHEIRO/) as HTMLInputElement).value).toBe('79,90');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('R$ 0,00');
    await userEvent.click(atalhos.getByRole('button', { name: /100,00/ }));
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('R$ 20,10');
    expect(document.activeElement).toBe(screen.getByLabelText(/RECEBIDO EM DINHEIRO/)); // o foco volta para o campo
    await userEvent.keyboard('{Enter}');
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 79,90 em Dinheiro. Troco: R$ 20,10.');
    expect(api.criarVenda).toHaveBeenCalledOnce();
  });

  it('troco no pagamento dividido: sobre a parte em dinheiro; com pouco dinheiro, avisa quanto falta', async () => {
    await montar();
    await bipar('7891000200209'); // R$ 79,90
    await userEvent.click(screen.getByRole('button', { name: 'Dividir pagamento' }));
    await userEvent.selectOptions(screen.getByLabelText('Forma da parte 1'), 'dinheiro');
    await userEvent.clear(screen.getByLabelText('Valor da parte 1'));
    await userEvent.type(screen.getByLabelText('Valor da parte 1'), '30');
    await userEvent.selectOptions(screen.getByLabelText('Forma da parte 2'), 'pix');
    await userEvent.type(screen.getByLabelText('Valor da parte 2'), '49,90');
    expect(within(screen.getByRole('group', { name: 'Atalhos do valor recebido' })).getAllByRole('button').map((b) => txt(b.textContent))).toEqual([
      'Exato',
      'R$ 35,00',
      'R$ 40,00',
      'R$ 50,00',
    ]);
    await userEvent.type(screen.getByLabelText(/RECEBIDO EM DINHEIRO/), '20');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('Faltam R$ 10,00');
    expect(screen.getByTestId('pdv-troco').previousElementSibling?.textContent).toBe('VALOR INSUFICIENTE');
    await userEvent.clear(screen.getByLabelText(/RECEBIDO EM DINHEIRO/));
    await userEvent.type(screen.getByLabelText(/RECEBIDO EM DINHEIRO/), '50');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('R$ 20,00');
  });

  it('F8, F9 e F10 escolhem Pix, Débito e Crédito', async () => {
    await montar();
    await userEvent.keyboard('{F9}');
    expect(screen.getByRole('button', { name: /^Cartão de débito/ }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{F10}');
    expect(screen.getByRole('button', { name: /^Cartão de crédito/ }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{F8}');
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('dividir pagamento: partes, "Falta pagar" e troco sobre a parte em dinheiro', async () => {
    const { api } = await montar();
    await bipar('7891000200209');
    await userEvent.click(screen.getByRole('button', { name: 'Dividir pagamento' }));
    const valor1 = screen.getByLabelText('Valor da parte 1') as HTMLInputElement;
    expect(valor1.value).toBe('79,90');
    expect((screen.getByLabelText('Forma da parte 2') as HTMLSelectElement).value).toBe('dinheiro');
    await userEvent.clear(valor1);
    await userEvent.type(valor1, '49,90');
    expect(txt(screen.getByText(/Falta pagar/).textContent)).toBe('Falta pagar: R$ 30,00');
    await finalizar();
    expect(txt(screen.getByRole('alert').textContent)).toBe('Os pagamentos somam R$ 49,90, e a venda é R$ 79,90.');
    await userEvent.type(screen.getByLabelText('Valor da parte 2'), '30');
    expect(screen.getByLabelText(/RECEBIDO EM DINHEIRO · PARTE DE/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/RECEBIDO EM DINHEIRO/), '50');
    expect(txt(screen.getByTestId('pdv-troco').textContent)).toBe('R$ 20,00');
    await finalizar();
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe(
      'Venda #00001 finalizada: R$ 79,90 em Dinheiro R$ 30,00 + Pix R$ 49,90. Troco: R$ 20,00.',
    );
    // a tela manda as partes como foram digitadas; a venda gravada fica na ordem das formas
    expect(api.criarVenda.mock.calls[0]![0].pagamentos).toEqual([
      { forma: 'pix', valorCentavos: 4990 },
      { forma: 'dinheiro', valorCentavos: 3000 },
    ]);
    expect((await vendasDoPdv())[0]!.pagamentos).toEqual([
      { forma: 'dinheiro', valorCentavos: 3000 },
      { forma: 'pix', valorCentavos: 4990 },
    ]);
  });

  it('tirar uma das duas partes volta para uma forma só', async () => {
    await montar();
    await bipar('7891000200209');
    await userEvent.click(screen.getByRole('button', { name: 'Dividir pagamento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a parte 1' }));
    expect(screen.queryByRole('group', { name: 'Pagamento dividido' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Dinheiro/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Limpar venda pede confirmação', async () => {
    await montar();
    await bipar('7897000400403');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Limpar venda' }));
    expect(linhas()).toHaveLength(1);
    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Limpar venda' }));
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Frente de caixa · desconto', () => {
  const abrirDesconto = async (produto: string) => {
    await userEvent.click(within(linhas().find((l) => l.textContent?.includes(produto))!).getByRole('button', { name: /desconto/ }));
    return janela();
  };
  const preencher = async (preco: string, motivo: string) => {
    const preco1 = within(janela()).getByLabelText('Preço final (R$)');
    await userEvent.clear(preco1);
    await userEvent.type(preco1, preco);
    await userEvent.type(within(janela()).getByLabelText('Motivo do desconto'), motivo);
  };

  it('até 10% o Vendedor dá sozinho: aplica sem senha e ele fica como responsável', async () => {
    const { api } = await montar();
    await bipar('7897000400403');
    expect(within(await abrirDesconto('Petisco Bifinho')).getByRole('heading').textContent).toBe('Desconto em Petisco Bifinho');
    await preencher('7,00', 'embalagem amassada');
    expect(txt(within(janela()).getByText(/Desconto de/).textContent)).toBe('Desconto de 6,7% (R$ 0,50 por unidade).');
    expect(within(janela()).queryByLabelText('Senha')).toBeNull();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Aplicar desconto' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(txt(linhas()[0]!.textContent)).toMatch(/com desconto/);
    expect(txt(linhas()[0]!.textContent)).toMatch(/de R\$ 7,50 · Bruno/);
    expect(total()).toBe('R$ 7,00');
    await finalizar();
    await screen.findByText(/finalizada/);
    const venda = (await vendasDoPdv())[0]!;
    expect(venda.itens[0]!.desconto).toEqual({ motivo: 'embalagem amassada', responsavel: { id: 'bruno', nome: 'Bruno' }, autorizadoComSenha: false });
    expect(venda.descontoCentavos).toBe(50);
  });

  it('acima de 10%: pede a senha do Dono ou do Administrador; senha errada não passa', async () => {
    const { api } = await montar();
    await bipar('7891000200209');
    await abrirDesconto('Ração Gatos');
    await preencher('70', 'cliente antigo');
    expect(within(janela()).getByRole('group', { name: /Passa de 10%/ })).toBeTruthy();
    const quem = (await within(janela()).findByRole('option', { name: 'Ana · Dono' })).closest('select')!;
    expect(within(quem).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana · Dono', 'Caio · Administrador']);
    await userEvent.selectOptions(quem, 'Caio · Administrador');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'errada');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar e aplicar' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('Senha incorreta.');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar e aplicar' }));
    expect(txt((await screen.findByText(/Desconto aplicado/)).textContent)).toBe('Desconto aplicado: R$ 9,90 por unidade (autorizado por Caio).');
    await finalizar();
    await screen.findByText(/finalizada/);
    expect((await vendasDoPdv())[0]!.itens[0]!.desconto).toEqual({
      motivo: 'cliente antigo',
      responsavel: { id: 'caio', nome: 'Caio' },
      autorizadoComSenha: true,
    });
  });

  it('brinde (preço 0): só um Dono autoriza; a venda sai sem pagamento', async () => {
    await montar();
    await bipar('7897000400403');
    await abrirDesconto('Petisco Bifinho');
    await preencher('0', 'brinde de aniversário');
    expect(within(janela()).getByText('Brinde: o produto sai de graça.')).toBeTruthy();
    expect(within(janela()).getByRole('group', { name: 'Brinde: autorização de um Dono' })).toBeTruthy();
    const quem = (await within(janela()).findByRole('option', { name: 'Ana · Dono' })).closest('select')!;
    expect(within(quem).getAllByRole('option')).toHaveLength(1); // o Administrador não aparece
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar e aplicar' }));
    await screen.findByText(/Desconto aplicado/);
    expect(total()).toBe('R$ 0,00');
    await finalizar();
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: brinde, sem pagamento.');
  });

  it('preço final que não é desconto e motivo vazio avisam dentro da janela', async () => {
    await montar();
    await bipar('7897000400403');
    await abrirDesconto('Petisco Bifinho');
    await preencher('8', 'x');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Aplicar desconto' }));
    expect(within(janela()).getByRole('alert').textContent).toMatch(/menor que o preço de tabela/);
    await userEvent.clear(within(janela()).getByLabelText('Motivo do desconto'));
    await userEvent.clear(within(janela()).getByLabelText('Preço final (R$)'));
    await userEvent.type(within(janela()).getByLabelText('Preço final (R$)'), '7');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Aplicar desconto' }));
    expect(within(janela()).getByRole('alert').textContent).toBe('Informe o motivo do desconto.');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('remover desconto pede confirmação e volta ao preço de tabela', async () => {
    await montar();
    await bipar('7897000400403');
    await abrirDesconto('Petisco Bifinho');
    await preencher('7', 'avaria');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Aplicar desconto' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remover desconto' }));
    expect(total()).toBe('R$ 7,50');
    expect(txt(linhas()[0]!.textContent)).not.toMatch(/com desconto/);
  });
});

describe('Frente de caixa · carrinho guardado', () => {
  it('volta depois de recarregar a página; o desconto que precisou de senha pede autorização de novo', async () => {
    const loja = await criarLoja(BRUNO);
    const primeira = await abrir(loja.base, BRUNO, 'k1');
    await bipar('7891000200209');
    await bipar('7897000400403');
    await userEvent.click(within(linhas()[0]!).getByRole('button', { name: 'Aplicar desconto' }));
    await userEvent.clear(within(janela()).getByLabelText('Preço final (R$)'));
    await userEvent.type(within(janela()).getByLabelText('Preço final (R$)'), '70');
    await userEvent.type(within(janela()).getByLabelText('Motivo do desconto'), 'cliente antigo');
    await within(janela()).findByRole('option', { name: 'Ana · Dono' });
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Autorizar e aplicar' }));
    await screen.findByText(/Desconto aplicado/);
    primeira.ui.unmount();

    await abrir(loja.base, BRUNO, 'k1'); // "recarregou a página"
    expect(linhas()).toHaveLength(2);
    expect(total()).toBe('R$ 77,50');
    expect(txt(linhas()[0]!.textContent)).toMatch(/autorize o desconto de novo/);
    await finalizar();
    expect((await screen.findByRole('alert')).textContent).toMatch(/precisa da autorização do Dono ou do Administrador. Aplique o desconto de novo/);
  });

  it('cada pessoa tem o próprio carrinho', async () => {
    const loja = await criarLoja(BRUNO);
    const a = await abrir(loja.base, BRUNO, 'carrinho-bruno');
    await bipar('7897000400403');
    a.ui.unmount();
    await abrir(loja.base, ANA, 'carrinho-ana');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Frente de caixa · devolução e cancelamento', () => {
  it('Dono cancela uma venda de hoje: o valor volta pelas mesmas formas', async () => {
    const loja = await criarLoja(ANA);
    await loja.base.criarVenda({ itens: [{ produtoId: loja.petisco.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valorCentavos: 1500 }] });
    const { api } = await abrir(loja.base, ANA, null);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Devolução ou cancelamento');
    await userEvent.click(await within(janela()).findByRole('button', { name: /#00001/ }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Venda #00001');
    await userEvent.click(within(janela()).getByLabelText('Cancelar a venda inteira'));
    expect(txt(within(janela()).getByText(/Volta tudo/).textContent)).toBe('Volta tudo para o cliente: Pix R$ 15,00. Todos os itens voltam ao estoque.');
    expect(within(janela()).queryByLabelText('Senha')).toBeNull(); // Dono não precisa de autorização
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'cliente desistiu');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cancelar a venda' }));
    expect(txt((await screen.findByText(/cancelada\./)).textContent)).toBe('Venda #00001 cancelada. Devolvido: Pix R$ 15,00.');
    const venda = (await vendasDoPdv())[0]!;
    expect(venda.status).toBe('cancelada');
    expect(venda.cancelamento).toMatchObject({ motivo: 'cliente desistiu', por: { id: 'ana', nome: 'Ana' }, autorizadoPor: null });
  });

  it('Vendedor devolve um item pelo número da venda, com a senha do Dono', async () => {
    const loja = await criarLoja(BRUNO);
    await loja.base.criarVenda({
      itens: [{ produtoId: loja.petisco.id, quantidade: 2 }],
      pagamentos: [{ forma: 'dinheiro', valorCentavos: 1500 }],
      recebidoDinheiroCentavos: 2000,
    });
    const { api } = await abrir(loja.base, BRUNO, null);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    await userEvent.type(within(janela()).getByLabelText('Número da venda'), '1');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }));
    await within(janela()).findByRole('heading', { name: 'Venda #00001' });
    await userEvent.clear(within(janela()).getByLabelText('Quantidade a devolver de Petisco Bifinho'));
    await userEvent.type(within(janela()).getByLabelText('Quantidade a devolver de Petisco Bifinho'), '1');
    expect(txt(within(janela()).getByText(/Volta para o cliente/).textContent)).toBe('Volta para o cliente: R$ 7,50 (Dinheiro R$ 7,50).');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'embalagem furada');
    await within(janela()).findByRole('option', { name: 'Ana · Dono' });
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'errada');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar devolução' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('Senha incorreta.');
    await userEvent.type(within(janela()).getByLabelText('Senha'), 'demo1234');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar devolução' }));
    expect(txt((await screen.findByText(/Devolução registrada/)).textContent)).toBe('Devolução registrada na venda #00001: R$ 7,50 (Dinheiro R$ 7,50).');
    const venda = (await vendasDoPdv())[0]!;
    expect(venda.devolucoes[0]).toMatchObject({ totalCentavos: 750, feitaPor: { id: 'bruno', nome: 'Bruno' }, autorizadaPor: { id: 'ana', nome: 'Ana' } });
  });

  it('venda de outro dia não pode ser cancelada inteira (só devolver); número que não existe avisa', async () => {
    const ontem = () => new Date(Date.now() - 86_400_000);
    const antes = await criarLoja(ANA, ontem);
    await antes.base.criarVenda({ itens: [{ produtoId: antes.petisco.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valorCentavos: 750 }] });
    await abrir(criarApiLocal({ lojaId: 'pdv', operador: ANA, exemplos: false, atrasoMs: 0 }), ANA, null);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    await userEvent.type(within(janela()).getByLabelText('Número da venda'), '99');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }));
    expect((await within(janela()).findByRole('alert')).textContent).toBe('Venda não encontrada.');
    await userEvent.clear(within(janela()).getByLabelText('Número da venda'));
    await userEvent.type(within(janela()).getByLabelText('Número da venda'), '1');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }));
    await within(janela()).findByRole('heading', { name: 'Venda #00001' });
    expect(within(janela()).queryByLabelText('Cancelar a venda inteira')).toBeNull();
    expect(within(janela()).getByText(/Cancelar a venda inteira só no mesmo dia/)).toBeTruthy();
  });
});

describe('Frente de caixa · estoque', () => {
  it('não passa do estoque: leitor e + avisam o disponível; a busca mostra o saldo', async () => {
    const api = criarApiLocal({ lojaId: 'est', operador: BRUNO, exemplos: false, atrasoMs: 0 });
    await api.criarProduto({ nome: 'Coleira M', codigoBarras: '789100', precoCentavos: 2990 });
    await darEstoque('est', 2);
    await abrir(api, BRUNO, null);
    await bipar('3*789100');
    expect(screen.getByRole('alert').textContent).toBe('Estoque insuficiente para Coleira M. Disponível: 2 un.');
    expect(screen.queryByRole('table')).toBeNull();
    await bipar('2*789100');
    expect(linhas()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar Coleira M' }));
    expect(screen.getByRole('alert').textContent).toBe('Estoque insuficiente para Coleira M. Disponível: 2 un.');
    expect((screen.getByLabelText('Quantidade de Coleira M', { selector: 'input' }) as HTMLInputElement).value).toBe('2');
    await userEvent.type(leitor(), 'coleira');
    expect(within(screen.getByRole('list', { name: 'Produtos encontrados' })).getByText('saldo 2 un')).toBeTruthy();
  });

  it('a venda dá baixa na hora: vendido tudo, o produto não passa mais', async () => {
    const api = criarApiLocal({ lojaId: 'est', operador: BRUNO, exemplos: false, atrasoMs: 0 });
    await api.criarProduto({ nome: 'Coleira M', codigoBarras: '789100', precoCentavos: 2990 });
    await darEstoque('est', 2);
    await abrir(api, BRUNO, null);
    await bipar('2*789100');
    await finalizar();
    await screen.findByText(/finalizada/);
    await userEvent.type(leitor(), 'coleira');
    await within(screen.getByRole('list', { name: 'Produtos encontrados' })).findByText('saldo 0 un');
    await userEvent.keyboard('{Escape}');
    await bipar('789100');
    expect(screen.getByRole('alert').textContent).toBe('Estoque insuficiente para Coleira M. Disponível: 0 un.');
  });

  it('devolução: o item marcado volta ao estoque; desmarcado (avaria) não volta', async () => {
    const loja = await criarLoja(ANA);
    await loja.base.criarVenda({ itens: [{ produtoId: loja.petisco.id, quantidade: 3 }], pagamentos: [{ forma: 'pix', valorCentavos: 2250 }] });
    const { api } = await abrir(loja.base, ANA, null);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    await userEvent.click(await within(janela()).findByRole('button', { name: /#00001/ }));
    await userEvent.clear(within(janela()).getByLabelText('Quantidade a devolver de Petisco Bifinho'));
    await userEvent.type(within(janela()).getByLabelText('Quantidade a devolver de Petisco Bifinho'), '2');
    const volta = within(janela()).getByLabelText('Petisco Bifinho volta ao estoque') as HTMLInputElement;
    expect(volta.checked).toBe(true); // vem marcado, como no DaniPets
    await userEvent.click(volta);
    expect(txt(within(janela()).getByText(/Volta para o cliente/).textContent)).toBe(
      'Volta para o cliente: R$ 15,00 (Pix R$ 15,00). Não volta ao estoque (avaria ou vencido): 2× Petisco Bifinho.',
    );
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'avaria');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar devolução' }));
    await screen.findByText(/Devolução registrada/);
    expect((await api.listarEstoque()).find((e) => e.produtoId === loja.petisco.id)?.saldo).toBe(97); // 100 − 3 vendidos; a avaria não volta
  });
});

describe('Frente de caixa · cliente (F6)', () => {
  const faixa = () => screen.getByRole('group', { name: 'Cliente da venda' });

  it('F6 acha o cliente pelo nome; a venda leva o cliente e a faixa volta para "Não identificado"', async () => {
    const loja = await criarLoja(BRUNO);
    // o limite de fiado é do Dono (sem limite, a venda no fiado pede a liberação de um Dono)
    const maria = await criarApiLocal({ lojaId: 'pdv', operador: ANA, exemplos: false, atrasoMs: 0 }).cadastrarCliente({
      nome: 'Maria Souza',
      telefone: '41999998888',
      cpf: '52998224725',
      limiteFiadoCentavos: 100_000,
    });
    const { api } = await abrir(loja.base, BRUNO, null);
    expect(within(faixa()).getByText('Não identificado')).toBeTruthy();
    await userEvent.keyboard('{F6}');
    expect(within(janela()).getByRole('heading').textContent).toBe('Identificar cliente');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), 'maria');
    await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(txt(faixa().textContent)).toMatch(/Maria Souza\s*CPF \*\*\*\.982\.247-\*\*/);
    await bipar('7897000400403');
    await finalizar();
    // PDV-18: o aviso final diz o cashback que o cliente ganhou (3,5% de R$ 7,50)
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 7,50 em Pix. Cliente: Maria Souza. Maria ganhou R$ 0,26 de cashback.');
    expect(api.criarVenda).toHaveBeenCalledWith(expect.objectContaining({ clienteId: maria.id }));
    expect(within(faixa()).getByText('Não identificado')).toBeTruthy();
    expect((await api.historicoDoCliente(maria.id)).resumo).toMatchObject({ compras: 1, totalCentavos: 750 });
  });

  it('cliente novo: o CPF digitado na busca já vem no cadastro; dado inválido avisa no campo; × tira o cliente', async () => {
    await montar();
    await userEvent.click(screen.getByRole('button', { name: 'Identificar cliente · F6' }));
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), '529.982.247-25');
    expect(await within(janela()).findByText(/Nenhum cliente encontrado/)).toBeTruthy();
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar novo cliente' }));
    expect(within(janela()).getByRole('heading').textContent).toBe('Novo cliente');
    expect((within(janela()).getByLabelText('CPF') as HTMLInputElement).value).toBe('52998224725');
    await userEvent.type(within(janela()).getByLabelText('Nome completo'), 'Jo');
    await userEvent.type(within(janela()).getByLabelText('Telefone com DDD'), '123');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar e usar na venda' }));
    expect(within(janela()).getByText(/pelo menos 3 letras/)).toBeTruthy();
    expect(within(janela()).getByText(/Telefone inválido/)).toBeTruthy();
    await userEvent.type(within(janela()).getByLabelText('Nome completo'), 'ão Lima');
    await userEvent.clear(within(janela()).getByLabelText('Telefone com DDD'));
    await userEvent.type(within(janela()).getByLabelText('Telefone com DDD'), '(41) 98888-7777');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Cadastrar e usar na venda' }));
    expect(await screen.findByText('Cliente cadastrado: João Lima.')).toBeTruthy();
    expect(txt(faixa().textContent)).toMatch(/João Lima/);
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o cliente da venda' }));
    expect(within(faixa()).getByText('Não identificado')).toBeTruthy();
  });

  it('o cliente fica no carrinho guardado (só nome e CPF mascarado)', async () => {
    const loja = await criarLoja(BRUNO);
    await loja.base.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    const { ui } = await abrir(loja.base, BRUNO, 'carrinho-cli');
    await userEvent.keyboard('{F6}');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), '8888');
    await userEvent.keyboard('{Enter}'); // só um cliente na lista: Enter escolhe
    expect(txt(faixa().textContent)).toMatch(/Maria Souza/);
    expect(localStorage.getItem('carrinho-cli')).not.toContain('52998224725');
    ui.unmount();
    await abrir(loja.base, BRUNO, 'carrinho-cli');
    expect(txt(faixa().textContent)).toMatch(/Maria Souza/);
  });
});

describe('Frente de caixa · fiado (F7)', () => {
  const faixa = () => screen.getByRole('group', { name: 'Cliente da venda' });
  const botaoFiado = () => screen.getByRole('button', { name: /^Fiado/ });

  it('sem cliente identificado não deixa: o botão fica bloqueado e F7 explica por quê', async () => {
    const { api } = await montar();
    await bipar('7897000400403');
    expect(botaoFiado().getAttribute('aria-disabled')).toBe('true');
    expect(botaoFiado().textContent).toMatch(/só com cliente identificado/);
    await userEvent.keyboard('{F7}');
    expect(screen.getByRole('alert').textContent).toBe('Venda no fiado precisa de cliente identificado. Identifique o cliente (F6).');
    expect(botaoFiado().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(botaoFiado());
    expect(botaoFiado().getAttribute('aria-pressed')).toBe('false');
    // no pagamento dividido o fiado nem aparece na lista sem cliente
    await userEvent.click(screen.getByRole('button', { name: 'Dividir pagamento' }));
    expect(within(screen.getByLabelText('Forma da parte 1')).queryByRole('option', { name: 'Fiado' })).toBeNull();
    expect(api.criarVenda).not.toHaveBeenCalled();
  });

  it('com cliente: F7 escolhe o fiado, a venda vai para a conta do cliente e a próxima venda volta para Pix', async () => {
    const loja = await criarLoja(BRUNO);
    // o limite de fiado é do Dono (sem limite, a venda no fiado pede a liberação de um Dono)
    const maria = await criarApiLocal({ lojaId: 'pdv', operador: ANA, exemplos: false, atrasoMs: 0 }).cadastrarCliente({
      nome: 'Maria Souza',
      telefone: '41999998888',
      cpf: '52998224725',
      limiteFiadoCentavos: 100_000,
    });
    const { api } = await abrir(loja.base, BRUNO, null);
    await userEvent.keyboard('{F6}');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), 'maria');
    await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
    await bipar('2*7897000400403');
    expect(botaoFiado().getAttribute('aria-disabled')).toBeNull();
    await userEvent.keyboard('{F7}');
    expect(botaoFiado().getAttribute('aria-pressed')).toBe('true');
    await finalizar();
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 15,00 em Fiado. Cliente: Maria Souza.');
    expect(api.criarVenda).toHaveBeenCalledWith(expect.objectContaining({ clienteId: maria.id, pagamentos: [{ forma: 'fiado', valorCentavos: 1500 }] }));
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(faixa()).getByText('Não identificado')).toBeTruthy();

    // identificada de novo, a faixa mostra quanto ela deve no fiado
    await userEvent.keyboard('{F6}');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), 'maria');
    await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
    expect(txt(faixa().textContent)).toMatch(/Fiado em aberto R\$ 15,00/);
  });

  it('tirar o cliente com o fiado escolhido tira o fiado do pagamento (volta para Pix e avisa)', async () => {
    const loja = await criarLoja(BRUNO);
    await loja.base.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
    const { api } = await abrir(loja.base, BRUNO, null);
    await userEvent.keyboard('{F6}');
    await userEvent.type(within(janela()).getByLabelText('CPF, telefone ou nome'), 'maria');
    await userEvent.click(await within(janela()).findByRole('button', { name: /Maria Souza/ }));
    await bipar('7897000400403');
    await userEvent.click(botaoFiado());
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o cliente da venda' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Sem cliente identificado não dá para vender no fiado: o fiado saiu do pagamento/);
    expect(screen.getByRole('button', { name: /^Pix/ }).getAttribute('aria-pressed')).toBe('true');
    await finalizar();
    expect(txt((await screen.findByText(/finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 7,50 em Pix.');
    expect(api.criarVenda.mock.calls[0]![0].pagamentos).toEqual([{ forma: 'pix', valorCentavos: 750 }]);
  });
});

describe('Frente de caixa · produto por kg (Fase 2, módulo 2)', () => {
  async function lojaComGranel() {
    const base = criarApiLocal({ lojaId: 'pdv', operador: ANA, exemplos: false, atrasoMs: 0 });
    const granel = await base.criarProduto({ nome: 'Ração a granel', codigoBarras: '2000000000015', precoCentavos: 1990, unidade: 'kg', estoqueInicial: 10_000 });
    await base.abrirCaixa({ fundoCentavos: 10000 }); // só vende com o caixa do dia aberto
    return { base, granel };
  }

  it('"1,5*código" vende 1,5 kg; + e − andam 0,5 kg; o visor e o total saem pelo preço do quilo', async () => {
    const { base } = await lojaComGranel();
    await abrir(base, ANA, null);
    await bipar('1,5*2000000000015');
    expect(txt(screen.getByText(/1,5 kg ×/).textContent)).toBe('1,5 kg × R$ 19,90/kg = R$ 29,85');
    expect(total()).toBe('R$ 29,85');
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar Ração a granel' }));
    expect((screen.getByLabelText('Quantidade de Ração a granel em kg') as HTMLInputElement).value).toBe('2');
    expect(total()).toBe('R$ 39,80');
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Ração a granel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Ração a granel' }));
    expect(total()).toBe('R$ 19,90');
    const campo = screen.getByLabelText('Quantidade de Ração a granel em kg');
    await userEvent.clear(campo);
    await userEvent.type(campo, '0,25{Enter}');
    expect(total()).toBe('R$ 4,98');
    await finalizar();
    expect(txt((await screen.findByText(/Venda #00001 finalizada/)).textContent)).toBe('Venda #00001 finalizada: R$ 4,98 em Pix.');
    const venda = (await vendasDoPdv())[0]!;
    expect(venda.itens[0]).toMatchObject({ unidade: 'kg', quantidade: 250, subtotalCentavos: 498 });
    expect((await base.listarEstoque())[0]!.saldo).toBe(9750);
  });

  it('não passa do estoque em kg e recusa peso com mais de 3 casas', async () => {
    const { base } = await lojaComGranel();
    await abrir(base, ANA, null);
    await bipar('11*2000000000015');
    expect(txt((await screen.findByRole('alert')).textContent)).toBe('Estoque insuficiente para Ração a granel. Disponível: 10 kg.');
    await bipar('1,2345*2000000000015');
    expect(txt(screen.getByRole('alert').textContent)).toBe('Peso inválido: use até 3 casas (ex.: 1,5*código = 1,5 kg).');
  });

  it('devolução em kg: parte do peso volta, pelo preço do quilo', async () => {
    const { base, granel } = await lojaComGranel();
    await base.criarVenda({ itens: [{ produtoId: granel.id, quantidade: 1250 }], pagamentos: [{ forma: 'pix', valorCentavos: 2488 }] });
    await abrir(base, ANA, null);
    await userEvent.click(screen.getByRole('button', { name: 'Devolução / cancelamento' }));
    await userEvent.type(within(janela()).getByLabelText('Número da venda'), '1');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }));
    await within(janela()).findByRole('heading', { name: 'Venda #00001' });
    expect(within(janela()).getByText('1,25 kg')).toBeTruthy();
    await userEvent.clear(within(janela()).getByLabelText('Quantidade a devolver de Ração a granel'));
    await userEvent.type(within(janela()).getByLabelText('Quantidade a devolver de Ração a granel'), '0,5');
    expect(txt(within(janela()).getByText(/Volta para o cliente/).textContent)).toBe('Volta para o cliente: R$ 9,95 (Pix R$ 9,95).');
    await userEvent.type(within(janela()).getByLabelText('Motivo'), 'cliente levou demais');
    await userEvent.click(within(janela()).getByRole('button', { name: 'Confirmar devolução' }));
    expect(txt((await screen.findByText(/Devolução registrada/)).textContent)).toBe('Devolução registrada na venda #00001: R$ 9,95 (Pix R$ 9,95).');
    expect((await base.listarEstoque())[0]!.saldo).toBe(10_000 - 1250 + 500);
  });
});
