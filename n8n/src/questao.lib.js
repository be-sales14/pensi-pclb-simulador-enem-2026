// Confere a Questao que o gerador devolveu contra o contrato (docs/02_CONTRATOS.md) e
// contra as regras nao negociaveis 1 e 2 do CLAUDE.md (sem imagem, sem fonte fabricada).
// NAO e a auditoria da Fase 2: sem nivel, sem distratores, sem solver. So o que quebra o
// contrato ou uma linha vermelha.
// Fonte do no Code "Validar questao" dos geradores.

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const FONTE_ELABORADO = 'Texto elaborado para este simulado.';
// docs/04_ANTI_IA.md §6, igual a regra 6.1 de data/lint_antiia.json
const FONTE_FABRICADA = /(Dispon[íi]vel em:|Acesso em:|https?:\/\/|\b(Folha|Estad[ãa]o|G1|BBC|El Pa[íi]s|Veja|Nature|Science|IBGE|IPCC|Reuters|UOL)\b)/i;
// PLANO.md §2.1: texto que depende de figura nao existe neste projeto.
const REFERE_IMAGEM = /\b(figura|imagem|ilustra[çc][ãa]o|gr[áa]fico|desenho|foto(grafia)?|mapa)\s+(abaixo|acima|a seguir|ao lado|seguinte|apresentad[oa])\b|\bobserve (a|o) (figura|imagem|gr[áa]fico|desenho)\b/i;

const palavras = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const temNumero = s => /\d/.test(String(s ?? ''));
const numero = s => {
  const m = String(s ?? '').replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

function lerSaidaLlm(json) {
  let v = json?.output ?? json?.text ?? json;
  if (typeof v === 'string') v = JSON.parse(v.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, ''));
  return v;
}

