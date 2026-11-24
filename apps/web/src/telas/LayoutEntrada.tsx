// apps/web/src/telas/LayoutEntrada.tsx — o molde das telas antes de entrar (entrada e primeiro acesso).
// Pedido do Luan (24/11/2026, com a imagem de referência): mais profissional, com MAIS da nossa marca e MENOS do nome
// do cliente. À esquerda, o painel da marca (o nosso sistema: nome, frase e destaques, de marca.ts); à direita, o
// formulário, onde o nome da loja aparece uma vez só. No celular, o painel vira uma faixa com a logo e a frase.
// Sem imagem de fora: os fundos são gradientes e desenhos em SVG (a página não carrega nada de outro endereço).
import type { ReactNode } from 'react';
import { Logo } from '../Logo';
import { MARCA } from '../marca';

export function LayoutEntrada({ acoes, children }: { acoes: ReactNode; children: ReactNode }) {
  return (
    <div className="entrada">
      <PainelDaMarca />
      <div className="entrada-lado">
        <div className="entrada-acoes">{acoes}</div>
        <main className="entrada-coluna">{children}</main>
        <footer className="entrada-rodape">
          <Logo tamanho="pequena" />
        </footer>
      </div>
    </div>
  );
}

/** O nosso sistema: a logo grande, a frase e os destaques. */
function PainelDaMarca() {
  return (
    <aside className="entrada-marca" aria-label={MARCA.nome}>
      <div className="entrada-marca-conteudo">
        <Logo />
        <p className="entrada-marca-slogan">{MARCA.slogan}</p>
        <span className="entrada-marca-traco" aria-hidden="true" />
        <ul className="entrada-marca-destaques" aria-label="O que o sistema faz">
          {MARCA.destaques.map((d) => (
            <li key={d.titulo}>
              <IconeDestaque icone={d.icone} />
              <b>{d.titulo}</b>
              <span>{d.texto}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="entrada-marca-rodape">
        © {new Date().getFullYear()} {MARCA.nome}
      </p>
    </aside>
  );
}

function IconeDestaque({ icone }: { icone: (typeof MARCA.destaques)[number]['icone'] }) {
  return (
    <svg className="entrada-marca-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icone === 'pdv' && (
        <>
          <path d="M2.5 3.5h2.6l2.3 11h10.9l2.2-7.5H6.2" />
          <circle cx="9.5" cy="19" r="1.6" />
          <circle cx="17" cy="19" r="1.6" />
        </>
      )}
      {icone === 'estoque' && (
        <>
          <path d="M3.5 12.5h7v7h-7zM13.5 12.5h7v7h-7zM8.5 4.5h7v7h-7z" />
          <path d="M6 15h2M16 15h2M11 7h2" />
        </>
      )}
      {icone === 'financeiro' && (
        <>
          <path d="M4 20.5h16" />
          <rect x="5" y="12" width="3.2" height="6" rx="1" />
          <rect x="10.4" y="8" width="3.2" height="10" rx="1" />
          <rect x="15.8" y="4" width="3.2" height="14" rx="1" />
        </>
      )}
    </svg>
  );
}
