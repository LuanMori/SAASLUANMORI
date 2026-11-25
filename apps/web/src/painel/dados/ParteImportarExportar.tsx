// apps/web/src/painel/dados/ParteImportarExportar.tsx
// Dados e backup → "Importar e exportar" (Fase 2, módulo 13; pedido do Luan, 25/11/2026):
//   - EXPORTAR PARA O EXCEL os cadastros (produtos, clientes e fornecedores), com as colunas do modelo de importação;
//   - CÓPIA DE SEGURANÇA: um arquivo com todos os dados da loja (DaniPets DAT-01). Leva o CPF completo dos clientes:
//     só quem pode vê-lo baixa;
//   - RESTAURAR UMA CÓPIA (DaniPets DAT-05): só o Adm. Sup, porque troca os dados atuais. O arquivo é conferido antes
//     (formato, loja e conferência), a tela mostra o que ele leva, pede a confirmação e, antes de trocar, baixa uma
//     cópia dos dados de agora.
// A importação de planilhas entra aqui na próxima parte do módulo (13c).
import {
  type CadastroDaPlanilha,
  COPIA_MAX_BYTES,
  type CopiaDaLoja,
  diaNoFuso,
  MENSAGENS_DA_COPIA,
  NOME_DO_CADASTRO,
  pode,
  podeBaixarCopia,
  type QuemAcessa,
} from '@saas/core';
import { type ChangeEvent, useState } from 'react';
import { type ApiPainel, ErroApi, type PreviaDaCopia } from '../../api';
import { type Baixar, baixarArquivo } from '../../relatorios/baixar';
import { gerarXlsx, type Planilha } from '../../relatorios/xlsx';
import { dataNoFuso, horaNoFuso, plural } from '../formato';
import { IconeExcel } from '../relatorios/TabelaDaPlanilha';
import { momentoParaArquivo, nomeParaArquivo, planilhaDeClientes, planilhaDeFornecedores, planilhaDeProdutos } from './planilhasDeCadastro';

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

export function ParteImportarExportar({ api, papel, nomeDaLoja, fuso, agora = () => new Date(), baixar = baixarArquivo, aoMudar }: Props) {
  return (
    <>
      <CartaoExportar api={api} papel={papel} nomeDaLoja={nomeDaLoja} fuso={fuso} agora={agora} baixar={baixar} />
      <CartaoCopia api={api} papel={papel} fuso={fuso} baixar={baixar} />
      {pode(papel, 'dados.restaurar') && <CartaoRestaurar api={api} fuso={fuso} baixar={baixar} aoMudar={aoMudar} />}
    </>
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
