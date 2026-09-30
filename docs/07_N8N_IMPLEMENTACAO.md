# Implementação no n8n

O que é nó, o que é sub-workflow, e as armadilhas que custam tempo.

---

## 1. Workflows

Um workflow por responsabilidade. Nove agentes, mas nem todo agente é um workflow.

| Workflow | Papel | Gatilho |
|---|---|---|
| `00-entrada-chat` | Chat Trigger + memória + agente 0 | Chat Trigger |
| `01-entrada-webhook` | Webhook, valida, cria job, responde **202** | Webhook `POST /simulado` |
| `02-orquestrador` | Distribuição, loop por slot, agregação, montagem | Execute Workflow |
| `10-gerador-mt` … `14-gerador-le` | Os cinco geradores | Execute Workflow |
| `20-auditoria` | Roda os 5 auditores em paralelo e agrega | Execute Workflow |
| `30-status` | `GET /simulado/:job_id/status` | Webhook |
| `31-correcao` | `POST /simulado/:id/respostas` → nota + relatório | Webhook |
| `99-erro` | Log, notificação, marca job como `erro` | Error Trigger |

O `02-orquestrador` é o único que conhece o fluxo inteiro. Os outros não sabem que existe
um simulado — recebem um slot ou uma questão e devolvem um objeto.

---

## 2. As duas portas, um núcleo

```
Chat Trigger ──> 00-entrada-chat ──┐
                                    ├──> 02-orquestrador
Webhook ────────> 01-entrada-webhook┘
                       │
                       └──> responde 202 { job_id } IMEDIATAMENTE
```

No `01-entrada-webhook`, o nó `Respond to Webhook` vem **antes** do
`Execute Sub-workflow`, e o sub-workflow é chamado com **"Wait for completion" desligado**.
Se ficar ligado, o webhook espera 180 questões e morre.

Configuração do nó Webhook: `Response Mode: Using 'Respond to Webhook' node`.

---

## 3. Fan-out por slot

`Loop Over Items` (Split In Batches) sobre o array de `BlueprintSlot`.

- **Batch size 3 a 5.** Não 1 (lento demais) nem 20 (rate limit).
- Dentro do loop: `Switch` por `area` → gerador correspondente → `20-auditoria` →
  `IF` no veredito → revisão ou grava.
- O contador de voltas vive no próprio item (`versao`), não em variável de workflow.
  Workflow static data não é confiável em execução paralela.

**Ordem de grandeza do tempo.** 180 slots, batch de 4, ~25s por slot no modo rápido
(geração + auditoria combinada + solver) → ~19 minutos. No modo rigoroso, some 60%.
Por isso o assíncrono não é otimização, é requisito.

---

## 4. Estruturar a saída dos agentes

Todo `AI Agent` / `Basic LLM Chain` usa **Structured Output Parser** com o schema de
[02_CONTRATOS.md](02_CONTRATOS.md).

- `Retry On Fail` ligado, 2 tentativas, `Wait Between Tries: 2000ms`.
- Um nó `Code` de validação depois do parser, checando as invariantes que o JSON Schema
  não pega: 5 alternativas com letras distintas, `justificativas.length === 5`,
  `gabarito` presente entre as letras, distrator numérico com `erro_nomeado`.
- Falha de validação alimenta o mesmo loop de revisão. Não é caso de erro do workflow.

**Temperatura.** Geração `0.7` (precisa variedade). Auditores `0.2`. Solver cego `0`.

---

## 5. O solver cego, no n8n

O erro fácil aqui é vazar o gabarito por descuido: o item que chega no nó do solver
carrega o objeto `Questao` inteiro.

Blindagem: um nó `Code` **imediatamente antes** do solver que reconstrói o item do zero,
por whitelist:

```js
return items.map(item => ({
  json: {
    slot_id: item.json.slot_id,
    enunciado: item.json.enunciado,
    suporte:   { texto: item.json.suporte.texto,
                 tabela_md: item.json.suporte.tabela_md ?? null },
    alternativas: item.json.alternativas.map(a => ({ letra: a.letra, texto: a.texto })),
  }
}));
```

