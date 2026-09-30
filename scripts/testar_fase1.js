#!/usr/bin/env node
// Testa os nos Code da Fase 1 (spec, variedade, questao, resposta) sem n8n.
// Uso: node scripts/testar_fase1.js      (sai com codigo 1 se algo falhar)
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const carregar = (arq, nomes) => new Function(
  `${fs.readFileSync(path.join(RAIZ, 'n8n/src', arq), 'utf8')}; return { ${nomes} };`)();

const { normalizarSpec } = carregar('spec.lib.js', 'normalizarSpec');
const { juntarVariedade } = carregar('variedade.lib.js', 'juntarVariedade');
const { validarQuestao } = carregar('questao.lib.js', 'validarQuestao');
const { montarResposta } = carregar('resposta.lib.js', 'montarResposta');

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
}
function afirma(cond, msg) { if (!cond) throw new Error(msg); }
function lanca(fn, trecho) {
  try { fn(); } catch (e) { afirma(e.message.includes(trecho), `erro errado: ${e.message}`); return; }
  throw new Error(`nao lancou (esperado "${trecho}")`);
}
const clone = o => JSON.parse(JSON.stringify(o));

console.log('spec');
caso('personalizado de MT preenche defaults e declara em assumido', () => {
  const s = normalizarSpec({ tipo: 'personalizado', areas: 'matemática', n_questoes: '5' }, { agora: 'x' });
  afirma(s.areas.join() === 'MT' && s.n_questoes === 5, JSON.stringify(s));
  afirma(s.modo === 'rapido' && s.nivel === 'misto', 'defaults');
  afirma(s.assumido.some(a => a.startsWith('modo=')), 'assumido sem modo');
});
caso('"oficial so de matematica" e reclassificado como personalizado', () => {
  lanca(() => normalizarSpec({ tipo: 'oficial', areas: ['MT'] }), 'n_questoes');
  const s = normalizarSpec({ tipo: 'oficial', areas: ['MT'], n_questoes: 5 });
  afirma(s.tipo === 'personalizado' && s.assumido.some(a => a.includes('reclassificado')), JSON.stringify(s));
});
caso('trava da Fase 1: so MT e no maximo 10', () => {
  lanca(() => normalizarSpec({ tipo: 'personalizado', areas: ['CH'], n_questoes: 5 }), 'Fase 1');
  lanca(() => normalizarSpec({ tipo: 'personalizado', areas: ['MT'], n_questoes: 20 }), 'Fase 1');
  lanca(() => normalizarSpec({ tipo: 'oficial' }), 'Fase 1');
});
caso('sem a trava, oficial vira 180 nas 4 areas', () => {
  const s = normalizarSpec({ tipo: 'oficial' }, { fase1: false });
  afirma(s.n_questoes === 180 && s.areas.length === 4, JSON.stringify(s));
});
caso('pedido embrulhado pela ferramenta do agente e lido (query objeto, query texto, input)', () => {
  const pedido = { tipo: 'personalizado', areas: ['MT'], n_questoes: 5 };
  for (const e of [{ query: pedido }, { query: JSON.stringify(pedido) }, { input: { query: '```json\n' + JSON.stringify(pedido) + '\n```' } }]) {
    const s = normalizarSpec(e);
    afirma(s.tipo === 'personalizado' && s.n_questoes === 5, JSON.stringify(e));
  }
});
caso('sem tipo, o erro lista os campos que chegaram', () => {
  lanca(() => normalizarSpec({ query: 'quero 5 de matematica', sessionId: 'x' }), 'Campos recebidos: query, sessionId');
});
caso('valor invalido e rejeitado, nao ignorado', () => {
  lanca(() => normalizarSpec({ tipo: 'personalizado', areas: ['MT'], n_questoes: 5, nivel: 'impossivel' }), 'nivel invalido');
  lanca(() => normalizarSpec({ tipo: 'qualquer' }), 'tipo invalido');
});

console.log('\nvariedade');
const bp = ['MT-01', 'MT-02', 'MT-03'].map(id => ({ slot_id: id, suporte_permitido: ['texto', 'tabela'], contexto_proibido: [] }));
const saida = { output: { slots: [
  { slot_id: 'MT-01', recorte: 'escala de mapa', genero_suporte: 'situação-problema', contexto: 'trilha em parque estadual' },
  { slot_id: 'MT-02', recorte: 'juros simples', genero_suporte: 'tabela', contexto: 'compra parcelada de geladeira' },
  { slot_id: 'MT-03', recorte: 'media ponderada', genero_suporte: 'texto informativo', contexto: 'nota de corte do Sisu' },
] } };
caso('contexto_proibido acumula os contextos anteriores', () => {
  const r = juntarVariedade(bp, saida).blueprint;
  afirma(r[0].contexto_proibido.length === 0, 'slot 1');
  afirma(r[2].contexto_proibido.join('|') === 'trilha em parque estadual|compra parcelada de geladeira', JSON.stringify(r[2]));
  afirma(r[0].genero_suporte === 'situacao-problema', 'genero normalizado');
});
caso('LLM que muda a contagem e rejeitado', () => {
  const s = clone(saida); s.output.slots.pop();
  lanca(() => juntarVariedade(bp, s), 'A contagem e do codigo');
});
caso('contexto repetido e rejeitado', () => {
  const s = clone(saida); s.output.slots[2].contexto = 'Trilha em  parque estadual';
  lanca(() => juntarVariedade(bp, s), 'contexto repetido');
});
caso('tabela onde nao pode vira situacao-problema com aviso', () => {
  const b = clone(bp); b[1].suporte_permitido = ['texto'];
  const r = juntarVariedade(b, saida);
  afirma(r.blueprint[1].genero_suporte === 'situacao-problema' && r.avisos.length === 1, JSON.stringify(r.avisos));
});

