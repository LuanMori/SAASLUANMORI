// apps/web/src/painel/caixa/ModalCliente.tsx
// Identificar o cliente na Frente de caixa (F6), como no DaniPets V9.3.3:
//   - digita CPF, telefone ou nome: aparecem até 8 clientes. A busca é feita no SERVIDOR, que já
//     devolve o CPF mascarado: a lista de clientes não é baixada para o navegador (LGPD);
//   - Enter escolhe quando só um cliente aparece;
//   - "Cadastrar novo cliente": nome completo, telefone com DDD e CPF (obrigatórios); o que foi
//     digitado na busca já preenche o campo certo.
// Venda sem cliente continua normal. Quem decide se o cliente existe é o servidor (na venda).
import { type ErroCampo, formatarTelefone, LIMITES_CLIENTE, mascararCpf, type NovoCliente, sugestaoDeCadastro, validarNovoCliente } from '@saas/core';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { type ApiPainel, type ClienteDaBusca, ErroApi } from '../../api';
import { Modal } from './Modal';

interface Props {
  api: Pick<ApiPainel, 'buscarClientesParaVenda' | 'cadastrarCliente'>;
  aoEscolher: (cliente: ClienteDaBusca, cadastradoAgora: boolean) => void;
  aoFechar: () => void;
}

export function ModalCliente({ api, aoEscolher, aoFechar }: Props) {
  const [novo, setNovo] = useState(false);
  const [termo, setTermo] = useState('');
  return novo ? (
    <PassoNovo api={api} sugestao={sugestaoDeCadastro(termo)} aoCadastrar={(c) => aoEscolher(c, true)} aoVoltar={() => setNovo(false)} aoFechar={aoFechar} />
  ) : (
    <PassoBuscar api={api} termo={termo} setTermo={setTermo} aoEscolher={(c) => aoEscolher(c, false)} aoNovo={() => setNovo(true)} aoFechar={aoFechar} />
  );
}

