// apps/web/src/demo/AvisosDaDemo.test.tsx — avisos fixos da demonstração (DaniPets ACE-13 e ACE-14).
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { gravar, usarArmazenamentoParaTeste } from './armazenamento';
import { AvisosDaDemo, riscoDoAmbiente } from './AvisosDaDemo';

afterEach(() => {
  cleanup();
  usarArmazenamentoParaTeste(localStorage);
});

const CHROME = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0';

describe('onde a demonstração foi aberta', () => {
  it('arquivo no Chrome ou no Edge: sem aviso', () => {
    expect(riscoDoAmbiente(CHROME, 'file:', false)).toBeNull();
    expect(riscoDoAmbiente(CHROME, 'https:', false)).toBeNull();
  });
  it('dentro de outra página ou aplicativo (e-mail, Drive): avisa', () => {
    expect(riscoDoAmbiente(CHROME, 'https:', true)).toMatch(/dentro de uma visualização/);
    expect(riscoDoAmbiente(`${CHROME} Electron/30.0`, 'file:', false)).toMatch(/dentro de uma visualização/);
  });
  it('arquivo no Firefox: avisa que cada cópia guarda os dados separados', () => {
    expect(riscoDoAmbiente(FIREFOX, 'file:', false)).toMatch(/Firefox/);
    expect(riscoDoAmbiente(FIREFOX, 'https:', false)).toBeNull();
  });
});

describe('aviso de gravação', () => {
  it('aparece quando o navegador recusa gravar e some quando volta', async () => {
    let cheio = true;
    const s: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        if (cheio) throw new DOMException('cheio', 'QuotaExceededError');
      },
    };
    usarArmazenamentoParaTeste(s); // já começa cheio
    render(<AvisosDaDemo risco={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/não está deixando gravar \(O armazenamento do navegador está cheio/);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar gravar de novo' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Ainda não foi possível gravar/);
    cheio = false;
    act(() => gravar('saas-demo:x', 1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('navegador que não guarda nada: avisa que some ao fechar', () => {
    usarArmazenamentoParaTeste(null);
    render(<AvisosDaDemo risco="qualquer risco" />);
    const alertas = screen.getAllByRole('alert');
    expect(alertas).toHaveLength(1); // o aviso de risco não repete o mesmo problema
    expect(alertas[0]!.textContent).toMatch(/não deixa a demonstração guardar dados/);
  });

  it('risco do ambiente aparece sozinho quando a gravação está normal', () => {
    render(<AvisosDaDemo risco="Atenção: aberto dentro do e-mail." />);
    expect(screen.getByRole('alert').textContent).toBe('Atenção: aberto dentro do e-mail.');
  });
});
