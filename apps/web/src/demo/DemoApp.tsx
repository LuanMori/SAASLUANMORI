// apps/web/src/demo/DemoApp.tsx
// Entrada da demonstração. No sistema real a loja vem do subdomínio e o login é
// conferido no servidor; aqui o subdomínio é simulado na faixa amarela e os usuários
// ficam no próprio navegador (usuariosDemo.ts), com as mesmas regras do servidor:
// senha com hash, senha provisória no primeiro acesso, bloqueio por senhas erradas e
// saída automática depois de 30 minutos sem uso.
// Várias abas abertas ficam sincronizadas (Fase 2, módulo 1): o que uma grava, as outras recarregam;
// quem foi desativado ou teve a senha redefinida em outra aba sai, e papel mudado vale na hora.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UsuarioDaLoja } from '../api';
import { TelaPainel } from '../painel/TelaPainel';
import { TelaCriarSenha } from '../painel/TrocarSenha';
import { avisarQueOsDadosMudaram } from '../sincronizacao';
import { TelaEntrada } from '../telas/TelaEntrada';
import { apagarDadosDemo, configuracaoDemo, criarApiLocal } from './apiLocal';
import { aoMudarEmOutraAba } from './armazenamento';
import { AvisosDaDemo } from './AvisosDaDemo';
import { pendenciasExemplo } from './pendenciasExemplo';
import { apagarUsuariosDemo, entrarDemo, LOJAS_DEMO, registrarSaidaDemo, SENHA_DEMO, usuarioGuardadoDemo } from './usuariosDemo';

/** Minutos sem uso até sair sozinho (DaniPets: IDLE_MINUTES). */
export const INATIVIDADE_MIN = 30;

interface Sessao {
  lojaId: string;
  usuario: UsuarioDaLoja;
}

