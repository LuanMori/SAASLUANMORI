// apps/web/src/demo/DemoApp.tsx
// Entrada da demonstração: no lugar do Auth0, escolhe loja e pessoa numa lista.
// Depois do "login", mostra a MESMA TelaProdutos do sistema real.
import { useMemo, useState } from 'react';
import { TelaProdutos } from '../telas/TelaProdutos';
import { apagarDadosDemo, criarApiLocal } from './apiLocal';

const LOJAS = [
  { id: 'loja-a', nome: 'Loja A' },
  { id: 'loja-b', nome: 'Loja B' },
] as const;

const PESSOAS = [
  { id: 'dono', nome: 'Ana (Dono)', bloqueio: null },
  { id: 'vendedor', nome: 'Bruno (Vendedor)', bloqueio: null },
  {
    id: 'nao-cadastrada',
    nome: 'Carla (não cadastrada pelo dono)',
    // Mesma mensagem da GuardaAutenticacao da API.
    bloqueio: 'Seu acesso a esta loja ainda não foi liberado. Peça ao dono da loja para cadastrar você.',
  },
] as const;

interface Entrada {
  lojaId: string;
  pessoaId: string;
}

export function DemoApp() {
  const [entrada, setEntrada] = useState<Entrada | null>(null);

  return (
    <>
      <p className="demo-faixa" role="note">
        Modo demonstração: sem servidor e sem login de verdade. Os dados ficam só neste navegador.
      </p>
      {entrada ? <Sessao entrada={entrada} aoSair={() => setEntrada(null)} /> : <TelaEntradaDemo aoEntrar={setEntrada} />}
    </>
  );
}

function Sessao({ entrada, aoSair }: { entrada: Entrada; aoSair: () => void }) {
  const loja = LOJAS.find((l) => l.id === entrada.lojaId) ?? LOJAS[0];
  const pessoa = PESSOAS.find((p) => p.id === entrada.pessoaId) ?? PESSOAS[0];
  const api = useMemo(() => criarApiLocal({ lojaId: loja.id, bloqueio: pessoa.bloqueio }), [loja.id, pessoa.bloqueio]);

  return <TelaProdutos api={api} sessao={{ nome: pessoa.nome, loja: loja.nome }} aoSair={aoSair} />;
}

function TelaEntradaDemo({ aoEntrar }: { aoEntrar: (e: Entrada) => void }) {
  const [lojaId, setLojaId] = useState<string>(LOJAS[0].id);
  const [pessoaId, setPessoaId] = useState<string>(PESSOAS[0].id);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <main className="login">
      <form
        className="login-cartao demo-entrada"
        onSubmit={(ev) => {
          ev.preventDefault();
          aoEntrar({ lojaId, pessoaId });
        }}
      >
        <div className="marca" aria-hidden="true">
          SP
        </div>
        <h1>Sistema Padrão</h1>
        <p className="suave">Gestão da sua loja</p>

        <div className="campo">
          <label htmlFor="demo-loja">Loja</label>
          <select id="demo-loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {LOJAS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="demo-pessoa">Entrar como</label>
          <select id="demo-pessoa" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
            {PESSOAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="botao botao-primario botao-grande">
          Entrar
        </button>
        <button
          type="button"
          className="botao demo-apagar"
          onClick={() => {
            if (window.confirm('Apagar todos os produtos da demonstração (Loja A e Loja B)?')) {
              apagarDadosDemo();
              setAviso('Dados da demonstração apagados.');
            }
          }}
        >
          Apagar dados da demonstração
        </button>
        {aviso && (
          <p className="alerta" role="status">
            {aviso}
          </p>
        )}
      </form>
    </main>
  );
}
