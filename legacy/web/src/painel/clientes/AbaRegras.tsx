// apps/web/src/painel/clientes/AbaRegras.tsx
// Aba Regras do programa (Fase 2, módulo 7), como no DaniPets V9.3.3 (cliTabRegras, CLI-17 e 18):
//   - Cashback (percentual e prazo), Retorno e cupom (dias sem comprar, desconto e validade do cupom, aviso de
//     cashback vencendo), Fiado (prazo e "fiado vencido pede liberação") e Cadastro (com o campo extra da loja,
//     o "Pet" do DaniPets: decisão P12);
//   - as mensagens do WhatsApp, com {nome}, {loja}... (cada mensagem só aceita as variáveis dela);
//   - o regulamento para deixar na loja, com o nome e as regras da loja, pronto para copiar;
//   - o Dono e o Administrador alteram; o Vendedor vê a página para explicar o programa ao cliente.
import { LIMITES_LOJA, LIMITES_REGRAS, regulamentoDoPrograma, type RegrasDaLoja, VARIAVEIS_MENSAGEM } from '@saas/core';
import { type FormEvent, type ReactNode, useState } from 'react';
import { type ApiPainel, ErroApi } from '../../api';

type CampoNumero = 'cashback.percentual' | 'cashback.validadeDias' | 'cashback.avisoDias' | 'retorno.diasSemComprar' | 'retorno.cupomPct' | 'retorno.cupomValidadeDias' | 'fiado.prazoDias';
type TipoMensagem = keyof RegrasDaLoja['mensagens'];

const MENSAGENS: { tipo: TipoMensagem; titulo: string }[] = [
  { tipo: 'retorno', titulo: 'Lembrete de retorno (com cupom)' },
  { tipo: 'cashback', titulo: 'Aviso de cashback vencendo' },
  { tipo: 'cobranca', titulo: 'Lembrete de pagamento do fiado' },
];

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível salvar. Tente de novo.');
const numeroTexto = (n: number) => String(n).replace('.', ',');

/** Cada regra: título, explicação e o valor (campo ou texto fixo). */
function Regra({ titulo, detalhe, children }: { titulo: string; detalhe: string; children?: ReactNode }) {
  return (
    <div className="reg-linha">
      <div className="reg-titulo">{titulo}</div>
      <div className="reg-detalhe suave">{detalhe}</div>
      {children && <div className="reg-valor">{children}</div>}
    </div>
  );
}

