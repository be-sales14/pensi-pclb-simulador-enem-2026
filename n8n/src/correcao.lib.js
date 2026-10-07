// Corrige uma entrega. Roda no n8n (o gabarito nunca vai ao browser antes disto).
// itens: [{numero, area, disciplina, gabarito}] lidos do banco; respostas: {"1":"C", ...}.

function corrigir(itens, respostasBrutas) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('simulado sem questoes');
  const respostas = typeof respostasBrutas === 'string' ? JSON.parse(respostasBrutas) : (respostasBrutas ?? {});
  const limpas = {};
  const detalhe = [];
  const soma = (m, k, certo) => { m[k] = m[k] ?? { acertos: 0, total: 0 }; m[k].total += 1; if (certo) m[k].acertos += 1; };
  const porArea = {}, porDisciplina = {};
  let acertos = 0;
  for (const it of [...itens].sort((a, b) => a.numero - b.numero)) {
    const bruta = respostas[it.numero] ?? respostas[String(it.numero)] ?? null;
    const marcada = bruta == null || bruta === '' ? null : String(bruta).trim().toUpperCase();
    if (marcada !== null && !/^[A-E]$/.test(marcada)) throw new Error(`resposta invalida na questao ${it.numero}: "${bruta}"`);
    const certo = marcada !== null && marcada === it.gabarito;
    if (certo) acertos += 1;
    limpas[it.numero] = marcada;
    soma(porArea, it.area, certo);
    soma(porDisciplina, `${it.area} · ${it.disciplina}`, certo);
    detalhe.push({ numero: it.numero, marcada, gabarito: it.gabarito, certo });
  }
  const numeros = new Set(itens.map(i => String(i.numero)));
  const fora = Object.keys(respostas).filter(k => !numeros.has(String(k)));
  if (fora.length) throw new Error(`respostas para questoes que nao existem neste simulado: ${fora.join(', ')}`);
  return { respostas: limpas, acertos, total: itens.length, por_area: porArea, por_disciplina: porDisciplina, detalhe };
}
