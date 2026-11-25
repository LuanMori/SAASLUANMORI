// apps/web/src/painel/TelaPainel.tsx
// Área logada: barra lateral (DaniPets V9.3.3) + conteúdo da seção escolhida.
// Já têm conteúdo: Visão geral (vendas de hoje), Frente de caixa, Caixa do dia, Produtos e estoque,
// Compras, Clientes, Financeiro, Relatórios (todas as vendas), Usuários, Dados e backup (dados da loja) e Meu usuário
// (foto, entradas e saídas e a troca de senha; abre também pelo nome, no canto de baixo da barra). As outras seções
// ficam em branco até chegar a vez delas.
// Os nomes que a loja deu às contas ("Banco Itaú") vão para todas as telas (ContextoNomesDasContas).
// Os dados da loja (nome, descrição, logo) e as regras (desconto sem senha...) vêm da API
// (lerConfiguracao); enquanto não chegam, ou se o servidor ainda não tiver essa parte, valem o nome
// da sessão e os padrões do DaniPets.
// A Frente de caixa abre em tela cheia, sem a barra lateral (como no DaniPets);
// o botão "← Painel" volta para a Visão geral.
// Sai sozinho depois de `inatividadeMin` minutos sem uso (DaniPets: 30).
// À meia-noite com o sistema aberto (usarViradaDoDia), o caixa que ficou aberto fecha sozinho, as telas
// recarregam e aparece o aviso do novo dia (também na Frente de caixa, que fica sem vender até abrir o caixa).
import { type ConfiguracaoDaLoja, dataBr, ehDono, ehGestor, FUSO_PADRAO, NOME_CONTA, type PapelNaLoja } from '@saas/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ApiSistema, MENSAGEM_SEM_SERVIDOR, type UsuarioDaLoja } from '../api';
import { aoMudaremOsDados, avisarQueOsDadosMudaram } from '../sincronizacao';
import { usarInatividade } from '../usarInatividade';
import { BarraLateral, type DadosBarra } from './BarraLateral';
import { AvisoComIcone } from './AvisoComIcone';
import { type IdSecao, ITENS_MENU, podeVer } from './menu';
import { ContextoNomesDasContas } from './nomesDasContas';
import type { Pendencia } from './pendencias';
import { TelaCaixaDoDia } from './TelaCaixaDoDia';
import { TelaClientes } from './TelaClientes';
import { TelaCompras } from './TelaCompras';
import { TelaDadosBackup } from './TelaDadosBackup';
import { TelaFinanceiro } from './TelaFinanceiro';
import { TelaFrenteCaixa } from './TelaFrenteCaixa';
import { TelaMeuUsuario } from './TelaMeuUsuario';
import { TelaProdutosEstoque } from './TelaProdutosEstoque';
import { TelaRelatorios } from './TelaRelatorios';
import { TelaUsuarios } from './TelaUsuarios';
import { TelaVisaoGeral } from './TelaVisaoGeral';
import { usarViradaDoDia } from './usarViradaDoDia';

interface Props extends DadosBarra {
  api: ApiSistema;
  /** Quem está logado. `id` e `usuario` entram na tela Usuários e na troca de senha. */
  /** `permissoes`: só no Personalizado (as funções escolhidas para ele). O Adm. Sup entra com o papel super_admin. */
  pessoa: { id?: string; nome: string; usuario?: string; papel: PapelNaLoja; permissoes?: readonly string[] | null };
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
  const [config, setConfig] = useState<ConfiguracaoDaLoja | null>(null);
  /** A foto do perfil (Meu usuário), no canto da barra lateral. */
  const [foto, setFoto] = useState<string | null>(null);
  /** Dia cujo caixa fechou sozinho na virada da meia-noite (com o sistema aberto). */
  const [fechouSozinho, setFechouSozinho] = useState<string | null>(null);
  usarInatividade(inatividadeMin, aoInatividade ?? aoSair);

