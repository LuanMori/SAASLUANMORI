// apps/web/src/Logo.tsx — logo PROVISÓRIA do SaaS (troque pelo arquivo da logo quando existir).
import { MARCA } from './marca';

export function Logo({ tamanho = 'grande' }: { tamanho?: 'grande' | 'pequena' }) {
  return (
    <span className={`logo logo-${tamanho}`}>
      <svg className="logo-simbolo" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" />
        <path d="M13 26V14l7 7 7-7v12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo-nome">{MARCA.nome}</span>
    </span>
  );
}
