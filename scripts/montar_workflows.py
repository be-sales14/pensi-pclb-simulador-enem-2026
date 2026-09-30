#!/usr/bin/env python3
"""Monta os workflows do n8n (n8n/*.json) a partir do código e dos prompts do repo.

Fonte de verdade:
  n8n/src/*.lib.js  -> nós Code (testados por scripts/testar_*.js)
  prompts/*.md      -> prompts dos agentes
  docs/04, docs/05  -> trechos de regra embutidos no prompt do gerador

Não edite código nem prompt dentro do n8n: edite aqui, rode os testes, rode este script
e reimporte. Uso:  python3 scripts/montar_workflows.py
"""
import json
import re
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
N8N = RAIZ / "n8n"

CRED_PG = {"postgres": {"id": "", "name": "Supabase Postgres"}}
CRED_GEMINI = {"googlePalmApi": {"id": "", "name": "Google Gemini(PaLM) Api account"}}
MODELO_FORTE = "models/gemini-2.5-pro"     # geração, variedade (escolher o mais novo no n8n)
MODELO_RAPIDO = "models/gemini-2.5-flash"  # conversa do intake
RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 2000}


def ler(caminho):
    return (RAIZ / caminho).read_text(encoding="utf-8")


def sem_chaves(texto):
    """Chave { } em prompt vira variável de template no LangChain do n8n e quebra o nó."""
    return texto.replace("{", "(").replace("}", ")")


def secoes(caminho, titulos):
    """Extrai seções '## ...' de um markdown, pelo começo do título."""
    md = ler(caminho)
    partes = re.split(r"(?m)^(?=## )", md)
    return "\n".join(p.strip() + "\n" for p in partes if any(p.startswith("## " + t) for t in titulos))


def js_str(texto):
    return json.dumps(texto, ensure_ascii=False)


class Workflow:
    def __init__(self, nome):
        self.nome, self.nodes, self.connections = nome, [], {}

    def no(self, nome, tipo, versao, pos, params, **extra):
        n = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"simulado-enem/{self.nome}/{nome}")),
             "name": nome, "type": tipo, "typeVersion": versao, "position": pos,
             "parameters": params}
        n.update(extra)
        self.nodes.append(n)
        return nome

    def liga(self, de, para, tipo="main"):
        saidas = self.connections.setdefault(de, {}).setdefault(tipo, [[]])
        saidas[0].append({"node": para, "type": tipo, "index": 0})

    def cadeia(self, *nomes):
        for a, b in zip(nomes, nomes[1:]):
            self.liga(a, b)

    def salvar(self):
        wf = {"name": self.nome, "nodes": self.nodes, "connections": self.connections,
              "settings": {"executionOrder": "v1"}, "pinData": {}}
        (N8N / f"{self.nome}.json").write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n")
        print(f"n8n/{self.nome}.json — {len(self.nodes)} nós")


def code(wf, nome, pos, lib, corpo, por_item=False):
    fonte = (ler(f"n8n/src/{lib}") + "\n// ---------------------------------------------- n8n\n" if lib else "") + corpo
    params = {"jsCode": fonte}
    if por_item:
        params["mode"] = "runOnceForEachItem"
    return wf.no(nome, "n8n-nodes-base.code", 2, pos, params)


def postgres(wf, nome, pos, sql, parametro, uma_vez=False):
    extra = {"credentials": CRED_PG}
    if uma_vez:
        extra["executeOnce"] = True
    return wf.no(nome, "n8n-nodes-base.postgres", 2.5, pos,
                 {"operation": "executeQuery", "query": sql,
                  "options": {"queryReplacement": parametro} if parametro else {}}, **extra)


def llm(wf, nome, pos, modelo, temperatura, schema, nome_modelo, nome_parser):
    wf.no(nome, "@n8n/n8n-nodes-langchain.chainLlm", 1.4, pos,
          {"promptType": "define", "text": "={{ $json.prompt }}", "hasOutputParser": True},
          onError="continueRegularOutput", **RETRY)
    wf.no(nome_modelo, "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", 1, [pos[0] - 80, pos[1] + 220],
          {"modelName": modelo, "options": {"temperature": temperatura}}, credentials=CRED_GEMINI)
    wf.no(nome_parser, "@n8n/n8n-nodes-langchain.outputParserStructured", 1.2, [pos[0] + 120, pos[1] + 220],
          {"schemaType": "manual", "inputSchema": json.dumps(schema, ensure_ascii=False, indent=2)})
    wf.liga(nome_modelo, nome, "ai_languageModel")
    wf.liga(nome_parser, nome, "ai_outputParser")
    return nome


