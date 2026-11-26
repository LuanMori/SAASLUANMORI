// apps/web/src/painel/dados/ParteImportarExportar.tsx
// Dados e backup → "Importar e exportar" (Fase 2, módulo 13; pedido do Luan, 25/11/2026):
//   - IMPORTAR UMA PLANILHA (.xlsx ou .csv; DaniPets DAT-07) de produtos, clientes, fornecedores ou vendas antigas (só
//     como histórico), com o modelo para baixar. Antes de gravar, a prévia mostra o que entra, o que já existe (fica como está), o que se repete e o que
//     tem erro, linha por linha. Grava tudo de uma vez (regras no @saas/core, importacao.ts);
//   - EXPORTAR PARA O EXCEL os cadastros (produtos, clientes e fornecedores), com as colunas do modelo de importação;
//   - CÓPIA DE SEGURANÇA: um arquivo com todos os dados da loja (DaniPets DAT-01). Leva o CPF completo dos clientes:
//     só quem pode vê-lo baixa;
//   - RESTAURAR UMA CÓPIA (DaniPets DAT-05): só o Adm. Sup, porque troca os dados atuais. O arquivo é conferido antes
//     (formato, loja e conferência), a tela mostra o que ele leva, pede a confirmação e, antes de trocar, baixa uma
//     cópia dos dados de agora.
import {
  type AjustesDaLoja,
  type CadastroDaPlanilha,
  type CelulaImportada,
  COPIA_MAX_BYTES,
  type CopiaDaLoja,
  dataBr,
  diaNoFuso,
  formatarCentavos,
  MENSAGENS_DA_COPIA,
  NOME_DA_SITUACAO,
  NOME_DO_CADASTRO,
  type Permissao,
  pode,
  podeBaixarCopia,
  type QuemAcessa,
  type RecursoDaLoja,
  recursoLigado,
  resumoDaImportacao,
} from '@saas/core';
import { type ChangeEvent, useState } from 'react';
import { type ApiPainel, ErroApi, type PreviaDaCopia, type PreviaDaImportacao, type PreviaDasVendasAntigas } from '../../api';
import { type Baixar, baixarArquivo } from '../../relatorios/baixar';
import { lerArquivoDePlanilha } from '../../relatorios/lerPlanilha';
import { gerarXlsx, type Planilha } from '../../relatorios/xlsx';
import { dataNoFuso, horaNoFuso, plural } from '../formato';
import { IconeExcel } from '../relatorios/TabelaDaPlanilha';
import { modeloDeImportacao, momentoParaArquivo, nomeParaArquivo, planilhaDeClientes, planilhaDeFornecedores, planilhaDeProdutos } from './planilhasDeCadastro';

interface Props {
  api: ApiPainel;
  papel: QuemAcessa;
  /** Nome da loja (para o nome dos arquivos). */
  nomeDaLoja: string;
  fuso: string;
  agora?: () => Date;
  baixar?: Baixar;
  /** Uma cópia foi restaurada: a área logada recarrega (o nome e o logo da loja podem ter mudado). */
  aoMudar?: () => void;
  /** Os recursos que o suporte desligou nesta loja (módulo 13f). */
  ajustes?: Pick<AjustesDaLoja, 'desligados'> | null;
}

type Aviso = { tipo: 'ok' | 'erro'; texto: string };

const INDISPONIVEL = 'Esta parte ainda não está disponível no sistema da loja.';
const mensagemDe = (e: unknown) =>
  e instanceof ErroApi && e.status === 501 ? INDISPONIVEL : e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.';

const TIPO_JSON = 'application/json';
const arquivoDaCopia = (c: CopiaDaLoja) => new TextEncoder().encode(JSON.stringify(c, null, 1));

function lerComoTexto(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ''));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsText(arquivo, 'utf-8');
  });
}

