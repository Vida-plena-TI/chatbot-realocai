import { formatarValor, periodo, rotuloTipo } from './format';

/**
 * Versão impressa (A4 paisagem). Sem elementos interativos.
 * Gerada só a partir dos dados do bloco: resumo, tabelas e avisos.
 * @param {{blocos: import('./types').Bloco[], clinica?: string, logoUrl?: string, geradoEm?: Date}} props
 */
export function PrintReport({ blocos, clinica = 'Vida Plena', subtitulo = 'Espaço Multidisciplinar', logoUrl, geradoEm = new Date() }) {
  const quando = `${geradoEm.toLocaleDateString('pt-BR')} às ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <>
      <footer className="pr-footer">
        <span>Gerado pelo RealocAI · uso interno · sem dados de pacientes</span>
        <span>Gerado em {quando}</span>
      </footer>
      {blocos.map((b, i) => (
        <article key={i} className="pr-block">
          <header className="pr-head">
            {logoUrl && <img src={logoUrl} alt="" />}
            <div className="pr-brand">
              <strong>{clinica}</strong>
              <span>{subtitulo}</span>
            </div>
            <div className="pr-meta">
              Gerado em {quando}
              <br />
              Meta de ocupação: {Math.round((b.meta ?? 0.8) * 100)}%
            </div>
          </header>

          <div className="pr-title">
            <div>
              <span className="pr-kicker">{rotuloTipo(b.tipo)}</span>
              <h1>{b.titulo}</h1>
              <span className="pr-period">Período: {periodo(b.periodo)}</span>
            </div>
            {b.resumo?.length > 0 && (
              <dl className="pr-summary">
                {b.resumo.map((r) => (
                  <div key={r.rotulo}>
                    <dt>{r.rotulo}</dt>
                    <dd>{r.exibicao ?? formatarValor(r.valor, r.formato)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {b.parcial && <p className="pr-warn">Dados parciais: parte da agenda não pôde ser lida.</p>}

          {b.tabelas?.map((t) => (
            <section key={t.nome} className="pr-table">
              <h2>{t.nome}</h2>
              <table>
                <thead>
                  <tr>
                    {t.colunas.map((c) => (
                      <th key={c.chave} className={c.formato === 'texto' || c.formato === 'data' ? '' : 'num'}>{c.rotulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.linhas.map((l, j) => (
                    <tr key={j}>
                      {t.colunas.map((c) => (
                        <td key={c.chave} className={c.formato === 'texto' || c.formato === 'data' ? '' : 'num'}>{formatarValor(l[c.chave], c.formato)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {b.avisos?.map((a) => (
            <p key={a} className="pr-note">{a}</p>
          ))}
        </article>
      ))}
    </>
  );
}
