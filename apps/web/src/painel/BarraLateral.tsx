// apps/web/src/painel/BarraLateral.tsx
// Barra lateral copiada do DaniPets V9.3.3, nas cores do SaaS:
//   loja (logo + nome + descrição) · "Frente de caixa" em destaque · grupos
//   Operação / Cadastros / Gestão / Sistema · pessoa (inicial, nome, papel,
//   botão de tema, Trocar senha, Sair) · versão no rodapé.
// Itens que o papel não pode ver somem; grupo sem item visível some junto.
import { nomeDoPapel, type PapelNaLoja } from '@saas/core';
import { BotaoTema } from '../BotaoTema';
import { MARCA } from '../marca';
import { GRUPOS_MENU, type IdSecao, ITEM_CAIXA, type ItemMenu, podeVer } from './menu';

export interface DadosBarra {
  /** Dados da loja (Dados e backup → Dados da loja): sem logo, aparecem as iniciais do nome. */
  loja: { nome: string; descricao?: string | null; logo?: string | null };
  pessoa: { nome: string; papel: PapelNaLoja; permissoes?: readonly string[] | null };
}

interface Props extends DadosBarra {
  secao: IdSecao;
  aoEscolher: (id: IdSecao) => void;
  aoSair: () => void;
  /** "Trocar senha" da pessoa logada. */
  aoTrocarSenha?: () => void;
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

export function BarraLateral({ loja, pessoa, secao, aoEscolher, aoSair, aoTrocarSenha, versao = 'V0.1' }: Props) {
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

  const grupos = GRUPOS_MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => podeVer(i, pessoa)) })).filter(
    (g) => g.itens.length > 0,
  );

  return (
    <aside className="sidebar" aria-label="Barra lateral">
      <div className="brand">
        <div className="brandmark" aria-hidden="true">
          {loja.logo ? <img src={loja.logo} alt="" /> : iniciais(loja.nome)}
        </div>
        <div className="brandcopy">
          <strong>{loja.nome}</strong>
          {loja.descricao && <span>{loja.descricao}</span>}
        </div>
      </div>

      {podeVer(ITEM_CAIXA, pessoa) && botao(ITEM_CAIXA, ' nav-pos')}

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
            <small>{nomeDoPapel(pessoa.papel)}</small>
          </div>
          <BotaoTema className="sideuser-theme" />
        </div>
        <div className="sideuser-actions">
          <button type="button" onClick={aoTrocarSenha} disabled={!aoTrocarSenha}>
            Trocar senha
          </button>
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