  // Meia-noite: ler o caixa já fecha o do dia anterior que ficou aberto (sem contagem). Avisa se foi o caso e
  // faz todas as telas lerem de novo (a Frente de caixa passa a mostrar "caixa de hoje não aberto").
  usarViradaDoDia(fuso, agora ?? (() => new Date()), (anterior) => {
    void Promise.resolve()
      .then(() => api.lerCaixa())
      .then(
        (p) => {
          if (p.historico.some((c) => c.dia === anterior && c.fechamento?.automatico)) setFechouSozinho(anterior);
        },
        () => undefined, // sem essa parte no servidor ou sem rede: as telas mostram o que conseguirem
      )
      .finally(avisarQueOsDadosMudaram);
  });
  const avisoDaVirada = fechouSozinho ? `Novo dia: o caixa de ${dataBr(fechouSozinho)} fechou sozinho à meia-noite, sem contagem da gaveta.` : null;

  // dados e regras da loja: na abertura, quando outra aba ou computador muda algo, e depois de salvar
  const carregarConfig = useCallback(() => {
    api.lerConfiguracao().then(setConfig, () => undefined); // sem essa parte no servidor: ficam o nome da sessão e os padrões
  }, [api]);
  useEffect(() => {
    carregarConfig();
    return aoMudaremOsDados(carregarConfig);
  }, [carregarConfig]);
  // a foto do perfil: na abertura, quando outra aba muda e depois de salvar em "Meu usuário"
  const carregarPerfil = useCallback(() => {
    api.meuPerfil().then((p: UsuarioDaLoja) => setFoto(p.foto ?? null), () => undefined); // sem essa parte no servidor: fica a inicial do nome
  }, [api]);
  useEffect(() => {
    carregarPerfil();
    return aoMudaremOsDados(carregarPerfil);
  }, [carregarPerfil]);
  const lojaDaBarra = config ? { nome: config.dados.nome, descricao: config.dados.descricao, logo: config.dados.logo } : loja;
  const nomesDasContas = config?.regras.financeiro.nomesContas ?? NOME_CONTA;
  // quem está logado, com as funções do Personalizado (as telas perguntam `pode(acesso, ...)`)
  const acesso = useMemo(() => ({ papel: pessoa.papel, permissoes: pessoa.permissoes ?? null }), [pessoa.papel, pessoa.permissoes]);

  const item = ITENS_MENU.find((i) => i.id === secao);
  // Mesmo que alguém force a seção, o papel sem permissão não vê o conteúdo.
  const permitido = item ? podeVer(item, acesso) : false;
  const disponivel = (id: IdSecao) => secoesDisponiveis === null || secoesDisponiveis.includes(id);
  const pode = (id: IdSecao) => {
    const alvo = ITENS_MENU.find((i) => i.id === id);
    return alvo ? podeVer(alvo, acesso) && disponivel(id) : false;
  };
  // Pendência "só gestor" some para o Vendedor e "só Dono" para quem não é Dono; nas outras, o botão só aparece
  // para quem pode abrir a aba de destino.
  const gestor = ehGestor(pessoa.papel);
  const dono = ehDono(pessoa.papel);
  const pendenciasVisiveis =
    pendencias
      ?.filter((p) => (!p.soGestor || gestor) && (!p.soDono || dono))
      .map((p) => (p.acao?.secao && !pode(p.acao.secao) ? { ...p, acao: undefined } : p)) ?? null;
  const escolher = (id: IdSecao) => setSecao(id);
  const sessaoEncerrada = (mensagem: string) => (aoSessaoEncerrada ?? (() => aoSair()))(mensagem);

