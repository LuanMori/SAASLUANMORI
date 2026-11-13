// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral (DaniPets V9.3.3) + conteúdo da seção escolhida.
// Já têm conteúdo: Visão geral (vendas de hoje), Frente de caixa e Relatórios
// (todas as vendas). As outras seções ficam em branco até chegar a vez delas.
import { FUSO_PADRAO } from '@saas/core';
import { useState } from 'react';
import type { ApiPainel } from '../api';
import { BarraLateral, type DadosBarra, NOME_PAPEL } from './BarraLateral';
import { type IdSecao, ITENS_MENU, podeVer } from './menu';
import type { Pendencia } from './pendencias';
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
  /** Pendências da Visão geral. null = ainda não definidas (docs/PENDENCIAS.md). */
  pendencias?: readonly Pendencia[] | null;
}

export function TelaPainel({
  loja,
  pessoa,
  api,
  aoSair,
  secaoInicial = 'visao-geral',
  fuso = FUSO_PADRAO,
  agora,
  intervaloMs,
  pendencias = null,
}: Props) {
  const [secao, setSecao] = useState<IdSecao>(secaoInicial);
  const item = ITENS_MENU.find((i) => i.id === secao);
  // Mesmo que alguém force a seção, o papel sem permissão não vê o conteúdo.
  const permitido = item ? podeVer(item, pessoa.papel) : false;
  const pode = (id: IdSecao) => {
    const alvo = ITENS_MENU.find((i) => i.id === id);
    return alvo ? podeVer(alvo, pessoa.papel) : false;
  };
  // Pendência "só gestor" some para o Vendedor; nas outras, o botão só aparece para quem pode abrir a aba de destino.
  const gestor = pessoa.papel === 'dono' || pessoa.papel === 'administrador';
  const pendenciasVisiveis =
    pendencias
      ?.filter((p) => !p.soGestor || gestor)
      .map((p) => (p.acao && !pode(p.acao.secao) ? { ...p, acao: undefined } : p)) ?? null;

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
            aoVerProdutos={pode('produtos-e-estoque') ? () => setSecao('produtos-e-estoque') : undefined}
            aoVerFinanceiro={pode('financeiro') ? () => setSecao('financeiro') : undefined}
            aoVerRelatorios={pode('relatorios') ? () => setSecao('relatorios') : undefined}
            pendencias={pendenciasVisiveis}
            aoIrPara={setSecao}
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
