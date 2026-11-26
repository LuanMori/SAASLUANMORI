// apps/web/src/painel/PendenciasDoInicio.tsx
// Card Pendências da Visão geral com as pendências de CLIENTES (arquivo do Luan de 23/11/2026; ligadas pelo Luan
// "no card de pendências"):
//   - "Fiado a vencer · N": fiado que vence de hoje a 7 dias, por cliente e vencimento (Dono e Administrador);
//   - "Cashback a vencer · N": a mesma lista da aba Retorno (todos);
//   - "Promoções exclusivas · N": clientes sem comprar há N dias, com o cupom de retorno (todos; só com cupom).
// "Ver lista" abre os clientes, com "Receber" (fiado, só aquele vencimento) e "WhatsApp" (lembrete de pagamento
// do vencimento, aviso de cashback ou mensagem de retorno com o cupom). Quem pediu "não incomodar" ou adiou os
// lembretes não entra nas listas (a API tira). As outras pendências (caixa) chegam prontas em `pendencias`.
import { dataBr, formatarCentavos, pctTexto, type TipoContato } from '@saas/core';
import { useMemo, useState } from 'react';
import { type ApiPainel, type ContaDoCliente, ErroApi, type PendenciasDeClientes } from '../api';
import { avisarQueOsDadosMudaram } from '../sincronizacao';
import { Modal } from './caixa/Modal';
import { CardPendencias } from './CardPendencias';
import { ModalReceberFiado } from './clientes/ModaisCliente';
import { ModalWhatsapp } from './clientes/ModalWhatsapp';
import type { IdSecao } from './menu';
import type { Pendencia } from './pendencias';
import { usarCarga } from './usarCarga';

type Grupo = 'fiado' | 'cashback' | 'promocao';

const ROTULO: Record<Grupo, string> = { fiado: 'Fiado a vencer', cashback: 'Cashback a vencer', promocao: 'Promoções exclusivas' };
const CONTATO: Record<Grupo, TipoContato> = { fiado: 'cobranca', cashback: 'cashback', promocao: 'retorno' };

/** Uma pessoa da lista, do jeito que a janela mostra. */
interface Pessoa {
  clienteId: string;
  nome: string;
  detalhe: string;
  venceEm: string | null;
  referencia: string | null;
  /** Por que não tem o botão do WhatsApp (já lembrado, sem WhatsApp...); null = tem. */
  semWhatsapp: string | null;
}

function pessoas(dados: PendenciasDeClientes, grupo: Grupo): Pessoa[] {
  if (grupo === 'fiado') {
    return (dados.fiado ?? []).map((i) => ({
      clienteId: i.clienteId,
      nome: i.nome,
      detalhe: `${formatarCentavos(i.valorCentavos)} · vence ${dataBr(i.venceEm)}`,
      venceEm: i.venceEm,
      referencia: i.referencia,
      semWhatsapp: i.avisado ? 'Lembrete registrado' : i.bloqueio,
    }));
  }
  if (grupo === 'cashback') {
    return dados.cashback.map((i) => ({
      clienteId: i.clienteId,
      nome: i.nome,
      detalhe: `${formatarCentavos(i.valorCentavos)} de cashback · vence ${dataBr(i.venceEm)}`,
      venceEm: null,
      referencia: null,
      semWhatsapp: i.bloqueio,
    }));
  }
  return dados.promocao.map((i) => ({
    clienteId: i.clienteId,
    nome: i.nome,
    detalhe: `Cupom de ${pctTexto(i.percentual)} · sem comprar há ${i.diasSemComprar} dias`,
    venceEm: null,
    referencia: null,
    semWhatsapp: i.bloqueio,
  }));
}

type Acao = { tipo: 'receber'; conta: ContaDoCliente; venceEm: string | null } | { tipo: 'whatsapp'; pessoa: Pessoa };