# ------------------------------------------------------------------ schemas de saída

S = lambda **kw: {"type": "string", **kw}
SCHEMA_VARIEDADE = {
    "type": "object", "required": ["slots"],
    "properties": {"slots": {"type": "array", "items": {
        "type": "object", "required": ["slot_id", "recorte", "genero_suporte", "contexto"],
        "properties": {"slot_id": S(), "recorte": S(), "genero_suporte": S(), "contexto": S()}}}},
}
SCHEMA_QUESTAO = {
    "type": "object", "required": ["inviavel"],
    "properties": {
        "inviavel": {"type": "boolean", "description": "true só se a questão exigir imagem"},
        "motivo": S(description="por que é inviável sem imagem; vazio se viável"),
        "suporte": {"type": "object", "required": ["texto", "fonte", "fonte_tipo"], "properties": {
            "texto": S(), "tabela_md": S(description="tabela em Markdown, ou vazio"),
            "fonte": S(), "fonte_tipo": S(enum=["elaborado", "real_verificada", "dominio_publico"])}},
        "enunciado": S(),
        "alternativas": {"type": "array", "items": {"type": "object", "required": ["letra", "texto"],
                         "properties": {"letra": S(enum=list("ABCDE")), "texto": S()}}},
        "gabarito": S(enum=list("ABCDE")),
        "justificativas": {"type": "array", "items": {
            "type": "object", "required": ["letra", "correta", "por_que", "erro_nomeado"],
            "properties": {"letra": S(enum=list("ABCDE")), "correta": {"type": "boolean"},
                           "por_que": S(), "erro_nomeado": S(description="erro que gera o distrator; vazio na correta")}}},
        "resolucao": S(),
    },
}

# ------------------------------------------------------------------ prompts montados

PROMPT_GERADOR_MT = sem_chaves("\n\n".join([
    ler("prompts/02_gerador_mt.md"),
    "# Regras anti-IA (docs/04_ANTI_IA.md, trechos)\n\n"
    + secoes("docs/04_ANTI_IA.md", ["1.", "2.", "3.", "6.", "8."]),
    "# Rubrica de dificuldade (docs/05_RUBRICA_DIFICULDADE.md, trechos)\n\n"
    + secoes("docs/05_RUBRICA_DIFICULDADE.md", ["Os cinco eixos", "Mapa soma"]),
    "# Formato\n\nDevolva só o objeto pedido pelo formato abaixo. `gabarito` é a letra da "
    "correta; `justificativas` tem uma entrada por letra, com `correta` verdadeiro só na do "
    "gabarito e `erro_nomeado` vazio nela. `tabela_md` vazio se não houver tabela. Se a questão "
    "for viável, `inviavel` é falso e `motivo` fica vazio.",
]))
PROMPT_VARIEDADE = sem_chaves(ler("prompts/01_distribuidor_variedade.md"))
PROMPT_INTAKE = sem_chaves(ler("prompts/00_intake.md") + "\n\n" + ler("prompts/00_intake_chat.md"))
for nome, p in [("gerador", PROMPT_GERADOR_MT), ("variedade", PROMPT_VARIEDADE), ("intake", PROMPT_INTAKE)]:
    assert "{" not in p and "}" not in p, nome

SEM_CHAVES_JS = ".replace(/[{}]/g, c => (c === '{' ? '(' : ')'))"

# ------------------------------------------------------------------ 99-erro

