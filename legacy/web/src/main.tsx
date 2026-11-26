// apps/web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilos.css';
import { MARCA } from './marca';
import { iniciarTema } from './tema';

document.title = MARCA.nome;
iniciarTema();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