export function AbaRegras({
  api,
  regras,
  nomeLoja,
  podeAlterar,
  aoSalvar,
}: {
  api: Pick<ApiPainel, 'salvarRegrasDaLoja'>;
  regras: RegrasDaLoja;
  nomeLoja: string;
  podeAlterar: boolean;
  aoSalvar: (mensagem: string) => void;
}) {
  const inicial = (): Record<CampoNumero, string> => ({
    'cashback.percentual': numeroTexto(regras.cashback.percentual),
    'cashback.validadeDias': String(regras.cashback.validadeDias),
    'cashback.avisoDias': String(regras.cashback.avisoDias),
    'retorno.diasSemComprar': String(regras.retorno.diasSemComprar),
    'retorno.cupomPct': numeroTexto(regras.retorno.cupomPct),
    'retorno.cupomValidadeDias': String(regras.retorno.cupomValidadeDias),
    'fiado.prazoDias': String(regras.fiado.prazoDias),
  });
  const [numeros, setNumeros] = useState(inicial);
  const [vencidoPedeDono, setVencidoPedeDono] = useState(regras.fiado.vencidoPedeDono);
  const [extraAtivo, setExtraAtivo] = useState(regras.clientes.campoExtra.ativo);
  const [extraRotulo, setExtraRotulo] = useState(regras.clientes.campoExtra.rotulo);
  const [mensagens, setMensagens] = useState({ ...regras.mensagens });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const regulamento = regulamentoDoPrograma(nomeLoja, regras);

  // função comum (não componente): o campo não é recriado a cada tecla e não perde o foco
  const numero = (campo: CampoNumero, sufixo: string) => (
    <span className="reg-numero">
      <label className="sr-only" htmlFor={`reg-${campo}`}>
        {LIMITES_REGRAS[campo].rotulo}
      </label>
      <input
        id={`reg-${campo}`}
        value={numeros[campo]}
        onChange={(e) => setNumeros((n) => ({ ...n, [campo]: e.target.value }))}
        inputMode={LIMITES_REGRAS[campo].casas ? 'decimal' : 'numeric'}
        maxLength={7}
        disabled={!podeAlterar}
      />
      <span className="suave">{sufixo}</span>
    </span>
  );

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setCopiado(null);
    const lidos = {} as Record<CampoNumero, number>;
    for (const campo of Object.keys(numeros) as CampoNumero[]) {
      const t = numeros[campo].trim();
      const l = LIMITES_REGRAS[campo];
      if (!/^\d+([.,]\d+)?$/.test(t)) return setErro(`${l.rotulo}: informe um número.`);
      const v = Number(t.replace(',', '.'));
      if (v < l.min || v > l.max) return setErro(`${l.rotulo}: use um valor entre ${numeroTexto(l.min)} e ${numeroTexto(l.max)}.`);
      if (!l.casas && !Number.isInteger(v)) return setErro(`${l.rotulo}: use um número inteiro de dias.`);
      lidos[campo] = v;
    }
    for (const m of MENSAGENS) if (!mensagens[m.tipo].trim()) return setErro('As mensagens não podem ficar em branco.');
    if (extraAtivo && !extraRotulo.trim()) return setErro('Dê um nome para o campo extra (ex.: Pet, Veículo).');
    setEnviando(true);
    try {
      await api.salvarRegrasDaLoja({
        cashback: { percentual: lidos['cashback.percentual'], validadeDias: lidos['cashback.validadeDias'], avisoDias: lidos['cashback.avisoDias'] },
        retorno: { diasSemComprar: lidos['retorno.diasSemComprar'], cupomPct: lidos['retorno.cupomPct'], cupomValidadeDias: lidos['retorno.cupomValidadeDias'] },
        fiado: { prazoDias: lidos['fiado.prazoDias'], vencidoPedeDono },
        mensagens: { retorno: mensagens.retorno, cashback: mensagens.cashback, cobranca: mensagens.cobranca },
        clientes: { campoExtra: { ativo: extraAtivo, rotulo: extraRotulo.trim() || regras.clientes.campoExtra.rotulo } },
      });
      aoSalvar('Regras salvas. Valem para as próximas vendas e lembretes.');
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(regulamento);
      setCopiado('Regulamento copiado.');
    } catch {
      // sem acesso à área de transferência: seleciona o texto para o Ctrl+C
      const pre = document.getElementById('cli-regulamento');
      const sel = window.getSelection();
      if (pre && sel) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      setCopiado('Texto selecionado. Use Ctrl+C para copiar.');
    }
  }

  return (
    <form className="reg" onSubmit={salvar} noValidate autoComplete="off">
      {!podeAlterar && (
        <p className="alerta" role="note">
          Só o Dono e o Administrador alteram as regras. O Vendedor vê esta página para explicar o programa ao cliente.
        </p>
      )}
      <div className="reg-grade">
        <section className="card card-plano" aria-labelledby="reg-cashback">
          <div className="card-cabeca">
            <h2 id="reg-cashback">Cashback</h2>
          </div>
          <Regra titulo="Percentual" detalhe="Sobre o valor pago em dinheiro, Pix ou cartão. Zero desliga o cashback.">
            {numero('cashback.percentual', '%')}
          </Regra>
          <Regra titulo="Prazo para usar" detalhe="Cada cashback vence nesse prazo, contado da compra.">
            {numero('cashback.validadeDias', 'dias')}
          </Regra>
          <Regra titulo="Mínimo e máximo por compra" detalhe="Não há valor mínimo de compra nem limite de uso." />
          <Regra titulo="Produtos que dão cashback" detalhe="Todos os produtos." />
          <Regra titulo="Parte paga com cashback, vale-troca ou fiado" detalhe="Não gera cashback. O fiado não gera nem quando é pago." />
          <Regra titulo="Devolução e cancelamento" detalhe="Retiram o cashback da compra. O cashback usado na compra volta para o cliente." />
        </section>

        <section className="card card-plano" aria-labelledby="reg-retorno">
          <div className="card-cabeca">
            <h2 id="reg-retorno">Retorno e cupom</h2>
          </div>
          <Regra titulo="Lembrar após" detalhe="Dias sem comprar para o cliente entrar na lista de retorno.">
            {numero('retorno.diasSemComprar', 'dias')}
          </Regra>
          <Regra titulo="Desconto do cupom de retorno" detalhe="Oferecido na mensagem e aplicado sozinho na Frente de caixa. Zero: sem cupom.">
            {numero('retorno.cupomPct', '%')}
          </Regra>
          <Regra titulo="Validade do cupom" detalhe="Contada a partir da mensagem.">
            {numero('retorno.cupomValidadeDias', 'dias')}
          </Regra>
          <Regra titulo="Aviso de cashback vencendo" detalhe="Quantos dias antes do vencimento o cliente entra na lista.">
            {numero('cashback.avisoDias', 'dias')}
          </Regra>
          <Regra titulo="Frequência" detalhe="Um lembrete por ciclo e só para quem autorizou mensagens." />
        </section>

        <section className="card card-plano" aria-labelledby="reg-fiado">
          <div className="card-cabeca">
            <h2 id="reg-fiado">Fiado</h2>
          </div>
          <Regra titulo="Limite de crédito" detalhe="Definido no cadastro de cada cliente, pelo Dono ou pelo Administrador." />
          <Regra titulo="Passar do limite" detalhe="Na Frente de caixa, só com a liberação de um Dono." />
          <Regra titulo="Prazo para pagar" detalhe="Contado a partir de cada compra no fiado.">
            {numero('fiado.prazoDias', 'dias')}
          </Regra>
          <Regra titulo="Cliente com fiado vencido" detalhe="Nova compra no fiado também pede a liberação de um Dono.">
            <label className="reg-check">
              <input type="checkbox" checked={vencidoPedeDono} onChange={(e) => setVencidoPedeDono(e.target.checked)} disabled={!podeAlterar} /> Pedir liberação
            </label>
          </Regra>
        </section>

        <section className="card card-plano" aria-labelledby="reg-cadastro">
          <div className="card-cabeca">
            <h2 id="reg-cadastro">Cadastro</h2>
          </div>
          <Regra titulo="Campos obrigatórios" detalhe="Nome, telefone com DDD e CPF." />
          <Regra titulo="Venda sem cliente" detalhe="Continua normal na Frente de caixa, sem cashback." />
          <Regra titulo="Cashback, cupom e fiado" detalhe="Exigem cadastro completo, com CPF." />
          <Regra titulo="Autorização para mensagens" detalhe="Separada do cadastro. O cliente pode cancelar quando quiser." />
          <Regra titulo="Campo extra no cadastro" detalhe="Um campo a mais com o nome que a loja escolher (ex.: o pet do cliente, o veículo).">
            <label className="reg-check">
              <input type="checkbox" checked={extraAtivo} onChange={(e) => setExtraAtivo(e.target.checked)} disabled={!podeAlterar} /> Usar o campo extra
            </label>
            <label className="sr-only" htmlFor="reg-extra">
              Nome do campo extra
            </label>
            <input id="reg-extra" className="reg-rotulo" value={extraRotulo} onChange={(e) => setExtraRotulo(e.target.value)} maxLength={LIMITES_LOJA.rotuloMax} disabled={!podeAlterar || !extraAtivo} />
          </Regra>
        </section>
      </div>

      <section className="card card-plano" aria-labelledby="reg-mensagens">
        <div className="card-cabeca">
          <h2 id="reg-mensagens">Mensagens do WhatsApp</h2>
        </div>
        <p className="suave">O sistema troca cada variável entre chaves pelo dado do cliente. O nome da loja entra no lugar de {'{loja}'}.</p>
        {MENSAGENS.map((m) => (
          <div key={m.tipo} className="campo">
            <label htmlFor={`reg-msg-${m.tipo}`}>{m.titulo}</label>
            <textarea
              id={`reg-msg-${m.tipo}`}
              rows={3}
              maxLength={LIMITES_LOJA.mensagemMax}
              value={mensagens[m.tipo]}
              onChange={(e) => setMensagens((x) => ({ ...x, [m.tipo]: e.target.value }))}
              disabled={!podeAlterar}
            />
            <small className="suave">Pode usar: {VARIAVEIS_MENSAGEM[m.tipo].map((v) => `{${v}}`).join(' ')}</small>
          </div>
        ))}
      </section>

      <section className="card card-plano" aria-labelledby="reg-regulamento">
        <div className="card-cabeca">
          <h2 id="reg-regulamento">Regulamento para deixar na loja</h2>
          <button type="button" className="botao" onClick={() => void copiar()}>
            Copiar texto
          </button>
        </div>
        <pre id="cli-regulamento" className="reg-regulamento">
          {regulamento}
        </pre>
        {copiado && (
          <p className="alerta" role="status">
            {copiado}
          </p>
        )}
      </section>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {podeAlterar && (
        <div>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Gravando…' : 'Salvar regras'}
          </button>
        </div>
      )}
    </form>
  );
}
