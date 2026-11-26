// apps/web/src/painel/imagem.ts
// Imagens escolhidas pela pessoa (o logo da loja e a foto do perfil): lidas e reduzidas no próprio navegador, sem
// enviar nada para fora. Os formatos aceitos e os tamanhos máximos ficam no @saas/core (a API confere de novo).

/** Os tipos de arquivo aceitos. */
export const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'];
/** Tamanho do arquivo escolhido (antes de reduzir). */
export const IMAGEM_ARQUIVO_MAX_BYTES = 5 * 1024 * 1024;

export function lerComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.readAsDataURL(arquivo);
  });
}

export interface ComoReduzir {
  /** A imagem cabe num quadrado deste lado (px). */
  lado: number;
  /** Tamanho máximo do data URL. */
  maxCaracteres: number;
  /** Corta o meio da imagem em quadrado (a foto do perfil aparece num círculo). */
  quadrado?: boolean;
  /** Vai em JPEG com fundo branco (foto). Sem: PNG, que mantém a transparência do logo; grande demais, JPEG. */
  jpeg?: boolean;
}

/** Reduz a imagem no próprio navegador. null = este navegador não reduz (a imagem vai como está, se couber). */
export async function reduzirImagem(arquivo: Blob, como: ComoReduzir): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const imagem = await createImageBitmap(arquivo);
  const corte = como.quadrado ? Math.min(imagem.width, imagem.height) : null;
  const origem = corte
    ? { x: (imagem.width - corte) / 2, y: (imagem.height - corte) / 2, largura: corte, altura: corte }
    : { x: 0, y: 0, largura: imagem.width, altura: imagem.height };
  const escala = Math.min(1, como.lado / Math.max(origem.largura, origem.altura));
  const largura = Math.max(1, Math.round(origem.largura * escala));
  const altura = Math.max(1, Math.round(origem.altura * escala));
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) {
    imagem.close();
    return null;
  }
  if (como.jpeg) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
  }
  ctx.drawImage(imagem, origem.x, origem.y, origem.largura, origem.altura, 0, 0, largura, altura);
  imagem.close();
  if (como.jpeg) return tela.toDataURL('image/jpeg', 0.85);
  const png = tela.toDataURL('image/png');
  return png.length <= como.maxCaracteres ? png : tela.toDataURL('image/jpeg', 0.85);
}

/** Arquivo escolhido → data URL (PNG, JPEG ou WebP, reduzido). `grande`: a mensagem quando nem reduzida cabe. */
export async function prepararImagem(arquivo: File, como: ComoReduzir & { grande: string }): Promise<string> {
  if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  if (arquivo.size > IMAGEM_ARQUIVO_MAX_BYTES) throw new Error('A imagem passa de 5 MB. Escolha uma menor.');
  const reduzida = await reduzirImagem(arquivo, como).catch(() => null);
  const imagem = reduzida ?? (await lerComoDataUrl(arquivo));
  if (imagem.length > como.maxCaracteres) throw new Error(como.grande);
  return imagem;
}
