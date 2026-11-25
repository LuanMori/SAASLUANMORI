// Cliente HTTP da interface HTML.
// Cliente HTTP da API. O token do Auth0 vai no Authorization; a LOJA não é
// enviada pelo frontend em lugar nenhum — a API descobre pelo token.


export class ErroApi extends Error {
  constructor(status, mensagem, erros = []) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.erros = erros;
  }
}


export function criarApi(urlBase, obterToken) {
  async function chamar(caminho, init = {}) {
    let token;
    try {
      token = await obterToken();
    } catch {
      throw new ErroApi(401, 'Sua sessão expirou. Entre novamente.');
    }

    let resposta;
    try {
      resposta = await fetch(`${urlBase}${caminho}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {
      throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a internet.');
    }

    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const c = (corpo ?? {});
      throw new ErroApi(
        resposta.status,
        typeof c.mensagem === 'string' ? c.mensagem : 'Algo deu errado. Tente novamente.',
        Array.isArray(c.erros) ? (c.erros) : [],
      );
    }
    return corpo;
  }

  return {
    listarProdutos: async () => (await chamar('/produtos')).itens,
    criarProduto: (dados) => chamar('/produtos', { method: 'POST', body: JSON.stringify(dados) }),
  };
}
