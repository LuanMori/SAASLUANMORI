// apps/web/src/demo/apiLocal.ts
// SÓ PARA A DEMONSTRAÇÃO (sistema-padrao-demo.html): faz o papel da API, mas
// guarda os produtos no próprio navegador (localStorage), separados por loja.
// Segue as mesmas regras de apps/api/src/produtos (validação do @saas/core,
// código interno sequencial por loja, código de barras único e diferente de
// qualquer código interno, mesmas mensagens de erro).
//
// NÃO é segurança: aqui não há Auth0, RLS nem servidor. Serve para testar telas
// e regras de cadastro sem instalar nada.
import { formatarCodigoInterno, validarNovoProduto } from '@saas/core';
import { type ApiProdutos, ErroApi, type Produto } from '../api';

const CHAVE = 'saas-demo:produtos:v1';

type Banco = Record<string, Produto[]>;

let memoria: Banco = {};

function lerBanco(): Banco {
  try {
    const texto = localStorage.getItem(CHAVE);
    return texto ? (JSON.parse(texto) as Banco) : memoria;
  } catch {
    return memoria;
  }
}

function gravarBanco(banco: Banco): void {
  memoria = banco;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(banco));
  } catch {
    // Navegador sem localStorage (ex.: aba anônima restrita): fica só na memória.
  }
}

export function apagarDadosDemo(): void {
  memoria = {};
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* sem localStorage */
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface OpcoesApiLocal {
  /** Identificador da loja ativa (no sistema real vem do token, nunca do cliente). */
  lojaId: string;
  /** Simula a pessoa não cadastrada pelo dono: a API responde 403. */
  bloqueio?: string | null;
}

export function criarApiLocal({ lojaId, bloqueio = null }: OpcoesApiLocal): ApiProdutos {
  return {
    async listarProdutos() {
      await esperar(120);
      if (bloqueio) throw new ErroApi(403, bloqueio);
      return [...(lerBanco()[lojaId] ?? [])].sort(
        (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id),
      );
    },

    async criarProduto(dados) {
      await esperar(250);
      if (bloqueio) throw new ErroApi(403, bloqueio);

      const validacao = validarNovoProduto(dados);
      if (!validacao.ok) throw new ErroApi(400, 'Dados do produto inválidos.', validacao.erros);
      const novo = validacao.valor;

      const banco = lerBanco();
      const daLoja = banco[lojaId] ?? [];
      const comCodigo = (codigo: string) =>
        daLoja.find((p) => p.codigoInterno === codigo || p.codigoBarras === codigo) ?? null;

      if (novo.codigoBarras) {
        const dono = comCodigo(novo.codigoBarras);
        if (dono) {
          throw new ErroApi(
            409,
            `Código de barras repetido: ${novo.codigoBarras} já está vinculado ao produto "${dono.nome}".`,
            [{ campo: 'codigoBarras', mensagem: `Já usado em "${dono.nome}".` }],
          );
        }
      }

      // Maior código interno da loja + 1, pulando números já usados como código de barras.
      let numero = daLoja.reduce((maior, p) => Math.max(maior, Number(p.codigoInterno)), 0) + 1;
      let codigoInterno = formatarCodigoInterno(numero);
      while (codigoInterno === novo.codigoBarras || comCodigo(codigoInterno)) {
        numero += 1;
        codigoInterno = formatarCodigoInterno(numero);
      }

      const agora = new Date().toISOString();
      const produto: Produto = {
        id: novoId(),
        codigoInterno,
        codigoBarras: novo.codigoBarras,
        nome: novo.nome,
        precoCentavos: novo.precoCentavos,
        ativo: true,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      gravarBanco({ ...banco, [lojaId]: [...daLoja, produto] });
      return produto;
    },
  };
}
