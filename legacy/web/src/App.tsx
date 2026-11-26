// apps/web/src/App.tsx
// Sistema real com login próprio (revisão de 18/11/2026, item 5.4): usuário e senha conferidos no
// nosso servidor. A sessão fica num cookie HttpOnly que o JavaScript nem consegue ler; a tela só
// pergunta ao servidor "quem está logado?" (GET /sessao) e manda o login (POST /sessao).
// Senha provisória -> "Crie a sua senha" antes de qualquer outra coisa. 30 min sem uso -> sai.
import { pode } from '@saas/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { criarApiEntrada, criarApiServidor, ErroApi, type SessaoAtual } from './api';
import { configuracao } from './configuracao';
import type { IdSecao } from './painel/menu';
import { TelaPainel } from './painel/TelaPainel';
import { TelaCriarSenha } from './painel/TrocarSenha';
import { TelaEntrada } from './telas/TelaEntrada';

/**
 * Abas que o servidor já atende. As outras mostram um aviso até chegar a vez delas (a demonstração tem todas). Em Meu
 * usuário, trocar a senha já funciona; a foto e as entradas e saídas avisam dentro da aba.
 */
export const SECOES_COM_SERVIDOR: readonly IdSecao[] = ['usuarios', 'meu-usuario'];

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'falhou'; mensagem: string }
  | { tipo: 'entrada'; loja: { nome: string; subdominio: string } | null; aviso: string | null }
  | { tipo: 'logado'; sessao: SessaoAtual };

const SEM_SERVIDOR = 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';

interface Props {
  urlApi?: string;
  /** Endereço da loja quando o servidor não tem DOMINIO_BASE (desenvolvimento). */
  lojaDev?: string | null;
}

export function App({ urlApi = configuracao.apiUrl, lojaDev = configuracao.lojaDev }: Props) {
  const entrada = useMemo(() => criarApiEntrada(urlApi), [urlApi]);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const irParaEntrada = useCallback(
    async (aviso: string | null) => {
      try {
        const r = await entrada.lojaDaEntrada(lojaDev);
        setEstado({ tipo: 'entrada', loja: r.loja, aviso });
      } catch (e) {
        setEstado({ tipo: 'falhou', mensagem: e instanceof ErroApi && e.status !== 0 ? e.message : SEM_SERVIDOR });
      }
    },
    [entrada, lojaDev],
  );

  const comecar = useCallback(async () => {
    setEstado({ tipo: 'carregando' });
    try {
      const sessao = await entrada.sessaoAtual();
      if (sessao) setEstado({ tipo: 'logado', sessao });
      else await irParaEntrada(null);
    } catch {
      setEstado({ tipo: 'falhou', mensagem: SEM_SERVIDOR });
    }
  }, [entrada, irParaEntrada]);

  useEffect(() => {
    void comecar();
  }, [comecar]);

  const sair = useCallback(
    async (aviso: string | null = null) => {
      await entrada.sair().catch(() => undefined);
      await irParaEntrada(aviso);
    },
    [entrada, irParaEntrada],
  );

  // 401 em qualquer pedido da área logada (sessão vencida ou encerrada): volta para a entrada
  const api = useMemo(() => criarApiServidor(urlApi, (mensagem) => void irParaEntrada(mensagem)), [urlApi, irParaEntrada]);

  if (estado.tipo === 'carregando') return <p className="carregando-tela">Carregando…</p>;

  if (estado.tipo === 'falhou') {
    return (
      <div className="carregando-tela">
        <p role="alert">{estado.mensagem}</p>
        <button type="button" className="botao botao-primario" onClick={() => void comecar()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (estado.tipo === 'entrada') {
    return (
      <TelaEntrada
        loja={estado.loja}
        aviso={estado.aviso}
        aoEntrar={async (usuario, senha) => {
          try {
            const sessao = await entrada.entrar({ loja: lojaDev, usuario, senha });
            setEstado({ tipo: 'logado', sessao });
            return { ok: true };
          } catch (e) {
            return { ok: false, mensagem: e instanceof ErroApi ? e.message : SEM_SERVIDOR };
          }
        }}
      />
    );
  }

  const { sessao } = estado;
  if (sessao.senhaProvisoria) {
    return (
      <TelaCriarSenha
        api={api}
        loja={sessao.loja}
        pessoa={{ nome: sessao.usuario.nome, usuario: sessao.usuario.usuario }}
        aoTrocar={() => setEstado({ tipo: 'logado', sessao: { ...sessao, senhaProvisoria: false } })}
        aoBloquear={(mensagem) => void irParaEntrada(mensagem)}
        aoSair={() => void sair()}
      />
    );
  }

  return (
    <TelaPainel
      api={api}
      loja={{ nome: sessao.loja.nome }}
      pessoa={sessao.usuario}
      aoSair={() => void sair()}
      secaoInicial={pode(sessao.usuario, 'usuarios') ? 'usuarios' : 'visao-geral'}
      secoesDisponiveis={SECOES_COM_SERVIDOR}
      inatividadeMin={sessao.inatividadeMin}
      aoInatividade={() => void sair(`Sua sessão terminou depois de ${sessao.inatividadeMin} minutos sem uso. Entre de novo.`)}
      aoSessaoEncerrada={(mensagem) => void irParaEntrada(mensagem)}
    />
  );
}