def wf_99():
    wf = Workflow("99-erro")
    t = wf.no("Quando um workflow falhar", "n8n-nodes-base.errorTrigger", 1, [0, 0], {})
    c = code(wf, "Normalizar erro", [240, 0], None, r"""// O Error Trigger manda dois formatos:
//  - erro num no qualquer: { execution: { id, url, error, lastNodeExecuted, mode }, workflow }
//  - erro no proprio gatilho: { trigger: { error, mode }, workflow }
const d = $input.first().json;
const ex = d.execution ?? {};
const erro = ex.error ?? d.trigger?.error ?? {};
const corta = (s, n) => (s == null ? null : String(s).slice(0, n));

let mensagem = erro.message ?? 'erro sem mensagem';
if (erro.description) mensagem += ' | ' + erro.description;

return [{
  json: {
    execucao_id:   ex.id != null ? String(ex.id) : null,
    execucao_url:  ex.url ?? null,
    workflow_id:   d.workflow?.id ?? null,
    workflow_nome: d.workflow?.name ?? null,
    no_com_erro:   ex.lastNodeExecuted ?? erro.node?.name ?? null,
    mensagem:      corta(mensagem, 2000),
    stack:         corta(erro.stack, 4000),
    modo:          ex.mode ?? d.trigger?.mode ?? null,
  },
}];""")
    p = postgres(wf, "Gravar erro e marcar job", [480, 0], """-- Marca o job como erro (se houver job desta execucao) e grava o log. Tudo numa query.
with e as (select $1::jsonb as j),
job as (
  update public.jobs
     set status = 'erro',
         erro = (select jsonb_build_object('workflow', j->>'workflow_nome', 'no', j->>'no_com_erro',
                                           'mensagem', j->>'mensagem', 'execucao_url', j->>'execucao_url',
                                           'em', now()) from e),
         atualizado_em = now()
   where execucao_id = (select j->>'execucao_id' from e)
     and status not in ('pronto', 'erro')
  returning id
)
insert into public.erros_execucao
  (execucao_id, execucao_url, workflow_id, workflow_nome, no_com_erro, mensagem, stack, modo, job_id)
select j->>'execucao_id', j->>'execucao_url', j->>'workflow_id', j->>'workflow_nome',
       j->>'no_com_erro', j->>'mensagem', j->>'stack', j->>'modo', (select id from job limit 1)
from e
returning id, job_id;""", "={{ JSON.stringify($json) }}")
    wf.cadeia(t, c, p)
    wf.salvar()


def wf_98():
    wf = Workflow("98-teste-erro")
    t = wf.no("Webhook de teste", "n8n-nodes-base.webhook", 2, [0, 0],
              {"httpMethod": "GET", "path": "simulado-teste-erro", "responseMode": "onReceived", "options": {}},
              webhookId="a9bdafe0-8164-440d-9537-739e914b9b4c")
    p = postgres(wf, "Criar job de teste", [240, 0], """-- Cria um job de teste amarrado a esta execucao, como o orquestrador fara.
insert into public.jobs (origem, status, execucao_id, spec)
values ('webhook', 'gerando', $1, '{"teste": "98-teste-erro"}'::jsonb)
returning id;""", "={{ $execution.id }}")
    s = wf.no("Falhar de proposito", "n8n-nodes-base.stopAndError", 1, [480, 0],
              {"errorMessage": "=Erro proposital de teste. job_id {{ $json.id }}"})
    wf.cadeia(t, p, s)
    wf.salvar()

# ------------------------------------------------------------------ 10-gerador-mt

def wf_10():
    wf = Workflow("10-gerador-mt")
    t = wf.no("Receber slot", "n8n-nodes-base.executeWorkflowTrigger", 1, [0, 0], {})
    c = code(wf, "Montar prompt", [220, 0], None, f"""// Prompt = prompts/02_gerador_mt.md + trechos de docs/04 e docs/05, montado por
// scripts/montar_workflows.py. Os dados do slot vao em texto, sem chaves.
const PROMPT = {js_str(PROMPT_GERADOR_MT)};
const s = $json;
const dados = [
  `slot_id: ${{s.slot_id}}`,
  `area: ${{s.area}} · disciplina: ${{s.disciplina}}`,
  `assunto: ${{s.assunto}}`,
  `recorte: ${{s.recorte}}`,
  `contexto: ${{s.contexto}}`,
  `genero do texto de apoio: ${{s.genero_suporte}}`,
  `nivel: ${{s.nivel}} (nivel_alvo ${{s.nivel_alvo}} na escala de 1 a 9 da rubrica)`,
  `suporte permitido: ${{(s.suporte_permitido ?? []).join(', ')}}`,
  `contextos ja usados neste simulado (proibidos): ${{(s.contexto_proibido ?? []).join('; ') || 'nenhum'}}`,
].join('\\n');
const prompt = (PROMPT + '\\n\\n# O slot\\n\\n' + dados){SEM_CHAVES_JS};
return {{ json: {{ slot: s, prompt }} }};""", por_item=True)
    g = llm(wf, "Gerar questao (Gemini)", [460, 0], MODELO_FORTE, 0.7, SCHEMA_QUESTAO,
            "Gemini (geracao)", "Formato da questao")
    v = code(wf, "Validar questao", [720, 0], "questao.lib.js", """const slot = $('Montar prompt').item.json.slot;
// Com onError=continue, falha do LLM (depois dos retries) chega aqui como { error }.
if ($json.error) {
  return { json: { slot, ok: false, inviavel: false, avisos: [], questao: null,
                   problemas: [`LLM falhou: ${$json.error.message ?? $json.error}`] } };
}
return { json: { slot, ...validarQuestao($json, slot) } };""", por_item=True)
    wf.cadeia(t, c, g, v)
    wf.salvar()

