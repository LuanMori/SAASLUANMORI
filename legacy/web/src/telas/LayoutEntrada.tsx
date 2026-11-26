// apps/web/src/telas/LayoutEntrada.tsx — o molde das telas antes de entrar (entrada e primeiro acesso), no modelo do
// Luan (24/11/2026): fundo claro com manchas verdes; à esquerda a logo com "PDV · Estoque · Financeiro", a chamada,
// o texto e os recursos; no meio a ilustração da loja; à direita o cartão de entrada, com a logo e a loja do endereço
// num selo. O tema e o Suporte ficam no canto. No celular, ficam a logo e o cartão.
// Sem imagem de fora (a página não carrega nada de outro endereço): a ilustração é um SVG feito por código
// (ilustracaoLoja.ts) e as manchas são gradientes.
import type { ReactNode } from 'react';
import { Logo } from '../Logo';
import { MARCA } from '../marca';
import { ILUSTRACAO_LOJA } from './ilustracaoLoja';

const ILUSTRACAO = ILUSTRACAO_LOJA();

export function LayoutEntrada({ loja, acoes, children }: { loja: { nome: string } | null; acoes: ReactNode; children: ReactNode }) {
  return (
    <div className="entrada">
      <div className="entrada-acoes">{acoes}</div>
      <section className="entrada-vitrine" aria-label="Apresentação">
        <div className="entrada-vitrine-marca">
          <Logo />
          <p className="entrada-vitrine-linha">{MARCA.linha}</p>
        </div>
        <div className="entrada-vitrine-corpo">
          <div className="entrada-vitrine-texto">
            <p className="entrada-vitrine-chamada">
              {MARCA.chamada.map((linha, i) => (
                <span key={linha}>
                  {i > 0 && <br />}
                  {linha}
                </span>
              ))}
            </p>
            <span className="entrada-vitrine-traco" aria-hidden="true" />
            <p className="entrada-vitrine-descricao">{MARCA.descricao}</p>
            <ul className="entrada-vitrine-recursos" aria-label="Recursos do sistema">
              {MARCA.recursos.map((r) => (
                <li key={r.texto}>
                  <span className="entrada-vitrine-icone">
                    <IconeRecurso icone={r.icone} />
                  </span>
                  {r.texto}
                </li>
              ))}
            </ul>
          </div>
          <div className="entrada-vitrine-ilustracao" aria-hidden="true">
            <img src={ILUSTRACAO} alt="" width={552} height={350} />
          </div>
        </div>
      </section>
      <main className="entrada-cartao">
        <div className="entrada-logo">
          <Logo />
        </div>
        {loja && (
          <p className="entrada-loja-selo" aria-label={`Loja: ${loja.nome}`}>
            <IconeLojaPequena />
            <span>{loja.nome}</span>
          </p>
        )}
        {children}
      </main>
    </div>
  );
}

function IconeLojaPequena() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 9.5 5.6 5h12.8L20 9.5" />
      <path d="M4 9.5c0 1.2.9 2.1 2 2.1s2-.9 2-2.1c0 1.2.9 2.1 2 2.1h4c1.1 0 2-.9 2-2.1 0 1.2.9 2.1 2 2.1s2-.9 2-2.1" />
      <path d="M5.5 12.5V19h13v-6.5M10 19v-4h4v4" />
    </svg>
  );
}

function IconeRecurso({ icone }: { icone: (typeof MARCA.recursos)[number]['icone'] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icone === 'pdv' && (
        <>
          <rect x="4" y="9.5" width="16" height="10" rx="1.6" />
          <path d="M7.5 9.5V4.5h9v5M8 13h2M11 13h2M14 13h2M8 16h8" />
        </>
      )}
      {icone === 'estoque' && (
        <>
          <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
          <path d="M4 8l8 4.5L20 8M12 12.5v8" />
        </>
      )}
      {icone === 'financeiro' && (
        <>
          <path d="M4 20h16" />
          <rect x="5.5" y="12.5" width="3" height="5" rx="0.8" />
          <rect x="10.5" y="8.5" width="3" height="9" rx="0.8" />
          <rect x="15.5" y="4.5" width="3" height="13" rx="0.8" />
        </>
      )}
    </svg>
  );
}
