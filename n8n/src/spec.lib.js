// Normaliza o pedido que chega do agente 0 (ou do webhook) num SimuladoSpec completo.
// Ver docs/02_CONTRATOS.md (SimuladoSpec) e docs/01_ARQUITETURA_AGENTES.md (defaults).
// Fonte do no Code "Normalizar spec" do 02-orquestrador.

// Fase 1: so existe o gerador de Matematica, e o chat espera a geracao terminar.
// Tirar estas travas quando os outros geradores e o modo assincrono existirem.
const FASE_1 = { areas: ['MT'], max_questoes: 10 };

const NOMES_AREA = {
  lc: 'LC', linguagens: 'LC', ch: 'CH', humanas: 'CH', 'ciencias humanas': 'CH',
  cn: 'CN', natureza: 'CN', 'ciencias da natureza': 'CN', mt: 'MT', matematica: 'MT',
};

const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// O LLM as vezes manda lista como texto: "MT, CH" ou '["MT"]'.
function lista(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(v).trim();
  if (s.startsWith('[')) { try { return lista(JSON.parse(s)); } catch { /* segue */ } }
  return s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
}

function normalizarSpec(entrada, ctx = {}) {
  const e = entrada ?? {};
  const assumido = lista(e.assumido);
  const spec = { origem: ctx.origem ?? e.origem ?? 'chat', aluno_id: e.aluno_id ?? null };

  const tipo = semAcento(e.tipo ?? '');
  if (!['oficial', 'personalizado'].includes(tipo))
    throw new Error(`tipo invalido: "${e.tipo}". Use "oficial" ou "personalizado".`);
  spec.tipo = tipo;

  const areas = [...new Set(lista(e.areas).map(a => NOMES_AREA[semAcento(a)] ?? a.toUpperCase()))];
  const invalidas = areas.filter(a => !['LC', 'CH', 'CN', 'MT'].includes(a));
  if (invalidas.length) throw new Error(`area invalida: ${invalidas.join(', ')}`);

  // Oficial trava area, contagem e distribuicao. Oficial de uma area so e personalizado.
  if (spec.tipo === 'oficial' && areas.length > 0 && areas.length < 4) {
    spec.tipo = 'personalizado';
    assumido.push('reclassificado de oficial para personalizado: oficial e a prova inteira');
  }
  if (spec.tipo === 'oficial') {
    spec.areas = ['LC', 'CH', 'CN', 'MT'];
    spec.n_questoes = 180;
  } else {
    if (areas.length === 0) throw new Error('personalizado sem area');
    spec.areas = areas;
    const n = Number(e.n_questoes);
    if (!Number.isInteger(n) || n < 1 || n > 180)
      throw new Error(`n_questoes invalido: "${e.n_questoes}" (1 a 180)`);
    spec.n_questoes = n;
  }
  spec.disciplinas = spec.tipo === 'oficial' ? [] : lista(e.disciplinas);
  spec.assuntos = spec.tipo === 'oficial' ? [] : lista(e.assuntos);

  const padrao = (campo, valido, valor, texto) => {
    const v = e[campo] == null || e[campo] === '' ? null : semAcento(e[campo]);
    if (v != null && !valido.includes(v)) throw new Error(`${campo} invalido: "${e[campo]}"`);
    if (v == null) {
      if (!assumido.some(a => a.startsWith(`${campo}=`))) assumido.push(`${campo}=${valor} ${texto}`);
      return valor;
    }
    return v;
  };
  spec.modo = padrao('modo', ['rapido', 'rigoroso'], 'rapido', 'por omissao');
  spec.nivel = padrao('nivel', ['facil', 'medio', 'dificil', 'misto'], 'misto', 'por omissao');
  spec.enfase = padrao('enfase', ['acumulada', 'recente'], 'acumulada', 'por omissao');
  spec.idioma_estrangeiro = spec.areas.includes('LC')
    ? padrao('idioma_estrangeiro', ['ingles', 'espanhol'], 'ingles', 'por omissao') : null;
  spec.ordem_dificuldade = spec.tipo === 'oficial' ? 'oficial' : 'crescente';
  spec.curva_dificuldade = e.curva_dificuldade ?? { facil: 0.30, medio: 0.45, dificil: 0.25 };
  spec.assumido = assumido;
  spec.criado_em = ctx.agora ?? new Date().toISOString();

  if (ctx.fase1 !== false) {
    const fora = spec.areas.filter(a => !FASE_1.areas.includes(a));
    if (fora.length)
      throw new Error(`Na Fase 1 so existe o gerador de Matematica (MT). Pedido incluiu: ${fora.join(', ')}.`);
    if (spec.n_questoes > FASE_1.max_questoes)
      throw new Error(`Na Fase 1 o limite e ${FASE_1.max_questoes} questoes por pedido (o chat espera a geracao terminar). Pedido: ${spec.n_questoes}.`);
  }
  return spec;
}
