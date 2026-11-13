// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral (DaniPets V9.3.3) + conteúdo da seção escolhida.
// Já têm conteúdo: Visão geral (vendas de hoje), Frente de caixa e Relatórios
// (todas as vendas). As outras seções ficam em branco até chegar a vez delas.
import { FUSO_PADRAO } from '@saas/core';
import { useState } from 'react';
import type { ApiPainel } from '../api';
import { BarraLateral, type DadosBarra, NOME_PAPEL } from './BarraLateral';
import { type IdSecao, ITENS_MENU, podeVer } from './menu';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';
import { TelaRelatorios } from './TelaRelatorios';
import { TelaVisaoGeral } from './TelaVisaoGeral';

interface Props extends DadosBarra {
  api: ApiPainel;
  aoSair: () => void;
  secaoInicial?: IdSecao;
  /** Fuso da loja (define o que é "hoje"). */
  fuso?: string;
  /** Relógio (para testes). */
  agora?: () => Date;
  /** Atualização automática da Visão geral (ms). */
  intervaloMs?: number;
}

export function TelaPainel({ loja, pessoa, api, aoSair, secaoInicial = 'visao-geral', fuso = FUSO_PADRAO, agora, intervaloMs }: Props) {
  const [secao, setSecao] = useState<IdSecao>(secaoInicial);
  const item = ITENS_MENU.find((i) => i.id === secao);
  // Mesmo que alguém force a seção, o papel sem permissão não vê o conteúdo.
  const permitido = item ? podeVer(item, pessoa.papel) : false;

  return (
    <div className="painel-app">
      <BarraLateral loja={loja} pessoa={pessoa} secao={secao} aoEscolher={setSecao} aoSair={aoSair} />
      <main className="painel-conteudo" aria-label={item?.rotulo ?? ''}>
        {permitido && secao === 'visao-geral' && (
          <TelaVisaoGeral
            api={api}
            nome={pessoa.nome}
            fuso={fuso}
            agora={agora}
            intervaloMs={intervaloMs}
            aoVerRelatorios={podeVer(ITENS_MENU.find((i) => i.id === 'relatorios')!, pessoa.papel) ? () => setSecao('relatorios') : undefined}
          />
        )}
        {permitido && secao === 'frente-de-caixa' && (
          <TelaFrenteCaixa api={api} operador={{ nome: pessoa.nome, papel: NOME_PAPEL[pessoa.papel] }} />
        )}
        {permitido && secao === 'relatorios' && <TelaRelatorios api={api} fuso={fuso} agora={agora} />}
      </main>
    </div>
  );
}