function PassoBuscar({
  api,
  termo,
  setTermo,
  aoEscolher,
  aoNovo,
  aoFechar,
}: {
  api: Props['api'];
  termo: string;
  setTermo: (t: string) => void;
  aoEscolher: (c: ClienteDaBusca) => void;
  aoNovo: () => void;
  aoFechar: () => void;
}) {
  const [achados, setAchados] = useState<ClienteDaBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);
  const limpo = termo.trim();

  // Busca no servidor um instante depois de parar de digitar; resposta atrasada não troca a mais nova.
  useEffect(() => {
    const meu = ++pedido.current;
    if (!limpo) {
      setAchados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const espera = setTimeout(() => {
      api
        .buscarClientesParaVenda(limpo)
        .then((lista) => {
          if (meu !== pedido.current) return;
          setAchados(lista);
          setBuscando(false);
        })
        .catch((e: unknown) => {
          if (meu !== pedido.current) return;
          setAchados([]);
          setBuscando(false);
          setErro(e instanceof ErroApi ? e.message : 'Não foi possível buscar os clientes.');
        });
    }, 200);
    return () => clearTimeout(espera);
  }, [api, limpo]);

  async function usar(ev: FormEvent) {
    ev.preventDefault();
    if (!limpo) return setErro('Digite o CPF, o telefone ou o nome.');
    let lista = achados;
    if (buscando) {
      // Enter antes de a lista chegar (leitor de CPF, digitação rápida): busca na hora
      try {
        lista = await api.buscarClientesParaVenda(limpo);
      } catch (e) {
        return setErro(e instanceof ErroApi ? e.message : 'Não foi possível buscar os clientes.');
      }
    }
    if (lista.length === 1) return aoEscolher(lista[0]!);
    setErro(lista.length ? 'Escolha um cliente da lista.' : 'Nenhum cliente encontrado. Use “Cadastrar novo cliente”.');
  }

  return (
    <Modal titulo="Identificar cliente" aoFechar={aoFechar}>
      <p className="modal-sub">Digite o CPF, o telefone ou o nome. Venda sem cliente continua normal.</p>
      <form className="modal-form" onSubmit={usar} noValidate autoComplete="off">
        <div className="campo">
          <label htmlFor="cli-busca">CPF, telefone ou nome</label>
          <input
            id="cli-busca"
            value={termo}
            maxLength={LIMITES_CLIENTE.buscaMax}
            onChange={(e) => {
              setTermo(e.target.value);
              setErro(null);
            }}
          />
        </div>
        <div className="cli-lista" role="group" aria-label="Clientes encontrados">
          {achados.length > 0 ? (
            achados.map((c) => (
              <button key={c.id} type="button" className="cli-opcao" onClick={() => aoEscolher(c)}>
                <b>{c.nome}</b>
                <small>
                  CPF {c.cpfMascarado} · {formatarTelefone(c.telefone)}
                </small>
              </button>
            ))
          ) : (
            <p className="modal-dica" role="status">
              {!limpo ? 'Digite o CPF, o telefone ou o nome.' : buscando ? 'Buscando…' : 'Nenhum cliente encontrado. Cadastre o cliente novo.'}
            </p>
          )}
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario">
            Usar este cliente
          </button>
          <button type="button" className="botao" onClick={aoNovo}>
            Cadastrar novo cliente
          </button>
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** O cadastro rápido do F6 tem só os três campos obrigatórios (o resto fica na aba Clientes). */
type Campo = 'nome' | 'telefone' | 'cpf';

function PassoNovo({
  api,
  sugestao,
  aoCadastrar,
  aoVoltar,
  aoFechar,
}: {
  api: Props['api'];
  sugestao: Partial<NovoCliente>;
  aoCadastrar: (c: ClienteDaBusca) => void;
  aoVoltar: () => void;
  aoFechar: () => void;
}) {
  const [dados, setDados] = useState<NovoCliente>({ nome: sugestao.nome ?? '', telefone: sugestao.telefone ?? '', cpf: sugestao.cpf ?? '' });
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const porCampo = (lista: readonly ErroCampo[]) =>
    lista.reduce<Partial<Record<Campo, string>>>((acc, e) => (e.campo in dados && !acc[e.campo as Campo] ? { ...acc, [e.campo]: e.mensagem } : acc), {});

  async function cadastrar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const local = validarNovoCliente(dados);
    if (!local.ok) return setErros(porCampo(local.erros));
    setErros({});
    setEnviando(true);
    try {
      const c = await api.cadastrarCliente(local.valor);
      aoCadastrar({ id: c.id, nome: c.nome, cpfMascarado: mascararCpf(c.cpf), telefone: c.telefone, fiadoEmAbertoCentavos: 0 });
    } catch (e) {
      if (e instanceof ErroApi && e.erros.some((x) => x.campo in dados)) setErros(porCampo(e.erros));
      else setErro(e instanceof ErroApi ? e.message : 'Não foi possível cadastrar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id: Campo, rotulo: string, extra: { inputMode?: 'numeric'; placeholder?: string; maxLength: number }) => (
    <div className={`campo${erros[id] ? ' campo-com-erro' : ''}`}>
      <label htmlFor={`cli-${id}`}>{rotulo}</label>
      <input
        id={`cli-${id}`}
        value={dados[id]}
        aria-invalid={Boolean(erros[id])}
        aria-describedby={erros[id] ? `cli-${id}-erro` : undefined}
        onChange={(e) => setDados((d) => ({ ...d, [id]: e.target.value }))}
        {...extra}
      />
      {erros[id] && (
        <span id={`cli-${id}-erro`} className="campo-erro">
          {erros[id]}
        </span>
      )}
    </div>
  );

  return (
    <Modal titulo="Novo cliente" aoFechar={aoFechar}>
      <p className="modal-sub">Nome, telefone e CPF são obrigatórios. Na tela, o CPF aparece mascarado.</p>
      <form className="modal-form" onSubmit={cadastrar} noValidate autoComplete="off">
        {campo('nome', 'Nome completo', { maxLength: LIMITES_CLIENTE.nomeMax })}
        <div className="modal-grade">
          {campo('telefone', 'Telefone com DDD', { inputMode: 'numeric', placeholder: '(41) 99999-9999', maxLength: 16 })}
          {campo('cpf', 'CPF', { inputMode: 'numeric', placeholder: '000.000.000-00', maxLength: 14 })}
        </div>
        {erro && (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal-acoes">
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando ? 'Cadastrando…' : 'Cadastrar e usar na venda'}
          </button>
          <button type="button" className="botao" onClick={aoVoltar}>
            Voltar
          </button>
        </div>
      </form>
    </Modal>
  );
}