# ------------------------------------------------------------------ 02-orquestrador

def wf_02():
    wf = Workflow("02-orquestrador")
    t = wf.no("Receber pedido", "n8n-nodes-base.executeWorkflowTrigger", 1, [0, 0], {})
    n = code(wf, "Normalizar spec", [220, 0], "spec.lib.js", """const e = $input.first().json;
const spec = normalizarSpec(e, { origem: e.origem ?? 'chat' });
// execucao_id: e como o 99-erro acha este job se algo quebrar (docs/07 §7).
return [{ json: { origem: spec.origem, spec, execucao_id: String($execution.id) } }];""")
    j = postgres(wf, "Criar job", [440, 0], """insert into public.jobs (origem, status, spec, execucao_id)
select j->>'origem', 'distribuindo', j->'spec', j->>'execucao_id' from (select $1::jsonb as j) x
returning id;""", "={{ JSON.stringify($json) }}")
    p = postgres(wf, "Ler pesos", [660, 0], """-- Pesos vivem no banco, nunca no codigo (CLAUDE.md).
select (select json_agg(d) from public.pesos_disciplina d) as disciplinas,
       (select json_agg(i) from public.pesos_incidencia i) as assuntos;""", None, uma_vez=True)
    r = code(wf, "Rateio", [880, 0], "distribuidor.lib.js", f"""const PROMPT = {js_str(PROMPT_VARIEDADE)};
const spec = $('Normalizar spec').first().json.spec;
const job_id = $('Criar job').first().json.id;
const pesos = $input.first().json;
const r = distribuir({{ ...spec, job_id, semente: job_id }}, pesos.disciplinas, pesos.assuntos);
const linhas = r.blueprint.map(s => [
  `slot_id: ${{s.slot_id}}`, `area: ${{s.area}}`, `disciplina: ${{s.disciplina}}`, `assunto: ${{s.assunto}}`,
  `nivel: ${{s.nivel}}`, `suporte_permitido: ${{s.suporte_permitido.join(', ')}}`].join(' | '));
const prompt = (PROMPT + '\\n\\n# Slots (' + linhas.length + ')\\n\\n' + linhas.join('\\n')){SEM_CHAVES_JS};
return [{{ json: {{ job_id, spec, blueprint: r.blueprint, fidelidade: r.fidelidade, prompt }} }}];""")
    l = llm(wf, "Variedade (Gemini)", [1100, 0], MODELO_FORTE, 0.7, SCHEMA_VARIEDADE,
            "Gemini (variedade)", "Formato da variedade")
    v = code(wf, "Validar variedade", [1340, 0], "variedade.lib.js", """const base = $('Rateio').first().json;
const saida = $input.first().json;
if (saida.error) throw new Error(`LLM de variedade falhou: ${saida.error.message ?? saida.error}`);
const { blueprint, avisos } = juntarVariedade(base.blueprint, saida);
return [{ json: { job_id: base.job_id, spec: base.spec, fidelidade: base.fidelidade, blueprint, avisos } }];""")
    s = postgres(wf, "Criar simulado", [1560, 0], """with e as (select $1::jsonb as j),
s as (
  insert into public.simulados (job_id, tipo, spec, blueprint, fidelidade, status)
  select (j->>'job_id')::uuid, j->'spec'->>'tipo', j->'spec', j->'blueprint', j->'fidelidade', 'gerando' from e
  returning id, job_id
),
u as (
  update public.jobs
     set status = 'gerando', atualizado_em = now(),
         progresso = jsonb_build_object('geradas', 0, 'total', (select jsonb_array_length(j->'blueprint') from e))
   where id = (select job_id from s)
)
select id as simulado_id from s;""", "={{ JSON.stringify($json) }}")
    sep = code(wf, "Separar slots", [1780, 0], None,
               "return $('Validar variedade').first().json.blueprint.map(s => ({ json: s }));")
    g = wf.no("Gerar questao (MT)", "n8n-nodes-base.executeWorkflow", 1.2, [2000, 0],
              {"source": "database", "workflowId": {"__rl": True, "value": "", "mode": "list"},
               "mode": "each", "options": {"waitForSubWorkflow": True}})
    gv = postgres(wf, "Gravar versao", [2220, 0], """-- Fase 1: sem auditoria, toda versao entra como REVISAR (conferencia a mao do Thiago).
with e as (select $1::jsonb as j),
v as (
  insert into public.questao_versoes (job_id, slot_id, versao, payload, veredito)
  select (j->>'job_id')::uuid, j->>'slot_id', 1, j->'payload', 'REVISAR' from e
  on conflict (job_id, slot_id, versao) do update set payload = excluded.payload
  returning id, (xmax = 0) as nova   -- xmax = 0: linha inserida agora, nao atualizada
),
u as (
  -- Reexecucao (upsert) nao conta de novo: so versao nova soma no progresso.
  update public.jobs
     set progresso = jsonb_set(progresso, '{geradas}', to_jsonb(coalesce((progresso->>'geradas')::int, 0) + 1)),
         atualizado_em = now()
   where id = (select (j->>'job_id')::uuid from e) and (select nova from v)
)
select id from v;""", "={{ JSON.stringify({ job_id: $('Criar job').first().json.id, slot_id: $json.slot.slot_id, payload: $json }) }}")
    f = postgres(wf, "Fechar job", [2440, 0], """with e as (select $1::uuid as id),
s as (update public.simulados set status = 'sem_auditoria' where job_id = (select id from e))
update public.jobs set status = 'pronto', atualizado_em = now()
 where id = (select id from e)
returning id;""", "={{ $('Criar job').first().json.id }}", uma_vez=True)
    m = code(wf, "Montar resposta", [2660, 0], "resposta.lib.js", """const base = $('Validar variedade').first().json;
const resultados = $('Gerar questao (MT)').all().map(i => i.json);
const texto = montarResposta({ jobId: base.job_id, spec: base.spec, fidelidade: base.fidelidade, resultados });
// "response" e o campo que a ferramenta do agente 0 devolve ao chat.
return [{ json: { response: texto, job_id: base.job_id,
                  ok: resultados.filter(r => r.ok).length, total: resultados.length } }];""")
    wf.cadeia(t, n, j, p, r, l, v, s, sep, g, gv, f, m)
    wf.salvar()

