// apps/web/src/demo/DemoApp.tsx
// Entrada da demonstração. No sistema real a loja vem do subdomínio e o login é
// validado no servidor; aqui o subdomínio é simulado na faixa amarela e os
// usuários/senhas de teste ficam no próprio arquivo.
import { useMemo, useState } from 'react';
import { TelaPainel } from '../painel/TelaPainel';
import { TelaEntrada } from '../telas/TelaEntrada';
import { apagarDadosDemo, criarApiLocal } from './apiLocal';
import { entrarDemo, LOJAS_DEMO, SENHA_DEMO, type UsuarioDemo } from './contasDemo';
import { pendenciasExemplo } from './pendenciasExemplo';

interface Sessao {
  lojaId: string;
  usuario: UsuarioDemo;
}

export function DemoApp() {
  const [subdominio, setSubdominio] = useState<string>(LOJAS_DEMO[0].subdominio);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  // Pendências ainda não foram definidas: por padrão o card diz isso; o exemplo é só para ver o visual.
  const [exemplos, setExemplos] = useState(false);
  const loja = LOJAS_DEMO.find((l) => l.subdominio === subdominio) ?? null;

  return (
    <>
      <FaixaDemo
        subdominio={subdominio}
        aoTrocar={(s) => {
          setSubdominio(s);
          setSessao(null);
        }}
        logado={sessao !== null}
        exemplos={exemplos}
        aoMudarExemplos={setExemplos}
      />
      {sessao && loja ? (
        <AreaLogada loja={loja} usuario={sessao.usuario} exemplos={exemplos} aoSair={() => setSessao(null)} />
      ) : (
        <TelaEntrada
          loja={loja}
          aoEntrar={async (usuario, senha) => {
            const r = await entrarDemo(subdominio, usuario, senha);
            if (r.ok) setSessao({ lojaId: r.lojaId, usuario: r.usuario });
            return r.ok ? { ok: true } : r;
          }}
        />
      )}
    </>
  );
}

function AreaLogada({
  loja,
  usuario,
  exemplos,
  aoSair,
}: {
  loja: (typeof LOJAS_DEMO)[number];
  usuario: UsuarioDemo;
  exemplos: boolean;
  aoSair: () => void;
}) {
  // O operador da API é quem entrou: é ele que fica registrado em cada venda.
  const api = useMemo(
    () => criarApiLocal({ lojaId: loja.id, operador: { id: usuario.usuario, nome: usuario.nome, papel: usuario.papel } }),
    [loja.id, usuario.usuario, usuario.nome, usuario.papel],
  );
  return (
    <TelaPainel
      api={api}
      loja={{ nome: loja.nome, descricao: loja.descricao }}
      pessoa={{ nome: usuario.nome, papel: usuario.papel }}
      pendencias={exemplos ? pendenciasExemplo() : null}
      chaveCarrinho={`saas-demo:pdv:${loja.id}:${usuario.usuario}`}
      aoSair={aoSair}
    />
  );
}

function FaixaDemo({
  subdominio,
  aoTrocar,
  logado,
  exemplos,
  aoMudarExemplos,
}: {
  subdominio: string;
  aoTrocar: (s: string) => void;
  logado: boolean;
  exemplos: boolean;
  aoMudarExemplos: (v: boolean) => void;
}) {
  const [detalhes, setDetalhes] = useState(false);
  return (
    <div className="demo-faixa" role="note">
      <span>
        <strong>Modo demonstração</strong>: sem servidor; os dados ficam só neste navegador.
      </span>
      <label className="demo-endereco">
        Endereço simulado:
        <select value={subdominio} onChange={(e) => aoTrocar(e.target.value)}>
          {LOJAS_DEMO.map((l) => (
            <option key={l.subdominio} value={l.subdominio}>
              {l.subdominio}.nomedaempresa.com.br
            </option>
          ))}
          <option value="naoexiste">naoexiste.nomedaempresa.com.br</option>
        </select>
      </label>
      <button type="button" className="demo-faixa-botao" onClick={() => setDetalhes((v) => !v)} aria-expanded={detalhes}>
        {detalhes ? 'Fechar' : 'Usuários de teste'}
      </button>
      {detalhes && (
        <div className="demo-detalhes">
          <p>
            Em qualquer loja: <code>ana</code> (Dono), <code>caio</code> (Administrador) e <code>bruno</code> (Vendedor), senha{' '}
            <code>{SENHA_DEMO}</code>.{' '}
            <code>carla</code> está desativada. 5 senhas erradas seguidas bloqueiam o usuário por 1 minuto. Cada loja já vem
            com produtos e algumas vendas de dias anteriores, de exemplo.
          </p>
          <label className="demo-check">
            <input type="checkbox" checked={exemplos} onChange={(e) => aoMudarExemplos(e.target.checked)} />
            Mostrar pendências de exemplo (as de verdade ainda não foram definidas)
          </label>
          {!logado && (
            <button
              type="button"
              className="demo-faixa-botao"
              onClick={() => {
                if (window.confirm('Apagar todos os produtos e vendas da demonstração (Loja A e Loja B)?')) apagarDadosDemo();
              }}
            >
              Apagar produtos e vendas da demonstração
            </button>
          )}
        </div>
      )}
    </div>
  );
}
