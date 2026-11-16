// apps/web/src/demo/main.tsx — entrada do sistema-padrao-demo.html (ver npm run build:demo).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../estilos.css';
import './demo.css';
import { MARCA } from '../marca';
import { DemoApp } from './DemoApp';

document.title = `${MARCA.nome} — demonstração`;

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
