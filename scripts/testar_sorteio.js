#!/usr/bin/env node
// Testa n8n/src/sorteio.lib.js contra o banco real (data/banco) e os pesos reais.
// Uso: node scripts/testar_sorteio.js      (sai com codigo 1 se algo falhar)
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const lib = new Function(`${ler('n8n/src/distribuidor.lib.js')}\n${ler('n8n/src/sorteio.lib.js')}
  return { montarSimulado, normalizarPedido };`)();

// Mesmo formato das linhas que o n8n le do Supabase.
const cls = JSON.parse(ler('data/banco/classificacao.json'));
const banco = ler('data/banco/questoes.jsonl').trim().split('\n').map(JSON.parse).map(r => ({
  id: r.id, ano: r.ano, area: r.area, lingua: r.lingua, anulada: r.anulada,
  disciplina: cls[r.id].disciplina, disciplina_secundaria: cls[r.id].disciplina_secundaria, assunto_id: cls[r.id].assunto_id,
}));
const pj = JSON.parse(ler('data/pesos_incidencia.json'));
const disciplinas = Object.entries(pj.divisao_disciplinas).flatMap(([area, ds]) => ds.map(d => ({ area, ...d })));
const assuntos = pj.assuntos;
const montar = (pedido, vistos) => lib.montarSimulado({ semente: 'teste', ...pedido }, disciplinas, assuntos, banco, vistos);
const porId = Object.fromEntries(banco.map(q => [q.id, q]));

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
}
const afirma = (c, m) => { if (!c) throw new Error(m); };
const conta = (xs, f) => xs.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});

console.log('oficial completo');
const of = montar({ tipo: 'oficial' });
const qs = of.itens.map(i => porId[i.questao_id]);
caso('180 questoes, 45 por area, sem repetir', () => {
  afirma(of.itens.length === 180 && new Set(of.itens.map(i => i.questao_id)).size === 180, 'contagem');
  afirma(JSON.stringify(conta(qs, q => q.area)) === JSON.stringify({ LC: 45, CH: 45, CN: 45, MT: 45 }), JSON.stringify(conta(qs, q => q.area)));
});
caso('proporcao por disciplina = divisao oficial', () => {
  const linhas = of.plano.reduce((m, l) => ({ ...m, [`${l.area}/${l.disciplina}`]: (m[`${l.area}/${l.disciplina}`] ?? 0) + l.n }), {});
  for (const d of disciplinas) afirma(linhas[`${d.area}/${d.disciplina}`] === d.slots_em_45, `plano ${d.disciplina}`);
  const got = conta(qs, q => `${q.area}/${q.disciplina}`);
  got['LC/Interdisciplinar'] = 1; got['LC/Portugues'] -= 0;
  const interd = qs.filter(q => q.area === 'LC' && q.disciplina_secundaria && q.disciplina !== 'Lingua estrangeira');
  afirma(interd.length >= 1, 'nenhuma questao interdisciplinar');
  for (const d of disciplinas.filter(d => d.disciplina !== 'Interdisciplinar' && d.area !== 'LC')) afirma((got[`${d.area}/${d.disciplina}`] ?? 0) === d.slots_em_45, `${d.disciplina}: ${got[`${d.area}/${d.disciplina}`]} vs ${d.slots_em_45}`);
});
caso('Matematica por assunto = slots medidos', () => {
  const got = conta(qs.filter(q => q.area === 'MT'), q => q.assunto_id);
  for (const a of assuntos.filter(a => a.area === 'MT' && a.slots_em_45)) afirma(got[a.id] === a.slots_em_45, `${a.id}: ${got[a.id]} vs ${a.slots_em_45}`);
});
caso('nenhuma anulada; lingua estrangeira so na lingua pedida e no comeco', () => {
  afirma(qs.every(q => !q.anulada), 'anulada entrou');
  const le = qs.filter(q => q.disciplina === 'Lingua estrangeira');
  afirma(le.every(q => q.lingua === 'ingles'), 'lingua errada');
  afirma(of.itens.slice(0, 5).every(i => porId[i.questao_id].disciplina === 'Lingua estrangeira'), 'LE fora das 5 primeiras');
});
caso('anos espalhados: nenhum ano passa de 9 questoes numa area de 45', () => {
  for (const [area, anos] of Object.entries(of.anos_por_area))
    afirma(Math.max(...Object.values(anos)) <= 9 && Object.keys(anos).length === 7, `${area}: ${JSON.stringify(anos)}`);
});
caso('mesma semente, mesma prova; outra semente, outra prova', () => {
  afirma(JSON.stringify(montar({ tipo: 'oficial' }).itens) === JSON.stringify(of.itens), 'nao deterministico');
  const outra = montar({ tipo: 'oficial', semente: 'outra' });
  const iguais = outra.itens.filter((x, i) => x.questao_id === of.itens[i].questao_id).length;
  afirma(iguais < 20, `${iguais} posicoes iguais com outra semente`);
});