  if (permitido && disponivel(secao) && secao === 'frente-de-caixa') {
    return (
      <div className="painel-app pdv-modo">
        <main className="pdv-conteudo" aria-label="Frente de caixa">
          <TelaFrenteCaixa
            api={api}
            operador={{ nome: pessoa.nome, papel: pessoa.papel, permissoes: pessoa.permissoes ?? null }}
            loja={lojaDaBarra}
            limiteDescontoPct={config?.regras.venda.descontoSemSenhaPct}
            fuso={fuso}
            agora={agora}
            chaveCarrinho={chaveCarrinho}
            aoSair={() => setSecao('visao-geral')}
            aoAbrirCaixa={pode('caixa-do-dia') ? () => setSecao('caixa-do-dia') : undefined}
            avisoDaVirada={avisoDaVirada}
          />
        </main>
      </div>
    );
  }

  const ver = (id: IdSecao) => permitido && secao === id && disponivel(id);
  return (
    <ContextoNomesDasContas.Provider value={nomesDasContas}>
      <div className="painel-app">
        <BarraLateral loja={lojaDaBarra} pessoa={{ ...pessoa, foto }} secao={secao} aoEscolher={escolher} aoSair={aoSair} />
        <main className="painel-conteudo" aria-label={item?.rotulo ?? ''}>
          {avisoDaVirada && (
            <AvisoComIcone
              tipo="atencao"
              papel="status"
              className="painel-aviso"
              acao={
                <span className="cx-aviso-acoes">
                  {pode('caixa-do-dia') && secao !== 'caixa-do-dia' && (
                    <button type="button" className="botao" onClick={() => escolher('caixa-do-dia')}>
                      Ir para Caixa do dia
                    </button>
                  )}
                  <button type="button" className="botao" onClick={() => setFechouSozinho(null)}>
                    Entendi
                  </button>
                </span>
              }
            >
              {avisoDaVirada} Abra o caixa de hoje para voltar a vender.
            </AvisoComIcone>
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
              aoVerCaixa={pode('caixa-do-dia') ? () => escolher('caixa-do-dia') : undefined}
              pendencias={pendenciasVisiveis}
              aoIrPara={escolher}
            />
          )}
          {ver('produtos-e-estoque') && <TelaProdutosEstoque api={api} papel={acesso} fuso={fuso} intervaloMs={intervaloMs} />}
          {ver('relatorios') && <TelaRelatorios api={api} fuso={fuso} agora={agora} />}
          {ver('usuarios') && <TelaUsuarios api={api} eu={{ id: pessoa.id ?? '', papel: pessoa.papel, permissoes: pessoa.permissoes ?? null }} fuso={fuso} agora={agora} />}
          {ver('dados-e-backup') && <TelaDadosBackup api={api} papel={acesso} aoMudar={carregarConfig} fuso={fuso} agora={agora} />}
          {ver('compras') && <TelaCompras api={api} fuso={fuso} agora={agora} />}
          {ver('financeiro') && <TelaFinanceiro api={api} papel={acesso} fuso={fuso} agora={agora} aoMudarRegras={carregarConfig} />}
          {ver('clientes') && (
            <TelaClientes api={api} pessoa={{ nome: pessoa.nome, papel: pessoa.papel, permissoes: pessoa.permissoes ?? null }} fuso={fuso} agora={agora} aoMudarRegras={carregarConfig} />
          )}
          {ver('caixa-do-dia') && <TelaCaixaDoDia api={api} pessoa={{ nome: pessoa.nome, papel: pessoa.papel, permissoes: pessoa.permissoes ?? null }} fuso={fuso} aoMudarRegras={carregarConfig} />}
          {ver('meu-usuario') && (
            <TelaMeuUsuario
              api={api}
              pessoa={{ nome: pessoa.nome, usuario: pessoa.usuario ?? '', papel: pessoa.papel }}
              fuso={fuso}
              agora={agora}
              aoMudarFoto={setFoto}
              aoBloquear={sessaoEncerrada}
            />
          )}
        </main>
      </div>
    </ContextoNomesDasContas.Provider>
  );
}
