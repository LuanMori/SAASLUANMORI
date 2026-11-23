// apps/web/src/relatorios/baixar.ts
// Entrega o arquivo para a pessoa salvar (o navegador baixa; nada vai para servidor nenhum).
import { TIPO_XLSX } from './xlsx';

export type Baixar = (nome: string, bytes: Uint8Array) => void;

export const baixarArquivo: Baixar = (nome, bytes) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: TIPO_XLSX }));
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
