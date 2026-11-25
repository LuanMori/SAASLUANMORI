// apps/web/src/painel/TelaDadosBackup.tsx
// Aba Dados e backup (Dono e Administrador). Fase 2, módulo 1 (decisão P5 do Luan): aqui ficam os
// "Dados da loja" — nome, descrição e logo, que aparecem na barra lateral, na entrada, nas mensagens de
// WhatsApp e no regulamento (DaniPets ESP-01 e 05: lá eram fixos no código) — e as regras que não têm aba
// própria (o desconto que o Vendedor dá sem senha; no DaniPets, fixo em 10%). As outras regras ficam nas
// abas onde são usadas, como no DaniPets. Módulo 13 (pedido do Luan, 25/11/2026): a tela ganhou partes —
// "Dados do sistema" (o que está acima), "Importar e exportar" (planilhas e cópia de segurança) e "Adm. Sup"
// (atualizações, ajustes por loja, visões sob medida e manutenção), esta só para o Adm. Sup
// (permissão 'suporte.ferramentas'). Parte ainda não trabalhada fica em branco até chegar a vez dela.
import { type DadosDaLoja, LIMITES_LOJA, LIMITES_REGRAS, pode, type RegrasDaLoja, type QuemAcessa } from '@saas/core';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { type ApiLoja, ErroApi } from '../api';
import { iniciais } from './BarraLateral';
import { usarCarga } from './usarCarga';

interface Props {
  api: ApiLoja;
  papel: QuemAcessa;
  /** Os dados ou as regras mudaram: a área logada recarrega (barra lateral, Frente de caixa). */
  aoMudar?: () => void;
}

const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.');

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
/** Tamanho do arquivo escolhido (antes de reduzir). */
const ARQUIVO_MAX_BYTES = 5 * 1024 * 1024;
/** O logo é reduzido para caber num quadrado deste tamanho (aparece pequeno na barra lateral). */
const LADO_DO_LOGO = 256;

function lerComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.readAsDataURL(arquivo);
  });
}

/** Reduz a imagem no próprio navegador (nada é enviado para fora). null = este navegador não reduz. */
async function reduzir(arquivo: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_DO_LOGO / Math.max(imagem.width, imagem.height));
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(imagem, 0, 0, largura, altura);
  imagem.close();
  const png = tela.toDataURL('image/png');
  return png.length <= LIMITES_LOJA.logoMaxCaracteres ? png : tela.toDataURL('image/jpeg', 0.85);
}

/**
 * Roda `aoMudar` só quando o valor gravado MUDA (salvo aqui ou em outra aba) — nunca ao abrir, para não
 * apagar o que a pessoa já começou a digitar.
 */
function usarQuandoMudar(valor: unknown, aoMudar: () => void) {
  const chave = JSON.stringify(valor);
  const anterior = useRef(chave);
  useEffect(() => {
    if (anterior.current === chave) return;
    anterior.current = chave;
    aoMudar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a chave importa
  }, [chave]);
}

