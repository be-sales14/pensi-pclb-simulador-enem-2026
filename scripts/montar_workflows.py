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
    libs = [lib] if isinstance(lib, str) else (lib or [])
    fonte = "".join(ler(f"n8n/src/{l}") + "\n" for l in libs)
    fonte = (fonte + "// ---------------------------------------------- n8n\n" if libs else "") + corpo
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



# ------------------------------------------------------------------ simulado com questoes reais (40-43)
# Webhooks chamados pelo front (Route Handler na Vercel), protegidos por header de token.
# Zero LLM: Code + Postgres. O gabarito so sai no 42, depois da entrega.

CRED_TOKEN = {"httpHeaderAuth": {"id": "", "name": "Simulado ENEM · token do front"}}


def webhook(wf, nome, caminho):
    return wf.no(nome, "n8n-nodes-base.webhook", 2, [0, 0],
                 {"httpMethod": "POST", "path": caminho, "authentication": "headerAuth",
                  "responseMode": "lastNode", "options": {}},
                 webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, f"simulado-enem/{wf.nome}/webhook")),
                 credentials=CRED_TOKEN)


def wf_40():
    wf = Workflow("40-aluno")
    w = webhook(wf, "Pedido", "simulado-enem/aluno")
    v = code(wf, "Validar", [220, 0], None, r"""// Cadastro minimo: email (a chave do historico) e nome (so para exibir).
const b = $input.first().json.body ?? {};
const email = String(b.email ?? '').trim().toLowerCase();
const nome = String(b.nome ?? '').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email invalido.');
if (nome.length < 1 || nome.length > 120) throw new Error('Informe seu nome.');
return [{ json: { email, nome } }];""")
    s = postgres(wf, "Registrar e ler historico", [440, 0], """-- Mesmo email = mesmo aluno: atualiza o nome e devolve o historico de entregas.
with e as (select $1::jsonb as j),
a as (
  insert into public.alunos (email, nome) select j->>'email', j->>'nome' from e
  on conflict (email) do update set nome = excluded.nome, ultimo_acesso = now()
  returning id, email::text as email, nome
)
select a.id as aluno_id, a.email, a.nome,
  coalesce((select json_agg(json_build_object(
      'entrega_id', en.id, 'simulado_id', en.simulado_id, 'tipo', s.tipo, 'origem', en.origem,
      'acertos', en.acertos, 'total', en.total, 'por_area', en.por_area, 'entregue_em', en.entregue_em)
      order by en.entregue_em desc)
    from public.entregas en join public.simulados_enem s on s.id = en.simulado_id
    where en.aluno_id = a.id), '[]'::json) as historico
from a;""", "={{ JSON.stringify($json) }}")
    wf.cadeia(w, v, s)
    wf.salvar()


def wf_41():
    wf = Workflow("41-simulado-montar")
    w = webhook(wf, "Pedido", "simulado-enem/montar")
    l = postgres(wf, "Ler banco, pesos e historico", [220, 0], """-- Pesos e banco vivem no Supabase (CLAUDE.md). "vistos": o que este aluno ja recebeu.
with e as (select $1::jsonb as j)
select (select json_agg(d) from public.pesos_disciplina d) as disciplinas,
       (select json_agg(i) from public.pesos_incidencia i) as assuntos,
       (select json_agg(json_build_object('id', q.id, 'ano', q.ano, 'area', q.area, 'lingua', q.lingua,
               'anulada', q.anulada, 'disciplina', q.disciplina,
               'disciplina_secundaria', q.disciplina_secundaria, 'assunto_id', q.assunto_id))
          from public.questoes_enem q where not q.anulada) as banco,
       coalesce((select json_agg(distinct it.questao_id)
          from public.simulado_enem_itens it join public.simulados_enem s on s.id = it.simulado_id
          where s.aluno_id::text = (select j->>'aluno_id' from e)), '[]'::json) as vistos;""",
                 "={{ JSON.stringify($json.body ?? {}) }}", uma_vez=True)
    m = code(wf, "Montar simulado", [440, 0], ["distribuidor.lib.js", "sorteio.lib.js"], """const corpo = $('Pedido').first().json.body ?? {};
const d = $input.first().json;
const r = montarSimulado(corpo, d.disciplinas, d.assuntos, d.banco, d.vistos);
return [{ json: {
  aluno_id: corpo.aluno_id || null, tipo: r.pedido.tipo, spec: r.pedido, semente: r.semente,
  n_questoes: r.itens.length, distribuicao: r.plano, avisos: r.avisos,
  itens: r.itens.map(i => ({ numero: i.numero, questao_id: i.questao_id })),
} }];""")
    g = postgres(wf, "Gravar e devolver questoes", [660, 0], """-- Devolve so o que o aluno ve: imagem, area e disciplina. Sem gabarito, ano ou numero original.
with e as (select $1::jsonb as j),
s as (
  insert into public.simulados_enem (aluno_id, tipo, spec, semente, n_questoes, distribuicao)
  select nullif(j->>'aluno_id', '')::uuid, j->>'tipo', j->'spec', j->>'semente',
         (j->>'n_questoes')::smallint, j->'distribuicao' from e
  returning id
),
i as (
  insert into public.simulado_enem_itens (simulado_id, numero, questao_id)
  select s.id, x.numero, x.questao_id
  from s, e, jsonb_to_recordset(e.j->'itens') as x(numero smallint, questao_id text)
  returning numero, questao_id
)
select (select id from s) as simulado_id,
       (select j->'spec' from e) as pedido,
       (select j->'avisos' from e) as avisos,
       (select json_agg(json_build_object('numero', i.numero, 'area', q.area, 'disciplina', q.disciplina,
               'imagem_url', q.imagem_url, 'largura', q.imagem_largura, 'altura', q.imagem_altura)
               order by i.numero)
          from i join public.questoes_enem q on q.id = i.questao_id) as questoes;""",
                 "={{ JSON.stringify($json) }}")
    wf.cadeia(w, l, m, g)
    wf.salvar()


