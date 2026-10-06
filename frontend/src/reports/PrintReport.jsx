import s from './reports.module.css';
import { ReportCard } from './ReportCard';

/**
 * Documento de impressão (PDF): os mesmos cartões do chat, no layout largo e sem controles.
 * Cada bloco começa numa página nova, com o cabeçalho de registro; o texto de destaque da
 * mensagem do assistente vem só antes do primeiro.
 * @param {{blocos: import('./types').Bloco[], texto?: string, logoUrl?: string, geradoEm?: Date}} props
 */
export function PrintReport({ blocos, texto = '', logoUrl, geradoEm = new Date() }) {
  const quando = `${geradoEm.toLocaleDateString('pt-BR')} às ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <main className={s.printDoc}>
      {blocos.map((b, i) => (
        <article key={i} className="pr-block">
          <header className="pr-head">
            {logoUrl && <img src={logoUrl} alt="" />}
            <strong>Vida Plena · Espaço Multidisciplinar</strong>
            <span>Gerado em {quando}</span>
          </header>
          {i === 0 && texto && <p className="pr-text">{texto}</p>}
          <ReportCard bloco={b} impressao />
        </article>
      ))}
    </main>
  );
}
