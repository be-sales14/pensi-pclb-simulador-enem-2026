// Agente 1 · Distribuidor, camadas 1 e 2 (rateio e viabilidade textual). Zero LLM.
// Ver docs/03_DISTRIBUICAO_ENEM.md §7 e §8 e docs/05_RUBRICA_DIFICULDADE.md.
//
// Este arquivo e a fonte do no Code "Rateio" do 02-orquestrador. Nao edite o codigo
// dentro do n8n: edite aqui, rode `node scripts/testar_distribuidor.js` e regenere o
// workflow com `python3 scripts/montar_workflows.py`.

const AREAS = ['LC', 'CH', 'CN', 'MT'];
const INICIO_OFICIAL = { LC: 1, CH: 46, CN: 91, MT: 136 };
const NIVEL_ALVO = { facil: 2, medio: 5, dificil: 8 }; // centro de cada faixa da rubrica
const CURVA_PADRAO = { facil: 0.30, medio: 0.45, dificil: 0.25 };
const PISO_PESO = 5;       // assunto com >= 5% da area nunca fica com 0 slot...
const PISO_N_MINIMO = 20;  // ...em area com 20+ questoes
const N_PEQUENO = 10;      // abaixo disso, rateio por peso vira ruido

// Maior resto (Hare). Fecha a conta exata; desempate estavel por resto, peso e id.
function ratear(itens, total) {
  if (itens.length === 0 || total === 0) return itens.map(p => ({ ...p, slots: 0 }));
  const soma = itens.reduce((s, p) => s + p.peso, 0);
  if (!(soma > 0)) throw new Error(`ratear: soma de pesos ${soma} para ${total} slots`);
  const base = itens.map(p => {
    const ideal = (p.peso / soma) * total;
    return { ...p, ideal, slots: Math.floor(ideal) };
  });
  const resto = p => Math.round((p.ideal - Math.floor(p.ideal)) * 1e9) / 1e9;
  const ordem = [...base].sort((a, b) =>
    resto(b) - resto(a) || b.peso - a.peso || String(a.id).localeCompare(String(b.id)));
  let faltam = total - base.reduce((s, p) => s + p.slots, 0);
  for (let i = 0; faltam > 0; i = (i + 1) % ordem.length, faltam--) ordem[i].slots += 1;
  return base;
}

