// apps/web/src/painel/TelaDadosBackupArquivos.test.tsx
// Dados e backup → "Importar e exportar" (módulo 13): as planilhas de cadastro no Excel, a cópia de segurança e a
// restauração pelo Adm. Sup (com a prévia, a confirmação e a cópia dos dados de agora baixada antes).
import { MENSAGENS_DA_COPIA } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { comCaixaAberto } from '../testes/caixa';
import { darEstoque } from '../testes/estoque';
import { TelaDadosBackup } from './TelaDadosBackup';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(cleanup);

const FUSO = 'America/Sao_Paulo';
const AGORA = new Date('2026-11-25T17:32:00Z'); // 14:32 em Brasília
const agora = () => AGORA;
const ANA = { id: 'ana', nome: 'Ana', papel: 'dono' as const };
const SUPORTE = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' as const };
const api = (operador: { id: string; nome: string; papel: string; permissoes?: string[] }) =>
  comCaixaAberto(criarApiLocal({ lojaId: 'loja-a', operador: operador as typeof ANA, exemplos: false, atrasoMs: 0, agora }));
const texto = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function lojaComDados() {
  const ana = api(ANA);
  await ana.listarUsuarios();
  const racao = await ana.criarProduto({ nome: 'Ração 3 kg', codigoBarras: '789100', precoCentavos: 5000 });
  await darEstoque('loja-a', 10);
  await ana.cadastrarCliente({ nome: 'Maria Souza', telefone: '41999998888', cpf: '52998224725' });
  await ana.cadastrarFornecedor({ nome: 'Distribuidora Pet', documento: null, telefone: null, contato: null, observacao: null });
  return { ana, racao };
}

async function abrir(props: Parameters<typeof TelaDadosBackup>[0]) {
  render(<TelaDadosBackup fuso={FUSO} agora={agora} {...props} />);
  await screen.findByLabelText('Nome da loja'); // os dados da loja carregaram (o nome vai no nome dos arquivos)
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Importar e exportar' }));
}