function MostrarAviso({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return aviso.tipo === 'erro' ? (
    <p className="alerta alerta-erro" role="alert">
      {aviso.texto}
    </p>
  ) : (
    <p className="alerta" role="status">
      {aviso.texto}
    </p>
  );
}

export function ParteImportarExportar({ api, papel, nomeDaLoja, fuso, agora = () => new Date(), baixar = baixarArquivo, aoMudar, ajustes = null }: Props) {
  return (
    <>
      <CartaoImportar api={api} papel={papel} baixar={baixar} aoMudar={aoMudar} ajustes={ajustes} />
      <CartaoExportar api={api} papel={papel} nomeDaLoja={nomeDaLoja} fuso={fuso} agora={agora} baixar={baixar} />
      <CartaoCopia api={api} papel={papel} fuso={fuso} baixar={baixar} />
      {pode(papel, 'dados.restaurar') && <CartaoRestaurar api={api} fuso={fuso} baixar={baixar} aoMudar={aoMudar} />}
    </>
  );
}

// ------------------------------------------------------------------ importar uma planilha

/** O que dá para importar: os cadastros e as vendas antigas (só como histórico). */
type OQueImportar = CadastroDaPlanilha | 'vendas';
/** Cada um com o acesso da aba dele (além de Dados e backup); as vendas antigas, com Relatórios. */
const PERMISSAO_PARA_IMPORTAR: Record<OQueImportar, Permissao> = { produtos: 'produtos.cadastrar', clientes: 'clientes', fornecedores: 'compras', vendas: 'relatorios' };
/** O recurso da loja de cada importação (módulo 13f): desligado pelo suporte, a opção some. */
const RECURSO_PARA_IMPORTAR: Partial<Record<OQueImportar, RecursoDaLoja>> = { fornecedores: 'compras', vendas: 'relatorios' };
const ROTULO_DO_QUE_IMPORTAR: Record<OQueImportar, string> = { ...NOME_DO_CADASTRO, vendas: 'Vendas antigas' };
const NO_SINGULAR_E_PLURAL: Record<CadastroDaPlanilha, [string, string]> = { produtos: ['produto', 'produtos'], clientes: ['cliente', 'clientes'], fornecedores: ['fornecedor', 'fornecedores'] };

type Escolhida =
  | { tipo: 'cadastro'; nome: string; tabela: CelulaImportada[][]; previa: PreviaDaImportacao }
  | { tipo: 'vendas'; nome: string; tabela: CelulaImportada[][]; previa: PreviaDasVendasAntigas };

function CartaoImportar({ api, papel, baixar, aoMudar, ajustes }: Required<Pick<Props, 'api' | 'papel' | 'baixar'>> & Pick<Props, 'aoMudar' | 'ajustes'>) {
  const opcoes = (['produtos', 'clientes', 'fornecedores', 'vendas'] as const).filter((c) => {
    const recurso = RECURSO_PARA_IMPORTAR[c];
    return pode(papel, PERMISSAO_PARA_IMPORTAR[c]) && (!recurso || recursoLigado(ajustes, recurso));
  });
  const [oQue, setOQue] = useState<OQueImportar>(opcoes[0] ?? 'produtos');
  const [escolhida, setEscolhida] = useState<Escolhida | null>(null);
  const [ocupado, setOcupado] = useState<'lendo' | 'importando' | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  if (opcoes.length === 0) return null;

  function trocar(c: OQueImportar) {
    setOQue(c);
    setEscolhida(null);
    setAviso(null);
  }

  async function baixarModelo() {
    setAviso(null);
    try {
      const extra = oQue === 'clientes' ? (await api.lerConfiguracao()).regras.clientes.campoExtra : null;
      baixar(`modelo-${oQue === 'vendas' ? 'vendas-antigas' : oQue}.xlsx`, gerarXlsx(modeloDeImportacao(oQue, extra?.ativo ? extra.rotulo : null)));
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDe(e) });
    }
  }

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEscolhida(null);
    setAviso(null);
    setOcupado('lendo');
    try {
      const tabela = await lerArquivoDePlanilha(arquivo);
      setEscolhida(
        oQue === 'vendas'
          ? { tipo: 'vendas', nome: arquivo.name, tabela, previa: await api.conferirVendasAntigas(tabela) }
          : { tipo: 'cadastro', nome: arquivo.name, tabela, previa: await api.conferirImportacao(oQue, tabela) },
      );
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDe(falha) });
    } finally {
      setOcupado(null);
    }
  }

  async function importar() {
    if (!escolhida) return;
    setOcupado('importando');
    setAviso(null);
    const semAsLinhasComErro = escolhida.previa.contagem.erro > 0;
    try {
      let partes: string[];
      if (escolhida.tipo === 'vendas') {
        const r = await api.importarVendasAntigas(escolhida.tabela, { semAsLinhasComErro });
        partes = [
          `${plural(r.vendas, 'venda antiga importada', 'vendas antigas importadas')} (${formatarCentavos(r.totalCentavos)}): estão em Relatórios → Vendas antigas.`,
          r.vendasExistentes ? `${plural(r.vendasExistentes, 'já tinha sido importada e ficou de fora', 'já tinham sido importadas e ficaram de fora')}.` : '',
          r.linhasComErro ? `${plural(r.linhasComErro, 'linha com erro ficou de fora', 'linhas com erro ficaram de fora')}.` : '',
        ];
      } else {
        const r = await api.importarCadastro(escolhida.previa.cadastro, escolhida.tabela, { semAsLinhasComErro });
        const [um, varios] = NO_SINGULAR_E_PLURAL[r.cadastro];
        partes = [
          `${plural(r.importadas, `${um} importado`, `${varios} importados`)}.`,
          r.existentes ? `${plural(r.existentes, 'já existia e ficou como estava', 'já existiam e ficaram como estavam')}.` : '',
          r.repetidas ? `${plural(r.repetidas, 'linha repetida na planilha ficou de fora', 'linhas repetidas na planilha ficaram de fora')}.` : '',
          r.comErro ? `${plural(r.comErro, 'linha com erro ficou de fora', 'linhas com erro ficaram de fora')}.` : '',
        ];
      }
      setEscolhida(null);
      setAviso({ tipo: 'ok', texto: partes.filter(Boolean).join(' ') });
      aoMudar?.();
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDe(falha) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="db-importar-titulo">
      <h2 id="db-importar-titulo">Importar uma planilha</h2>
      <p className="suave db-sub">
        Traga os cadastros de outro sistema ou de uma planilha (.xlsx ou .csv). O que já está cadastrado (mesmo código de barras, CPF ou nome) fica como
        está: a importação só acrescenta. Antes de gravar, o sistema mostra o que vai entrar.
      </p>
      <fieldset className="db-escolha">
        <legend>O que vai importar?</legend>
        {opcoes.map((c) => (
          <label key={c} className={oQue === c ? 'db-escolha-on' : undefined}>
            <input type="radio" name="db-cadastro" value={c} checked={oQue === c} onChange={() => trocar(c)} disabled={ocupado !== null} />
            {ROTULO_DO_QUE_IMPORTAR[c]}
          </label>
        ))}
      </fieldset>
      {oQue === 'vendas' && (
        <p className="modal-dica db-dica-antes">
          As vendas antigas entram só como histórico: não mexem em estoque, caixa nem financeiro. Elas aparecem nos Relatórios, na aba Vendas antigas. Uma
          linha por item (com o produto) ou uma linha por venda (só o total).
        </p>
      )}
      {!escolhida && (
        <div className="db-exportar">
          <label className="botao botao-primario db-arquivo">
            {ocupado === 'lendo' ? 'Lendo a planilha…' : 'Escolher a planilha'}
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void escolher(e)}
              aria-label={`Escolher a planilha de ${ROTULO_DO_QUE_IMPORTAR[oQue].toLowerCase()} para importar`}
              disabled={ocupado !== null}
            />
          </label>
          <button type="button" className="botao rel-exportar" onClick={() => void baixarModelo()} disabled={ocupado !== null}>
            <IconeExcel />
            Baixar o modelo
          </button>
        </div>
      )}
      {escolhida && (
        <PreviaDaPlanilha
          titulo={
            escolhida.tipo === 'vendas'
              ? `${plural(escolhida.previa.vendas, 'venda', 'vendas')} (${formatarCentavos(escolhida.previa.totalCentavos)}${
                  escolhida.previa.de && escolhida.previa.ate ? `, de ${dataBr(escolhida.previa.de)} a ${dataBr(escolhida.previa.ate)}` : ''
                }). ${resumoDaImportacao(escolhida.previa.contagem)}`
              : resumoDaImportacao(escolhida.previa.contagem)
          }
          nome={escolhida.nome}
          previa={escolhida.previa}
          botao={
            escolhida.tipo === 'vendas'
              ? escolhida.previa.vendas > 0
                ? escolhida.previa.contagem.erro > 0
                  ? `Importar só as vendas certas (${escolhida.previa.vendas})`
                  : `Importar ${plural(escolhida.previa.vendas, 'venda antiga', 'vendas antigas')}`
                : null
              : escolhida.previa.contagem.nova > 0
                ? escolhida.previa.contagem.erro > 0
                  ? `Importar só as linhas certas (${escolhida.previa.contagem.nova})`
                  : `Importar ${plural(escolhida.previa.contagem.nova, ...NO_SINGULAR_E_PLURAL[escolhida.previa.cadastro])}`
                : null
          }
          ocupado={ocupado === 'importando'}
          aoImportar={() => void importar()}
          aoCancelar={() => setEscolhida(null)}
        />
      )}
      <MostrarAviso aviso={aviso} />
    </section>
  );
}

