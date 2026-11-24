// apps/web/src/Logo.tsx — logo PROVISÓRIA do SaaS (troque pelo arquivo da logo quando existir). No modelo do Luan
// (24/11/2026): a fachada da loja, em branco, num quadrado verde de cantos arredondados, e o nome ao lado.
import { MARCA } from './marca';

export function Logo({ tamanho = 'grande' }: { tamanho?: 'grande' | 'pequena' }) {
  return (
    <span className={`logo logo-${tamanho}`}>
      <svg className="logo-simbolo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect width="48" height="48" rx="12" fill="currentColor" />
        <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11.5 19 14.5 11h19l3 8" />
          <path d="M11.5 19c0 2.1 1.6 3.8 3.6 3.8s3.6-1.7 3.6-3.8c0 2.1 1.6 3.8 3.6 3.8h3.4c2 0 3.6-1.7 3.6-3.8 0 2.1 1.6 3.8 3.6 3.8s3.6-1.7 3.6-3.8" />
          <path d="M14 24v13h20V24M21 37v-7h6v7" />
        </g>
      </svg>
      <span className="logo-nome">{MARCA.nome}</span>
    </span>
  );
}
