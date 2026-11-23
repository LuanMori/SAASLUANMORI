// apps/web/src/painel/clientes/ModaisCliente.tsx
// Janelas da aba Clientes (Fase 2, módulo 6), como no DaniPets V9.3.3:
//   - cadastro e edição (CLI-01): nome, telefone e CPF obrigatórios; campo extra da loja ("Pet"), nascimento,
//     limite de fiado (só Dono e Administrador), endereço, observações, WhatsApp, autorização de mensagens e
//     "não incomodar". Na edição o CPF inteiro não vem do servidor: em branco, fica o do cadastro;
//   - receber fiado (CLI-16; arquivo do Luan de 23/11/2026): valor (todo ou parte, ou um vencimento), forma em
//     botões, dinheiro entregue com troco, cartão com a taxa da maquininha repassada ao cliente, prévia e a chave
//     que evita receber duas vezes;
//   - taxas da maquininha (Dono e Administrador; a baixa automática ou manual é escolha do Dono);
//   - excluir cliente sem histórico, com motivo (CLI-07).
// As regras (campo extra, fiado, cashback, cupom, mensagens) ficam na aba Regras do programa (clientes/AbaRegras.tsx).
import { contaNaFrase, type NomesDasContas, baixaAutomaticaDoCartao, type Cliente, type CotacaoRecebimento, cotarRecebimentoFiado, dataBr, descreverAbatidas, type ErroCampo, FORMAS_RECEBER_FIADO, type FormaReceberFiado, formatarCentavos, formatarTelefone, LIMITES_CLIENTE, NOME_FORMA_PAGAMENTO, pctTexto, pode, previaDoRecebimento, reaisParaCentavos, type RegrasDaLoja, validarNovoCliente, type QuemAcessa } from '@saas/core';
import { type FormEvent, useRef, useState } from 'react';
import { type ApiPainel, type ClienteSemCpf, type ContaDoCliente, ErroApi } from '../../api';
import { Modal } from '../caixa/Modal';
import { usarNomesDasContas } from '../nomesDasContas';
import { usarCarga } from '../usarCarga';

const mensagemDe = (e: unknown) => (e instanceof ErroApi ? e.message : 'Não foi possível gravar. Tente de novo.');
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function Acoes({ enviando, rotulo, aoFechar, perigo = false }: { enviando: boolean; rotulo: string; aoFechar: () => void; perigo?: boolean }) {
  return (
    <div className="modal-acoes">
      <button type="submit" className={`botao ${perigo ? 'botao-perigo' : 'botao-primario'}`} disabled={enviando}>
        {enviando ? 'Gravando…' : rotulo}
      </button>
      <button type="button" className="botao" onClick={aoFechar}>
        Cancelar
      </button>
    </div>
  );
}

const Erro = ({ texto }: { texto: string | null }) =>
  texto ? (
    <p className="alerta alerta-erro" role="alert">
      {texto}
    </p>
  ) : null;

