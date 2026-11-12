// apps/web/src/demo/main.tsx — entrada do sistema-padrao-demo.html (ver npm run build:demo).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../estilos.css';
import './demo.css';
import { DemoApp } from './DemoApp';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