def wf_42():
    wf = Workflow("42-simulado-entregar")
    w = webhook(wf, "Pedido", "simulado-enem/entregar")
    l = postgres(wf, "Ler gabarito", [220, 0], """-- O gabarito so e lido aqui, no back, para corrigir.
with e as (select $1::jsonb as j)
select (select count(*) from public.alunos a where a.id::text = (select j->>'aluno_id' from e)) as aluno_existe,
       (select json_agg(json_build_object('numero', it.numero, 'area', q.area, 'disciplina', q.disciplina,
               'gabarito', q.gabarito) order by it.numero)
          from public.simulado_enem_itens it join public.questoes_enem q on q.id = it.questao_id
          where it.simulado_id::text = (select j->>'simulado_id' from e)) as itens;""",
                 "={{ JSON.stringify($json.body ?? {}) }}", uma_vez=True)
    c = code(wf, "Corrigir", [440, 0], "correcao.lib.js", """const b = $('Pedido').first().json.body ?? {};
const d = $input.first().json;
if (!Number(d.aluno_existe)) throw new Error('Aluno nao cadastrado: registre email e nome antes de entregar.');
if (!d.itens) throw new Error('Simulado nao encontrado.');
const r = corrigir(d.itens, b.respostas);
return [{ json: { simulado_id: b.simulado_id, aluno_id: b.aluno_id,
                  origem: b.origem === 'pdf' ? 'pdf' : 'pagina', iniciado_em: b.iniciado_em || null, ...r } }];""")
    g = postgres(wf, "Gravar entrega", [660, 0], """-- Uma entrega por aluno por simulado: a segunda nao sobrescreve a primeira.
with e as (select $1::jsonb as j),
ins as (
  insert into public.entregas (simulado_id, aluno_id, origem, respostas, acertos, total, por_area,
                               por_disciplina, iniciado_em)
  select (j->>'simulado_id')::uuid, (j->>'aluno_id')::uuid, j->>'origem', j->'respostas',
         (j->>'acertos')::smallint, (j->>'total')::smallint, j->'por_area', j->'por_disciplina',
         nullif(j->>'iniciado_em', '')::timestamptz
  from e
  on conflict (simulado_id, aluno_id) do nothing
  returning id
)
select (select id from ins) as entrega_id;""", "={{ JSON.stringify($json) }}")
    r = code(wf, "Resultado", [880, 0], None, """const c = $('Corrigir').first().json;
if (!$input.first().json.entrega_id) throw new Error('Este simulado ja foi entregue por este aluno.');
// Agora sim o gabarito pode ir ao browser: a entrega ja esta gravada.
return [{ json: { entrega_id: $input.first().json.entrega_id, acertos: c.acertos, total: c.total,
                  por_area: c.por_area, por_disciplina: c.por_disciplina, questoes: c.detalhe } }];""")
    wf.cadeia(w, l, c, g, r)
    wf.salvar()


