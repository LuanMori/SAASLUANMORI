// apps/web/src/painel/caixa/Modal.tsx
// Janela por cima da tela (desconto, autorização, devolução). Foco vai para o primeiro
// campo, Tab não sai da janela, Esc fecha e o foco volta para onde estava.
import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
  larga?: boolean;
}

const FOCAVEIS = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({ titulo, children, aoFechar, larga = false }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fechar.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const lista = [...ref.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (lista.length === 0) return;
      const primeiro = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      antes?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar.current();
      }}
    >
      <div ref={ref} className={`modal-caixa${larga ? ' modal-larga' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id} className="modal-titulo">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}