// PRNG com semente: o mesmo spec sempre gera o mesmo blueprint.
function prng(semente) {
  let h = 2166136261;
  for (const c of String(semente)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normalizar = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Niveis de um assunto com k slots, pela curva (rubrica, secao "Curva-alvo").
function niveis(k, spec, rnd) {
  if (spec.nivel && spec.nivel !== 'misto') return Array(k).fill(spec.nivel);
  const curva = spec.curva_dificuldade ?? CURVA_PADRAO;
  const rotulos = ['facil', 'medio', 'dificil'];
  const dominante = rotulos.reduce((a, b) => (curva[b] > curva[a] ? b : a));
  if (k === 1) return [dominante];
  if (k === 2) {
    const outros = rotulos.filter(r => r !== dominante);
    const soma = outros.reduce((s, r) => s + curva[r], 0);
    return [dominante, rnd() * soma < curva[outros[0]] ? outros[0] : outros[1]];
  }
  return ratear(rotulos.map(r => ({ id: r, peso: curva[r] })), k)
    .flatMap(r => Array(r.slots).fill(r.id));
}

// Rateio de uma area em dois niveis: area -> disciplina -> assunto.
// comTexto=false da o ALVO (distribuicao real); comTexto=true da o ENTREGUE (so texto).
function ratearArea(total, discs, assuntosPorDisc, oficial, comTexto) {
  const fatorMedio = d => {
    const as = assuntosPorDisc[d.disciplina];
    const soma = as.reduce((s, a) => s + a.pesoBase, 0);
    return soma > 0 ? as.reduce((s, a) => s + a.pesoBase * a.fator, 0) / soma : 1;
  };
  // Lingua estrangeira e fixada pelo edital: nao encolhe com fator_texto.
  const fixas = discs.filter(d => d.confianca === 'edital' && oficial);
  const livres = discs.filter(d => !fixas.includes(d));
  const totalLivre = total - fixas.reduce((s, d) => s + d.slots_em_45, 0);
  const porDisc = [
    ...fixas.map(d => ({ ...d, slots: d.slots_em_45 })),
    ...ratear(livres.map(d => ({
      ...d, id: d.disciplina,
      peso: d.slots_em_45 * (comTexto ? fatorMedio(d) : 1),
    })), totalLivre),
  ];
  return porDisc.flatMap(d => {
    const fixa = d.confianca === 'edital' && oficial;
    return ratear(assuntosPorDisc[d.disciplina].map(a => ({
      ...a, peso: a.pesoBase * (comTexto && !fixa ? a.fator : 1),
    })), d.slots);
  });
}

function distribuir(spec, pesosDisciplina, pesosIncidencia) {
  const oficial = spec.tipo === 'oficial';
  const n = oficial ? 180 : Number(spec.n_questoes);
  if (!oficial && !(Number.isInteger(n) && n >= 1 && n <= 180))
    throw new Error(`n_questoes invalido: ${spec.n_questoes} (1 a 180)`);
  const areas = oficial ? AREAS : AREAS.filter(a => (spec.areas ?? []).includes(a));
  if (areas.length === 0) throw new Error('nenhuma area valida no spec');

  // Filtros do personalizado. Assunto aceita id ('MT.funcoes') ou nome, sem acento.
  const filtroDisc = new Set((oficial ? [] : spec.disciplinas ?? []).map(normalizar));
  const filtroAss = new Set((oficial ? [] : spec.assuntos ?? []).map(normalizar));
  const conhecidos = new Set(pesosIncidencia.flatMap(a => [normalizar(a.id), normalizar(a.assunto)]));
  const desconhecidos = [...filtroAss].filter(x => !conhecidos.has(x));
  if (desconhecidos.length) throw new Error(`assunto fora de pesos_incidencia: ${desconhecidos.join(', ')}`);

  const pesoDe = a => Number(!oficial && spec.enfase === 'recente' && a.peso_recente != null
    ? a.peso_recente : a.peso);

  const totaisArea = oficial
    ? Object.fromEntries(areas.map(a => [a, 45]))
    : Object.fromEntries(ratear(areas.map(a => ({ id: a, peso: 1 })), n).map(a => [a.id, a.slots]));

  const alvo = [], entregue = [];
  for (const area of areas) {
    const total = totaisArea[area];
    let candidatos = pesosIncidencia.filter(a => a.area === area)
      .filter(a => filtroDisc.size === 0 || filtroDisc.has(normalizar(a.disciplina)))
      .filter(a => filtroAss.size === 0 || filtroAss.has(normalizar(a.id)) || filtroAss.has(normalizar(a.assunto)))
      .map(a => ({
        ...a, id: a.id, peso_bruto: pesoDe(a), fator: Number(a.fator_texto ?? 1),
        pesoBase: oficial ? Number(a.slots_em_45) : pesoDe(a),
      }));
    if (candidatos.length === 0) throw new Error(`nenhum assunto candidato na area ${area}`);

    const discs = pesosDisciplina.filter(d => d.area === area &&
      candidatos.some(a => a.disciplina === d.disciplina)).map(d => ({ ...d, slots_em_45: Number(d.slots_em_45) }));
    const porDisc = Object.fromEntries(discs.map(d =>
      [d.disciplina, candidatos.filter(a => a.disciplina === d.disciplina)]));

    // Peso do assunto na area inteira, em %: participacao da disciplina x do assunto nela.
    const somaDisc = discs.reduce((s, d) => s + d.slots_em_45, 0);
    for (const d of discs) {
      const soma = porDisc[d.disciplina].reduce((s, a) => s + a.pesoBase, 0);
      for (const a of porDisc[d.disciplina])
        a.peso_area = soma > 0 ? 100 * (d.slots_em_45 / somaDisc) * (a.pesoBase / soma) : 0;
    }

    let a1, a2;
    if (!oficial && total < N_PEQUENO) {
      // Poucas questoes: assuntos pedidos em partes iguais; senao os de maior peso, 1 cada.
      if (filtroAss.size > 0) {
        a1 = a2 = ratear(candidatos.map(a => ({ ...a, peso: 1 })), total);
      } else {
        const top = (chave) => {
          const ids = new Set([...candidatos].sort((x, y) => chave(y) - chave(x) || x.id.localeCompare(y.id))
            .slice(0, total).map(a => a.id));
          const base = candidatos.map(a => ({ ...a, slots: ids.has(a.id) ? 1 : 0 }));
          // Se total > numero de assuntos, o que sobra vai por peso.
          const sobra = total - base.reduce((s, a) => s + a.slots, 0);
          if (sobra > 0) ratear(base.map(a => ({ ...a, peso: chave(a) })), sobra)
            .forEach((r, i) => { base[i].slots += r.slots; });
          return base;
        };
        a1 = top(a => a.peso_area);
        a2 = top(a => a.peso_area * a.fator);
      }
    } else {
      a1 = ratearArea(total, discs, porDisc, oficial, false);
      a2 = ratearArea(total, discs, porDisc, oficial, true);
      if (!oficial && total >= PISO_N_MINIMO) {
        for (const a of a2) {
          if (a.slots === 0 && a.peso_area >= PISO_PESO && a.fator > 0.2) {
            const maior = a2.reduce((x, y) => (y.slots > x.slots ? y : x));
            maior.slots -= 1; a.slots = 1;
          }
        }
      }
    }
    if (oficial) a1 = candidatos.map(a => ({ ...a, slots: Number(a.slots_em_45) }));
    alvo.push(...a1); entregue.push(...a2);
  }

  // Blueprint: um slot por questao. Area na ordem oficial, assunto por peso na area.
  const rnd = prng(spec.semente ?? spec.job_id ?? JSON.stringify(spec));
  const blueprint = [];
  let seq = 0;
  for (const area of areas) {
    const doArea = entregue.filter(a => a.area === area && a.slots > 0)
      .sort((x, y) => y.peso_area - x.peso_area || x.id.localeCompare(y.id));
    let k = 0;
    for (const a of doArea) {
      for (const rotulo of niveis(a.slots, spec, rnd)) {
        k += 1; seq += 1;
        blueprint.push({
          slot_id: `${area}-${String(k).padStart(2, '0')}`,
          numero: oficial ? INICIO_OFICIAL[area] + k - 1 : seq,
          area, disciplina: a.disciplina, assunto_id: a.id, assunto: a.assunto,
          recorte: null, contexto: null, genero_suporte: null, contexto_proibido: [],
          habilidade: null, // Matriz do INEP quando mapear limpo. Nao inventar codigo.
          nivel: rotulo, nivel_alvo: NIVEL_ALVO[rotulo],
          suporte_permitido: area === 'LC' && a.disciplina !== 'Interdisciplinar'
            ? ['texto'] : ['texto', 'tabela'],
          fator_texto: a.fator,
          peso_origem: { fonte: a.confianca, percentual: Number(a.peso) },
        });
      }
    }
  }

  // Fidelidade: onde o entregue (so texto) difere do alvo (prova real). Declarado, nao escondido.
  const desvios = [];
  const soma = (lista, chave) => lista.reduce((m, a) => ({ ...m, [chave(a)]: (m[chave(a)] ?? 0) + a.slots }), {});
  const dA = soma(alvo, a => `${a.area}|${a.disciplina}`), dE = soma(entregue, a => `${a.area}|${a.disciplina}`);
  for (const k of Object.keys(dA)) if (dA[k] !== (dE[k] ?? 0)) {
    const [area, disciplina] = k.split('|');
    desvios.push({ nivel: 'disciplina', area, disciplina, alvo: dA[k], entregue: dE[k] ?? 0, motivo: 'restricao_texto' });
  }
  const eMap = Object.fromEntries(entregue.map(a => [a.id, a.slots]));
  for (const a of alvo) if (a.slots !== (eMap[a.id] ?? 0))
    desvios.push({ nivel: 'assunto', area: a.area, disciplina: a.disciplina, assunto: a.assunto,
                   alvo: a.slots, entregue: eMap[a.id] ?? 0, motivo: 'restricao_texto' });
  const movidos = alvo.reduce((s, a) => s + Math.max(0, a.slots - (eMap[a.id] ?? 0)), 0);

  // Invariantes: se quebrar, falha alto (vai para o 99-erro), nunca segue com conta errada.
  if (blueprint.length !== n) throw new Error(`rateio fechou ${blueprint.length} slots, esperado ${n}`);
  for (const area of areas) {
    const got = blueprint.filter(s => s.area === area).length;
    if (got !== totaisArea[area]) throw new Error(`area ${area}: ${got} slots, esperado ${totaisArea[area]}`);
  }
  if (entregue.some(a => a.slots < 0) || alvo.reduce((s, a) => s + a.slots, 0) !== n)
    throw new Error('rateio inconsistente entre alvo e entregue');

  return {
    blueprint,
    fidelidade: { score: Math.round((1 - movidos / n) * 1000) / 1000, desvios },
    totais_area: totaisArea,
  };
}
