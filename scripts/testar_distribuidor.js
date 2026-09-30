#!/usr/bin/env node
// Testa n8n/src/distribuidor.lib.js contra os pesos reais de data/pesos_incidencia.json,
// no mesmo formato das linhas que o n8n le do Supabase.
// Uso: node scripts/testar_distribuidor.js      (sai com codigo 1 se algo falhar)
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

const src = fs.readFileSync(path.join(RAIZ, 'n8n/src/distribuidor.lib.js'), 'utf8');
const { distribuir, ratear } = new Function(`${src}; return { distribuir, ratear };`)();

const d = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/pesos_incidencia.json'), 'utf8'));
const disciplinas = Object.entries(d.divisao_disciplinas).flatMap(([area, ds]) =>
  ds.map(x => ({ area, disciplina: x.disciplina, peso: x.peso, slots_em_45: x.slots_em_45, confianca: x.confianca })));
const assuntos = d.assuntos.map(a => ({
  id: a.id, area: a.area, disciplina: a.disciplina, assunto: a.assunto, peso: a.peso,
  peso_recente: a.peso_recente ?? null, slots_em_45: a.slots_em_45, confianca: a.confianca,
  fator_texto: a.fator_texto ?? 1,
}));

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
}
function igual(got, exp, msg) {
  const ord = v => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ord(v[k])])) : v;
  if (JSON.stringify(ord(got)) !== JSON.stringify(ord(exp)))
    throw new Error(`${msg}: esperado ${JSON.stringify(exp)}, veio ${JSON.stringify(got)}`);
}
const contar = (bp, chave) => bp.reduce((m, s) => ({ ...m, [chave(s)]: (m[chave(s)] ?? 0) + 1 }), {});
const sp = extra => ({ tipo: 'personalizado', job_id: 'teste', ...extra });

console.log('ratear');
caso('exemplo do doc fecha a conta', () => {
  const r = ratear([{ id: 'a', peso: 1 }, { id: 'b', peso: 1 }, { id: 'c', peso: 1 }], 10);
  igual(r.map(x => x.slots), [4, 3, 3], 'maior resto com empate');
});
caso('Artes 60/40 em 4 da 2/2 (o JSON diz 3/1: divergencia conhecida)', () => {
  igual(ratear([{ id: 'mov', peso: 60 }, { id: 'mus', peso: 40 }], 4).map(x => x.slots), [2, 2], 'Hare');
});

console.log('\noficial');
const of = distribuir({ tipo: 'oficial', job_id: 'teste' }, disciplinas, assuntos);
caso('180 slots, 45 por area', () => {
  igual(of.blueprint.length, 180, 'total');
  igual(contar(of.blueprint, s => s.area), { LC: 45, CH: 45, CN: 45, MT: 45 }, 'por area');
});
caso('numeracao oficial 1-180 sem buraco, LC 1-45 ... MT 136-180', () => {
  igual(of.blueprint.map(s => s.numero), Array.from({ length: 180 }, (_, i) => i + 1), 'numeros');
  igual(of.blueprint.filter(s => s.area === 'MT').map(s => s.numero)[0], 136, 'MT comeca em 136');
});
caso('Lingua estrangeira fica com 5 (edital nao encolhe)', () => {
  igual(contar(of.blueprint, s => s.disciplina)['Lingua estrangeira'], 5, 'LE');
});
caso('Artes perde slot por restricao de texto e isso aparece na fidelidade', () => {
  const artes = of.fidelidade.desvios.find(x => x.nivel === 'disciplina' && x.disciplina === 'Artes');
  if (!artes || !(artes.entregue < artes.alvo)) throw new Error(JSON.stringify(of.fidelidade.desvios));
});
caso('nenhuma imagem em suporte_permitido', () => {
  if (of.blueprint.some(s => s.suporte_permitido.includes('imagem'))) throw new Error('imagem');
});
caso('nenhum codigo de habilidade inventado', () => {
  if (of.blueprint.some(s => s.habilidade !== null)) throw new Error('habilidade preenchida');
});
caso('deterministico: mesmo spec, mesmo blueprint', () => {
  const b = distribuir({ tipo: 'oficial', job_id: 'teste' }, disciplinas, assuntos);
  igual(b, of, 'segunda rodada');
});