export function DemoApp() {
  const [subdominio, setSubdominio] = useState<string>(LOJAS_DEMO[0].subdominio);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Pendências ainda não foram definidas: por padrão o card diz isso; o exemplo é só para ver o visual.
  const [exemplos, setExemplos] = useState(false);
  /** Muda quando outra aba grava algo (para reler o nome da loja e a pessoa logada). */
  const [versao, setVersao] = useState(0);
  const loja = LOJAS_DEMO.find((l) => l.subdominio === subdominio) ?? null;
  // nome da loja como está nos Dados da loja (pode ter sido mudado)
  const dadosDaLoja = useMemo(() => (loja ? configuracaoDemo(loja.id).dados : null), [loja, versao, sessao]);

  // a sessão de agora (a tela pode pedir para sair várias vezes ao mesmo tempo: só a primeira vale)
  const sessaoAtual = useRef<Sessao | null>(sessao);
  sessaoAtual.current = sessao;
  const sair = (mensagem: string | null = null) => {
    const s = sessaoAtual.current;
    if (!s) return;
    sessaoAtual.current = null;
    void registrarSaidaDemo(s.lojaId, s.usuario.id);
    setSessao(null);
    setAviso(mensagem);
  };

  useEffect(
    () =>
      aoMudarEmOutraAba(() => {
        setVersao((v) => v + 1);
        avisarQueOsDadosMudaram();
      }),
    [],
  );

  // a pessoa logada mudou em outra aba? (como no servidor: desativar e redefinir a senha encerram a sessão)
  useEffect(() => {
    if (!sessao) return;
    const atual = usuarioGuardadoDemo(sessao.lojaId, sessao.usuario.id);
    if (!atual) return;
    if (!atual.ativo) sair('Seu acesso a esta loja foi desativado. Fale com o Dono da loja.');
    else if (atual.senhaProvisoria && !sessao.usuario.senhaProvisoria) sair('Sua senha foi redefinida pelo Dono ou pelo Administrador. Entre com a senha provisória.');
    else if (atual.papel !== sessao.usuario.papel || atual.nome !== sessao.usuario.nome || JSON.stringify(atual.permissoes ?? null) !== JSON.stringify(sessao.usuario.permissoes ?? null)) {
      setSessao({ ...sessao, usuario: { ...sessao.usuario, papel: atual.papel, nome: atual.nome, permissoes: atual.permissoes ?? null } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confere só quando outra aba grava
  }, [versao]);

  return (
    <>
      <AvisosDaDemo />
      <FaixaDemo
        subdominio={subdominio}
        aoTrocar={(s) => {
          setSubdominio(s);
          setSessao(null);
          setAviso(null);
        }}
        logado={sessao !== null}
        exemplos={exemplos}
        aoMudarExemplos={setExemplos}
      />
      {sessao && loja ? (
        <AreaLogada
          loja={{ ...loja, nome: dadosDaLoja?.nome ?? loja.nome, descricao: dadosDaLoja?.descricao ?? loja.descricao }}
          usuario={sessao.usuario}
          exemplos={exemplos}
          aoSair={sair}
          aoCriarSenha={() => setSessao({ ...sessao, usuario: { ...sessao.usuario, senhaProvisoria: false } })}
        />
      ) : (
        <TelaEntrada
          loja={loja && dadosDaLoja ? { nome: dadosDaLoja.nome } : null}
          aviso={aviso}
          aoEntrar={async (usuario, senha) => {
            const r = await entrarDemo(subdominio, usuario, senha).catch((e: unknown) => ({ ok: false as const, mensagem: e instanceof Error ? e.message : String(e) }));
            if (r.ok) {
              setAviso(null);
              setSessao({ lojaId: r.lojaId, usuario: r.usuario });
            }
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
  aoCriarSenha,
}: {
  loja: { id: string; nome: string; descricao: string | null };
  usuario: UsuarioDaLoja;
  exemplos: boolean;
  aoSair: (mensagem?: string | null) => void;
  aoCriarSenha: () => void;
}) {
  // O operador da API é quem entrou: é ele que fica registrado em cada venda.
  const api = useMemo(
    () =>
      criarApiLocal({
        lojaId: loja.id,
        operador: { id: usuario.id, nome: usuario.nome, papel: usuario.papel, permissoes: usuario.permissoes ?? null },
        // desativada em outra aba: volta para a entrada (o servidor faz o mesmo com o 401)
        aoSessaoEncerrada: (mensagem) => aoSair(mensagem),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- aoSair muda a cada render; a API só muda com a pessoa
    [loja.id, usuario.id, usuario.nome, usuario.papel, usuario.permissoes],
  );
  if (usuario.senhaProvisoria) {
    return (
      <TelaCriarSenha
        api={api}
        loja={loja}
        pessoa={{ nome: usuario.nome, usuario: usuario.usuario }}
        aoTrocar={aoCriarSenha}
        aoBloquear={(mensagem) => aoSair(mensagem)}
        aoSair={() => aoSair()}
      />
    );
  }
  return (
    <TelaPainel
      api={api}
      loja={{ nome: loja.nome, descricao: loja.descricao }}
      pessoa={{ id: usuario.id, nome: usuario.nome, usuario: usuario.usuario, papel: usuario.papel, permissoes: usuario.permissoes ?? null }}
      pendencias={exemplos ? pendenciasExemplo() : null}
      chaveCarrinho={`saas-demo:pdv:${loja.id}:${usuario.id}`}
      aoSair={() => aoSair()}
      inatividadeMin={INATIVIDADE_MIN}
      aoInatividade={() => aoSair(`Sua sessão terminou depois de ${INATIVIDADE_MIN} minutos sem uso. Entre de novo.`)}
      aoSessaoEncerrada={(mensagem) => aoSair(mensagem)}
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
            <code>{SENHA_DEMO}</code>. O <code>suporte</code> é o Adm. Sup (o usuário mestre): entra em qualquer loja com tudo
            liberado, não aparece na lista de usuários e, no histórico e nas vendas, aparece como “Suporte”; só ele cadastra o
            Dono e o Administrador.{' '}
            <code>carla</code> está desativada. Como no sistema real: 5 senhas erradas seguidas bloqueiam o usuário por 5 minutos,
            a senha fica guardada só como hash, a sessão termina depois de 30 minutos sem uso e quem recebe uma senha provisória
            (aba Usuários, com a Ana ou o Caio) cria a própria no primeiro acesso. Cada loja já vem com produtos (com estoque),
            clientes e algumas vendas de dias anteriores, de exemplo.
          </p>
          <label className="demo-check">
            <input type="checkbox" checked={exemplos} onChange={(e) => aoMudarExemplos(e.target.checked)} />
            Mostrar também exemplos de pendências
          </label>
          {!logado && (
            <button
              type="button"
              className="demo-faixa-botao"
              onClick={() => {
                if (
                  window.confirm(
                    'Apagar todos os dados da demonstração (produtos, vendas, estoque, clientes, financeiro e usuários) da Loja A e da Loja B? Os usuários voltam a ser Ana, Caio, Bruno e Carla, com a senha demo1234.',
                  )
                ) {
                  apagarDadosDemo();
                  apagarUsuariosDemo();
                }
              }}
            >
              Apagar os dados da demonstração
            </button>
          )}
        </div>
      )}
    </div>
  );
}
