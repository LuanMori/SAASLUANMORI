// apps/web/src/painel/BarraLateral.tsx
// Barra lateral no formato do DaniPets: loja no topo, itens do menu, bloco da
// pessoa (nome, papel, trocar senha, sair, tema) e a marca do SaaS no rodapé.
import { Logo } from '../Logo';
import { type IdSecao, ITENS_MENU } from './menu';

export interface DadosBarra {
  loja: { nome: string; descricao?: string | null };
  pessoa: { nome: string; papel: string };
}

interface Props extends DadosBarra {
  secao: IdSecao;
  aoEscolher: (id: IdSecao) => void;
  aoSair: () => void;
  /** Versão mostrada no rodapé. */
  versao?: string;
  id?: string;
  aberta?: boolean;
}

/** "Pet Shop da Ana" -> "PA"; "Loja A" -> "LA". */
export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z0-9]$/.test(p));
  const letras = (partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes).map((p) => p?.[0] ?? '');
  return (letras.join('') || nome.trim().charAt(0)).toUpperCase() || '?';
}

export function BarraLateral({ loja, pessoa, secao, aoEscolher, aoSair, versao = 'V0.1', id, aberta = false }: Props) {
  return (
    <aside id={id} className={`barra${aberta ? ' barra-aberta' : ''}`} aria-label="Menu">
      <div className="barra-loja">
        <span className="barra-loja-logo" aria-hidden="true">
          {iniciais(loja.nome)}
        </span>
        <div className="barra-loja-texto">
          <strong>{loja.nome}</strong>
          {loja.descricao && <span>{loja.descricao}</span>}
        </div>
      </div>

      <nav className="barra-nav" aria-label="Menu principal">
        {ITENS_MENU.map((item) => (
          <button
            key={item.id}
            type="button"
            className="barra-item"
            aria-current={item.id === secao ? 'page' : undefined}
            onClick={() => aoEscolher(item.id)}
          >
            {item.icone}
            <span>{item.rotulo}</span>
          </button>
        ))}
      </nav>

      <div className="barra-pessoa">
        <div className="barra-pessoa-nome">
          <b>{pessoa.nome}</b>
          <small>{pessoa.papel}</small>
        </div>
        <div className="barra-pessoa-acoes">
          {/* Trocar senha e tema escuro ainda não fazem nada (entram depois). */}
          <button type="button" className="barra-mini">
            Trocar senha
          </button>
          <button type="button" className="barra-mini" onClick={aoSair}>
            Sair
          </button>
        </div>
        <button type="button" className="barra-mini barra-mini-largo">
          <svg className="barra-icone-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
          </svg>
          Tema escuro
        </button>
      </div>

      <div className="barra-rodape">
        <Logo tamanho="pequena" />
        <span>{versao}</span>
      </div>
    </aside>
  );
}
