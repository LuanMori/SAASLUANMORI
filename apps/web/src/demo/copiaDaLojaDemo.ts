// apps/web/src/demo/copiaDaLojaDemo.ts
// SÓ PARA A DEMONSTRAÇÃO: a conferência (SHA-256) da cópia de segurança, calculada pelo próprio navegador
// (crypto.subtle), e a leitura do arquivo com a conferência comparada. As regras do arquivo (formato, loja, assuntos)
// ficam no @saas/core (copiaDaLoja.ts); no servidor, a conferência vai ganhar uma chave que só ele tem.
import { type CopiaDaLoja, type CopiaSemConferencia, lerCopiaDaLoja, MENSAGENS_DA_COPIA, type Resultado, textoParaConferencia } from '@saas/core';

/** SHA-256 do texto (UTF-8), em hexadecimal minúsculo. */
export async function sha256Hex(texto: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const conferenciaDaCopia = (c: CopiaSemConferencia | CopiaDaLoja): Promise<string> => sha256Hex(textoParaConferencia(c));

/** Lê o arquivo da cópia e confere tudo: formato, versão, loja, assuntos e a conferência (sobre o arquivo como veio). */
export async function lerArquivoDaCopia(texto: string, lojaId: string): Promise<Resultado<CopiaDaLoja>> {
  const r = lerCopiaDaLoja(texto, lojaId);
  if (!r.ok) return r;
  const { textoDaConferencia, ...copia } = r.valor;
  if ((await sha256Hex(textoDaConferencia)) !== copia.conferencia) return { ok: false, erros: [{ campo: 'arquivo', mensagem: MENSAGENS_DA_COPIA.alterada }] };
  return { ok: true, valor: copia };
}
