// Formatação apenas. A tela nunca recalcula os números do bloco.

/** Faixas de cor da ocupação (ajustáveis). A meta vem do bloco. */
export const FAIXA_ATENCAO = 0.6;

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const halfUp1 = (x) => Math.floor(Number(x.toFixed(9)) * 10 + 0.5) / 10;

/** 0.81481 → "81,5%" (half-up, uma casa, vírgula). */
export const pct = (f) => `${halfUp1(f * 100).toFixed(1).replace('.', ',')}%`;
/** 11.666 → "11,7" */
export const dec1 = (n) => halfUp1(n).toFixed(1).replace('.', ',');
export const int = (n) => new Intl.NumberFormat('pt-BR').format(n);

const toDate = (iso) => new Date(`${iso}T12:00:00`);
export const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const ddmmaaaa = (iso) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
export const diaCurto = (iso) => WD[toDate(iso).getDay()];
export const diaLongo = (iso) => WDL[toDate(iso).getDay()];
export const rotuloDia = (iso) => `${diaCurto(iso)} ${ddmm(iso)}`;

export function periodo({ inicio, fim }) {
  if (inicio === fim) return `${diaLongo(inicio)}, ${ddmmaaaa(inicio)}`;
  return `${ddmm(inicio)} a ${ddmmaaaa(fim)}`;
}

/** @returns {'ok'|'warn'|'low'} */
export function faixa(f, meta = 0.8) {
  if (f >= meta) return 'ok';
  if (f >= FAIXA_ATENCAO) return 'warn';
  return 'low';
}

export function statusMeta(abaixo, faltam, curto = false) {
  if (!abaixo) return 'Meta atingida';
  return !curto && faltam ? `Abaixo da meta · faltam ${faltam}` : 'Abaixo da meta';
}

/** Prefere `exibicao` do resumo quando existir. */
export function exibir(bloco, rotulo, fallback) {
  const item = bloco.resumo?.find((r) => r.rotulo === rotulo);
  return item?.exibicao ?? fallback;
}

export function formatarValor(valor, formato) {
  if (valor == null || valor === '') return '—';
  if (formato === 'percentual') return pct(valor);
  if (formato === 'inteiro') return int(valor);
  if (formato === 'decimal') return dec1(valor);
  if (formato === 'data') return ddmmaaaa(valor);
  return String(valor);
}

const TIPOS = {
  ocupacao_profissional: 'Ocupação da profissional',
  pacientes_por_profissional: 'Pacientes por profissional',
  ocupacao_agregada: 'Ocupação agregada',
};
export const rotuloTipo = (tipo) => TIPOS[tipo] || 'Relatório';

export function tituloAba(b) {
  if (b.tipo === 'ocupacao_profissional') return `Ocupação · ${b.dados.profissional.nome}`;
  return rotuloTipo(b.tipo);
}

const hoje = () => new Date().toISOString().slice(0, 10);
export function nomeArquivo(blocos, formato) {
  const tipo = blocos.length === 1 ? blocos[0].tipo : 'relatorios';
  return `realocai-${tipo}-${hoje()}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`;
}

/** Heurística para mostrar o esqueleto do relatório enquanto o agente responde. */
export const pareceRelatorio = (texto = '') => /ocupa|pacientes por|quantos pacientes|relat[óo]rio/i.test(texto);