/** Arquivo escolhido → data URL do logo (PNG, JPEG ou WebP, reduzido). */
export async function prepararLogo(arquivo: File): Promise<string> {
  if (!TIPOS_LOGO.includes(arquivo.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  if (arquivo.size > ARQUIVO_MAX_BYTES) throw new Error('A imagem passa de 5 MB. Escolha uma menor.');
  const reduzida = await reduzir(arquivo).catch(() => null);
  const logo = reduzida ?? (await lerComoDataUrl(arquivo));
  if (logo.length > LIMITES_LOJA.logoMaxCaracteres) throw new Error('O logo é grande demais. Use uma imagem menor (até 200 KB).');
  return logo;
}

/**
 * As partes de Dados e backup (pedido do Luan, 25/11/2026): os dados do sistema (o que já havia), importar e exportar
 * (planilhas e cópia de segurança) e a do Adm. Sup, que só ele vê. Parte ainda não trabalhada fica em branco.
 */
type Parte = 'sistema' | 'arquivos' | 'admsup';
const PARTES: { id: Parte; rotulo: string }[] = [
  { id: 'sistema', rotulo: 'Dados do sistema' },
  { id: 'arquivos', rotulo: 'Importar e exportar' },
  { id: 'admsup', rotulo: 'Adm. Sup' },
];

export function TelaDadosBackup({ api, papel, aoMudar }: Props) {
  const { estado, recarregar } = usarCarga(() => api.lerConfiguracao(), [api]);
  const podeAlterar = pode(papel, 'loja.configurar');
  const ehAdmSup = pode(papel, 'suporte.ferramentas');
  const partes = PARTES.filter((p) => p.id !== 'admsup' || ehAdmSup);
  const [parte, setParte] = useState<Parte>('sistema');
  const salvou = () => {
    void recarregar();
    aoMudar?.();
  };

  return (
    <div className="rel db">
      <header className="vg-topo">
        <div>
          <h1>Dados e backup</h1>
          <p className="suave">Os dados e as regras da loja, as planilhas para importar e exportar e a cópia de segurança.</p>
        </div>
      </header>

      <nav className="cli-abas rel-abas" aria-label="Partes de Dados e backup">
        {partes.map((p) => (
          <button key={p.id} type="button" className={parte === p.id ? 'cli-aba-on' : ''} aria-current={parte === p.id ? 'page' : undefined} onClick={() => setParte(p.id)}>
            {p.rotulo}
          </button>
        ))}
      </nav>

      {parte === 'sistema' &&
        (estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? (
          <p className="alerta alerta-erro" role="alert">
            {estado.mensagem}
          </p>
        ) : estado.tipo === 'carregando' ? (
          <p className="suave">Carregando…</p>
        ) : (
          <>
            <CartaoDadosDaLoja api={api} dados={estado.dados.dados} podeAlterar={podeAlterar} aoSalvar={salvou} />
            <CartaoRegrasGerais api={api} regras={estado.dados.regras} podeAlterar={podeAlterar} aoSalvar={salvou} />
          </>
        ))}
    </div>
  );
}

function CartaoDadosDaLoja({ api, dados, podeAlterar, aoSalvar }: { api: ApiLoja; dados: DadosDaLoja; podeAlterar: boolean; aoSalvar: () => void }) {
  const [nome, setNome] = useState(dados.nome);
  const [descricao, setDescricao] = useState(dados.descricao ?? '');
  const [logo, setLogo] = useState<string | null>(dados.logo);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // os dados mudaram (salvos aqui ou em outra aba): o formulário mostra o que está gravado
  usarQuandoMudar(dados, () => {
    setNome(dados.nome);
    setDescricao(dados.descricao ?? '');
    setLogo(dados.logo);
  });

  const mudanca: Partial<DadosDaLoja> = {};
  if (nome.trim() !== dados.nome) mudanca.nome = nome;
  if ((descricao.trim() || null) !== dados.descricao) mudanca.descricao = descricao;
  if (logo !== dados.logo) mudanca.logo = logo;
  const mudou = Object.keys(mudanca).length > 0;

  async function escolherLogo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(null);
    setAviso(null);
    try {
      setLogo(await prepararLogo(arquivo));
    } catch (falha) {
      setErro(mensagemDe(falha));
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      await api.salvarDadosDaLoja(mudanca);
      setAviso('Dados da loja salvos.');
      aoSalvar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="db-loja-titulo">
      <h2 id="db-loja-titulo">Dados da loja</h2>
      <p className="suave db-sub">Aparecem na barra lateral e na tela de entrada. Quando a fidelidade estiver pronta, também nas mensagens de WhatsApp e no regulamento.</p>
      <form className="db-form" onSubmit={salvar} noValidate>
        <div className="db-logo">
          <div className="db-logo-previa" aria-hidden="true">
            {logo ? <img src={logo} alt="" /> : <span>{iniciais(nome || dados.nome)}</span>}
          </div>
          {podeAlterar && (
            <div className="db-logo-acoes">
              <label className="botao db-arquivo">
                {logo ? 'Trocar o logo' : 'Escolher o logo'}
                <input type="file" accept={TIPOS_LOGO.join(',')} onChange={(e) => void escolherLogo(e)} aria-label="Escolher a imagem do logo" />
              </label>
              {logo && (
                <button type="button" className="link" onClick={() => setLogo(null)}>
                  Tirar o logo
                </button>
              )}
              <span className="modal-dica">PNG, JPEG ou WebP. A imagem é reduzida aqui mesmo, no navegador.</span>
            </div>
          )}
        </div>
        <div className="campo">
          <label htmlFor="db-nome">Nome da loja</label>
          <input id="db-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={LIMITES_LOJA.nomeMax} disabled={!podeAlterar} autoComplete="organization" />
        </div>
        <div className="campo">
          <label htmlFor="db-descricao">Descrição (abaixo do nome, na barra lateral)</label>
          <input
            id="db-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={LIMITES_LOJA.descricaoMax}
            disabled={!podeAlterar}
            placeholder="Ex.: Rações, petiscos e acessórios"
          />
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="alerta" role="status">
            {aviso}
          </p>
        )}
        {podeAlterar && (
          <div className="modal-acoes">
            <button type="submit" className="botao botao-primario" disabled={!mudou || enviando}>
              {enviando ? 'Salvando…' : 'Salvar os dados da loja'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

const LIMITE_DESCONTO = LIMITES_REGRAS['venda.descontoSemSenhaPct'];

/** "12,5" ou "12.5" -> 12.5; vazio ou texto -> null. */
export function lerPercentual(texto: string): number | null {
  const t = texto.replace('%', '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function CartaoRegrasGerais({ api, regras, podeAlterar, aoSalvar }: { api: ApiLoja; regras: RegrasDaLoja; podeAlterar: boolean; aoSalvar: () => void }) {
  const [desconto, setDesconto] = useState(String(regras.venda.descontoSemSenhaPct).replace('.', ','));
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  usarQuandoMudar(regras.venda.descontoSemSenhaPct, () => setDesconto(String(regras.venda.descontoSemSenhaPct).replace('.', ',')));
  const valor = lerPercentual(desconto);
  const mudou = valor !== regras.venda.descontoSemSenhaPct;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (valor === null) {
      setErro(`Informe um número de ${LIMITE_DESCONTO.min} a ${LIMITE_DESCONTO.max} (por exemplo, 10 ou 12,5).`);
      return;
    }
    setEnviando(true);
    try {
      await api.salvarRegrasDaLoja({ venda: { descontoSemSenhaPct: valor } });
      setAviso('Regra salva. Vale para as próximas vendas na Frente de caixa.');
      aoSalvar();
    } catch (falha) {
      setErro(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card db-card" aria-labelledby="db-regras-titulo">
      <h2 id="db-regras-titulo">Regras gerais</h2>
      <form className="db-form" onSubmit={salvar} noValidate>
        <div className="campo db-campo-curto">
          <label htmlFor="db-desconto">Desconto que o Vendedor dá sem senha (%)</label>
          <input id="db-desconto" value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" disabled={!podeAlterar} aria-describedby="db-desconto-dica" />
          <span id="db-desconto-dica" className="modal-dica">
            Acima disso, a Frente de caixa pede a senha do Dono ou do Administrador. Brinde (preço R$ 0,00) sempre pede o Dono. Padrão: 10%.
          </span>
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="alerta" role="status">
            {aviso}
          </p>
        )}
        {podeAlterar && (
          <div className="modal-acoes">
            <button type="submit" className="botao botao-primario" disabled={!mudou || enviando}>
              {enviando ? 'Salvando…' : 'Salvar a regra'}
            </button>
          </div>
        )}
      </form>
      <p className="card-rodape db-rodape">
        As outras regras (caixa, fiado, cashback, motivos de ajuste, categorias de despesa) já valem com os padrões do DaniPets e vão poder ser mudadas nas
        abas onde são usadas, à medida que cada aba ficar pronta.
      </p>
    </section>
  );
}