export function ModalCadastroCliente({
  api,
  cliente,
  papel,
  regras,
  hoje,
  aoSalvar,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'cadastrarCliente' | 'atualizarCliente'>;
  /** null = cliente novo. */
  cliente: ClienteSemCpf | null;
  papel: QuemAcessa;
  regras: RegrasDaLoja;
  /** AAAA-MM-DD (limite do nascimento). */
  hoje: string;
  aoSalvar: (c: Cliente, novo: boolean) => void;
  aoFechar: () => void;
}) {
  const novo = !cliente;
  const gestor = pode(papel, 'clientes.limite');
  const extra = regras.clientes.campoExtra;
  const [nome, setNome] = useState(cliente?.nome ?? '');
  const [telefone, setTelefone] = useState(cliente ? formatarTelefone(cliente.telefone) : '');
  const [cpf, setCpf] = useState('');
  const [campoExtra, setCampoExtra] = useState(cliente?.extra ?? '');
  const [nascimento, setNascimento] = useState(cliente?.nascimento ?? '');
  const [limite, setLimite] = useState(reais(cliente?.limiteFiadoCentavos ?? 0));
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '');
  const [observacoes, setObservacoes] = useState(cliente?.observacoes ?? '');
  const [whatsapp, setWhatsapp] = useState(cliente ? cliente.whatsapp !== false : true);
  const [autoriza, setAutoriza] = useState(Boolean(cliente?.autorizaMensagens));
  const [naoIncomodar, setNaoIncomodar] = useState(Boolean(cliente?.naoIncomodar));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const limiteCentavos = limite.trim() === '' ? 0 : reaisParaCentavos(limite);
    if (gestor && (limiteCentavos === null || limiteCentavos < 0)) return setErros({ limiteFiadoCentavos: 'Limite de fiado: use só números (ex.: 200 ou 200,00).' });
    const pedido = {
      nome,
      telefone,
      // na edição, sem CPF digitado, fica o do cadastro
      cpf: novo || cpf.trim() ? cpf : '',
      ...(extra.ativo ? { extra: campoExtra } : {}),
      nascimento: nascimento || null,
      endereco,
      observacoes,
      whatsapp,
      autorizaMensagens: autoriza,
      ...(novo ? {} : { naoIncomodar }),
      ...(gestor ? { limiteFiadoCentavos: limiteCentavos ?? 0 } : {}),
    };
    // confere na tela o que dá (o servidor confere tudo de novo); na edição sem CPF, não confere o CPF aqui
    const local = validarNovoCliente(novo || cpf.trim() ? pedido : { ...pedido, cpf: '52998224725' }, { hoje });
    if (!local.ok) {
      const porCampo: Record<string, string> = {};
      local.erros.forEach((e: ErroCampo) => (porCampo[e.campo] ??= e.mensagem));
      return setErros(porCampo);
    }
    setErros({});
    setEnviando(true);
    try {
      const salvo = novo ? await api.cadastrarCliente(pedido) : await api.atualizarCliente(cliente.id, pedido);
      aoSalvar(salvo, novo);
    } catch (e) {
      if (e instanceof ErroApi && e.erros.length) {
        const porCampo: Record<string, string> = {};
        e.erros.forEach((x) => (porCampo[x.campo] ??= x.mensagem));
        setErros(porCampo);
      }
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id: string, rotulo: string, valor: string, mudar: (v: string) => void, extraInput: Record<string, unknown> = {}) => (
    <div className={`campo${erros[id] ? ' campo-com-erro' : ''}`}>
      <label htmlFor={`cc-${id}`}>{rotulo}</label>
      <input id={`cc-${id}`} value={valor} onChange={(e) => mudar(e.target.value)} aria-invalid={Boolean(erros[id])} {...extraInput} />
      {erros[id] && <span className="campo-erro">{erros[id]}</span>}
    </div>
  );

  return (
    <Modal titulo={novo ? 'Novo cliente' : `Editar cadastro de ${cliente.nome.split(' ')[0]}`} aoFechar={aoFechar} larga>
      <p className="modal-sub">Nome, telefone e CPF são obrigatórios.</p>
      <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
        <div className="cli-form">
          {campo('nome', 'Nome completo', nome, setNome, { maxLength: LIMITES_CLIENTE.nomeMax })}
          {campo('telefone', 'Telefone com DDD', telefone, setTelefone, { inputMode: 'numeric', placeholder: '(41) 99999-9999', maxLength: 16 })}
          {campo('cpf', 'CPF', cpf, setCpf, {
            inputMode: 'numeric',
            maxLength: 14,
            placeholder: novo ? '000.000.000-00' : `${cliente.cpfMascarado} (em branco: mantém)`,
          })}
          {extra.ativo && campo('extra', extra.rotulo, campoExtra, setCampoExtra, { maxLength: LIMITES_CLIENTE.textoMax, placeholder: extra.rotulo === 'Pet' ? 'Ex.: Thor, cão' : '' })}
          {campo('nascimento', 'Nascimento', nascimento, setNascimento, { type: 'date', min: '1900-01-01', max: hoje })}
          {campo('limiteFiadoCentavos', 'Limite de fiado (R$)', limite, setLimite, { inputMode: 'decimal', maxLength: 12, disabled: !gestor })}
          {campo('endereco', 'Endereço', endereco, setEndereco, { maxLength: LIMITES_CLIENTE.textoMax })}
          {campo('observacoes', 'Observações', observacoes, setObservacoes, { maxLength: LIMITES_CLIENTE.observacoesMax })}
        </div>
        <p className="modal-dica">
          {gestor ? 'Limite 0 = não compra no fiado. Passar do limite na Frente de caixa pede a liberação de um Dono.' : 'O limite de fiado é definido pelo Dono ou pelo Administrador.'}
        </p>
        <div className="cli-checks">
          <label>
            <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Este telefone tem WhatsApp
          </label>
          <label>
            <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} /> <b>O cliente autoriza receber ofertas e lembretes da loja pelo WhatsApp.</b>{' '}
            <span className="suave">Pergunte ao cliente. Quem não autorizar continua com o fiado normalmente.</span>
          </label>
          {!novo && (
            <label>
              <input type="checkbox" checked={naoIncomodar} onChange={(e) => setNaoIncomodar(e.target.checked)} /> Não incomodar: tirar o cliente das listas de lembrete
            </label>
          )}
        </div>
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo={novo ? 'Cadastrar cliente' : 'Salvar alterações'} aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

