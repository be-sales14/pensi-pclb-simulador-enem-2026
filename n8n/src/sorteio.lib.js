// Monta um simulado com questoes reais do banco (questoes_enem). Zero LLM.
// Usa ratear() e prng() de distribuidor.lib.js (o montador concatena os dois arquivos).
// Ver PLANO.md §0.
//
//   1. normalizarPedido: valida o pedido e preenche defaults;
//   2. planejar: quantas questoes por area, disciplina e (em MT) assunto, na proporcao
//      oficial (pesos_disciplina / pesos_incidencia, lidos do banco);
//   3. sortear: para cada linha do plano escolhe questoes reais, espalhando os anos,
//      evitando as que o aluno ja viu e nunca usando anulada;
//   4. ordenar: area na ordem da prova, lingua estrangeira primeiro, o resto embaralhado.

const ORDEM_AREAS = ['LC', 'CH', 'CN', 'MT'];
const AREAS_DO_DIA = { 1: ['LC', 'CH'], 2: ['CN', 'MT'] };

function normalizarPedido(e) {
  const p = e ?? {};
  const tipo = String(p.tipo ?? '').toLowerCase();
  if (!['oficial', 'personalizado'].includes(tipo)) throw new Error('tipo invalido: use "oficial" ou "personalizado"');
  const lingua = String(p.lingua ?? 'ingles').toLowerCase();
  if (!['ingles', 'espanhol'].includes(lingua)) throw new Error('lingua invalida: use "ingles" ou "espanhol"');
  const pedido = { tipo, lingua, semente: String(p.semente ?? '') || null };
  if (tipo === 'oficial') {
    const dia = p.dia == null || p.dia === '' || p.dia === 'completo' ? null : Number(p.dia);
    if (dia !== null && ![1, 2].includes(dia)) throw new Error('dia invalido: 1, 2 ou vazio (prova completa)');
    pedido.dia = dia;
    pedido.areas = dia ? AREAS_DO_DIA[dia] : ORDEM_AREAS;
    pedido.n_questoes = pedido.areas.length * 45;
  } else {
    const areas = [...new Set((Array.isArray(p.areas) ? p.areas : String(p.areas ?? '').split(','))
      .map(a => String(a).trim().toUpperCase()).filter(Boolean))];
    if (!areas.length || areas.some(a => !ORDEM_AREAS.includes(a))) throw new Error('areas invalidas: use LC, CH, CN, MT');
    const n = Number(p.n_questoes);
    if (!Number.isInteger(n) || n < 1 || n > 180) throw new Error('n_questoes invalido (1 a 180)');
    pedido.areas = ORDEM_AREAS.filter(a => areas.includes(a));
    pedido.n_questoes = n;
    pedido.disciplinas = (p.disciplinas ?? []).map(String);
    pedido.assuntos = (p.assuntos ?? []).map(String);
  }
  return pedido;
}

// Plano: [{area, disciplina, assunto_id|null, n}]. Soma = n_questoes, sempre.
function planejar(pedido, pesosDisciplina, pesosIncidencia) {
  const oficial = pedido.tipo === 'oficial';
  const totais = oficial
    ? Object.fromEntries(pedido.areas.map(a => [a, 45]))
    : Object.fromEntries(ratear(pedido.areas.map(a => ({ id: a, peso: 1 })), pedido.n_questoes).map(a => [a.id, a.slots]));
  const filtroDisc = new Set((pedido.disciplinas ?? []).map(s => s.toLowerCase()));
  const filtroAss = new Set(pedido.assuntos ?? []);
  const plano = [];
  for (const area of pedido.areas) {
    let discs = pesosDisciplina.filter(d => d.area === area)
      .filter(d => oficial || !filtroDisc.size || filtroDisc.has(String(d.disciplina).toLowerCase()));
    if (!discs.length) throw new Error(`nenhuma disciplina valida na area ${area}`);
    const porDisc = oficial
      ? discs.map(d => ({ ...d, slots: Number(d.slots_em_45) }))
      : ratear(discs.map(d => ({ ...d, id: d.disciplina, peso: Number(d.slots_em_45) })), totais[area]);
    for (const d of porDisc) {
      if (!d.slots) continue;
      if (area !== 'MT') { plano.push({ area, disciplina: d.disciplina, assunto_id: null, n: d.slots }); continue; }
      // Matematica: dividida por assunto, que e o que o estudo mediu questao a questao.
      let ass = pesosIncidencia.filter(a => a.area === 'MT' && (!filtroAss.size || filtroAss.has(a.id)));
      if (!ass.length) throw new Error('nenhum assunto de MT valido no pedido');
      const r = oficial && !filtroAss.size
        ? ass.map(a => ({ ...a, slots: Number(a.slots_em_45) }))
        : ratear(ass.map(a => ({ ...a, peso: Number(a.peso) })), d.slots);
      for (const a of r) if (a.slots) plano.push({ area, disciplina: d.disciplina, assunto_id: a.id, n: a.slots });
    }
  }
  const soma = plano.reduce((s, l) => s + l.n, 0);
  if (soma !== pedido.n_questoes) throw new Error(`plano fechou ${soma}, esperado ${pedido.n_questoes}`);
  return plano;
}

