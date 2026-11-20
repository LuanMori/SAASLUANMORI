// apps/web/src/painel/clientes/ModaisCliente.tsx
// Janelas da aba Clientes (Fase 2, módulo 6), como no DaniPets V9.3.3:
//   - cadastro e edição (CLI-01): nome, telefone e CPF obrigatórios; campo extra da loja ("Pet"), nascimento,
//     limite de fiado (só Dono e Administrador), endereço, observações, WhatsApp, autorização de mensagens e
//     "não incomodar". Na edição o CPF inteiro não vem do servidor: em branco, fica o do cadastro;
//   - receber fiado (CLI-16): valor (todo ou parte), forma, e o que o valor abate (a compra mais antiga primeiro);
//   - excluir cliente sem histórico, com motivo (CLI-07);
//   - regras dos clientes: o campo extra (ligado e o rótulo) e as regras do fiado (prazo e vencido pede Dono).
import {
  type Cliente,
  descreverAbatidas,
  type ErroCampo,
  FORMAS_RECEBER_FIADO,
  type FormaReceberFiado,
  formatarCentavos,
  formatarTelefone,
  LIMITES_CLIENTE,
  LIMITES_REGRAS,
  NOME_FORMA_PAGAMENTO,
  pode,
  type PapelDeLoja,
  previaDoRecebimento,
  reaisParaCentavos,
  type RegrasDaLoja,
  validarNovoCliente,
} from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiPainel, type ClienteSemCpf, type ContaDoCliente, ErroApi } from '../../api';
import { Modal } from '../caixa/Modal';

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
  papel: PapelDeLoja;
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

const DICA_FORMA: Record<FormaReceberFiado, string> = {
  dinheiro: 'Em dinheiro, o valor entra no esperado do Caixa do dia (com o caixa de hoje aberto).',
  pix: 'Em Pix, o valor entra na Conta bancária.',
  debito: 'No cartão, o valor fica a receber da operadora, com a taxa do cartão.',
  credito: 'No cartão, o valor fica a receber da operadora, com a taxa do cartão.',
};

export function ModalReceberFiado({
  api,
  conta,
  aoConcluir,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'receberFiadoDoCliente'>;
  conta: Pick<ContaDoCliente, 'cliente' | 'fiado'>;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const { cliente, fiado } = conta;
  const [valor, setValor] = useState(reais(fiado.devendoCentavos));
  const [forma, setForma] = useState<FormaReceberFiado>('dinheiro');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const centavos = reaisParaCentavos(valor);
  // a mesma conta do servidor: abate primeiro a compra que vence primeiro
  const previa = previaDoRecebimento(fiado.abertos, centavos ?? 0);

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (centavos === null || centavos <= 0) return setErro('Informe o valor recebido (só números).');
    if (centavos > fiado.devendoCentavos) return setErro(`${cliente.nome} deve ${formatarCentavos(fiado.devendoCentavos)}. Informe um valor até esse.`);
    setEnviando(true);
    try {
      const r = await api.receberFiadoDoCliente(cliente.id, { valorCentavos: centavos, forma });
      aoConcluir(
        `Recebido ${formatarCentavos(centavos)} de ${cliente.nome.split(' ')[0]} em ${NOME_FORMA_PAGAMENTO[forma]}: abateu ${descreverAbatidas(r.abatidas)}.${r.ficaDevendoCentavos > 0 ? ` Fica devendo ${formatarCentavos(r.ficaDevendoCentavos)}.` : ''}`,
      );
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Receber fiado" aoFechar={aoFechar}>
      <p className="modal-sub">
        {cliente.nome} deve <b>{formatarCentavos(fiado.devendoCentavos)}</b>
        {fiado.vencidoCentavos > 0 ? `, com ${formatarCentavos(fiado.vencidoCentavos)} vencido` : ''}.
      </p>
      <form className="modal-form" onSubmit={confirmar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="rf-valor">Valor recebido (R$)</label>
          <input id="rf-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" maxLength={12} />
        </div>
        <div className="campo">
          <label htmlFor="rf-forma">Forma de pagamento</label>
          <select id="rf-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaReceberFiado)}>
            {FORMAS_RECEBER_FIADO.map((f) => (
              <option key={f} value={f}>
                {NOME_FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </select>
        </div>
        <dl className="cli-previa">
          <dt>Abate primeiro a mais antiga</dt>
          <dd>{previa.abatidas.length ? descreverAbatidas(previa.abatidas) : '—'}</dd>
          <dt>Fica devendo</dt>
          <dd>{formatarCentavos(previa.ficaDevendoCentavos)}</dd>
        </dl>
        <p className="modal-dica">{DICA_FORMA[forma]}</p>
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Confirmar recebimento" aoFechar={aoFechar} />
      </form>
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
  papel: PapelDeLoja;
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

export function ModalRegrasClientes({
  api,
  regras,
  aoSalvar,
  aoFechar,
}: {
  api: Pick<ApiPainel, 'salvarRegrasDaLoja'>;
  regras: RegrasDaLoja;
  aoSalvar: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [ativo, setAtivo] = useState(regras.clientes.campoExtra.ativo);
  const [rotulo, setRotulo] = useState(regras.clientes.campoExtra.rotulo);
  const [prazo, setPrazo] = useState(String(regras.fiado.prazoDias));
  const [vencidoPedeDono, setVencidoPedeDono] = useState(regras.fiado.vencidoPedeDono);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const limite = LIMITES_REGRAS['fiado.prazoDias'];

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const dias = Number(prazo);
    if (!Number.isInteger(dias) || dias < limite.min || dias > limite.max) return setErro(`Prazo do fiado: de ${limite.min} a ${limite.max} dias.`);
    if (ativo && !rotulo.trim()) return setErro('Dê um nome para o campo extra (ex.: Pet, Veículo).');
    setEnviando(true);
    try {
      await api.salvarRegrasDaLoja({ clientes: { campoExtra: { ativo, rotulo: rotulo.trim() || regras.clientes.campoExtra.rotulo } }, fiado: { prazoDias: dias, vencidoPedeDono } });
      aoSalvar('Regras dos clientes salvas.');
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Regras dos clientes" aoFechar={aoFechar}>
      <form className="modal-form" onSubmit={salvar} noValidate autoComplete="off">
        <fieldset className="dev-acao">
          <legend>Campo extra no cadastro</legend>
          <label>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Usar um campo a mais no cadastro (ex.: o pet do cliente, o veículo)
          </label>
          <div className="campo">
            <label htmlFor="rc-rotulo">Nome do campo</label>
            <input id="rc-rotulo" value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={40} disabled={!ativo} />
          </div>
        </fieldset>
        <fieldset className="dev-acao">
          <legend>Fiado</legend>
          <div className="campo">
            <label htmlFor="rc-prazo">{limite.rotulo}</label>
            <input id="rc-prazo" value={prazo} onChange={(e) => setPrazo(e.target.value)} inputMode="numeric" maxLength={3} />
          </div>
          <label>
            <input type="checkbox" checked={vencidoPedeDono} onChange={(e) => setVencidoPedeDono(e.target.checked)} /> Cliente com fiado vencido só compra no fiado com a liberação de um Dono
          </label>
        </fieldset>
        <Erro texto={erro} />
        <Acoes enviando={enviando} rotulo="Salvar" aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}