console.log('\nquestao');
const slot = { slot_id: 'MT-01', area: 'MT', assunto: 'Razao, proporcao e regra de tres', nivel: 'medio', suporte_permitido: ['texto', 'tabela'] };
// Conferida a mao: 1:25.000, 8 cm no mapa = 200.000 cm = 2 km. Ida e volta = 4 km.
const boa = { output: {
  inviavel: false,
  suporte: {
    texto: 'Um grupo de estudantes planeja uma caminhada em um parque estadual. No mapa da trilha, feito na escala 1 : 25 000, o trecho entre a portaria e a cachoeira mede 8 cm. O grupo vai da portaria até a cachoeira e volta pelo mesmo caminho.',
    tabela_md: null, fonte: 'Texto elaborado para este simulado.', fonte_tipo: 'elaborado' },
  enunciado: 'A distância total percorrida pelo grupo, em quilômetros, é',
  alternativas: [
    { letra: 'A', texto: '0,4' }, { letra: 'B', texto: '2' }, { letra: 'C', texto: '4' },
    { letra: 'D', texto: '20' }, { letra: 'E', texto: '40' }],
  gabarito: 'C',
  justificativas: [
    { letra: 'A', correta: false, por_que: 'converteu cm para km dividindo por 1 000 000 e esqueceu a escala', erro_nomeado: 'unidade_nao_convertida' },
    { letra: 'B', correta: false, por_que: 'calculou so a ida', erro_nomeado: 'etapa_faltando' },
    { letra: 'C', correta: true, por_que: '8 x 25 000 = 200 000 cm = 2 km; ida e volta, 4 km', erro_nomeado: null },
    { letra: 'D', correta: false, por_que: 'converteu cm para km dividindo por 10 000', erro_nomeado: 'unidade_nao_convertida' },
    { letra: 'E', correta: false, por_que: 'ida e volta com a conversao errada por 10 000', erro_nomeado: 'unidade_nao_convertida' }],
  resolucao: '8 cm x 25 000 = 200 000 cm = 2 000 m = 2 km. Ida e volta: 2 x 2 = 4 km.',
} };
caso('questao correta passa', () => {
  const r = validarQuestao(boa, slot);
  afirma(r.ok, r.problemas.join('; '));
  afirma(r.questao.metadados.palavras_suporte > 20, 'metadados');
});
const quebrar = (mut) => { const q = clone(boa); mut(q.output); return validarQuestao(q, slot); };
caso('BLOCKER: fonte fabricada em texto elaborado', () => {
  const r = quebrar(q => { q.suporte.texto += ' Disponível em: www.parque.sp.gov.br. Acesso em: 3 mar. 2025.'; });
  afirma(!r.ok && r.problemas.some(p => p.includes('fonte fabricada')), r.problemas.join('; '));
  const r2 = quebrar(q => { q.suporte.fonte = 'Folha de S.Paulo, 2024.'; });
  afirma(!r2.ok, 'fonte com veiculo passou');
});
caso('BLOCKER: texto que depende de figura', () => {
  const r = quebrar(q => { q.suporte.texto = 'Observe a figura abaixo, que mostra o mapa da trilha.'; });
  afirma(!r.ok && r.problemas.some(p => p.includes('figura')), r.problemas.join('; '));
});
caso('gabarito e justificativa correta discordando', () => {
  const r = quebrar(q => { q.gabarito = 'B'; });
  afirma(!r.ok && r.problemas.some(p => p.includes('gabarito e B')), r.problemas.join('; '));
});
caso('distrator numerico sem erro_nomeado', () => {
  const r = quebrar(q => { q.justificativas[3].erro_nomeado = null; });
  afirma(!r.ok && r.problemas.some(p => p.includes('D sem erro_nomeado')), r.problemas.join('; '));
});
caso('4 alternativas e rejeitado', () => {
  const r = quebrar(q => { q.alternativas.pop(); });
  afirma(!r.ok, 'passou com 4');
});
caso('inviavel volta como inviavel', () => {
  const r = validarQuestao({ output: { inviavel: true, motivo: 'precisa de figura' } }, slot);
  afirma(!r.ok && r.inviavel, JSON.stringify(r));
});
caso('saida em texto com cerca ```json tambem e lida', () => {
  const r = validarQuestao({ text: '```json\n' + JSON.stringify(boa.output) + '\n```' }, slot);
  afirma(r.ok, r.problemas.join('; '));
});
caso('alternativas fora de ordem crescente viram aviso, nao bloqueio', () => {
  const r = quebrar(q => { q.alternativas[0].texto = '50'; q.justificativas[0].erro_nomeado = 'formula_trocada'; });
  afirma(r.ok && r.avisos.some(a => a.includes('crescente')), JSON.stringify(r));
});

console.log('\nresposta');
caso('resposta do chat nao vaza gabarito, justificativa nem resolucao', () => {
  const r = validarQuestao(boa, slot);
  const txt = montarResposta({ jobId: 'j1', spec: { assumido: ['modo=rapido'] }, fidelidade: { score: 1, desvios: [] },
    resultados: [{ ...r, slot }, { ok: false, problemas: ['inviavel'], slot: { ...slot, slot_id: 'MT-02' } }] });
  afirma(txt.includes('C) 4') && txt.includes('MT-02'), txt);
  for (const vaza of ['Gabarito: ', 'gabarito": ', 'etapa_faltando', 'calculou so a ida', '2 000 m'])
    afirma(!txt.includes(vaza), `vazou "${vaza}"`);
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nOK — todos os casos passaram.');
process.exit(falhas ? 1 : 0);
