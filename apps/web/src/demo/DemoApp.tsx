// apps/web/src/demo/DemoApp.tsx
// Entrada da demonstração. No sistema real a loja vem do subdomínio e o login é
// validado no servidor; aqui o subdomínio é simulado na faixa amarela e os
// usuários/senhas de teste ficam no próprio arquivo.
import { useMemo, useState } from 'react';
import { TelaPainel } from '../painel/TelaPainel';
import { TelaEntrada } from '../telas/TelaEntrada';
import { apagarDadosDemo, criarApiLocal } from './apiLocal';
import { entrarDemo, LOJAS_DEMO, SENHA_DEMO, type UsuarioDemo } from './contasDemo';

interface Sessao {
  lojaId: string;
  usuario: UsuarioDemo;
}

export function DemoApp() {
  const [subdominio, setSubdominio] = useState<string>(LOJAS_DEMO[0].subdominio);
  const [sessao, setSessao] = useState<Sessao | null>(null);
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
      />
      {sessao && loja ? (
        <AreaLogada loja={loja} usuario={sessao.usuario} aoSair={() => setSessao(null)} />
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

function AreaLogada({ loja, usuario, aoSair }: { loja: (typeof LOJAS_DEMO)[number]; usuario: UsuarioDemo; aoSair: () => void }) {
  // O operador da API é quem entrou: é ele que fica registrado em cada venda.
  const api = useMemo(
    () => criarApiLocal({ lojaId: loja.id, operador: { id: usuario.usuario, nome: usuario.nome } }),
    [loja.id, usuario.usuario, usuario.nome],
  );
  return (
    <TelaPainel
      api={api}
      loja={{ nome: loja.nome, descricao: loja.descricao }}
      pessoa={{ nome: usuario.nome, papel: usuario.papel }}
      aoSair={aoSair}
    />
  );
}

function FaixaDemo({ subdominio, aoTrocar, logado }: { subdominio: string; aoTrocar: (s: string) => void; logado: boolean }) {
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
            Em qualquer loja: <code>ana</code> (Dono) e <code>bruno</code> (Vendedor), senha <code>{SENHA_DEMO}</code>.{' '}
            <code>carla</code> está desativada. 5 senhas erradas seguidas bloqueiam o usuário por 1 minuto. Cada loja já vem
            com produtos e algumas vendas de dias anteriores, de exemplo.
          </p>
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