# ------------------------------------------------------------------ 00-entrada-chat

def wf_00():
    wf = Workflow("00-entrada-chat")
    ct = wf.no("Chat", "@n8n/n8n-nodes-langchain.chatTrigger", 1.1, [0, 0], {"options": {}},
               webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "simulado-enem/00-entrada-chat/webhook")))
    la = postgres(wf, "Listar assuntos", [220, 0], """-- Fase 1: so Matematica. So nomes; os pesos nao vao para o prompt.
select string_agg('- ' || assunto, E'\\n' order by peso desc) as assuntos
from public.pesos_incidencia where area = 'MT';""", None, uma_vez=True)
    ag = wf.no("Agente 0 · Intake", "@n8n/n8n-nodes-langchain.agent", 1.7, [460, 0], {
        "promptType": "define",
        "text": "={{ $('Chat').item.json.chatInput }}",
        "options": {"systemMessage": "=" + PROMPT_INTAKE + "\n\n{{ $json.assuntos }}"},
    })
    wf.no("Gemini (conversa)", "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", 1, [340, 240],
          {"modelName": MODELO_RAPIDO, "options": {"temperature": 0.3}}, credentials=CRED_GEMINI)
    wf.no("Memoria da conversa", "@n8n/n8n-nodes-langchain.memoryBufferWindow", 1.3, [500, 240],
          {"sessionIdType": "customKey", "sessionKey": "={{ $('Chat').item.json.sessionId }}",
           "contextWindowLength": 10})
    wf.no("gerar_simulado", "@n8n/n8n-nodes-langchain.toolWorkflow", 1.3, [660, 240], {
        "name": "gerar_simulado",
        "description": "Gera o simulado quando o pedido estiver fechado. Devolve o texto pronto para "
                       "repassar ao aluno, exatamente como veio.",
        "source": "database",
        "workflowId": {"__rl": True, "value": "", "mode": "list"},
        "specifyInputSchema": True,
        "schemaType": "fromJson",
        "jsonSchemaExample": json.dumps({"tipo": "personalizado", "areas": ["MT"], "n_questoes": 5,
                                         "assuntos": ["Porcentagem"], "nivel": "misto", "modo": "rapido",
                                         "assumido": ["modo=rapido por omissao"]}, ensure_ascii=False, indent=2),
        "responsePropertyName": "response",
    })
    wf.cadeia(ct, la, ag)
    wf.liga("Gemini (conversa)", ag, "ai_languageModel")
    wf.liga("Memoria da conversa", ag, "ai_memory")
    wf.liga("gerar_simulado", ag, "ai_tool")
    wf.salvar()


if __name__ == "__main__":
    for f in (wf_99, wf_98, wf_10, wf_02, wf_00):
        f()
