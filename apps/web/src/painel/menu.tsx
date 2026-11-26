// apps/web/src/painel/menu.tsx — itens da barra lateral, copiados do DaniPets V9.3.3:
// "Frente de caixa" em destaque acima do menu e os outros itens em grupos
// (Operação, Cadastros, Gestão, Sistema). Para mudar a barra, mexa só nesta lista.
import { type AjustesDaLoja, type Permissao, pode, type QuemAcessa, type RecursoDaLoja, recursoLigado } from '@saas/core';
import type { ReactNode } from 'react';

export type IdSecao =
  | 'visao-geral'
  | 'frente-de-caixa'
  | 'caixa-do-dia'
  | 'produtos-e-estoque'
  | 'compras'
  | 'clientes'
  | 'financeiro'
  | 'relatorios'
  | 'dados-e-backup'
  | 'usuarios'
  | 'suporte'
  | 'meu-usuario';

export interface ItemMenu {
  id: IdSecao;
  rotulo: string;
  icone: ReactNode;
  /** Quem não tem esta permissão não vê o item (matriz única de @saas/core/permissoes; DaniPets: PAGE_PERM). */
  permissao?: Permissao;
  /** Some de todos quando o suporte desliga este recurso na loja (Adm. Sup → Ajustes desta loja, módulo 13f). */
  recurso?: RecursoDaLoja;
}

export interface GrupoMenu {
  titulo: string;
  itens: readonly ItemMenu[];
}

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg className="barra-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ITENS: readonly ItemMenu[] = [
  {
    id: 'visao-geral',
    rotulo: 'Visão geral',
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icone>
    ),
  },
  {
    id: 'frente-de-caixa',
    rotulo: 'Frente de caixa',
    permissao: 'vender',
    icone: (
      <Icone>
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
      </Icone>
    ),
  },
  {
    id: 'caixa-do-dia',
    rotulo: 'Caixa do dia',
    permissao: 'caixa',
    icone: (
      <Icone>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 12h.01M18 12h.01" />
      </Icone>
    ),
  },
  {
    id: 'produtos-e-estoque',
    rotulo: 'Produtos e estoque',
    icone: (
      <Icone>
        <path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z" />
        <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
      </Icone>
    ),
  },
  {
    id: 'compras',
    permissao: 'compras',
    recurso: 'compras',
    rotulo: 'Compras',
    icone: (
      <Icone>
        <path d="M14 17V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11h2M14 9h4l3 3.5V17h-2M9 17h6" />
        <circle cx="7" cy="17.5" r="2" />
        <circle cx="17" cy="17.5" r="2" />
      </Icone>
    ),
  },
  {
    id: 'clientes',
    rotulo: 'Clientes',
    permissao: 'clientes',
    icone: (
      <Icone>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.1 2.5 3.5 5.2" />
      </Icone>
    ),
  },
  {
    id: 'financeiro',
    permissao: 'financeiro',
    recurso: 'financeiro',
    rotulo: 'Financeiro',
    icone: (
      <Icone>
        <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />
      </Icone>
    ),
  },
  {
    id: 'relatorios',
    permissao: 'relatorios',
    recurso: 'relatorios',
    rotulo: 'Relatórios',
    icone: (
      <Icone>
        <path d="M4 4v16h16M8.5 16v-4M13 16V8M17.5 16v-6" />
      </Icone>
    ),
  },
  {
    id: 'dados-e-backup',
    permissao: 'dados',
    rotulo: 'Dados e backup',
    icone: (
      <Icone>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
        <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
      </Icone>
    ),
  },
  {
    id: 'usuarios',
    permissao: 'usuarios',
    rotulo: 'Usuários',
    icone: (
      <Icone>
        <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
        <circle cx="12" cy="10" r="2.3" />
        <path d="M8.6 16c.7-1.5 1.9-2.3 3.4-2.3s2.7.8 3.4 2.3" />
      </Icone>
    ),
  },
  {
    id: 'suporte',
    rotulo: 'Suporte',
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6" />
        <path d="M12 17h.01" />
      </Icone>
    ),
  },
  {
    // pedido do Luan, 25/11/2026: para todos (sem permissão); abre também pelo nome, no canto de baixo da barra
    id: 'meu-usuario',
    rotulo: 'Meu usuário',
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="10" r="3" />
        <path d="M6.7 18.3c1.2-2 3.1-3.1 5.3-3.1s4.1 1.1 5.3 3.1" />
      </Icone>
    ),
  },
];

const item = (id: IdSecao): ItemMenu => {
  const achado = ITENS.find((i) => i.id === id);
  if (!achado) throw new Error(`Item de menu desconhecido: ${id}`);
  return achado;
};

/** Botão em destaque, acima dos grupos. */
export const ITEM_CAIXA: ItemMenu = item('frente-de-caixa');

export const GRUPOS_MENU: readonly GrupoMenu[] = [
  { titulo: 'Operação', itens: [item('visao-geral'), item('caixa-do-dia')] },
  { titulo: 'Cadastros', itens: [item('produtos-e-estoque'), item('compras'), item('clientes')] },
  { titulo: 'Gestão', itens: [item('financeiro'), item('relatorios')] },
  { titulo: 'Sistema', itens: [item('usuarios'), item('dados-e-backup'), item('suporte'), item('meu-usuario')] },
];

/** Todos os itens, na ordem em que aparecem na barra. */
export const ITENS_MENU: readonly ItemMenu[] = [ITEM_CAIXA, ...GRUPOS_MENU.flatMap((g) => g.itens)];

/** Quem tem a permissão vê o item, desde que o suporte não tenha desligado o recurso dele nesta loja. */
export function podeVer(item: ItemMenu, quem: QuemAcessa, ajustes?: Pick<AjustesDaLoja, 'desligados'> | null): boolean {
  return (!item.permissao || pode(quem, item.permissao)) && (!item.recurso || recursoLigado(ajustes, item.recurso));
}
