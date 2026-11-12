// apps/web/src/main.tsx
import { Auth0Provider } from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { configuracao, erroConfiguracao } from './configuracao';
import './estilos.css';

const raiz = createRoot(document.getElementById('raiz')!);

if (erroConfiguracao) {
  raiz.render(<p className="carregando-tela">{erroConfiguracao}</p>);
} else {
  raiz.render(
    <StrictMode>
      <Auth0Provider
        domain={configuracao.auth0Domain}
        clientId={configuracao.auth0ClientId}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: configuracao.auth0Audience,
        }}
        // Tokens só em memória (nunca em localStorage: menos exposição a XSS).
        // Ao recarregar a página, a sessão é recuperada pelo Auth0 via iframe; em
        // produção use o custom domain do Auth0 (login.<dominio>) para isso funcionar
        // em navegadores que bloqueiam cookie de terceiros (ver docs/AUTH0.md).
        cacheLocation="memory"
        useRefreshTokens
        useRefreshTokensFallback
      >
        <App />
      </Auth0Provider>
    </StrictMode>,
  );
}
