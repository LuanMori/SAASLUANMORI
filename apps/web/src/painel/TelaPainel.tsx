// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral + conteúdo da seção escolhida.
// POR ENQUANTO só "Visão geral" tem conteúdo (o cabeçalho; o resto vem a seguir).
// As outras seções ficam em branco de propósito até chegar a vez de cada uma.
import { useEffect, useRef, useState } from 'react';
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
  const [menuAberto, setMenuAberto] = useState(false);
  const refBotaoMenu = useRef<HTMLButtonElement>(null);
  const rotulo = ITENS_MENU.find((i) => i.id === secao)?.rotulo ?? '';

  // No celular a barra vira gaveta: fecha com Esc e devolve o foco ao botão Menu.
  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAberto(false);
        refBotaoMenu.current?.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [menuAberto]);

  return (
    <div className="painel-app">
      <header className="painel-topo-celular">
        <button
          ref={refBotaoMenu}
          type="button"
          className="painel-botao-menu"
          aria-expanded={menuAberto}
          aria-controls="barra-lateral"
          onClick={() => setMenuAberto((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Menu
        </button>
        <strong>{loja.nome}</strong>
      </header>

      <BarraLateral
        id="barra-lateral"
        aberta={menuAberto}
        loja={loja}
        pessoa={pessoa}
        secao={secao}
        aoEscolher={(id) => {
          setSecao(id);
          setMenuAberto(false);
        }}
        aoSair={aoSair}
      />
      {menuAberto && <div className="painel-veu" aria-hidden="true" onClick={() => setMenuAberto(false)} />}

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