function validarQuestao(bruto, slot) {
  const problemas = [], avisos = [];
  let q;
  try { q = lerSaidaLlm(bruto); } catch (e) {
    return { ok: false, inviavel: false, problemas: [`saida nao e JSON: ${e.message}`], avisos, questao: null };
  }
  if (!q || typeof q !== 'object') return { ok: false, inviavel: false, problemas: ['saida vazia'], avisos, questao: null };

  if (q.inviavel === true)
    return { ok: false, inviavel: true, problemas: [`inviavel sem imagem: ${q.motivo ?? 'sem motivo'}`], avisos, questao: null };

  // Alternativas: 5, A-E, sem repetir letra nem texto.
  const alts = Array.isArray(q.alternativas) ? q.alternativas : [];
  const letras = alts.map(a => String(a?.letra ?? '').trim().toUpperCase());
  if (alts.length !== 5 || LETRAS.some(l => !letras.includes(l)))
    problemas.push(`alternativas precisam ser 5, de A a E; vieram ${JSON.stringify(letras)}`);
  const textos = alts.map(a => String(a?.texto ?? '').trim().toLowerCase().replace(/\s+/g, ' '));
  if (textos.some(t => !t)) problemas.push('alternativa com texto vazio');
  if (new Set(textos).size !== textos.length) problemas.push('alternativas com texto repetido');

  const gabarito = String(q.gabarito ?? '').trim().toUpperCase();
  if (!LETRAS.includes(gabarito)) problemas.push(`gabarito invalido: "${q.gabarito}"`);

  // Justificativas: 5, uma por letra, uma so correta, e e a do gabarito.
  const justs = Array.isArray(q.justificativas) ? q.justificativas : [];
  const jl = justs.map(j => String(j?.letra ?? '').trim().toUpperCase());
  if (justs.length !== 5 || LETRAS.some(l => !jl.includes(l)))
    problemas.push(`justificativas precisam ser 5, uma por letra; vieram ${JSON.stringify(jl)}`);
  const corretas = justs.filter(j => j?.correta === true).map(j => String(j.letra).toUpperCase());
  if (corretas.length !== 1) problemas.push(`justificativas marcam ${corretas.length} corretas, esperado 1`);
  else if (corretas[0] !== gabarito) problemas.push(`justificativa correta e ${corretas[0]}, gabarito e ${gabarito}`);
  if (justs.some(j => !String(j?.por_que ?? '').trim())) problemas.push('justificativa sem "por_que"');

  // MT e CN: distrator numerico sem erro nomeado e BLOCKER (docs/04_ANTI_IA.md §2).
  if (['MT', 'CN'].includes(slot?.area)) {
    const textoDe = Object.fromEntries(alts.map(a => [String(a.letra).toUpperCase(), a.texto]));
    for (const j of justs) {
      const l = String(j?.letra ?? '').toUpperCase();
      if (j?.correta !== true && temNumero(textoDe[l]) && !String(j?.erro_nomeado ?? '').trim())
        problemas.push(`distrator numerico ${l} sem erro_nomeado`);
    }
    const nums = LETRAS.map(l => numero(textoDe[l]));
    if (nums.every(x => !Number.isNaN(x)) && nums.some((x, i) => i > 0 && x < nums[i - 1]))
      avisos.push('alternativas numericas fora da ordem crescente');
  }

  // Suporte, fonte e imagem: regras 1 e 2 do CLAUDE.md.
  const sup = q.suporte ?? {};
  const texto = String(sup.texto ?? '');
  const tabela = sup.tabela_md ? String(sup.tabela_md) : null;
  let fonte = String(sup.fonte ?? '').replace(/^#?FONTE:\s*/i, '').trim();
  const fonteTipo = String(sup.fonte_tipo ?? '').trim();
  if (!['elaborado', 'real_verificada', 'dominio_publico'].includes(fonteTipo))
    problemas.push(`fonte_tipo invalido: "${sup.fonte_tipo}"`);
  if (fonteTipo === 'elaborado') {
    if (fonte !== FONTE_ELABORADO) problemas.push(`fonte de texto elaborado tem que ser exatamente "${FONTE_ELABORADO}"; veio "${fonte}"`);
    if (FONTE_FABRICADA.test(texto) || FONTE_FABRICADA.test(fonte) || (tabela && FONTE_FABRICADA.test(tabela)))
      problemas.push('BLOCKER fonte fabricada: texto elaborado cita veiculo, URL ou "Disponivel em/Acesso em"');
  }
  if (fonteTipo === 'real_verificada')
    problemas.push('fonte real_verificada exige busca real com URL; o gerador nao tem busca nesta fase');
  if (fonteTipo === 'dominio_publico' && !/^Dom[íi]nio p[úu]blico\s+[—-]\s+.+/.test(fonte))
    problemas.push('fonte de dominio publico fora do formato "Dominio publico — obra, autor, ano"');
  if (tabela && !(slot?.suporte_permitido ?? []).includes('tabela'))
    problemas.push('tabela num slot que nao permite tabela');
  const corpo = [texto, q.enunciado, ...alts.map(a => a?.texto)].join('\n');
  if (REFERE_IMAGEM.test(corpo)) problemas.push('BLOCKER texto depende de figura, grafico ou imagem');

  const enunciado = String(q.enunciado ?? '').trim();
  if (!enunciado) problemas.push('enunciado vazio');
  else if (palavras(enunciado) < 5 || palavras(enunciado) > 15)
    avisos.push(`enunciado com ${palavras(enunciado)} palavras (faixa 5 a 15)`);
  if (!String(q.resolucao ?? '').trim()) problemas.push('resolucao vazia');
  if (!texto.trim() && !tabela) problemas.push('sem texto de apoio nem tabela');

  const questao = {
    slot_id: slot?.slot_id ?? q.slot_id ?? null,
    versao: 1,
    suporte: { texto, tabela_md: tabela, fonte, fonte_tipo: fonteTipo },
    enunciado,
    alternativas: alts.map(a => ({ letra: String(a.letra).toUpperCase(), texto: String(a.texto).trim() }))
      .sort((a, b) => a.letra.localeCompare(b.letra)),
    gabarito,
    justificativas: justs.map(j => ({
      letra: String(j.letra).toUpperCase(), correta: j.correta === true,
      por_que: String(j.por_que ?? '').trim(), erro_nomeado: j.erro_nomeado ? String(j.erro_nomeado) : null,
    })).sort((a, b) => a.letra.localeCompare(b.letra)),
    resolucao: String(q.resolucao ?? '').trim(),
    metadados: { palavras_suporte: palavras(texto), tem_tabela: Boolean(tabela) },
  };
  return { ok: problemas.length === 0, inviavel: false, problemas, avisos, questao };
}
