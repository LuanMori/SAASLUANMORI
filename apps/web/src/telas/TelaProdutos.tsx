import { useLayoutEffect, useRef } from 'react';
import type { ApiProdutos } from '../api';
import { montarProdutos, mostrarSessao, type Sessao } from './produtos-view';

export type { Sessao } from './produtos-view';

interface Props {
  api: ApiProdutos;
  sessao: Sessao;
  aoSair: () => void;
  intervaloMs?: number;
}

export function TelaProdutos({ api, sessao, aoSair, intervaloMs = 5000 }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const sair = useRef(aoSair);
  useLayoutEffect(() => { sair.current = aoSair; }, [aoSair]);
  useLayoutEffect(() => montarProdutos(raiz.current!, api, () => sair.current(), intervaloMs), [api, intervaloMs]);
  useLayoutEffect(() => { mostrarSessao(raiz.current!, sessao); }, [api, intervaloMs, sessao.loja, sessao.nome]);
  return <div className="app" ref={raiz} />;
}
