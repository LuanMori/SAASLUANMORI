// apps/web/src/demo/armazenamento.test.ts
// Gravação da demonstração: tudo ou nada, uma operação por vez, aviso de falha e as outras abas sabendo.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroApi } from '../api';
import {
  aoMudarEmOutraAba,
  aoMudarSituacao,
  comTrava,
  ErroGravacao,
  gravar,
  ler,
  MENSAGEM_CHEIO,
  MENSAGEM_RECUSOU,
  situacaoGravacao,
  testarGravacao,
  transacao,
  usarArmazenamentoParaTeste,
} from './armazenamento';

/** localStorage de mentira: `recusar` faz o navegador recusar gravar algumas chaves (cheio). */
class Falso implements Storage {
  dados = new Map<string, string>();
  recusar = new Set<string>();
  outroErro = false;
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(k: string) {
    return this.dados.get(k) ?? null;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.recusar.has(k) || this.recusar.has('*')) {
      throw this.outroErro ? new Error('SecurityError') : new DOMException('cheio', 'QuotaExceededError');
    }
    this.dados.set(k, v);
  }
}

afterEach(() => usarArmazenamentoParaTeste(localStorage));

describe('tudo ou nada', () => {
  it('as gravações da transação vão juntas no fim; dentro dela, a leitura já vê o que foi gravado', () => {
    const s = new Falso();
    usarArmazenamentoParaTeste(s);
    const r = transacao(() => {
      gravar('saas-demo:a', [1]);
      expect(s.getItem('saas-demo:a')).toBeNull(); // ainda não foi para o navegador
      expect(ler('saas-demo:a', [])).toEqual([1]);
      gravar('saas-demo:b', { x: 2 });
      return 'pronto';
    });
    expect(r).toBe('pronto');
    expect(s.getItem('saas-demo:a')).toBe('[1]');
    expect(ler('saas-demo:b', {})).toEqual({ x: 2 });
  });

  it('erro no meio: nada é gravado', () => {
    const s = new Falso();
    usarArmazenamentoParaTeste(s);
    expect(() =>
      transacao(() => {
        gravar('saas-demo:a', 1);
        throw new Error('estoque insuficiente');
      }),
    ).toThrow('estoque insuficiente');
    expect(s.dados.size).toBe(0);
  });

  it('o navegador recusa a segunda gravação: a primeira é desfeita, a operação é recusada e o aviso aparece', () => {
    const s = new Falso();
    s.dados.set('saas-demo:vendas', '["antiga"]');
    usarArmazenamentoParaTeste(s);
    const avisos = vi.fn();
    const parar = aoMudarSituacao(avisos);
    s.recusar.add('saas-demo:lancamentos');
    expect(() =>
      transacao(() => {
        gravar('saas-demo:vendas', ['antiga', 'nova']);
        gravar('saas-demo:lancamentos', ['entrada']);
      }),
    ).toThrow(ErroGravacao);
    expect(s.getItem('saas-demo:vendas')).toBe('["antiga"]'); // a venda nova não ficou sem o financeiro
    expect(s.getItem('saas-demo:lancamentos')).toBeNull();
    expect(situacaoGravacao()).toMatchObject({ tipo: 'falhou', mensagem: MENSAGEM_CHEIO });
    expect(avisos).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'falhou' }));

    // voltou a gravar: o aviso some sozinho
    s.recusar.clear();
    gravar('saas-demo:vendas', ['antiga', 'nova']);
    expect(situacaoGravacao()).toEqual({ tipo: 'ok' });
    parar();
  });

  it('chave nova que não pôde ser gravada é apagada ao desfazer; erro que não é de espaço tem outra mensagem', () => {
    const s = new Falso();
    usarArmazenamentoParaTeste(s);
    s.recusar.add('saas-demo:b');
    s.outroErro = true;
    expect(() =>
      transacao(() => {
        gravar('saas-demo:a', 1);
        gravar('saas-demo:b', 2);
      }),
    ).toThrow(MENSAGEM_RECUSOU);
    expect(s.dados.has('saas-demo:a')).toBe(false);
  });

  it('transação dentro de transação faz parte da de fora; transação assíncrona é erro de programação', () => {
    const s = new Falso();
    usarArmazenamentoParaTeste(s);
    transacao(() => {
      gravar('saas-demo:a', 1);
      transacao(() => gravar('saas-demo:b', 2));
      expect(s.dados.size).toBe(0);
    });
    expect(s.dados.size).toBe(2);
    expect(() => transacao(() => Promise.resolve(1))).toThrow(/síncrona/);
  });

  it('dado ilegível conta como vazio', () => {
    const s = new Falso();
    s.dados.set('saas-demo:x', '{quebrado');
    usarArmazenamentoParaTeste(s);
    expect(ler('saas-demo:x', [])).toEqual([]);
  });
});

describe('navegador que não deixa guardar', () => {
  it('sem armazenamento: avisa e guarda só nesta aba', () => {
    usarArmazenamentoParaTeste(null);
    expect(situacaoGravacao()).toEqual({ tipo: 'so-memoria' });
    gravar('saas-demo:a', [1]);
    expect(ler('saas-demo:a', [])).toEqual([1]);
    expect(testarGravacao()).toBe(false);
  });

  it('cheio desde a abertura: avisa; "Tentar gravar de novo" confere e tira o aviso quando volta', () => {
    const s = new Falso();
    s.recusar.add('*');
    usarArmazenamentoParaTeste(s);
    expect(situacaoGravacao().tipo).toBe('falhou');
    expect(testarGravacao()).toBe(false);
    s.recusar.clear();
    expect(testarGravacao()).toBe(true);
    expect(situacaoGravacao()).toEqual({ tipo: 'ok' });
  });
});

describe('uma operação por vez', () => {
  it('a segunda espera a primeira terminar', async () => {
    const ordem: string[] = [];
    const lenta = comTrava(async () => {
      ordem.push('1 começou');
      await new Promise((r) => setTimeout(r, 20));
      ordem.push('1 terminou');
    });
    const rapida = comTrava(() => {
      ordem.push('2 começou');
    });
    await Promise.all([lenta, rapida]);
    expect(ordem).toEqual(['1 começou', '1 terminou', '2 começou']);
  });

  it('uma operação que falha não trava as próximas; a recusa do navegador vira erro da API (507)', async () => {
    const s = new Falso();
    usarArmazenamentoParaTeste(s);
    await expect(comTrava(() => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    s.recusar.add('saas-demo:a');
    const e = await comTrava(() => transacao(() => gravar('saas-demo:a', 1))).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroApi);
    expect(e).toMatchObject({ status: 507, codigo: 'gravacao_recusada' });
    await expect(comTrava(() => 'segue')).resolves.toBe('segue');
  });
});

describe('as outras abas ficam sabendo', () => {
  it('junta as gravações de uma operação num aviso só e ignora o que não é da demonstração', async () => {
    const f = vi.fn();
    const parar = aoMudarEmOutraAba(f, 10);
    window.dispatchEvent(new StorageEvent('storage', { key: 'saas-demo:vendas:v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'saas-demo:estoque:v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'outro-sistema' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'saas-demo:sonda' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(f).toHaveBeenCalledOnce();
    expect(f).toHaveBeenCalledWith(['saas-demo:vendas:v1', 'saas-demo:estoque:v1']);
    parar();
    window.dispatchEvent(new StorageEvent('storage', { key: 'saas-demo:vendas:v1' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(f).toHaveBeenCalledOnce();
  });
});
