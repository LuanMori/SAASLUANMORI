// apps/web/src/painel/registroDeErros.tsx
// REGISTRO DE ERROS (Adm. Sup, módulo 13h): o erro inesperado na tela de alguém da loja vai para o registro do suporte
// (Dados e backup → Adm. Sup → Registro de erros), sem precisar pedir print:
//   - usarRegistroDeErros: escuta os erros que escapam (o "error" da página e a promessa recusada sem tratamento);
//   - LimiteDeErro: se uma tela quebra ao desenhar, mostra um aviso no lugar dela (a barra e o resto continuam) e
//     registra o erro; "Tentar de novo" desenha a tela outra vez.
// Registrar nunca atrapalha a pessoa: sem essa parte no servidor, ou sem espaço, segue sem registrar.
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import type { ApiManutencao } from '../api';

type ApiDoRegistro = Pick<ApiManutencao, 'registrarErro'>;

/** "TypeError: Cannot read properties of undefined (reading 'nome')". */
export const mensagemDoErro = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e === 'string' ? e : 'Erro desconhecido');

/** "arquivo.js:linha:coluna": do evento, ou da primeira linha da pilha que aponta para o código. */
export function ondeDoErro(e: unknown, arquivo?: string, linha?: number, coluna?: number): string | null {
  if (arquivo) return `${arquivo.split(/[/\\]/).pop()}:${linha ?? 0}:${coluna ?? 0}`;
  const pilha = e instanceof Error ? (e.stack ?? '') : '';
  const m = /\(?([^()\s]+):(\d+):(\d+)\)?/.exec(pilha.split('\n').slice(1).join('\n'));
  return m ? `${m[1]!.split(/[/\\]/).pop()}:${m[2]}:${m[3]}` : null;
}

/** Manda o erro para o registro; qualquer falha ao registrar é ignorada (até a que acontece na hora de chamar). */
export function registrar(api: ApiDoRegistro, mensagem: string, onde: string | null, tela: string): void {
  void Promise.resolve()
    .then(() => api.registrarErro({ mensagem, onde, tela }))
    .catch(() => undefined);
}

/** Enquanto a área logada está aberta, os erros que escapam vão para o registro, com a aba em que a pessoa estava. */
export function usarRegistroDeErros(api: ApiDoRegistro, tela: string): void {
  const telaAtual = useRef(tela);
  telaAtual.current = tela;
  useEffect(() => {
    const aoErro = (ev: ErrorEvent) =>
      registrar(api, ev.error ? mensagemDoErro(ev.error) : ev.message || 'Erro desconhecido', ondeDoErro(ev.error, ev.filename, ev.lineno, ev.colno), telaAtual.current);
    const aoRecusar = (ev: PromiseRejectionEvent) => registrar(api, mensagemDoErro(ev.reason), ondeDoErro(ev.reason), telaAtual.current);
    window.addEventListener('error', aoErro);
    window.addEventListener('unhandledrejection', aoRecusar);
    return () => {
      window.removeEventListener('error', aoErro);
      window.removeEventListener('unhandledrejection', aoRecusar);
    };
  }, [api]);
}

interface PropsDoLimite {
  /** Recebe o erro de desenho da tela (a mensagem e o componente). */
  aoErro: (mensagem: string, onde: string | null) => void;
  children: ReactNode;
}

/** Se a tela quebrar ao desenhar, mostra o aviso no lugar dela e registra (use `key` da aba: trocar de aba recomeça). */
export class LimiteDeErro extends Component<PropsDoLimite, { quebrou: boolean }> {
  override state = { quebrou: false };

  static getDerivedStateFromError(): { quebrou: boolean } {
    return { quebrou: true };
  }

  override componentDidCatch(e: unknown, info: ErrorInfo): void {
    const componente = /^\s*at (\S+)/m.exec(info.componentStack ?? '')?.[1];
    this.props.aoErro(mensagemDoErro(e), componente ? `componente ${componente}` : ondeDoErro(e));
  }

  override render(): ReactNode {
    if (!this.state.quebrou) return this.props.children;
    return (
      <section className="card limite-erro" role="alert" aria-labelledby="limite-erro-titulo">
        <h2 id="limite-erro-titulo">Algo deu errado nesta tela</h2>
        <p className="suave">O erro foi guardado para o suporte. Tente de novo; se continuar, fale com o suporte.</p>
        <div className="modal-acoes">
          <button type="button" className="botao botao-primario" onClick={() => this.setState({ quebrou: false })}>
            Tentar de novo
          </button>
        </div>
      </section>
    );
  }
}