export function PendenciasDoInicio({
  api,
  pendencias,
  aoIrPara,
  nota = null,
  carregando = false,
}: {
  /** Sem `pendenciasDeClientes` (servidor sem essa parte), o card fica só com as pendências recebidas. */
  api: Partial<Pick<ApiPainel, 'pendenciasDeClientes' | 'contaDoCliente' | 'receberFiadoDoCliente' | 'taxasParaReceberFiado' | 'mensagemParaCliente' | 'registrarContato'>>;
  /** As outras pendências (caixa). null = nenhuma regra disponível. */
  pendencias: readonly Pendencia[] | null;
  aoIrPara?: (secao: IdSecao) => void;
  nota?: string | null;
  carregando?: boolean;
}) {
  const temClientes = Boolean(api.pendenciasDeClientes);
  const { estado, recarregar } = usarCarga(() => (api.pendenciasDeClientes ? api.pendenciasDeClientes() : Promise.resolve(null)), [api], temClientes ? 60_000 : 0);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  // as janelas carregam com a api que recebem: a mesma referência entre um desenho e outro (senão recarregam sem parar)
  const apiReceber = useMemo(
    () => (api.receberFiadoDoCliente && api.taxasParaReceberFiado ? { receberFiadoDoCliente: api.receberFiadoDoCliente, taxasParaReceberFiado: api.taxasParaReceberFiado } : null),
    [api],
  );
  const apiWhatsapp = useMemo(
    () => (api.mensagemParaCliente && api.registrarContato ? { mensagemParaCliente: api.mensagemParaCliente, registrarContato: api.registrarContato } : null),
    [api],
  );

  const doCliente: Pendencia[] = dados
    ? (['fiado', 'cashback', 'promocao'] as const)
        .map((g) => ({ g, n: pessoas(dados, g).length }))
        .filter((x) => x.n > 0)
        .map(({ g, n }) => ({
          id: `clientes-${g}`,
          gravidade: 'media' as const,
          texto: `${ROTULO[g]} · ${n}`,
          acao: {
            rotulo: 'Ver lista',
            abrir: () => {
              setAviso(null);
              setGrupo(g);
            },
          },
        }))
    : [];
  const lista = pendencias === null && !dados ? null : [...(pendencias ?? []), ...doCliente];

  const concluir = (texto: string) => {
    setAcao(null);
    setAviso(texto);
    void recarregar();
    avisarQueOsDadosMudaram(); // os números da Visão geral (saldo, fiado) leem de novo
  };
  async function receber(p: Pessoa) {
    if (!api.contaDoCliente) return;
    try {
      setAcao({ tipo: 'receber', conta: await api.contaDoCliente(p.clienteId), venceEm: p.venceEm });
    } catch (e) {
      setAviso(e instanceof ErroApi ? e.message : 'Não foi possível abrir a conta do cliente.');
    }
  }

  const naLista = grupo && dados ? pessoas(dados, grupo) : [];
  return (
    <>
      <CardPendencias pendencias={lista} aoIrPara={aoIrPara} nota={nota} carregando={carregando || (temClientes && estado.tipo === 'carregando')} />
      {grupo && !acao && (
        <Modal titulo={ROTULO[grupo]} aoFechar={() => setGrupo(null)}>
          {aviso && (
            <p className="alerta" role="status">
              {aviso}
            </p>
          )}
          {naLista.length === 0 ? (
            <p className="vazio">Ninguém nesta lista agora.</p>
          ) : (
            <ul className="pend-lista-clientes">
              {naLista.map((p) => (
                <li key={`${p.clienteId}|${p.venceEm ?? ''}`} className="pend-pessoa">
                  <div>
                    <b>{p.nome}</b>
                    <small>{p.detalhe}</small>
                  </div>
                  <div className="pend-pessoa-acoes">
                    {grupo === 'fiado' && apiReceber && api.contaDoCliente && (
                      <button type="button" className="botao" onClick={() => void receber(p)} aria-label={`Receber o fiado de ${p.nome}`}>
                        Receber
                      </button>
                    )}
                    {!apiWhatsapp ? null : p.semWhatsapp ? (
                      <small className="suave">{p.semWhatsapp}</small>
                    ) : (
                      <button type="button" className="botao" onClick={() => setAcao({ tipo: 'whatsapp', pessoa: p })} aria-label={`WhatsApp para ${p.nome}`}>
                        WhatsApp
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-acoes">
            <button type="button" className="botao" onClick={() => setGrupo(null)}>
              Fechar
            </button>
          </div>
        </Modal>
      )}
      {acao?.tipo === 'receber' && apiReceber && (
        <ModalReceberFiado
          api={apiReceber}
          conta={acao.conta}
          vencimento={acao.venceEm}
          aoConcluir={concluir}
          aoFechar={() => setAcao(null)}
        />
      )}
      {acao?.tipo === 'whatsapp' && grupo && apiWhatsapp && (
        <ModalWhatsapp
          api={apiWhatsapp}
          clienteId={acao.pessoa.clienteId}
          tipo={CONTATO[grupo]}
          referencia={acao.pessoa.referencia}
          aoConcluir={concluir}
          aoFechar={() => setAcao(null)}
        />
      )}
    </>
  );
}
