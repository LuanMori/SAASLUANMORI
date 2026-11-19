// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral (DaniPets V9.3.3) + conteúdo da seção escolhida.
// Já têm conteúdo: Visão geral (vendas de hoje), Frente de caixa, Produtos e estoque,
// Relatórios (todas as vendas), Usuários, Dados e backup (dados da loja) e Compras (fornecedores). As
// outras seções ficam em branco até chegar a vez delas.
// Os dados da loja (nome, descrição, logo) e as regras (desconto sem senha...) vêm da API
// (lerConfiguracao); enquanto não chegam, ou se o servidor ainda não tiver essa parte, valem o nome
// da sessão e os padrões do DaniPets.
// A Frente de caixa abre em tela cheia, sem a barra lateral (como no DaniPets);
// o botão "← Painel" volta para a Visão geral.
// Sai sozinho depois de `inatividadeMin` minutos sem uso (DaniPets: 30).
import { type ConfiguracaoDaLoja, ehGestor, FUSO_PADRAO, type PapelDeLoja } from '@saas/core';
import { useCallback, useEffect, useState } from 'react';
import { type ApiSistema, MENSAGEM_SEM_SERVIDOR } from '../api';
import { aoMudaremOsDados } from '../sincronizacao';
import { usarInatividade } from '../usarInatividade';
import { BarraLateral, type DadosBarra } from './BarraLateral';
import { type IdSecao, ITENS_MENU, podeVer } from './menu';
import type { Pendencia } from './pendencias';
import { TelaCompras } from './TelaCompras';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';
import { TelaRelatorios } from './TelaRelatorios';
import { TelaUsuarios } from './TelaUsuarios';
import { TelaVisaoGeral } from './TelaVisaoGeral';
import { ModalTrocarSenha } from './TrocarSenha';

interface Props extends DadosBarra {
  api: ApiSistema;
  /** Quem está logado. `id` e `usuario` entram na tela Usuários e na troca de senha. */
  pessoa: { id?: string; nome: string; usuario?: string; papel: PapelDeLoja };
  aoSair: () => void;
  secaoInicial?: IdSecao;
  /** Fuso da loja (define o que é "hoje"). */
  fuso?: string;
  /** Relógio (para testes). */
  agora?: () => Date;
  /** Atualização automática da Visão geral (ms). */
  intervaloMs?: number;
  /** Pendências da Visão geral. null = ainda não definidas (docs/PENDENCIAS.md). */
  pendencias?: readonly Pendencia[] | null;
  /** Onde guardar o carrinho da Frente de caixa desta pessoa (loja + pessoa). null = não guarda. */
  chaveCarrinho?: string | null;
  /** Minutos sem uso até sair sozinho (null = não sai). */
  inatividadeMin?: number | null;
  /** O que fazer quando sai por inatividade (padrão: aoSair). */
  aoInatividade?: () => void;
  /** A sessão terminou de fora (ex.: errou a senha atual 5 vezes ao trocar a senha). */
  aoSessaoEncerrada?: (mensagem: string) => void;
  /** Seções que já funcionam (no sistema real, as ligadas ao servidor). null = todas. */
  secoesDisponiveis?: readonly IdSecao[] | null;
}