function PreviaDaPlanilha({
  titulo,
  nome,
  previa: p,
  botao,
  ocupado,
  aoImportar,
  aoCancelar,
}: {
  titulo: string;
  nome: string;
  previa: Pick<PreviaDaImportacao, 'colunas' | 'ignoradas' | 'contagem' | 'linhas'>;
  /** O texto do botão de importar; null = nada a importar. */
  botao: string | null;
  ocupado: boolean;
  aoImportar: () => void;
  aoCancelar: () => void;
}) {
  const semObservacao = p.contagem.nova - p.linhas.filter((l) => l.situacao === 'nova').length;
  return (
    <div className="db-previa" role="group" aria-label="O que a planilha traz">
      <p className="db-previa-titulo">
        <strong>{nome}</strong>: {titulo}
      </p>
      <p className="modal-dica">
        Colunas usadas: {p.colunas.join(', ')}.{p.ignoradas.length > 0 ? ` Ficam de fora: ${p.ignoradas.join(', ')}.` : ''}
      </p>
      {p.linhas.length > 0 && (
        <div className="tabela-caixa tabela-caixa-borda">
          <table className="tabela db-importar-tabela">
            <thead>
              <tr>
                <th scope="col">Linha</th>
                <th scope="col">Nome</th>
                <th scope="col">Situação</th>
                <th scope="col">O que acontece</th>
              </tr>
            </thead>
            <tbody>
              {p.linhas.map((l) => (
                <tr key={l.numero} className={`db-linha-${l.situacao}`}>
                  <td data-rotulo="Linha">{l.numero}</td>
                  <td data-rotulo="Nome">{l.nome || '—'}</td>
                  <td data-rotulo="Situação">{NOME_DA_SITUACAO[l.situacao]}</td>
                  <td data-rotulo="O que acontece">{[...l.motivos, ...l.avisos].join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {semObservacao > 0 && p.linhas.length > 0 && <p className="modal-dica">{plural(semObservacao, 'outra linha entra', 'outras linhas entram')} sem observação.</p>}
      {botao === null ? (
        <p className="alerta alerta-aviso">Nada a importar: as linhas desta planilha já estão cadastradas (ou importadas), repetidas ou com erro.</p>
      ) : (
        p.contagem.erro > 0 && (
          <p className="alerta alerta-aviso">As linhas com erro ficam de fora. Depois, corrija a planilha e importe de novo: o que já tiver entrado não se repete.</p>
        )
      )}
      <div className="modal-acoes">
        <button type="button" className="botao" onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </button>
        {botao !== null && (
          <button type="button" className="botao botao-primario" onClick={aoImportar} disabled={ocupado}>
            {ocupado ? 'Importando…' : botao}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ exportar para o Excel

async function montarPlanilha(api: ApiPainel, cadastro: CadastroDaPlanilha, papel: QuemAcessa): Promise<Planilha> {
  if (cadastro === 'produtos') {
    const [produtos, estoque, fornecedores] = await Promise.all([
      api.listarProdutos(),
      // o estoque e os fornecedores completam a planilha; sem eles (sistema da loja sem essa parte), as colunas vão vazias
      api.listarEstoque().catch(() => null),
      pode(papel, 'compras') ? api.listarFornecedores().catch(() => null) : Promise.resolve(null),
    ]);
    return planilhaDeProdutos(produtos, estoque, fornecedores);
  }
  if (cadastro === 'clientes') {
    const [clientes, configuracao] = await Promise.all([api.listarClientes(''), api.lerConfiguracao()]);
    return planilhaDeClientes(clientes, configuracao.regras.clientes.campoExtra, pode(papel, 'clientes.cpf'));
  }
  return planilhaDeFornecedores(await api.listarFornecedores());
}

function CartaoExportar({ api, papel, nomeDaLoja, fuso, agora, baixar }: Required<Pick<Props, 'api' | 'papel' | 'nomeDaLoja' | 'fuso' | 'agora' | 'baixar'>>) {
  const [ocupado, setOcupado] = useState<CadastroDaPlanilha | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // cada cadastro com o acesso da aba dele: clientes com Clientes, fornecedores com Compras
  const cadastros = (['produtos', 'clientes', 'fornecedores'] as const).filter((c) => c === 'produtos' || pode(papel, c === 'clientes' ? 'clientes' : 'compras'));

  async function exportar(cadastro: CadastroDaPlanilha) {
    setOcupado(cadastro);
    setAviso(null);
    try {
      const planilha = await montarPlanilha(api, cadastro, papel);
      const quando = agora();
      baixar(`${cadastro}-${nomeParaArquivo(nomeDaLoja)}-${diaNoFuso(quando, fuso)}.xlsx`, gerarXlsx([planilha], quando));
      // fica no histórico (a planilha pode levar dados de clientes); sem essa parte no sistema, só não fica registrado
      await api.registrarPlanilhaExportada({ assunto: NOME_DO_CADASTRO[cadastro], linhas: planilha.linhas.length }).catch(() => undefined);
      setAviso({ tipo: 'ok', texto: `Planilha de ${NOME_DO_CADASTRO[cadastro].toLowerCase()} baixada: ${plural(planilha.linhas.length, 'linha', 'linhas')}.` });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDe(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="db-exportar-titulo">
      <h2 id="db-exportar-titulo">Exportar para o Excel</h2>
      <p className="suave db-sub">
        Os cadastros da loja numa planilha, com as mesmas colunas do modelo de importação. Serve para conferir, guardar ou levar os cadastros para outra loja.
      </p>
      <div className="db-exportar">
        {cadastros.map((c) => (
          <button key={c} type="button" className="botao rel-exportar" onClick={() => void exportar(c)} disabled={ocupado !== null}>
            <IconeExcel />
            {ocupado === c ? 'Gerando…' : `${NOME_DO_CADASTRO[c]} (Excel)`}
          </button>
        ))}
      </div>
      {cadastros.includes('clientes') && !pode(papel, 'clientes.cpf') && (
        <p className="modal-dica db-dica">Na planilha de clientes, o CPF vai em branco: o CPF completo é só para quem pode vê-lo.</p>
      )}
      <MostrarAviso aviso={aviso} />
    </section>
  );
}

// ------------------------------------------------------------------ cópia de segurança

function CartaoCopia({ api, papel, fuso, baixar }: Required<Pick<Props, 'api' | 'papel' | 'fuso' | 'baixar'>>) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const podeBaixar = podeBaixarCopia(papel);

  async function baixarCopia() {
    setOcupado(true);
    setAviso(null);
    try {
      const copia = await api.gerarCopiaDaLoja();
      const nome = `copia-de-seguranca-${nomeParaArquivo(copia.loja.nome)}-${momentoParaArquivo(new Date(copia.geradaEm), fuso)}.json`;
      baixar(nome, arquivoDaCopia(copia), TIPO_JSON);
      const registros = Object.values(copia.contagem).reduce((s, n) => s + n, 0);
      setAviso({ tipo: 'ok', texto: `Cópia baixada (${nome}): ${plural(registros, 'registro', 'registros')}. Guarde em lugar seguro.` });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDe(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="db-copia-titulo">
      <h2 id="db-copia-titulo">Cópia de segurança</h2>
      <p className="suave db-sub">
        Um arquivo com todos os dados da loja: cadastros, vendas, estoque, caixa, financeiro, fidelidade, vales-troca e o histórico. Guarde em lugar seguro:
        ele tem os dados pessoais dos clientes, como o CPF (LGPD).
      </p>
      <div className="db-exportar">
        <button type="button" className="botao botao-primario" onClick={() => void baixarCopia()} disabled={!podeBaixar || ocupado}>
          {ocupado ? 'Gerando a cópia…' : 'Baixar a cópia de segurança'}
        </button>
      </div>
      {!podeBaixar && <p className="modal-dica db-dica">{MENSAGENS_DA_COPIA.precisaCpf}</p>}
      {!pode(papel, 'dados.restaurar') && (
        <p className="modal-dica db-dica">Restaurar uma cópia é com o Adm. Sup (o suporte do sistema), porque troca todos os dados atuais da loja.</p>
      )}
      <MostrarAviso aviso={aviso} />
    </section>
  );
}

// ------------------------------------------------------------------ restaurar (só o Adm. Sup)

function CartaoRestaurar({ api, fuso, baixar, aoMudar }: Required<Pick<Props, 'api' | 'fuso' | 'baixar'>> & Pick<Props, 'aoMudar'>) {
  const [escolhida, setEscolhida] = useState<{ nome: string; texto: string; previa: PreviaDaCopia } | null>(null);
  const [entendi, setEntendi] = useState(false);
  const [ocupado, setOcupado] = useState<'conferindo' | 'restaurando' | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEscolhida(null);
    setEntendi(false);
    setAviso(null);
    if (arquivo.size > COPIA_MAX_BYTES) {
      setAviso({ tipo: 'erro', texto: MENSAGENS_DA_COPIA.grande });
      return;
    }
    setOcupado('conferindo');
    try {
      const texto = await lerComoTexto(arquivo);
      setEscolhida({ nome: arquivo.name, texto, previa: await api.conferirCopiaDaLoja(texto) });
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDe(falha) });
    } finally {
      setOcupado(null);
    }
  }

  async function restaurar() {
    if (!escolhida || !entendi) return;
    setOcupado('restaurando');
    setAviso(null);
    try {
      // DaniPets DAT-05: antes de trocar, baixa os dados de agora (se não der para baixar, não troca)
      const atual = await api.gerarCopiaDaLoja();
      const nomeAntes = `copia-antes-de-restaurar-${nomeParaArquivo(atual.loja.nome)}-${momentoParaArquivo(new Date(atual.geradaEm), fuso)}.json`;
      baixar(nomeAntes, arquivoDaCopia(atual), TIPO_JSON);
      const feita = await api.restaurarCopiaDaLoja(escolhida.texto);
      setEscolhida(null);
      setEntendi(false);
      setAviso({
        tipo: 'ok',
        texto: `Cópia de ${dataNoFuso(feita.geradaEm, fuso)} restaurada (${plural(feita.registros, 'registro', 'registros')}). Os dados de antes foram baixados no arquivo ${nomeAntes}.`,
      });
      aoMudar?.();
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: mensagemDe(falha) });
    } finally {
      setOcupado(null);
    }
  }

  const p = escolhida?.previa;
  return (
    <section className="card db-card" aria-labelledby="db-restaurar-titulo">
      <h2 id="db-restaurar-titulo">Restaurar uma cópia</h2>
      <p className="suave db-sub">
        Troca todos os dados da loja pelos de uma cópia de segurança desta loja. Antes de trocar, o sistema baixa uma cópia dos dados de agora. A equipe (usuários
        e senhas) e o histórico continuam como estão. Só o Adm. Sup vê esta parte.
      </p>
      {!p && (
        <div className="db-exportar">
          <label className="botao db-arquivo">
            {ocupado === 'conferindo' ? 'Conferindo o arquivo…' : 'Escolher o arquivo da cópia'}
            <input type="file" accept=".json,application/json" onChange={(e) => void escolher(e)} aria-label="Escolher o arquivo da cópia de segurança" disabled={ocupado !== null} />
          </label>
        </div>
      )}
      {p && escolhida && (
        <div className="db-previa" role="group" aria-label="O que a cópia leva">
          <p className="db-previa-titulo">
            <strong>
              Cópia de {dataNoFuso(p.geradaEm, fuso)} às {horaNoFuso(p.geradaEm, fuso)}
            </strong>
            {p.geradaPor ? `, baixada por ${p.geradaPor}` : ''}. {plural(p.registros, 'registro', 'registros')} no arquivo {escolhida.nome}.
          </p>
          <ul className="db-previa-lista">
            {p.assuntos
              .filter((a) => a.quantidade > 0)
              .map((a) => (
                <li key={a.assunto}>
                  <span>{a.nome}</span>
                  <strong>{a.quantidade}</strong>
                </li>
              ))}
          </ul>
          <p className="alerta alerta-aviso">
            Os dados atuais da loja serão trocados pelos desta cópia. O que foi feito depois de {dataNoFuso(p.geradaEm, fuso)} às {horaNoFuso(p.geradaEm, fuso)} sai
            do sistema (fica só no histórico e na cópia que o sistema baixa antes de trocar).
          </p>
          <label className="db-confirmar">
            <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} disabled={ocupado !== null} />
            Entendi: os dados atuais da loja serão trocados pelos desta cópia.
          </label>
          <div className="modal-acoes">
            <button type="button" className="botao" onClick={() => (setEscolhida(null), setEntendi(false))} disabled={ocupado !== null}>
              Cancelar
            </button>
            <button type="button" className="botao botao-perigo" onClick={() => void restaurar()} disabled={!entendi || ocupado !== null}>
              {ocupado === 'restaurando' ? 'Restaurando…' : 'Restaurar esta cópia'}
            </button>
          </div>
        </div>
      )}
      <MostrarAviso aviso={aviso} />
    </section>
  );
}
