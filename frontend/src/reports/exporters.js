import { api } from '../api/client';
import { nomeArquivo } from './format';

export function baixar(blob, arquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Gera o arquivo a partir dos dados dos blocos (nunca do texto da conversa).
 * @param {import('./types').Bloco[]} blocos
 * @param {import('./types').FormatoExportacao} formato
 * @returns {Promise<{arquivo: string, impressao?: boolean}>}
 */
export async function exportarBlocos(blocos, formato) {
  const padrao = nomeArquivo(blocos, formato);
  const r = await api.exportReports({ blocos, formato });
  if (r?.impressao) return { arquivo: padrao, impressao: true };
  const arquivo = r.arquivo || padrao;
  baixar(r.blob, arquivo);
  return { arquivo };
}
