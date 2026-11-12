// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral (DaniPets V9.3.3) + conteúdo da seção escolhida.
// POR ENQUANTO só "Visão geral" tem conteúdo (o cabeçalho; o resto vem a seguir).
// As outras seções ficam em branco de propósito até chegar a vez de cada uma.
import { useState } from 'react';
import { BarraLateral, type DadosBarra } from './BarraLateral';
import { type IdSecao, ITENS_MENU } from './menu';

interface Props extends DadosBarra {
  aoSair: () => void;
  secaoInicial?: IdSecao;
  /** Para testes: data mostrada na Visão geral. */
  hoje?: Date;
}

export function TelaPainel({ loja, pessoa, aoSair, secaoInicial = 'visao-geral', hoje }: Props) {
  const [secao, setSecao] = useState<IdSecao>(secaoInicial);
  const rotulo = ITENS_MENU.find((i) => i.id === secao)?.rotulo ?? '';

  return (
    <div className="painel-app">
      <BarraLateral loja={loja} pessoa={pessoa} secao={secao} aoEscolher={setSecao} aoSair={aoSair} />
      <main className="painel-conteudo" aria-label={rotulo}>
        {secao === 'visao-geral' && <CabecalhoVisaoGeral nome={pessoa.nome} hoje={hoje ?? new Date()} />}
      </main>
    </div>
  );
}

function CabecalhoVisaoGeral({ nome, hoje }: { nome: string; hoje: Date }) {
  const data = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = hoje.getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return (
    <header className="visao-cabecalho">
      <h1>Visão geral</h1>
      <p className="suave">
        {saudacao}, {nome} · <span className="painel-data">{data}</span>
      </p>
    </header>
  );
}
