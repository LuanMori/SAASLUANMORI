// apps/web/src/BotaoTema.tsx — botão do tema claro / escuro (DaniPets: "☾ Tema escuro" / "☀ Tema claro").
// O mesmo botão na barra lateral e na tela de entrada (pedido do Luan, 24/11/2026): a escolha fica neste
// navegador e vale para todas as telas, antes e depois de entrar (tema.ts).
import { usarTema } from './tema';

export function BotaoTema({ className }: { className: string }) {
  const { tema, alternar } = usarTema();
  const proximo = tema === 'escuro' ? 'claro' : 'escuro';
  return (
    <button type="button" className={className} aria-label={`Usar o tema ${proximo}`} title={`Tema ${proximo}`} onClick={alternar}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {tema === 'escuro' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}