console.log('\npersonalizado');
caso('Fase 1: 5 de Matematica = 5 assuntos distintos, 1 slot cada', () => {
  const r = distribuir(sp({ areas: ['MT'], n_questoes: 5 }), disciplinas, assuntos);
  igual(r.blueprint.length, 5, 'total');
  igual(new Set(r.blueprint.map(s => s.assunto_id)).size, 5, 'assuntos distintos');
  igual(r.blueprint.map(s => s.slot_id), ['MT-01', 'MT-02', 'MT-03', 'MT-04', 'MT-05'], 'slot_ids');
  igual(r.blueprint.map(s => s.numero), [1, 2, 3, 4, 5], 'numeros');
  igual([...new Set(r.blueprint.map(s => s.nivel))], ['medio'], '1 slot por assunto = nivel dominante');
});
caso('45 de Matematica bate com os slots medidos quando nao ha perda de texto', () => {
  const r = distribuir(sp({ areas: ['MT'], n_questoes: 45 }), disciplinas, assuntos);
  igual(r.blueprint.length, 45, 'total');
  const razao = r.fidelidade.desvios.find(x => x.assunto === 'Razao, proporcao e regra de tres');
  if (razao && razao.entregue < razao.alvo) throw new Error('razao (fator 1.0) nao deveria perder slot');
});
caso('60 questoes em LC+CH: 30/30, com filtro de disciplina respeitado', () => {
  const r = distribuir(sp({ areas: ['LC', 'CH'], n_questoes: 60, disciplinas: ['Historia', 'Portugues'] }), disciplinas, assuntos);
  igual(contar(r.blueprint, s => s.area), { LC: 30, CH: 30 }, 'por area');
  igual(Object.keys(contar(r.blueprint, s => s.disciplina)).sort(), ['Historia', 'Portugues'], 'disciplinas');
});
caso('assuntos pedidos por nome sem acento, n pequeno = partes iguais', () => {
  const r = distribuir(sp({ areas: ['MT'], n_questoes: 4, assuntos: ['probabilidade', 'Porcentagem'] }), disciplinas, assuntos);
  igual(contar(r.blueprint, s => s.assunto_id), { 'MT.probabilidade': 2, 'MT.porcentagem': 2 }, 'divisao');
});
caso('nivel fixo "dificil" vira nivel_alvo 8 em todos', () => {
  const r = distribuir(sp({ areas: ['MT'], n_questoes: 12, nivel: 'dificil' }), disciplinas, assuntos);
  igual([...new Set(r.blueprint.map(s => s.nivel_alvo))], [8], 'nivel_alvo');
});
caso('curva aplicada dentro do assunto: 3+ slots misturam niveis', () => {
  const r = distribuir(sp({ areas: ['MT'], n_questoes: 45 }), disciplinas, assuntos);
  const razao = r.blueprint.filter(s => s.assunto_id === 'MT.razao_proporcao').map(s => s.nivel);
  if (new Set(razao).size < 2) throw new Error(`so um nivel em ${razao.length} slots: ${razao}`);
});
caso('assunto inventado e rejeitado', () => {
  let erro = null;
  try { distribuir(sp({ areas: ['MT'], n_questoes: 5, assuntos: ['Calculo diferencial'] }), disciplinas, assuntos); }
  catch (e) { erro = e.message; }
  if (!erro || !erro.includes('fora de pesos_incidencia')) throw new Error(`nao rejeitou: ${erro}`);
});
caso('n_questoes fora de 1..180 e rejeitado', () => {
  for (const n of [0, 181, 2.5]) {
    let ok = false;
    try { distribuir(sp({ areas: ['MT'], n_questoes: n }), disciplinas, assuntos); } catch { ok = true; }
    if (!ok) throw new Error(`aceitou n=${n}`);
  }
});

console.log('\nresumo do oficial');
console.log(`  fidelidade ${of.fidelidade.score}; desvios por disciplina:`);
for (const x of of.fidelidade.desvios.filter(x => x.nivel === 'disciplina'))
  console.log(`    ${x.area} ${x.disciplina}: alvo ${x.alvo}, entregue ${x.entregue}`);
const f5 = distribuir(sp({ areas: ['MT'], n_questoes: 5 }), disciplinas, assuntos);
console.log('  Fase 1 (5 MT): ' + f5.blueprint.map(s => s.assunto_id.replace('MT.', '')).join(', '));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nOK — todos os casos passaram.');
process.exit(falhas ? 1 : 0);
