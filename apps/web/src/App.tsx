// apps/web/src/App.tsx
import { useAuth0 } from '@auth0/auth0-react';
import { useMemo } from 'react';
import { criarApi } from './api';
import { configuracao } from './configuracao';
import { TelaLogin } from './telas/TelaLogin';
import { TelaProdutos } from './telas/TelaProdutos';

export function App() {
  const { isLoading, isAuthenticated, error, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();

  const api = useMemo(
    () =>
      criarApi(configuracao.apiUrl, async () => {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error('sem token');
        return token;
      }),
    [getAccessTokenSilently],
  );

  if (isLoading) {
    return <p className="carregando-tela">Carregando…</p>;
  }

  if (!isAuthenticated) {
    return <TelaLogin aoEntrar={() => void loginWithRedirect()} erro={error ? 'Não foi possível entrar. Tente novamente.' : null} />;
  }

  const sessao = {
    nome: user?.name ?? user?.email ?? 'Usuário',
    // org_name vem no token quando o tenant usa nomes de Organization (ver docs/AUTH0.md).
    loja: typeof user?.org_name === 'string' ? user.org_name : null,
  };

  return (
    <TelaProdutos
      api={api}
      sessao={sessao}
      aoSair={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
    />
  );
}