function sortear(pedido, plano, banco, vistos, semente) {
  const rnd = prng(semente);
  const jaVisto = new Set(vistos ?? []);
  const usadas = new Set();
  const avisos = [];
  const anosPorArea = {};
  const escolhidas = [];
  const sorteio = new Map(banco.map(q => [q.id, rnd()]));   // ordem aleatoria, fixa pela semente

  // Pool menor primeiro: o slot Interdisciplinar escolhe antes que Portugues e Literatura
  // gastem as questoes de duas disciplinas.
  const ordemSorteio = [...plano].sort((a, b) => (b.disciplina === 'Interdisciplinar') - (a.disciplina === 'Interdisciplinar'));
  for (const linha of ordemSorteio) {
    const anos = (anosPorArea[linha.area] = anosPorArea[linha.area] ?? {});
    // "Interdisciplinar" (1 de 45 em LC) nao e rotulo de questao: na leitura manual essas
    // questoes vem com duas disciplinas. O slot sai das questoes de LC com disciplina secundaria.
    const daDisciplina = linha.disciplina === 'Interdisciplinar'
      ? q => q.disciplina_secundaria != null && q.disciplina !== 'Lingua estrangeira'
      : q => q.disciplina === linha.disciplina;
    const casa = q => !q.anulada && q.area === linha.area && daDisciplina(q)
      && (linha.assunto_id == null || q.assunto_id === linha.assunto_id)
      && (q.lingua == null || q.lingua === pedido.lingua) && !usadas.has(q.id);
    let pool = banco.filter(q => casa(q) && !jaVisto.has(q.id));
    if (pool.length < linha.n) {
      const extra = banco.filter(q => casa(q) && jaVisto.has(q.id));
      if (extra.length) avisos.push(`${linha.disciplina}${linha.assunto_id ? ' / ' + linha.assunto_id : ''}: repetiu questao ja vista (banco pequeno para este aluno)`);
      pool = pool.concat(extra);
    }
    if (pool.length < linha.n)
      throw new Error(`banco sem questoes suficientes: ${linha.area}/${linha.disciplina}${linha.assunto_id ? '/' + linha.assunto_id : ''} pede ${linha.n}, tem ${pool.length}`);
    for (let k = 0; k < linha.n; k++) {
      // O ano menos usado nesta area ganha; empate, a ordem sorteada decide. Nao-vista antes de vista.
      pool.sort((a, b) => (jaVisto.has(a.id) - jaVisto.has(b.id)) || ((anos[a.ano] ?? 0) - (anos[b.ano] ?? 0))
        || (sorteio.get(a.id) - sorteio.get(b.id)));
      const q = pool.shift();
      usadas.add(q.id);
      anos[q.ano] = (anos[q.ano] ?? 0) + 1;
      escolhidas.push({ ...q, _linha: linha });
    }
  }
  return { escolhidas, avisos, anosPorArea };
}

function ordenar(pedido, escolhidas, semente) {
  const rnd = prng(semente + ':ordem');
  const peso = new Map(escolhidas.map(q => [q.id, rnd()]));
  const ordem = [...escolhidas].sort((a, b) =>
    ORDEM_AREAS.indexOf(a.area) - ORDEM_AREAS.indexOf(b.area)
    || ((b.disciplina === 'Lingua estrangeira') - (a.disciplina === 'Lingua estrangeira'))
    || (peso.get(a.id) - peso.get(b.id)));
  return ordem.map((q, i) => ({ numero: i + 1, questao_id: q.id, area: q.area, disciplina: q.disciplina, ano: q.ano }));
}

function montarSimulado(entrada, pesosDisciplina, pesosIncidencia, banco, vistos) {
  const pedido = normalizarPedido(entrada);
  const semente = pedido.semente ?? String(Date.now());
  const plano = planejar(pedido, pesosDisciplina, pesosIncidencia);
  const { escolhidas, avisos, anosPorArea } = sortear(pedido, plano, banco, vistos, semente);
  const itens = ordenar(pedido, escolhidas, semente);
  if (itens.length !== pedido.n_questoes || new Set(itens.map(i => i.questao_id)).size !== itens.length)
    throw new Error('simulado montado com contagem errada ou questao repetida');
  return { pedido, semente, plano, itens, avisos, anos_por_area: anosPorArea };
}
