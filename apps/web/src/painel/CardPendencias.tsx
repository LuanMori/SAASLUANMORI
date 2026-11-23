// apps/web/src/painel/CardPendencias.tsx
// Card "Pendências" da Visão geral, no formato do DaniPets V9.3.3:
// título com a contagem, cada item com ícone pela gravidade, texto e (opcional)
// um botão que leva para a aba onde se resolve. Urgentes primeiro.
//   pendencias === null → ainda não definimos quais avisos entram (docs/PENDENCIAS.md)
//   pendencias === []   → nada pendente (com a `nota`, se houver: o que já está ligado e o que falta escolher)
import type { ReactNode } from 'react';
import type { IdSecao } from './menu';
import { ordenarPendencias, type Pendencia } from './pendencias';

interface Props {
  pendencias: readonly Pendencia[] | null;
  aoIrPara?: (secao: IdSecao) => void;
  /** Texto pequeno embaixo de "Nada pendente." */
  nota?: string | null;
  /** Ainda lendo os dados das regras (ex.: a situação do caixa): não diz "nada definido" nem "nada pendente" antes da hora. */
  carregando?: boolean;
}

export function CardPendencias({ pendencias, aoIrPara, nota = null, carregando = false }: Props) {
  const lista = pendencias ? ordenarPendencias(pendencias) : [];

  return (
    <section className="card card-plano pend-card" aria-labelledby="pend-titulo">
      <div className="card-cabeca">
        <h2 id="pend-titulo">
          Pendências
          {lista.length > 0 && (
            <span className="pend-contagem" data-testid="pend-contagem">
              {lista.length}
            </span>
          )}
        </h2>
      </div>

      {carregando && lista.length === 0 ? (
        <p className="pend-vazio">Carregando…</p>
      ) : pendencias === null ? (
        <p className="pend-vazio">
          <IconeInfo />
          <span>
            Ainda não definimos quais avisos entram aqui. Quando escolhermos (caixa, estoque, validade, contas…), eles aparecem nesta
            lista.
          </span>
        </p>
      ) : lista.length === 0 ? (
        <p className="pend-vazio pend-ok">
          <IconeOk />
          <span>
            Nada pendente. Tudo em ordem.
            {nota && <small className="pend-nota">{nota}</small>}
          </span>
        </p>
      ) : (
        <ul className="pend-lista">
          {lista.map((p) => (
            <li key={p.id} className={`pend-item pend-${p.gravidade}`}>
              {p.gravidade === 'alta' ? <IconePare /> : <IconeAtencao />}
              <div className="pend-corpo">
                <p className="pend-texto">
                  <span className="sr-only">{p.gravidade === 'alta' ? 'Urgente: ' : 'Atenção: '}</span>
                  {p.texto}
                </p>
                {p.acao && (p.acao.abrir || (aoIrPara && p.acao.secao)) && (
                  <button type="button" className="botao pend-acao" onClick={p.acao.abrir ?? (() => aoIrPara!(p.acao!.secao!))}>
                    {p.acao.rotulo}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- ícones (mesmo desenho do DaniPets: octógono = urgente, triângulo = atenção)
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg className="pend-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const IconePare = () => (
  <Icone>
    <path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z" />
    <path d="M12 7.5v5M12 16.5h.01" />
  </Icone>
);
const IconeAtencao = () => (
  <Icone>
    <path d="M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Icone>
);
const IconeOk = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.7 2.7L16 9.8" />
  </Icone>
);
const IconeInfo = () => (
  <Icone>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6h.01" />
  </Icone>
);
