// apps/web/src/painel/TrocarSenha.tsx
// "Trocar a senha" (aba Meu usuário) e "Crie a sua senha" (primeiro acesso, com a senha
// provisória que o Dono entregou). Pede a senha atual: quem pega o computador destravado não troca a
// senha de ninguém. As regras da senha nova são as de @saas/core (as mesmas do servidor).
import { LIMITES_USUARIO, validarSenhaNova } from '@saas/core';
import { type FormEvent, useState } from 'react';
import { type ApiConta, ErroApi } from '../api';
import { BotaoTema } from '../BotaoTema';
import { LayoutEntrada } from '../telas/LayoutEntrada';

interface PropsForm {
  api: Pick<ApiConta, 'trocarMinhaSenha'>;
  pessoa: { nome: string; usuario: string };
  /** Senha trocada com sucesso. */
  aoTrocar: () => void;
  /** Errou a senha atual 5 vezes: o usuário foi bloqueado e a sessão terminou. */
  aoBloquear: (mensagem: string) => void;
  /** Texto do campo da senha atual ("Senha atual" ou "Senha provisória que você recebeu"). */
  rotuloAtual?: string;
  textoBotao?: string;
  aoCancelar?: () => void;
}

export function FormTrocarSenha({ api, pessoa, aoTrocar, aoBloquear, rotuloAtual = 'Senha atual', textoBotao = 'Trocar a senha', aoCancelar }: PropsForm) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erros, setErros] = useState<{ atual?: string; nova?: string; confirmacao?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const e: typeof erros = {};
    if (!atual) e.atual = 'Informe a senha atual.';
    const v = validarSenhaNova(nova, { usuario: pessoa.usuario, nome: pessoa.nome });
    if (!v.ok) e.nova = v.erros[0]!.mensagem;
    else if (nova === atual) e.nova = 'A senha nova precisa ser diferente da atual.';
    if (!e.nova && confirmacao !== nova) e.confirmacao = 'A confirmação está diferente da senha nova.';
    setErros(e);
    if (Object.keys(e).length) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.trocarMinhaSenha(atual, nova);
      aoTrocar();
    } catch (x) {
      if (x instanceof ErroApi && x.status === 429) return aoBloquear(x.message);
      if (x instanceof ErroApi && x.erros.some((c) => c.campo === 'senhaAtual')) setErros({ atual: 'Senha atual errada.' });
      setErro(x instanceof ErroApi ? x.message : 'Não foi possível trocar a senha agora. Tente de novo.');
      setAtual('');
    } finally {
      setEnviando(false);
    }
  }

  const tipo = mostrar ? 'text' : 'password';
  return (
    <form className="modal-form" onSubmit={enviar} noValidate>
      <div className="campo">
        <label htmlFor="ts-atual">{rotuloAtual}</label>
        <input id="ts-atual" type={tipo} value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" maxLength={LIMITES_USUARIO.senhaMax} />
        {erros.atual && <span className="campo-erro">{erros.atual}</span>}
      </div>
      <div className="campo">
        <label htmlFor="ts-nova">Senha nova</label>
        <input id="ts-nova" type={tipo} value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" maxLength={LIMITES_USUARIO.senhaMax} aria-describedby="ts-dica" />
        <span id="ts-dica" className="modal-dica">
          Pelo menos {LIMITES_USUARIO.senhaMin} caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar. Não use o seu nome nem o seu usuário.
        </span>
        {erros.nova && <span className="campo-erro">{erros.nova}</span>}
      </div>
      <div className="campo">
        <label htmlFor="ts-confirmacao">Repita a senha nova</label>
        <input id="ts-confirmacao" type={tipo} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" maxLength={LIMITES_USUARIO.senhaMax} />
        {erros.confirmacao && <span className="campo-erro">{erros.confirmacao}</span>}
      </div>
      <label className="ts-mostrar">
        <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar as senhas
      </label>
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="modal-acoes">
        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Salvando…' : textoBotao}
        </button>
        {aoCancelar && (
          <button type="button" className="botao" onClick={aoCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Primeiro acesso (senha provisória): a pessoa só usa o sistema depois de criar a própria senha. */
export function TelaCriarSenha({ loja, aoSair, ...resto }: Omit<PropsForm, 'rotuloAtual' | 'textoBotao' | 'aoCancelar'> & { loja: { nome: string }; aoSair: () => void }) {
  return (
    <LayoutEntrada loja={loja} acoes={<BotaoTema className="entrada-tema" />}>
      <section className="entrada-form" aria-labelledby="cs-titulo">
        <h1 id="cs-titulo" className="entrada-titulo">
          Crie a sua senha
        </h1>
        <p className="entrada-subtitulo cs-texto">
          Olá, {resto.pessoa.nome}. Por segurança, troque a senha provisória por uma senha pessoal, que só você vai saber. Ela vale para entrar no sistema e para autorizar operações no caixa.
        </p>
        <FormTrocarSenha {...resto} rotuloAtual="Senha provisória que você recebeu" textoBotao="Criar a minha senha" />
        <button type="button" className="entrada-link" onClick={aoSair}>
          Sair
        </button>
      </section>
    </LayoutEntrada>
  );
}