/** Para onde vai o dinheiro, por forma (e, no cartão, pela baixa escolhida pelo Dono), com o nome que a loja deu à conta. */
function dicaDaForma(forma: FormaReceberFiado, baixaAutomatica: boolean, nomes: NomesDasContas): string {
  if (forma === 'dinheiro') return 'Em dinheiro, entra no esperado do Caixa do dia só o valor da baixa (com o caixa de hoje aberto); o troco sai da gaveta.';
  if (forma === 'pix') return `Em Pix, o valor entra ${contaNaFrase('banco', nomes, 'em')}.`;
  return `No cartão, a taxa da maquininha é cobrada do cliente: a loja recebe o valor cheio. ${
    baixaAutomatica ? `Baixa automática: entra ${contaNaFrase('banco', nomes, 'em')} na hora.` : 'Baixa manual: fica a receber da operadora até alguém confirmar o depósito.'
  }`;
}

/** Identificador do pedido: o mesmo pedido enviado de novo (clique duplo, rede lenta) não recebe duas vezes. */
const novaChave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Receber fiado (arquivo do Luan, 23/11/2026): valor a baixar (todo ou parte, ou só um vencimento), a forma em
 * botões, o dinheiro entregue com o troco e, no cartão, quanto cobrar na maquininha com a taxa repassada ao
 * cliente. A prévia mostra o que a loja recebe e o saldo depois da baixa.
 */
