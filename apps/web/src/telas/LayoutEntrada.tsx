// apps/web/src/telas/LayoutEntrada.tsx — o molde das telas antes de entrar (entrada e primeiro acesso), no formato da
// imagem do Luan (24/11/2026): à esquerda, o painel verde com a loja em destaque (o desenho da loja num selo, o nome
// dela, a frase e os destaques do sistema); à direita, a nossa logo e o formulário. No celular, o painel vira uma
// faixa com a loja e a frase.
// Sem imagem de fora (a página não carrega nada de outro endereço): o fundo de prateleiras é um desenho em SVG,
// desfocado, e as curvas dos cantos são gradientes.
import type { ReactNode } from 'react';
import { Logo } from '../Logo';
import { MARCA } from '../marca';

export function LayoutEntrada({ loja, acoes, children }: { loja: { nome: string } | null; acoes: ReactNode; children: ReactNode }) {
  return (
    <div className="entrada">
      <PainelDaLoja loja={loja} />
      <div className="entrada-lado">
        <div className="entrada-acoes">{acoes}</div>
        <main className="entrada-coluna">
          <div className="entrada-logo">
            <Logo />
          </div>
          {children}
        </main>
        <footer className="entrada-rodape">
          <Logo tamanho="pequena" />
        </footer>
      </div>
    </div>
  );
}

/** A loja do endereço, com a frase e os destaques do sistema. O nome da loja é lido pelo título do formulário. */
function PainelDaLoja({ loja }: { loja: { nome: string } | null }) {
  return (
    <aside className="entrada-marca" aria-label="Apresentação">
      <div className="entrada-marca-prateleiras" aria-hidden="true" />
      <div className="entrada-marca-conteudo">
        <span className="entrada-marca-selo" aria-hidden="true">
          <IconeLoja />
        </span>
        <p className="entrada-marca-loja" aria-hidden="true">
          {loja?.nome ?? MARCA.nome}
        </p>
        <p className="entrada-marca-slogan">{MARCA.slogan}</p>
        <span className="entrada-marca-traco" aria-hidden="true" />
        <ul className="entrada-marca-destaques" aria-label="Recursos do sistema">
          {MARCA.destaques.map((d) => (
            <li key={d.titulo}>
              <IconeDestaque icone={d.icone} />
              <b>{d.titulo}</b>
              <span>{d.texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** A fachada da loja: letreiro, toldo listrado com a borda recortada, vitrine, porta e calçada. */
function IconeLoja() {
  return (
    <svg className="entrada-marca-icone-loja" viewBox="0 0 96 96" fill="none" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {/* fachada (fica atrás do toldo) */}
      <path d="M17 40v44h62V40" fill="rgba(255,255,255,0.08)" stroke="#fff" strokeWidth="3.4" />
      {/* vitrine, com o reflexo */}
      <rect x="23" y="52" width="25" height="19" rx="3" fill="rgba(134,239,192,0.22)" stroke="#fff" strokeWidth="3" />
      <path d="M28 66l6-9M34 66l3.5-5" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      {/* porta */}
      <path d="M55 84V55a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v29" fill="#86efc0" stroke="#fff" strokeWidth="3" />
      <circle cx="68.5" cy="69" r="1.8" fill="#05452f" />
      {/* calçada */}
      <path d="M8 84h80" stroke="#fff" strokeWidth="3.4" />
      {/* letreiro */}
      <rect x="12" y="10" width="72" height="11" rx="3.5" fill="#86efc0" stroke="#fff" strokeWidth="3" />
      {/* toldo: 4 gomos, alternando verde e branco, com a borda recortada */}
      <path d="M14 21h17l-2 17a9.5 7 0 0 1-19 0Z" fill="#86efc0" stroke="#fff" strokeWidth="2.8" />
      <path d="M31 21h17v17a9.5 7 0 0 1-19 0Z" fill="#fff" stroke="#fff" strokeWidth="2.8" />
      <path d="M48 21h17l2 17a9.5 7 0 0 1-19 0Z" fill="#86efc0" stroke="#fff" strokeWidth="2.8" />
      <path d="M65 21h17l4 17a9.5 7 0 0 1-19 0Z" fill="#fff" stroke="#fff" strokeWidth="2.8" />
    </svg>
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