describe('Importar e exportar: planilhas e cópia de segurança', () => {
  it('o Dono baixa as três planilhas, com as colunas do modelo; cada uma fica no histórico', async () => {
    const { ana } = await lojaComDados();
    const baixar = vi.fn();
    await abrir({ api: ana, papel: 'dono', baixar });

    await userEvent.click(screen.getByRole('button', { name: 'Produtos (Excel)' }));
    expect(await screen.findByText('Planilha de produtos baixada: 1 linha.')).toBeTruthy();
    const [nome, bytes] = baixar.mock.calls[0]!;
    expect(nome).toBe('produtos-loja-a-2026-11-25.xlsx');
    expect(texto(bytes.slice(0, 2))).toBe('PK'); // é um .xlsx (ZIP)
    for (const t of ['Código interno', 'Preço de venda', 'Estoque mínimo', 'Ração 3 kg', 'Ativo']) expect(texto(bytes)).toContain(t);

    await userEvent.click(screen.getByRole('button', { name: 'Clientes (Excel)' }));
    expect(await screen.findByText('Planilha de clientes baixada: 1 linha.')).toBeTruthy();
    expect(baixar.mock.calls[1]![0]).toBe('clientes-loja-a-2026-11-25.xlsx');
    expect(texto(baixar.mock.calls[1]![1])).toContain('529.982.247-25'); // o Dono vê o CPF completo

    await userEvent.click(screen.getByRole('button', { name: 'Fornecedores (Excel)' }));
    expect(await screen.findByText('Planilha de fornecedores baixada: 1 linha.')).toBeTruthy();
    expect(texto(baixar.mock.calls[2]![1])).toContain('Distribuidora Pet');

    const historico = (await ana.listarAuditoria(3)).map((h) => h.resumo);
    expect(historico).toEqual(['Fornecedores • 1 linha', 'Clientes • 1 linha', 'Produtos • 1 linha']);
  });

  it('a cópia de segurança: o Dono baixa o arquivo; restaurar não aparece para ele', async () => {
    const { ana } = await lojaComDados();
    const baixar = vi.fn();
    await abrir({ api: ana, papel: 'dono', baixar });
    expect(screen.queryByRole('region', { name: 'Restaurar uma cópia' })).toBeNull();
    expect(screen.getByText(/Restaurar uma cópia é com o Adm\. Sup/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Baixar a cópia de segurança' }));
    expect(await screen.findByText(/^Cópia baixada \(copia-de-seguranca-loja-a-2026-11-25-1432\.json\): \d+ registros\. Guarde em lugar seguro\.$/)).toBeTruthy();
    const [nome, bytes, tipo] = baixar.mock.calls[0]!;
    expect(nome).toBe('copia-de-seguranca-loja-a-2026-11-25-1432.json');
    expect(tipo).toBe('application/json');
    expect(JSON.parse(texto(bytes))).toMatchObject({ formato: 'sistema-padrao/copia-da-loja', loja: { id: 'loja-a' }, contagem: { produtos: 1, clientes: 1 } });
  });

  it('Personalizado só com "Dados e backup": só a planilha de produtos, e a cópia bloqueada com o motivo', async () => {
    await lojaComDados();
    const paula = { id: 'paula', nome: 'Paula', papel: 'personalizado', permissoes: ['dados'] };
    await abrir({ api: api(paula), papel: paula });
    const regiao = screen.getByRole('region', { name: 'Exportar para o Excel' });
    expect(within(regiao).getAllByRole('button').map((b) => b.textContent)).toEqual(['Produtos (Excel)']);
    expect((screen.getByRole('button', { name: 'Baixar a cópia de segurança' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(MENSAGENS_DA_COPIA.precisaCpf)).toBeTruthy();
  });
});

describe('Importar e exportar: restaurar uma cópia (Adm. Sup)', () => {
  it('escolhe o arquivo, vê o que ele leva, confirma; antes de trocar, a cópia dos dados de agora é baixada', async () => {
    const { ana, racao } = await lojaComDados();
    const copia = JSON.stringify(await ana.gerarCopiaDaLoja(), null, 1);
    await ana.criarProduto({ nome: 'Areia 4 kg', codigoBarras: null, precoCentavos: 2490 });
    await ana.alterarProduto(racao.id, { precoCentavos: 5900 });

    const baixar = vi.fn();
    const aoMudar = vi.fn();
    const sup = api(SUPORTE);
    await abrir({ api: sup, papel: 'super_admin', baixar, aoMudar });
    const regiao = screen.getByRole('region', { name: 'Restaurar uma cópia' });
    await userEvent.upload(within(regiao).getByLabelText('Escolher o arquivo da cópia de segurança'), new File([copia], 'minha-copia.json', { type: 'application/json' }));

    const previa = await within(regiao).findByRole('group', { name: 'O que a cópia leva' });
    expect(previa.textContent).toContain('Cópia de 25/11/2026 às 14:32, baixada por Ana.');
    expect(previa.textContent).toContain('no arquivo minha-copia.json');
    const produtos = within(previa).getByText('Produtos').closest('li')!;
    expect(produtos.textContent).toBe('Produtos1');
    const botao = within(previa).getByRole('button', { name: 'Restaurar esta cópia' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true); // só depois de confirmar
    await userEvent.click(within(previa).getByLabelText('Entendi: os dados atuais da loja serão trocados pelos desta cópia.'));
    await userEvent.click(botao);

    expect(await within(regiao).findByText(/^Cópia de 25\/11\/2026 restaurada \(\d+ registros\)\. Os dados de antes foram baixados no arquivo copia-antes-de-restaurar-loja-a-2026-11-25-1432\.json\.$/)).toBeTruthy();
    // antes de trocar: a cópia dos dados de agora (com o produto novo e o preço mudado)
    expect(baixar).toHaveBeenCalledTimes(1);
    const [nome, bytes, tipo] = baixar.mock.calls[0]!;
    expect([nome, tipo]).toEqual(['copia-antes-de-restaurar-loja-a-2026-11-25-1432.json', 'application/json']);
    expect(JSON.parse(texto(bytes)).contagem.produtos).toBe(2);
    // depois: a loja como na cópia
    expect((await sup.listarProdutos()).map((p) => [p.nome, p.precoCentavos])).toEqual([['Ração 3 kg', 5000]]);
    expect(aoMudar).toHaveBeenCalled();
    expect(within(regiao).queryByRole('group', { name: 'O que a cópia leva' })).toBeNull();
  });

  it('arquivo alterado: avisa e não mostra a prévia; "Cancelar" volta a escolher o arquivo', async () => {
    const { ana } = await lojaComDados();
    const copia = await ana.gerarCopiaDaLoja();
    const mexida = JSON.parse(JSON.stringify(copia));
    mexida.dados.produtos[0].nome = 'Ração 15 kg';
    await abrir({ api: api(SUPORTE), papel: 'super_admin', baixar: vi.fn() });
    const regiao = screen.getByRole('region', { name: 'Restaurar uma cópia' });
    const escolher = () => within(regiao).getByLabelText('Escolher o arquivo da cópia de segurança');

    await userEvent.upload(escolher(), new File([JSON.stringify(mexida)], 'copia.json', { type: 'application/json' }));
    expect((await within(regiao).findByRole('alert')).textContent).toBe(MENSAGENS_DA_COPIA.alterada);
    expect(within(regiao).queryByRole('group', { name: 'O que a cópia leva' })).toBeNull();

    await userEvent.upload(escolher(), new File([JSON.stringify(copia)], 'copia.json', { type: 'application/json' }));
    await within(regiao).findByRole('group', { name: 'O que a cópia leva' });
    expect(within(regiao).queryByRole('alert')).toBeNull();
    await userEvent.click(within(regiao).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(within(regiao).queryByRole('group', { name: 'O que a cópia leva' })).toBeNull());
    expect(escolher()).toBeTruthy();
    expect((await ana.listarProdutos()).map((p) => p.nome)).toEqual(['Ração 3 kg']);
  });
});