export function TelaPainel({
  loja,
  pessoa,
  api,
  aoSair,
  secaoInicial = 'visao-geral',
  fuso = FUSO_PADRAO,
  agora,
  intervaloMs,
  pendencias = null,
  chaveCarrinho = null,
  inatividadeMin = null,
  aoInatividade,
  aoSessaoEncerrada,
  secoesDisponiveis = null,
}: Props) {
  const [secao, setSecao] = useState<IdSecao>(secaoInicial);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfiguracaoDaLoja | null>(null);
  usarInatividade(inatividadeMin, aoInatividade ?? aoSair);

  // dados e regras da loja: na abertura, quando outra aba ou computador muda algo, e depois de salvar
  const carregarConfig = useCallback(() => {
    api.lerConfiguracao().then(setConfig, () => undefined); // sem essa parte no servidor: ficam o nome da sessão e os padrões
  }, [api]);
  useEffect(() => {
    carregarConfig();
    return aoMudaremOsDados(carregarConfig);
  }, [carregarConfig]);
  const lojaDaBarra = config ? { nome: config.dados.nome, descricao: config.dados.descricao, logo: config.dados.logo } : loja;

  const item = ITENS_MENU.find((i) => i.id === secao);
  // Mesmo que alguém force a seção, o papel sem permissão não vê o conteúdo.
  const permitido = item ? podeVer(item, pessoa.papel) : false;
  const disponivel = (id: IdSecao) => secoesDisponiveis === null || secoesDisponiveis.includes(id);
  const pode = (id: IdSecao) => {
    const alvo = ITENS_MENU.find((i) => i.id === id);
    return alvo ? podeVer(alvo, pessoa.papel) && disponivel(id) : false;
  };
  // Pendência "só gestor" some para o Vendedor; nas outras, o botão só aparece para quem pode abrir a aba de destino.
  const gestor = ehGestor(pessoa.papel);
  const pendenciasVisiveis =
    pendencias
      ?.filter((p) => !p.soGestor || gestor)
      .map((p) => (p.acao && !pode(p.acao.secao) ? { ...p, acao: undefined } : p)) ?? null;
  const escolher = (id: IdSecao) => {
    setAviso(null);
    setSecao(id);
  };

  if (permitido && disponivel(secao) && secao === 'frente-de-caixa') {
    return (
      <div className="painel-app pdv-modo">
        <main className="pdv-conteudo" aria-label="Frente de caixa">
          <TelaFrenteCaixa
            api={api}
            operador={{ nome: pessoa.nome, papel: pessoa.papel }}
            loja={lojaDaBarra}
            limiteDescontoPct={config?.regras.venda.descontoSemSenhaPct}
            fuso={fuso}
            agora={agora}
            chaveCarrinho={chaveCarrinho}
            aoSair={() => setSecao('visao-geral')}
          />
        </main>
      </div>
    );
  }

  const ver = (id: IdSecao) => permitido && secao === id && disponivel(id);
  return (
    <div className="painel-app">
      <BarraLateral loja={lojaDaBarra} pessoa={pessoa} secao={secao} aoEscolher={escolher} aoSair={aoSair} aoTrocarSenha={() => setTrocandoSenha(true)} />
      <main className="painel-conteudo" aria-label={item?.rotulo ?? ''}>
        {aviso && (
          <p className="alerta painel-aviso" role="status">
            {aviso}
          </p>
        )}
        {permitido && !disponivel(secao) && (
          <div className="rel">
            <header className="vg-topo">
              <div>
                <h1>{item?.rotulo}</h1>
                <p className="alerta" role="status">
                  {MENSAGEM_SEM_SERVIDOR}
                </p>
              </div>
            </header>
          </div>
        )}
        {ver('visao-geral') && (
          <TelaVisaoGeral
            api={api}
            nome={pessoa.nome}
            fuso={fuso}
            agora={agora}
            intervaloMs={intervaloMs}
            aoVerProdutos={pode('produtos-e-estoque') ? () => escolher('produtos-e-estoque') : undefined}
            aoVerFinanceiro={pode('financeiro') ? () => escolher('financeiro') : undefined}
            aoVerRelatorios={pode('relatorios') ? () => escolher('relatorios') : undefined}
            pendencias={pendenciasVisiveis}
            aoIrPara={escolher}
          />
        )}
        {ver('produtos-e-estoque') && <TelaProdutosEstoque api={api} papel={pessoa.papel} fuso={fuso} intervaloMs={intervaloMs} />}
        {ver('relatorios') && <TelaRelatorios api={api} fuso={fuso} agora={agora} />}
        {ver('usuarios') && <TelaUsuarios api={api} eu={{ id: pessoa.id ?? '', papel: pessoa.papel }} fuso={fuso} agora={agora} />}
        {ver('dados-e-backup') && <TelaDadosBackup api={api} papel={pessoa.papel} aoMudar={carregarConfig} />}
        {ver('compras') && <TelaCompras api={api} fuso={fuso} agora={agora} />}
      </main>
      {trocandoSenha && (
        <ModalTrocarSenha
          api={api}
          pessoa={{ nome: pessoa.nome, usuario: pessoa.usuario ?? '' }}
          aoFechar={() => setTrocandoSenha(false)}
          aoTrocar={() => {
            setTrocandoSenha(false);
            setAviso('Senha trocada. Use a senha nova no próximo acesso e nas autorizações do caixa.');
          }}
          aoBloquear={(mensagem) => {
            setTrocandoSenha(false);
            (aoSessaoEncerrada ?? (() => aoSair()))(mensagem);
          }}
        />
      )}
    </div>
  );
}
