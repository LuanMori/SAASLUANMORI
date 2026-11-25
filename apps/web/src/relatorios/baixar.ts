// apps/web/src/relatorios/baixar.ts
// Entrega o arquivo para a pessoa salvar (o navegador baixa; nada vai para servidor nenhum).
import { TIPO_XLSX } from './xlsx';

/** `tipo`: o tipo do arquivo (padrão: planilha do Excel). */
export type Baixar = (nome: string, bytes: Uint8Array, tipo?: string) => void;

export const baixarArquivo: Baixar = (nome, bytes, tipo = TIPO_XLSX) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