def wf_43():
    wf = Workflow("43-simulado-ver")
    w = webhook(wf, "Pedido", "simulado-enem/ver")
    s = postgres(wf, "Ler simulado", [220, 0], """-- Reabre um simulado pelo codigo (quem fez no PDF digita as respostas depois). Sem gabarito.
with e as (select $1::jsonb as j)
select s.id as simulado_id, s.spec as pedido,
       (select json_agg(json_build_object('numero', it.numero, 'area', q.area, 'disciplina', q.disciplina,
               'imagem_url', q.imagem_url, 'largura', q.imagem_largura, 'altura', q.imagem_altura)
               order by it.numero)
          from public.simulado_enem_itens it join public.questoes_enem q on q.id = it.questao_id
          where it.simulado_id = s.id) as questoes
from public.simulados_enem s
where s.id::text = (select j->>'simulado_id' from e);""", "={{ JSON.stringify($json.body ?? {}) }}", uma_vez=True)
    v = code(wf, "Conferir", [440, 0], None, """const r = $input.first().json;
if (!r.simulado_id) throw new Error('Simulado nao encontrado. Confira o codigo impresso no PDF.');
return [{ json: r }];""")
    wf.cadeia(w, s, v)
    wf.salvar()


# ------------------------------------------------------------------ MVP: prova e gabarito sem front (44-45)
# O proprio n8n serve as paginas. Formulario do n8n ou link direto -> prova em HTML (layout B,
# botao "Salvar PDF"). Gabarito em outro link (regra 4). Sem token: e so leitura do banco.

N8N_WEBHOOK = "https://api.data.descomplica.io/webhook"   # trocar na instancia de producao

SQL_LER_BANCO = """-- Pesos e banco vivem no Supabase (CLAUDE.md).
select (select json_agg(d) from public.pesos_disciplina d) as disciplinas,
       (select json_agg(i) from public.pesos_incidencia i) as assuntos,
       (select json_agg(json_build_object('id', q.id, 'ano', q.ano, 'area', q.area, 'lingua', q.lingua,
               'anulada', q.anulada, 'disciplina', q.disciplina,
               'disciplina_secundaria', q.disciplina_secundaria, 'assunto_id', q.assunto_id))
          from public.questoes_enem q where not q.anulada) as banco;"""


def responder_html(wf, nome, pos):
    return wf.no(nome, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "text", "responseBody": "={{ $json.html }}",
        "options": {"responseHeaders": {"entries": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}]}},
    })


