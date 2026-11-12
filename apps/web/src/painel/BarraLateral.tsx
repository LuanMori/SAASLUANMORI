// apps/web/src/painel/BarraLateral.tsx
// Barra lateral copiada do DaniPets V9.3.3, nas cores do SaaS:
//   loja (logo + nome + descrição) · "Frente de caixa" em destaque · grupos
//   Operação / Cadastros / Gestão / Sistema · pessoa (inicial, nome, papel,
//   botão de tema, Trocar senha, Sair) · versão no rodapé.
// Itens que o papel não pode ver somem; grupo sem item visível some junto.
import type { PapelDeLoja } from '@saas/core';
import { MARCA } from '../marca';
import { GRUPOS_MENU, type IdSecao, ITEM_CAIXA, type ItemMenu, podeVer } from './menu';

export const NOME_PAPEL: Record<PapelDeLoja, string> = {
  dono: 'Dono',
  administrador: 'Administrador',
  vendedor: 'Vendedor',
};

export interface DadosBarra {
  loja: { nome: string; descricao?: string | null };
  pessoa: { nome: string; papel: PapelDeLoja };
}

interface Props extends DadosBarra {
  secao: IdSecao;
  aoEscolher: (id: IdSecao) => void;
  aoSair: () => void;
  versao?: string;
}

/** "Pet Shop da Ana" -> "PA"; "Loja A" -> "LA" (logo provisória da loja). */
export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z0-9]$/.test(p));
  const letras = (partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes).map((p) => p?.[0] ?? '');
  return (letras.join('') || nome.trim().charAt(0)).toUpperCase() || '?';
}

export function BarraLateral({ loja, pessoa, secao, aoEscolher, aoSair, versao = 'V0.1' }: Props) {
  const botao = (item: ItemMenu, extra = '') => (
    <button
      key={item.id}
      type="button"
      className={`nav${extra}${item.id === secao ? ' active' : ''}`}
      aria-current={item.id === secao ? 'page' : undefined}
      onClick={() => aoEscolher(item.id)}
    >
      {item.icone}
      <span>{item.rotulo}</span>
    </button>
  );

  const grupos = GRUPOS_MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => podeVer(i, pessoa.papel)) })).filter(
    (g) => g.itens.length > 0,
  );

  return (
    <aside className="sidebar" aria-label="Barra lateral">
      <div className="brand">
        <div className="brandmark" aria-hidden="true">
          {iniciais(loja.nome)}
        </div>
        <div className="brandcopy">
          <strong>{loja.nome}</strong>
          {loja.descricao && <span>{loja.descricao}</span>}
        </div>
      </div>

      {botao(ITEM_CAIXA, ' nav-pos')}

      <nav className="navlist" aria-label="Menu principal">
        {grupos.map((g) => (
          <div key={g.titulo} className="navsec" role="group" aria-label={g.titulo}>
            <div className="navgroup" aria-hidden="true">
              {g.titulo}
            </div>
            {g.itens.map((i) => botao(i))}
          </div>
        ))}
      </nav>

      <div className="sideuser">
        <div className="sideuser-id">
          <span className="sideuser-avatar" aria-hidden="true">
            {(pessoa.nome.trim().charAt(0) || '?').toUpperCase()}
          </span>
          <div className="sideuser-name">
            <b>{pessoa.nome}</b>
            <small>{NOME_PAPEL[pessoa.papel]}</small>
          </div>
          {/* Tema escuro e Trocar senha ainda não fazem nada (entram depois). */}
          <button type="button" className="sideuser-theme" aria-label="Trocar o tema (claro ou escuro)" title="Trocar o tema">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
            </svg>
          </button>
        </div>
        <div className="sideuser-actions">
          <button type="button">Trocar senha</button>
          <button type="button" onClick={aoSair}>
            Sair
          </button>
        </div>
      </div>
      <div className="sidefoot">
        {versao} • {MARCA.nome}
      </div>
    </aside>
  );
}