export function ModalReceberFiado({
  api,
  conta,
  vencimento = null,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'receberFiadoDoCliente' | 'taxasParaReceberFiado'>;
  conta: Pick<ContaDoCliente, 'cliente' | 'fiado'>;
  /** Só as compras deste vencimento (lista "Fiado a vencer"). */
  vencimento?: string | null;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const nomes = usarNomesDasContas();
  const { cliente, fiado } = conta;
  const abertos = vencimento ? fiado.abertos.filter((a) => a.venceEm === vencimento) : fiado.abertos;
  const limite = abertos.reduce((t, a) => t + a.abertoCentavos, 0);
  const [valor, setValor] = useState(reais(limite));
  const [forma, setForma] = useState<FormaReceberFiado>('dinheiro');
  const [entregue, setEntregue] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const envio = useRef(false);
  const chave = useRef<string | null>(null);
  const { estado: taxas, recarregar } = usarCarga(() => api.taxasParaReceberFiado(), [api]);
  const cartao = forma === 'debito' || forma === 'credito';
  const base = reaisParaCentavos(valor);
  const entregueCentavos = entregue.trim() ? reaisParaCentavos(entregue) : base;

  // a mesma conta do servidor (cotarRecebimentoFiado): o que cobrar, a taxa, o troco
  let cotacao: CotacaoRecebimento | null = null;
  let problema: string | null = null;
  if (base === null || base <= 0) problema = 'Informe o valor a baixar (só números).';
  else if (base > limite) problema = `${cliente.nome} deve ${formatarCentavos(limite)}${vencimento ? ' neste vencimento' : ''}. Informe um valor até esse.`;
  else if (forma === 'dinheiro' && entregueCentavos === null) problema = 'Confira o valor entregue (só números).';
  else if (!cartao || taxas.tipo === 'pronto') {
    const r = cotarRecebimentoFiado(base, forma, taxas.tipo === 'pronto' ? taxas.dados : SEM_TAXA, forma === 'dinheiro' ? entregueCentavos : undefined);
    if (r.ok) cotacao = r.valor;
    else problema = r.erros[0]!.mensagem;
  }
  const previa = previaDoRecebimento(abertos, base ?? 0);
  const baixaAutomatica = taxas.tipo === 'pronto' ? baixaAutomaticaDoCartao(taxas.dados) : true;

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    if (!cotacao || envio.current) return;
    envio.current = true;
    setEnviando(true);
    setErro(null);
    chave.current ??= novaChave();
    try {
      const pago = await api.receberFiadoDoCliente(cliente.id, {
        valorCentavos: cotacao.principalCentavos,
        forma,
        vencimento,
        entregueCentavos: cotacao.entregueCentavos,
        brutoPrevistoCentavos: cotacao.brutoCentavos,
        taxaPrevistaPct: cotacao.percentual,
        chave: chave.current,
      });
      const c = pago.cotacao;
      aoConcluir(
        `Baixa de ${formatarCentavos(c.principalCentavos)} confirmada. ${NOME_FORMA_PAGAMENTO[forma]}: ${formatarCentavos(c.brutoCentavos)}${
          forma === 'dinheiro' ? ` · troco ${formatarCentavos(c.trocoCentavos)}` : ''
        } · saldo em aberto ${formatarCentavos(pago.ficaDevendoCentavos)}.`,
      );
    } catch (e) {
      setErro(mensagemDe(e));
      if (e instanceof ErroApi && e.codigo === 'taxa_mudou') void recarregar(); // mostra o valor novo para conferir
    } finally {
      envio.current = false;
      setEnviando(false);
    }
  }

  const linha = (rotulo: string, total: string) => (
    <div className="baixa-linha" key={rotulo}>
      <span>{rotulo}</span>
      <strong>{total}</strong>
    </div>
  );
  return (
    <Modal titulo="Receber fiado" aoFechar={aoFechar}>
      <p className="modal-sub">
        {cliente.nome} · {vencimento ? `vence ${dataBr(vencimento)} · ` : 'em aberto '}
        <b>{formatarCentavos(limite)}</b>
        {!vencimento && fiado.vencidoCentavos > 0 ? ` (${formatarCentavos(fiado.vencidoCentavos)} vencido)` : ''}
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="rf-valor">Valor a baixar (R$)</label>
          <input
            id="rf-valor"
            value={valor}
            onChange={(e) => {
              setErro(null);
              setValor(e.target.value);
            }}
            inputMode="decimal"
            maxLength={14}
          />
        </div>
        <div className="baixa-formas" role="group" aria-label="Forma de pagamento">
          {FORMAS_RECEBER_FIADO.map((f) => (
            <button
              key={f}
              type="button"
              className="botao"
              aria-pressed={forma === f}
              onClick={() => {
                setErro(null);
                setForma(f);
              }}
            >
              {NOME_FORMA_PAGAMENTO[f]}
            </button>
          ))}
        </div>
        {forma === 'dinheiro' && (
          <div className="campo">
            <label htmlFor="rf-entregue">Dinheiro entregue (R$)</label>
            <input
              id="rf-entregue"
              value={entregue}
              onChange={(e) => {
                setErro(null);
                setEntregue(e.target.value);
              }}
              inputMode="decimal"
              maxLength={14}
              placeholder={base && base > 0 ? reais(base) : '0,00'}
            />
          </div>
        )}
        {cotacao && (
          <div className="baixa-previa" aria-live="polite" aria-label="Prévia do recebimento">
            {linha(cartao ? 'Cobrar na maquininha' : forma === 'pix' ? 'Receber no Pix' : 'Troco', formatarCentavos(forma === 'dinheiro' ? cotacao.trocoCentavos : cotacao.brutoCentavos))}
            {cartao && linha(`Taxa da maquininha (${pctTexto(cotacao.percentual)})`, formatarCentavos(cotacao.taxaCentavos))}
            {cartao && linha('Líquido para a loja', formatarCentavos(cotacao.liquidoCentavos))}
            {linha('Saldo após a baixa', formatarCentavos(fiado.devendoCentavos - cotacao.principalCentavos))}
            {previa.abatidas.length > 0 && linha('Abate primeiro', descreverAbatidas(previa.abatidas))}
          </div>
        )}
        {cartao && taxas.tipo !== 'pronto' && (
          <p className="suave" role="status">
            {taxas.tipo === 'carregando' ? 'Consultando a taxa da maquininha…' : taxas.mensagem}
          </p>
        )}
        <p className="modal-dica">{dicaDaForma(forma, baixaAutomatica, nomes)}</p>
        <Erro texto={erro ?? problema} />
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando || !cotacao}>
            {enviando ? 'Registrando…' : 'Confirmar recebimento'}
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Voltar
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SEM_TAXA = { taxaPct: { debito: 0, credito: 0 } };
const PCT = /^\d{1,2}([,.]\d{1,2})?$/;
const pctCampo = (n: number) => String(n).replace('.', ',');

/**
 * Taxas da maquininha (arquivo do Luan, 23/11/2026; aba Clientes → Fiado): o Dono e o Administrador mudam as taxas
 * do débito e do crédito; a baixa do cartão (automática ou manual) é escolha do Dono.
 */
export function ModalTaxasMaquininha({
  api,
  papel,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'lerTaxasCartao' | 'salvarTaxasCartao'>;
  papel: QuemAcessa;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const { estado } = usarCarga(() => api.lerTaxasCartao(), [api]);
  const [debito, setDebito] = useState<string | null>(null);
  const [credito, setCredito] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<boolean | null>(null);
  const [diasDebito, setDiasDebito] = useState<string | null>(null);
  const [diasCredito, setDiasCredito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nomes = usarNomesDasContas();
  const escolheBaixa = pode(papel, 'financeiro.baixa_cartao');
  const atual = estado.tipo === 'pronto' ? estado.dados : null;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!atual) return;
    setErro(null);
    const textos = { debito: debito ?? pctCampo(atual.taxaPct.debito), credito: credito ?? pctCampo(atual.taxaPct.credito) };
    for (const f of ['debito', 'credito'] as const) {
      if (!PCT.test(textos[f].trim())) return setErro(`${NOME_FORMA_PAGAMENTO[f]}: informe um percentual de 0 a 99,99.`);
    }
    // prazo para a operadora depositar (vale na baixa manual): dias inteiros de 0 a 365
    const prazos = { debito: (diasDebito ?? String(atual.dias.debito)).trim(), credito: (diasCredito ?? String(atual.dias.credito)).trim() };
    for (const f of ['debito', 'credito'] as const) {
      if (!/^\d{1,3}$/.test(prazos[f]) || Number(prazos[f]) > 365) return setErro(`Prazo do ${f === 'debito' ? 'débito' : 'crédito'}: informe de 0 a 365 dias.`);
    }
    setEnviando(true);
    try {
      await api.salvarTaxasCartao({
        ...atual,
        taxaPct: { debito: Number(textos.debito.trim().replace(',', '.')), credito: Number(textos.credito.trim().replace(',', '.')) },
        dias: { debito: Number(prazos.debito), credito: Number(prazos.credito) },
        ...(escolheBaixa && baixa !== null ? { baixaAutomatica: baixa } : {}),
      });
      aoConcluir('Taxas da maquininha atualizadas.');
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const automatica = baixa ?? (atual ? baixaAutomaticaDoCartao(atual) : true);
  return (
    <Modal titulo="Taxas da maquininha" aoFechar={aoFechar}>
      {!atual ? (
        estado.tipo === 'carregando' ? (
          <p className="vazio">Carregando…</p>
        ) : (
          <Erro texto={estado.tipo === 'bloqueado' || estado.tipo === 'falhou' ? estado.mensagem : null} />
        )
      ) : (
        <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
          <p className="modal-sub">Valem para as vendas no cartão e para o fiado pago no cartão (no fiado, a taxa é cobrada do cliente).</p>
          <div className="cli-form">
            <div className="campo">
              <label htmlFor="tx-debito">Cartão de débito (%)</label>
              <input id="tx-debito" value={debito ?? pctCampo(atual.taxaPct.debito)} onChange={(e) => setDebito(e.target.value)} inputMode="decimal" maxLength={5} />
            </div>
            <div className="campo">
              <label htmlFor="tx-credito">Cartão de crédito (%)</label>
              <input id="tx-credito" value={credito ?? pctCampo(atual.taxaPct.credito)} onChange={(e) => setCredito(e.target.value)} inputMode="decimal" maxLength={5} />
            </div>
          </div>
          <fieldset className="tx-baixa" disabled={!escolheBaixa}>
            <legend>Baixa do cartão</legend>
            <label>
              <input type="radio" name="tx-baixa" checked={automatica} onChange={() => setBaixa(true)} disabled={!escolheBaixa} /> Automática: entra{' '}
              {contaNaFrase('banco', nomes, 'em')} na hora, já sem a taxa
            </label>
            <label>
              <input type="radio" name="tx-baixa" checked={!automatica} onChange={() => setBaixa(false)} disabled={!escolheBaixa} /> Manual: fica a receber da operadora até confirmar o depósito
              (Financeiro → A receber)
            </label>
            {!escolheBaixa && <small className="suave">Só o Dono escolhe a baixa do cartão.</small>}
          </fieldset>
          {!automatica && (
            <div className="cli-form">
              <div className="campo">
                <label htmlFor="tx-dias-debito">Débito cai em (dias)</label>
                <input id="tx-dias-debito" value={diasDebito ?? String(atual.dias.debito)} onChange={(e) => setDiasDebito(e.target.value)} inputMode="numeric" maxLength={3} />
              </div>
              <div className="campo">
                <label htmlFor="tx-dias-credito">Crédito cai em (dias)</label>
                <input id="tx-dias-credito" value={diasCredito ?? String(atual.dias.credito)} onChange={(e) => setDiasCredito(e.target.value)} inputMode="numeric" maxLength={3} />
              </div>
            </div>
          )}
          <Erro texto={erro} />
          <Acoes enviando={enviando} rotulo="Salvar taxas" aoFechar={aoFechar} />
        </form>
      )}
    </Modal>
  );
}

export function ModalExcluirCliente({
  api,
  cliente,
  papel,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'excluirCliente'>;
  cliente: Pick<ClienteSemCpf, 'id' | 'nome' | 'telefone'>;
  papel: QuemAcessa;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!motivo.trim()) return setErro('Informe o motivo da exclusão.');
    setEnviando(true);
    try {
      await api.excluirCliente(cliente.id, motivo.trim());
      aoConcluir(`${cliente.nome} foi excluído.`);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Excluir cliente" aoFechar={aoFechar}>
      <p className="modal-sub">
        <b>{cliente.nome}</b> • {formatarTelefone(cliente.telefone)}
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="ec-motivo">Motivo da exclusão</label>
          <input id="ec-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={LIMITES_CLIENTE.motivoMax} placeholder="Ex.: cadastro em duplicidade" />
        </div>
        {!pode(papel, 'clientes.desativar') && <p className="modal-dica">O Dono e o Administrador vão ver um aviso desta exclusão na aba Clientes.</p>}
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Excluir" aoFechar={aoFechar} perigo />
      </form>
    </Modal>
  );
}
