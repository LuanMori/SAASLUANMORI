// apps/web/src/demo/contasDemo.ts
// SÓ PARA A DEMONSTRAÇÃO: lojas, usuários e senhas de teste, e as regras de
// entrada que o servidor terá (mensagem única para usuário ou senha errados,
// usuário desativado, bloqueio após várias senhas erradas). Não é segurança:
// tudo isto roda no navegador e qualquer pessoa pode ler.

export const SENHA_DEMO = 'demo1234';
export const TENTATIVAS_MAX = 5;
export const BLOQUEIO_MS = 60_000;

export const LOJAS_DEMO = [
  { id: 'loja-a', subdominio: 'lojaa', nome: 'Loja A', descricao: 'Rações, petiscos e acessórios' },
  { id: 'loja-b', subdominio: 'lojab', nome: 'Loja B', descricao: 'Pet shop e banho e tosa' },
] as const;

export interface UsuarioDemo {
  usuario: string;
  nome: string;
  papelRotulo: string;
  ativo: boolean;
}

const USUARIOS: UsuarioDemo[] = [
  { usuario: 'ana', nome: 'Ana', papelRotulo: 'Dono', ativo: true },
  { usuario: 'bruno', nome: 'Bruno', papelRotulo: 'Vendedor', ativo: true },
  { usuario: 'carla', nome: 'Carla', papelRotulo: 'Vendedor', ativo: false },
];

export const MENSAGEM_CREDENCIAIS = 'Usuário ou senha incorretos.';

type Resultado =
  | { ok: true; lojaId: string; usuario: UsuarioDemo }
  | { ok: false; mensagem: string };

const falhas = new Map<string, { quantidade: number; bloqueadoAte: number }>();

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function entrarDemo(subdominio: string, usuario: string, senha: string, agora = Date.now): Promise<Resultado> {
  await esperar(350);
  const loja = LOJAS_DEMO.find((l) => l.subdominio === subdominio);
  if (!loja) return { ok: false, mensagem: 'Loja não encontrada ou inativa.' };

  const nome = usuario.trim().toLowerCase();
  const chave = `${loja.id}:${nome}`;
  const registro = falhas.get(chave);
  if (registro && registro.bloqueadoAte > agora()) {
    const segundos = Math.ceil((registro.bloqueadoAte - agora()) / 1000);
    return { ok: false, mensagem: `Muitas tentativas erradas. Tente de novo em ${segundos} s ou peça ao dono para trocar sua senha.` };
  }

  const conta = USUARIOS.find((u) => u.usuario === nome);
  if (!conta || senha !== SENHA_DEMO) {
    const quantidade = (registro?.quantidade ?? 0) + 1;
    const bloqueia = quantidade >= TENTATIVAS_MAX;
    falhas.set(chave, { quantidade: bloqueia ? 0 : quantidade, bloqueadoAte: bloqueia ? agora() + BLOQUEIO_MS : 0 });
    return {
      ok: false,
      mensagem: bloqueia
        ? 'Muitas tentativas erradas. Este usuário ficou bloqueado por 1 minuto.'
        : MENSAGEM_CREDENCIAIS,
    };
  }

  falhas.delete(chave);
  if (!conta.ativo) return { ok: false, mensagem: 'Seu acesso a esta loja está desativado. Fale com o dono da loja.' };
  return { ok: true, lojaId: loja.id, usuario: conta };
}
