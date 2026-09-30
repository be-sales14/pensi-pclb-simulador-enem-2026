// Agente 1, camada 3: junta a saida do LLM de variedade ao blueprint e confere que ele
// nao mexeu na contagem. Ver prompts/01_distribuidor_variedade.md.
// Fonte do no Code "Validar variedade" do 02-orquestrador.

const GENEROS = ['situacao-problema', 'tabela', 'texto informativo', 'texto de opiniao', 'poema',
  'cronica', 'trecho literario', 'documento de dominio publico', 'conceito filosofico', 'dialogo'];

const chave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim();

// O parser do n8n entrega { output: {...} }; versoes antigas entregam o objeto direto,
// ou texto com cerca ```json.
function lerSaidaLlm(json) {
  let v = json?.output ?? json?.text ?? json;
  if (typeof v === 'string') v = JSON.parse(v.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, ''));
  return v;
}

function juntarVariedade(blueprint, saidaLlm) {
  const saida = lerSaidaLlm(saidaLlm);
  const itens = Array.isArray(saida) ? saida : saida?.slots;
  if (!Array.isArray(itens)) throw new Error('variedade: saida do LLM sem lista "slots"');
  if (itens.length !== blueprint.length)
    throw new Error(`variedade: entraram ${blueprint.length} slots e voltaram ${itens.length}. A contagem e do codigo, nao do LLM.`);

  const porId = Object.fromEntries(itens.map(x => [x.slot_id, x]));
  const faltando = blueprint.filter(s => !porId[s.slot_id]).map(s => s.slot_id);
  if (faltando.length) throw new Error(`variedade: slot_id ausente na saida: ${faltando.join(', ')}`);

  const usados = [];
  const avisos = [];
  const resultado = blueprint.map(s => {
    const v = porId[s.slot_id];
    let genero = chave(v.genero_suporte);
    if (!GENEROS.includes(genero)) {
      avisos.push(`${s.slot_id}: genero "${v.genero_suporte}" fora da lista; usei situacao-problema`);
      genero = 'situacao-problema';
    }
    if (genero === 'tabela' && !s.suporte_permitido.includes('tabela')) {
      avisos.push(`${s.slot_id}: tabela nao permitida neste assunto; usei situacao-problema`);
      genero = 'situacao-problema';
    }
    const contexto = String(v.contexto ?? '').trim();
    const recorte = String(v.recorte ?? '').trim();
    if (!contexto || !recorte) throw new Error(`variedade: ${s.slot_id} sem recorte ou contexto`);
    if (usados.some(u => chave(u) === chave(contexto)))
      throw new Error(`variedade: contexto repetido no simulado: "${contexto}" (${s.slot_id})`);

    // contexto_proibido acumula o que os slots anteriores usaram. Contabilidade e codigo.
    const slot = { ...s, recorte, contexto, genero_suporte: genero, contexto_proibido: [...usados] };
    usados.push(contexto);
    return slot;
  });
  return { blueprint: resultado, avisos };
}