Whitelist, nunca blacklist. `delete item.json.gabarito` esquece
`justificativas`, `resolucao` e `metadados` — e o solver acerta 100%, o que parece ótimo
e não vale nada.

---

## 6. Credenciais e pesos

- Chaves de LLM e Supabase em **Credentials** do n8n. Nunca em nó `Set`, nunca em prompt.
- Os pesos de incidência vivem no Supabase (`pesos_incidencia`), lidos por nó
  `Supabase` / `Postgres` no início do `02-orquestrador`. **Não hard-codar no `Code`**:
  recalibrar quando sair o ENEM 2026 não pode exigir editar workflow.
- Os rulesets anti-IA são texto longo. Ficam em `prompts/` no repo e são versionados; no
  n8n entram por nó `Set` alimentado de uma tabela `prompts` no Supabase, ou colados no
  system prompt e sincronizados a cada release. A segunda é mais simples para os alunos —
  escolher uma e não misturar.

---

## 7. Idempotência e reexecução

- `job_id` é gerado no `01-entrada-webhook` e é a chave de tudo.
- Cada questão gravada carrega `(job_id, slot_id, versao)` como chave única. Reexecutar o
  orquestrador não duplica: `upsert`.
- O `99-erro` (Error Trigger) marca o job como `erro` e grava o erro em `erros_execucao`,
  para poder retomar de onde parou em vez de gerar 180 de novo.
- **O Error Trigger sabe qual execução quebrou, não qual job.** Por isso o
  `02-orquestrador` grava `jobs.execucao_id = {{ $execution.id }}` como primeiro passo.
  Sem isso, o `99-erro` loga o erro mas não consegue marcar o job.
- Para retomar, os slots que faltam são os do blueprint sem versão `APROVADO` em
  `questao_versoes` — não precisa guardar o `slot_id` no erro.
- Todo workflow do projeto aponta para o `99-erro` em **Settings → Error workflow**.
- **Erro workflow não dispara em execução manual** ("Test workflow"). Para testar, use
  uma execução de produção — é para isso que existe o `98-teste-erro`.

---

## 8. Custo — o que controlar

| Alavanca | Efeito |
|---|---|
| `modo: rapido` como default | corta ~55% das chamadas de auditoria |
| Auditor combinado no modo rápido | nível + anti-IA + distratores em 1 chamada |
| Sonnet na geração, Opus só no solver | o solver é ~1/5 das chamadas |
| Banco de questões reaproveitável | a partir da Fase 4, um simulado pode puxar questão aprovada do banco em vez de gerar |
| Cap de voltas em 2 | impede questão problemática consumir o orçamento |

O reaproveitamento do banco é a maior economia e chega na Fase 4. Antes disso, todo
simulado gera tudo de novo — o que é caro e é o preço de aprender.

---

## 9. Armadilhas específicas do n8n

- **`Respond to Webhook` depois de trabalho longo = 504.** Responder antes (§2).
- **`Execute Sub-workflow` com "wait for completion" ligado herda o timeout do pai.**
- **`Loop Over Items` não paraleliza de verdade** — batch size é tamanho de lote, e os
  lotes são sequenciais. Para paralelismo real, dividir o blueprint em N pedaços e
  disparar N execuções do orquestrador, uma por área. Quatro áreas = 4 execuções
  paralelas, o que corta o tempo em ~4×.
- **Memória do Chat Trigger é por `sessionId`.** Sem `sessionId` estável, o agente 0
  esquece o que o aluno acabou de dizer.
- **`Structured Output Parser` falha silenciosamente com schema muito profundo.** Manter
  aninhamento em 2 ou 3 níveis; achatar quando passar disso.
- **Nó `Code` roda em sandbox sem acesso a `fetch` por default** em algumas instalações.
  Requisição HTTP é nó `HTTP Request`, não `Code`.
