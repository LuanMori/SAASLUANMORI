// apps/web/src/painel/menu.test.ts — o menu e a escolha do Personalizado falam da mesma coisa (pedido do Luan,
// 24/11/2026: "Personalizado você escolhe o que a pessoa tem acesso"). Se uma aba nova pedir uma permissão, ou mudar a
// que pede, este teste avisa que a tela Usuários também precisa mudar (TELAS_DO_PERSONALIZADO, em @saas/core).
import { PERMISSOES_CONCEDIVEIS, TELAS_DO_PERSONALIZADO } from '@saas/core';
import { describe, expect, it } from 'vitest';
import { ITENS_MENU } from './menu';

describe('menu × telas do Personalizado', () => {
  it('cada tela do Personalizado que está no menu pede, no menu, o mesmo acesso que a escolha dá', () => {
    for (const t of TELAS_DO_PERSONALIZADO) {
      const item = ITENS_MENU.find((i) => i.rotulo === t.tela);
      if (!item) continue; // "Regras da loja": vale em várias telas
      expect([t.tela, item.permissao ?? null]).toEqual([t.tela, t.acesso]);
    }
  });

  it('toda aba que pede uma permissão que se pode dar aparece na escolha do Personalizado', () => {
    const doMenu = ITENS_MENU.filter((i) => i.permissao && PERMISSOES_CONCEDIVEIS.includes(i.permissao));
    expect(doMenu.map((i) => i.rotulo).filter((r) => !TELAS_DO_PERSONALIZADO.some((t) => t.tela === r))).toEqual([]);
    // as que não se dão (Usuários) ficam de fora de propósito
    expect(ITENS_MENU.filter((i) => i.permissao && !PERMISSOES_CONCEDIVEIS.includes(i.permissao)).map((i) => i.rotulo)).toEqual(['Usuários']);
  });
});
