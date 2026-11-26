// apps/web/src/painel/TelaAdmSupManutencao.test.tsx — Adm. Sup: manutenção (módulo 13h) na tela de Dados e backup
// (diagnóstico, conferir o estoque, registro de erros) e a captura dos erros das telas.
import type { OperadorComPapel } from '@saas/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApiLocal } from '../demo/apiLocal';
import { apagarUsuariosDemo } from '../demo/usuariosDemo';
import { formatarBytes } from './dados/CartaoManutencao';
import { LimiteDeErro, usarRegistroDeErros } from './registroDeErros';
import { TelaDadosBackup } from './TelaDadosBackup';

beforeEach(() => {
  localStorage.clear();
  apagarUsuariosDemo();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FUSO = 'America/Sao_Paulo';
const AGORA = new Date('2026-11-26T15:00:00Z');
const agora = () => AGORA;
const SUPORTE: OperadorComPapel = { id: 'adm-sup', nome: 'Suporte', papel: 'super_admin' };
const ANA: OperadorComPapel = { id: 'ana', nome: 'Ana', papel: 'dono' };
const BRUNO: OperadorComPapel = { id: 'bruno', nome: 'Bruno', papel: 'vendedor' };
const api = (o: OperadorComPapel) => criarApiLocal({ lojaId: 'loja-a', operador: o, exemplos: false, atrasoMs: 0, agora });

function gravarMovimento(produtoId: string, quantidade: number) {
  const todos = JSON.parse(localStorage.getItem('saas-demo:estoque:v1') ?? '{}') as Record<string, unknown[]>;
  const mov = { id: `m-${produtoId}`, produtoId, tipo: 'ajuste', quantidade, criadoEm: '2026-11-26T10:00:00.000Z', motivo: 'Contagem', vendaId: null, vendaNumero: null, por: { id: 'ana', nome: 'Ana' } };
  localStorage.setItem('saas-demo:estoque:v1', JSON.stringify({ ...todos, 'loja-a': [...(todos['loja-a'] ?? []), mov] }));
}

async function parteDoAdmSup() {
  render(<TelaDadosBackup api={api(SUPORTE)} papel="super_admin" fuso={FUSO} agora={agora} />);
  await screen.findByLabelText('Nome da loja');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Partes de Dados e backup' })).getByRole('button', { name: 'Adm. Sup' }));
}

describe('Adm. Sup → manutenção', () => {
  it('o diagnóstico: versão, equipe, espaço, caixa e os registros de cada assunto', async () => {
    await api(ANA).listarUsuarios();
    await api(ANA).criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    await parteDoAdmSup();
    const diag = screen.getByRole('region', { name: 'Diagnóstico da loja' });
    expect(await within(diag).findByText('Gerado em 26/11/2026 às 12:00.')).toBeTruthy();
    const fato = (rotulo: string) => within(diag).getByText(rotulo).nextElementSibling?.textContent;
    expect([fato('Versão do sistema'), fato('Equipe'), fato('Erros no registro')]).toEqual(['V0.1', '3 ativos de 4', '0']);
    expect(fato('Caixa')).toBe('Hoje: não aberto · último fechado: — · a verificar: 0');
    expect(fato('Espaço')).toMatch(/^Esta loja: \d+(,\d)? KB · tudo no navegador: .+ de cerca de 5 MB$/);
    const assuntos = within(diag).getByRole('table', { name: 'Registros por assunto' });
    expect(within(assuntos).getByRole('row', { name: 'Produtos 1' })).toBeTruthy();
    expect(within(diag).getByText(/use “Desfazer o fechamento” na aba Caixa do dia/)).toBeTruthy();
    expect([formatarBytes(900), formatarBytes(2048), formatarBytes(1_572_864)]).toEqual(['900 bytes', '2 KB', '1,5 MB']);
  });

  it('conferir o estoque: o saldo negativo, "Zerar o saldo" com confirmação, e o movimento sem produto', async () => {
    const p = await api(ANA).criarProduto({ nome: 'Petisco', codigoBarras: null, precoCentavos: 1000 });
    gravarMovimento(p.id, -3);
    gravarMovimento('sumiu', 2);
    await parteDoAdmSup();
    const cartao = await screen.findByRole('region', { name: 'Conferir o estoque' });
    const lista = within(cartao).getByRole('list', { name: 'Produtos com saldo negativo' });
    expect(lista.textContent).toContain('PetiscoSaldo: -3 un');
    expect(within(cartao).getByText('1 movimento é de um produto que não existe mais (não muda nenhum saldo da lista).')).toBeTruthy();
    await userEvent.click(within(lista).getByRole('button', { name: 'Zerar o saldo de Petisco' }));
    await userEvent.click(within(within(cartao).getByRole('group', { name: 'Zerar o saldo de Petisco?' })).getByRole('button', { name: 'Sim, zerar' }));
    expect(await within(cartao).findByText('Saldo de Petisco zerado com um ajuste de +3 un (fica no histórico do produto).')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Conferir o estoque' })).getByText('Nenhum produto com saldo negativo.')).toBeTruthy());
  });

  it('o registro de erros: quem, a aba, o erro e as vezes; limpar com confirmação', async () => {
    await api(ANA).listarUsuarios();
    await api(BRUNO).registrarErro({ mensagem: 'TypeError: x is undefined', onde: 'app.js:10:5', tela: 'frente-de-caixa' });
    await parteDoAdmSup();
    const cartao = screen.getByRole('region', { name: 'Registro de erros' });
    const tabela = await within(cartao).findByRole('table', { name: 'Erros registrados' });
    const linha = within(tabela).getAllByRole('row')[1]!;
    expect(within(linha).getAllByRole('cell').map((c) => c.textContent)).toEqual(['26/11/2026 12:00', 'Bruno', 'Frente de caixa', 'TypeError: x is undefined · app.js:10:5', '1']);
    await userEvent.click(within(cartao).getByRole('button', { name: 'Limpar o registro' }));
    await userEvent.click(within(within(cartao).getByRole('group', { name: 'Limpar o registro de erros?' })).getByRole('button', { name: 'Sim, limpar o erro' }));
    expect(await within(cartao).findByText('Registro de erros limpo.')).toBeTruthy();
    expect(within(cartao).getByText('Nenhum erro registrado.')).toBeTruthy();
  });
});

describe('a captura dos erros das telas', () => {
  function Quebra({ quebrar }: { quebrar: boolean }): React.ReactNode {
    if (quebrar) throw new Error('falhou ao desenhar');
    return <p>Tela boa</p>;
  }

  it('a tela que quebra ao desenhar vira um aviso e o erro vai para o registro; "Tentar de novo" desenha de novo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // o React avisa no console do teste
    const aoErro = vi.fn();
    function Teste() {
      const [quebrar, setQuebrar] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setQuebrar(false)}>
            Consertar
          </button>
          <LimiteDeErro aoErro={aoErro}>
            <Quebra quebrar={quebrar} />
          </LimiteDeErro>
        </>
      );
    }
    render(<Teste />);
    expect(screen.getByRole('alert').textContent).toContain('Algo deu errado nesta tela');
    expect(aoErro).toHaveBeenCalledWith('Error: falhou ao desenhar', 'componente Quebra');
    await userEvent.click(screen.getByRole('button', { name: 'Consertar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByText('Tela boa')).toBeTruthy();
  });

  it('os erros que escapam (da página e de promessa recusada) vão para o registro com a aba de agora', async () => {
    const registrarErro = vi.fn().mockResolvedValue(undefined);
    const apiDoRegistro = { registrarErro };
    function Area({ tela }: { tela: string }) {
      usarRegistroDeErros(apiDoRegistro, tela);
      return null;
    }
    const { rerender, unmount } = render(<Area tela="clientes" />);
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is undefined'), message: 'x is undefined', filename: 'http://loja/assets/app.js', lineno: 10, colno: 5 }));
    await waitFor(() => expect(registrarErro).toHaveBeenCalledWith({ mensagem: 'TypeError: x is undefined', onde: 'app.js:10:5', tela: 'clientes' }));
    rerender(<Area tela="relatorios" />);
    const recusa = Object.assign(new Event('unhandledrejection'), { reason: 'sem rede' });
    window.dispatchEvent(recusa);
    await waitFor(() => expect(registrarErro).toHaveBeenLastCalledWith({ mensagem: 'sem rede', onde: null, tela: 'relatorios' }));
    // registrar que falha não atrapalha nada
    registrarErro.mockRejectedValueOnce(new Error('501'));
    window.dispatchEvent(new ErrorEvent('error', { message: 'outro' }));
    await waitFor(() => expect(registrarErro).toHaveBeenCalledTimes(3));
    unmount();
    window.dispatchEvent(new ErrorEvent('error', { message: 'depois de sair' }));
    expect(registrarErro).toHaveBeenCalledTimes(3);
  });
});