console.log('\noficial por dia e personalizado');
caso('dia 1 = LC + CH, 90 questoes; espanhol quando pedido', () => {
  const r = montar({ tipo: 'oficial', dia: 1, lingua: 'espanhol' });
  const q = r.itens.map(i => porId[i.questao_id]);
  afirma(r.itens.length === 90 && q.every(x => ['LC', 'CH'].includes(x.area)), 'areas');
  afirma(q.filter(x => x.disciplina === 'Lingua estrangeira').every(x => x.lingua === 'espanhol'), 'lingua');
});
caso('personalizado 45 de MT segue os pesos', () => {
  const r = montar({ tipo: 'personalizado', areas: ['MT'], n_questoes: 45 });
  const got = conta(r.itens.map(i => porId[i.questao_id]), q => q.assunto_id);
  afirma(got['MT.razao_proporcao'] >= 7, JSON.stringify(got));
});
caso('personalizado 10 de Humanas so de Historia', () => {
  const r = montar({ tipo: 'personalizado', areas: ['CH'], n_questoes: 10, disciplinas: ['Historia'] });
  afirma(r.itens.every(i => porId[i.questao_id].disciplina === 'Historia') && r.itens.length === 10, 'disciplina');
});
caso('aluno nao recebe questao que ja viu (quando o banco permite)', () => {
  const primeiro = montar({ tipo: 'personalizado', areas: ['CH'], n_questoes: 45 });
  const vistos = primeiro.itens.map(i => i.questao_id);
  const segundo = montar({ tipo: 'personalizado', areas: ['CH'], n_questoes: 45, semente: 'x' }, vistos);
  const repetidas = segundo.itens.filter(i => vistos.includes(i.questao_id)).length;
  afirma(repetidas === 0 && segundo.avisos.length === 0, `${repetidas} repetidas`);
});
caso('banco esgotado avisa e reaproveita, sem quebrar', () => {
  const vistos = banco.filter(q => q.area === 'CH').map(q => q.id);
  const r = montar({ tipo: 'personalizado', areas: ['CH'], n_questoes: 20 }, vistos);
  afirma(r.itens.length === 20 && r.avisos.length > 0, JSON.stringify(r.avisos));
});
caso('pedido invalido e rejeitado', () => {
  for (const p of [{ tipo: 'x' }, { tipo: 'oficial', dia: 3 }, { tipo: 'personalizado', areas: ['XX'], n_questoes: 5 },
                   { tipo: 'personalizado', areas: ['MT'], n_questoes: 0 }, { tipo: 'oficial', lingua: 'frances' }]) {
    let ok = false; try { montar(p); } catch { ok = true; }
    afirma(ok, `aceitou ${JSON.stringify(p)}`);
  }
});

console.log('\nexemplo: oficial completo, questoes por ano em cada area');
for (const [a, anos] of Object.entries(of.anos_por_area)) console.log(`  ${a}: ${JSON.stringify(anos)}`);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nOK — todos os casos passaram.');
process.exit(falhas ? 1 : 0);