def wf_44():
    wf = Workflow("44-simulado-prova")
    opcoes = lambda *xs: {"values": [{"option": x} for x in xs]}
    f = wf.no("Formulario", "n8n-nodes-base.formTrigger", 2.2, [0, -120], {
        "formTitle": "Simulado ENEM",
        "formDescription": "Questões reais do ENEM (2019 a 2025), na proporção da prova oficial. "
                           "O simulado abre pronto para fazer ou salvar em PDF.",
        "formFields": {"values": [
            {"fieldLabel": "Tipo de simulado", "fieldType": "dropdown", "requiredField": True,
             "fieldOptions": opcoes("Oficial completo (180 questões)", "Oficial 1º dia: Linguagens e Humanas (90)",
                                    "Oficial 2º dia: Natureza e Matemática (90)", "Personalizado")},
            {"fieldLabel": "Áreas (só no personalizado)", "fieldType": "dropdown", "multiselect": True,
             "fieldOptions": opcoes("Linguagens", "Ciências Humanas", "Ciências da Natureza", "Matemática")},
            {"fieldLabel": "Número de questões (só no personalizado)", "fieldType": "number"},
            {"fieldLabel": "Língua estrangeira", "fieldType": "dropdown", "requiredField": True,
             "fieldOptions": opcoes("Inglês", "Espanhol")},
        ]},
        "responseMode": "responseNode", "options": {},
    }, webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "simulado-enem/44/form")))
    w = wf.no("Link direto", "n8n-nodes-base.webhook", 2, [0, 120],
              {"httpMethod": "GET", "path": "simulado-enem/prova", "responseMode": "responseNode", "options": {}},
              webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "simulado-enem/44/webhook")))
    lp = code(wf, "Ler pedido", [240, 0], None, r"""// Aceita o formulario do n8n ou o link direto (?tipo=oficial&dia=2, ?tipo=personalizado&areas=MT,CH&n=20).
const j = $input.first().json;
const AREA = { 'Linguagens': 'LC', 'Ciências Humanas': 'CH', 'Ciências da Natureza': 'CN', 'Matemática': 'MT' };
let pedido;
if (j.query) {
  const q = j.query;
  pedido = { tipo: q.tipo, dia: q.dia, areas: q.areas, n_questoes: q.n, lingua: q.lingua, semente: q.semente };
} else {
  const tipo = String(j['Tipo de simulado'] ?? '');
  const lingua = String(j['Língua estrangeira'] ?? 'Inglês') === 'Espanhol' ? 'espanhol' : 'ingles';
  if (tipo.startsWith('Oficial')) {
    pedido = { tipo: 'oficial', dia: tipo.includes('1º') ? 1 : tipo.includes('2º') ? 2 : null, lingua };
  } else {
    const areas = [].concat(j['Áreas (só no personalizado)'] ?? []).map(a => AREA[a]).filter(Boolean);
    if (!areas.length) throw new Error('No personalizado, escolha pelo menos uma área.');
    pedido = { tipo: 'personalizado', areas, n_questoes: j['Número de questões (só no personalizado)'], lingua };
  }
}
return [{ json: { pedido } }];""")
    lb = postgres(wf, "Ler banco e pesos", [460, 0], SQL_LER_BANCO, None, uma_vez=True)
    m = code(wf, "Montar simulado", [680, 0], ["distribuidor.lib.js", "sorteio.lib.js"], """const corpo = $('Ler pedido').first().json.pedido;
const d = $input.first().json;
const r = montarSimulado(corpo, d.disciplinas, d.assuntos, d.banco, []);
return [{ json: {
  aluno_id: null, tipo: r.pedido.tipo, spec: r.pedido, semente: r.semente,
  n_questoes: r.itens.length, distribuicao: r.plano, avisos: r.avisos,
  itens: r.itens.map(i => ({ numero: i.numero, questao_id: i.questao_id })),
} }];""")
    g = postgres(wf, "Gravar simulado", [900, 0], """-- Guarda o simulado (para o gabarito e para corrigir depois). Devolve so o que a prova mostra.
with e as (select $1::jsonb as j),
s as (
  insert into public.simulados_enem (aluno_id, tipo, spec, semente, n_questoes, distribuicao)
  select null, j->>'tipo', j->'spec', j->>'semente', (j->>'n_questoes')::smallint, j->'distribuicao' from e
  returning id
),
i as (
  insert into public.simulado_enem_itens (simulado_id, numero, questao_id)
  select s.id, x.numero, x.questao_id
  from s, e, jsonb_to_recordset(e.j->'itens') as x(numero smallint, questao_id text)
  returning numero, questao_id
)
select (select id from s) as simulado_id,
       (select j->'spec' from e) as pedido,
       (select json_agg(json_build_object('numero', i.numero, 'area', q.area, 'disciplina', q.disciplina,
               'imagem_url', q.imagem_url, 'largura', q.imagem_largura, 'altura', q.imagem_altura)
               order by i.numero)
          from i join public.questoes_enem q on q.id = i.questao_id) as questoes;""",
                 "={{ JSON.stringify($json) }}")
    pg = code(wf, "Montar pagina", [1120, 0], "pagina.lib.js", f"""const BASE = {js_str(N8N_WEBHOOK)};
const s = $input.first().json;
const html = paginaProva(s, `${{BASE}}/simulado-enem/gabarito?id=${{s.simulado_id}}`);
return [{{ json: {{ html }} }}];""")
    rs = responder_html(wf, "Mostrar prova", [1340, 0])
    wf.liga(f, lp)
    wf.liga(w, lp)
    wf.cadeia(lp, lb, m, g, pg, rs)
    wf.salvar()


def wf_45():
    wf = Workflow("45-simulado-gabarito")
    w = wf.no("Link do gabarito", "n8n-nodes-base.webhook", 2, [0, 0],
              {"httpMethod": "GET", "path": "simulado-enem/gabarito", "responseMode": "responseNode", "options": {}},
              webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "simulado-enem/45/webhook")))
    l = postgres(wf, "Ler gabarito", [220, 0], """-- Gabarito oficial do INEP, com a origem de cada questao (ano e numero no caderno).
with e as (select $1::text as id)
select s.id as simulado_id, s.spec as pedido,
       (select json_agg(json_build_object('numero', it.numero, 'gabarito', q.gabarito, 'area', q.area,
               'disciplina', q.disciplina, 'ano', q.ano, 'numero_original', q.numero) order by it.numero)
          from public.simulado_enem_itens it join public.questoes_enem q on q.id = it.questao_id
          where it.simulado_id = s.id) as itens
from public.simulados_enem s
where s.id::text = (select id from e);""", "={{ $json.query.id ?? '' }}", uma_vez=True)
    c = code(wf, "Montar pagina", [440, 0], "pagina.lib.js", """const g = $input.first().json;
if (!g.simulado_id) throw new Error('Simulado nao encontrado: confira o link do gabarito.');
return [{ json: { html: paginaGabarito(g) } }];""")
    r = responder_html(wf, "Mostrar gabarito", [660, 0])
    wf.cadeia(w, l, c, r)
    wf.salvar()


if __name__ == "__main__":
    for f in (wf_99, wf_98, wf_10, wf_02, wf_00, wf_40, wf_41, wf_42, wf_43, wf_44, wf_45):
        f()
