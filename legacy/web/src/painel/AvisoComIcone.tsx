// apps/web/src/painel/AvisoComIcone.tsx
// Aviso com ícone (DaniPets V9.3.3 .alert): atenção (amarelo, triângulo), erro (vermelho, octógono), ok (verde,
// círculo com visto) ou informação (verde, círculo com "i": os avisos do suporte). Opcional: botões à direita (`acao`).
import type { ReactNode } from 'react';

interface Props {
  tipo: 'atencao' | 'erro' | 'ok' | 'info';
  /** status = informa; alert = precisa de atenção já (o leitor de tela lê na hora). */
  papel: 'status' | 'alert';
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function AvisoComIcone({ tipo, papel, acao, className = '', children }: Props) {
  return (
    <div className={`cx-aviso cx-aviso-${tipo}${className ? ` ${className}` : ''}`} role={papel}>
      <svg className="cx-aviso-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {tipo === 'erro' ? (
          <>
            <path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z" />
            <path d="M12 7.5v5M12 16.5h.01" />
          </>
        ) : tipo === 'ok' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12.5 2.7 2.7L16 9.8" />
          </>
        ) : tipo === 'info' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5.5M12 7.5h.01" />
          </>
        ) : (
          <>
            <path d="M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
            <path d="M12 9.5v4M12 17h.01" />
          </>
        )}
      </svg>
      <p className="cx-aviso-texto">{children}</p>
      {acao}
    </div>
  );
}
