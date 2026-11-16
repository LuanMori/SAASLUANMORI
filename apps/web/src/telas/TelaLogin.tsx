// apps/web/src/telas/TelaLogin.tsx
// O login acontece na tela do Auth0 (Universal Login). Quem pertence a mais
// de uma loja escolhe a loja lá, depois de se identificar.
import { Logo } from '../Logo';
import { MARCA } from '../marca';

interface Props {
  aoEntrar: () => void;
  erro?: string | null;
}

export function TelaLogin({ aoEntrar, erro }: Props) {
  return (
    <main className="login">
      <div className="login-cartao">
        <Logo />
        <h1 className="sr-only">{MARCA.nome}</h1>
        <p className="suave">Gestão da sua loja</p>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <button type="button" className="botao botao-primario botao-grande" onClick={aoEntrar}>
          Entrar
        </button>
      </div>
    </main>
  );
}
