// apps/web/src/telas/TelaEntrada.tsx
// Tela de entrada (login) com usuário e senha. A loja já vem do subdomínio, então a
// pessoa não escolhe a loja aqui. Usuário e senha são cadastrados pelo Dono ou pelo
// super admin; por isso "Esqueceu sua senha?" orienta a pedir a eles.
//
// A tela não sabe COMO o login é feito: quem usa passa `aoEntrar`, que devolve
// { ok: true } ou { ok: false, mensagem }. Mensagens de erro não dizem se o que
// errou foi o usuário ou a senha (não ajuda quem tenta adivinhar contas).
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Logo } from '../Logo';
import { MARCA } from '../marca';

export type ResultadoEntrada = { ok: true } | { ok: false; mensagem: string };

interface Props {
  /** Loja do subdomínio. null = endereço não corresponde a nenhuma loja. */
  loja: { nome: string } | null;
  aoEntrar: (usuario: string, senha: string) => Promise<ResultadoEntrada>;
  /** Mensagem vinda de fora (ex.: "Sua sessão expirou."). */
  aviso?: string | null;
}

export function TelaEntrada({ loja, aoEntrar, aviso = null }: Props) {
  return (
    <div className="entrada">
      {loja && <BotaoSuporte />}
      <main className="entrada-coluna">
        <Logo />
        {loja ? (
          <FormEntrada loja={loja} aoEntrar={aoEntrar} aviso={aviso} />
        ) : (
          <section className="entrada-form" aria-labelledby="entrada-titulo">
            <h1 id="entrada-titulo" className="entrada-loja">
              Endereço não encontrado
            </h1>
            <p className="alerta alerta-erro" role="alert">
              Este endereço não corresponde a nenhuma loja ativa. Confira o link com o dono da sua loja.
            </p>
          </section>
        )}
      </main>
      <footer className="entrada-rodape">
        <Logo tamanho="pequena" />
      </footer>
    </div>
  );
}

function FormEntrada({ loja, aoEntrar, aviso }: Required<Props> & { loja: { nome: string } }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ajudaSenha, setAjudaSenha] = useState(false);
  const refUsuario = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);

  useEffect(() => refUsuario.current?.focus(), []);

  const podeEntrar = usuario.trim() !== '' && senha !== '' && !enviando;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!podeEntrar) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await aoEntrar(usuario.trim(), senha);
      if (!r.ok) {
        setErro(r.mensagem);
        setSenha('');
        refSenha.current?.focus();
      }
    } catch {
      setErro('Não foi possível entrar agora. Verifique a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const verCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <form className="entrada-form" onSubmit={enviar} noValidate aria-labelledby="entrada-titulo">
      <h1 id="entrada-titulo" className="entrada-loja">
        {loja.nome}
      </h1>
      <p className="entrada-boas-vindas">Boas-vindas</p>

      {(erro ?? aviso) && (
        <p className="alerta alerta-erro" role="alert">
          {erro ?? aviso}
        </p>
      )}

      <div className="entrada-campo">
        <div className="entrada-rotulo">
          <label htmlFor="entrada-usuario">Insira seu usuário</label>
          <Dica texto="Use o usuário que o dono da loja cadastrou para você." />
        </div>
        <div className="entrada-caixa">
          <IconeUsuario />
          <input
            id="entrada-usuario"
            ref={refUsuario}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Ex.: maria.silva"
            maxLength={64}
          />
        </div>
      </div>

      <div className="entrada-campo">
        <div className="entrada-rotulo">
          <label htmlFor="entrada-senha">Insira sua senha</label>
        </div>
        <div className="entrada-caixa">
          <IconeCadeado />
          <input
            id="entrada-senha"
            ref={refSenha}
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyUp={verCapsLock}
            onKeyDown={verCapsLock}
            onBlur={() => setCapsLock(false)}
            autoComplete="current-password"
            maxLength={128}
            aria-describedby={capsLock ? 'entrada-caps' : undefined}
          />
          <button
            type="button"
            className="entrada-olho"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
            aria-pressed={mostrarSenha}
          >
            {mostrarSenha ? <IconeOlhoAberto /> : <IconeOlhoFechado />}
          </button>
        </div>
        {capsLock && (
          <span id="entrada-caps" className="entrada-caps">
            Caps Lock ligado
          </span>
        )}
      </div>

      <button type="submit" className="botao botao-primario botao-grande entrada-botao" disabled={!podeEntrar}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>

      <button type="button" className="entrada-link" onClick={() => setAjudaSenha((v) => !v)} aria-expanded={ajudaSenha}>
        Esqueceu sua senha?
      </button>
      {ajudaSenha && (
        <p className="alerta" role="status">
          Peça ao dono da loja para criar uma senha nova para você. Por segurança, a senha não é enviada por e-mail.
        </p>
      )}
    </form>
  );
}

function BotaoSuporte() {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <div className="entrada-suporte">
      <button type="button" className="entrada-suporte-botao" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-controls={id}>
        <IconeAjuda />
        Suporte
      </button>
      {aberto && (
        <div id={id} className="entrada-suporte-caixa" role="dialog" aria-label="Suporte">
          <p>{MARCA.suporte.texto}</p>
          <a href={`mailto:${MARCA.suporte.email}`}>{MARCA.suporte.email}</a>
        </div>
      )}
    </div>
  );
}

function Dica({ texto }: { texto: string }) {
  return (
    <span className="entrada-dica" tabIndex={0} role="img" aria-label={texto} title={texto}>
      <IconeInfo />
      <span className="entrada-dica-balao" aria-hidden="true">
        {texto}
      </span>
    </span>
  );
}

// ---- ícones (traço, herdam a cor do texto)
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const IconeUsuario = () => (
  <Svg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Svg>
);
const IconeCadeado = () => (
  <Svg>
    <rect x="4.5" y="10" width="15" height="11" rx="1.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="0.6" fill="currentColor" />
  </Svg>
);
const IconeOlhoFechado = () => (
  <Svg>
    <path d="M3 10c2.4 3 5.4 4.5 9 4.5S18.6 13 21 10" />
    <path d="M6 13l-1.5 2M12 14.5V17M18 13l1.5 2" />
  </Svg>
);
const IconeOlhoAberto = () => (
  <Svg>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const IconeInfo = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
  </Svg>
);
const IconeAjuda = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </Svg>
);
