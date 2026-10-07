# Workflows exportados

Um arquivo `.json` por workflow, exportado do n8n (`... > Download`).

| Arquivo | Workflow | Fase |
|---|---|---|
| `99-erro.json` | Error Trigger — log e marca o job como `erro`. **Não usado na instância de teste do Thiago**: sem ele, job que quebra fica parado em `gerando` | 0 |
| `98-teste-erro.json` | Falha de propósito para testar o `99-erro`. Desativar depois do teste | 0 |
| `00-entrada-chat.json` | Chat Trigger + agente 0, com a ferramenta `gerar_simulado` | 1 |
| `02-orquestrador.json` | Spec, rateio, variedade, loop de geração, gravação (Fase 1: sem auditoria) | 1 |
| `10-gerador-mt.json` | Gerador de Matemática | 1 |
| `20-auditoria.json` | Os cinco auditores em paralelo | 2 |
| `01-entrada-webhook.json` | Webhook, responde 202 | 3 |
| `30-status.json` | `GET /status` | 3 |
| `31-correcao.json` | Correção e relatório | 3 |

## MVP: gerar o simulado (sem front)

Dois workflows, sem LLM e sem front. O próprio n8n mostra a prova e o gabarito.

| Arquivo | O que faz |
|---|---|
| `44-simulado-prova.json` | Formulário do n8n (ou link direto) → monta o simulado na proporção oficial → página da prova com "Salvar PDF" |
| `45-simulado-gabarito.json` | Página do gabarito, em link separado (regra 4) |

Importar: os dois arquivos; nos nós de banco, a credencial Postgres do Supabase; ativar os dois.
A URL do formulário aparece no nó **Formulario** (Production URL). Link direto:
`<n8n>/webhook/simulado-enem/prova?tipo=oficial&dia=2` ou
`?tipo=personalizado&areas=MT,CH&n=20&lingua=espanhol`.

O endereço do gabarito usa a constante `N8N_WEBHOOK` em `scripts/montar_workflows.py`: na
instância de produção, troque e regenere.

Os workflows `40` a `43` (cadastro, entrega e correção pelo front) ficam para depois do MVP.

## Os JSON são gerados, não editados

Os nós `Code` e os prompts **não** são escritos dentro do n8n. A fonte é o repo:

| Fonte | Vira |
|---|---|
| `n8n/src/*.lib.js` | código dos nós `Code` (testado por `scripts/testar_*.js`) |
| `prompts/*.md` + trechos de `docs/04` e `docs/05` | prompts dos agentes |

Para mudar qualquer coisa: edite a fonte, rode os testes e regenere os JSON.

```bash
node scripts/testar_distribuidor.js && node scripts/testar_fase1.js
python3 scripts/montar_workflows.py
```

Depois reimporte o workflow no n8n. Se você editar direto no n8n, a próxima regeneração
apaga a mudança.

## Importar a Fase 1

A ordem importa, porque um workflow chama o outro:

1. `10-gerador-mt.json`: escolher a credencial Gemini no nó **Gemini (geracao)**.
2. `02-orquestrador.json`: credencial Postgres nos 6 nós de banco, Gemini no nó
   **Gemini (variedade)**, e no nó **Gerar questao (MT)** escolher o workflow
   `10-gerador-mt`.
3. `00-entrada-chat.json`: Postgres em **Listar assuntos**, Gemini em
   **Gemini (conversa)**, e na ferramenta **gerar_simulado** escolher o workflow
   `02-orquestrador`.
4. Nos nós Gemini, escolher o modelo mais novo disponível: um forte (Pro) para geração e
   variedade, um rápido (Flash) para a conversa.

**Antes de exportar:** confira que nenhuma credencial ficou embutida no JSON. O n8n
exporta referência de credencial, não o segredo — mas prompt com chave colada em nó `Set`
vai junto. `n8n/*.credentials.json` está no `.gitignore`; nós de `Set` não estão.

Detalhes de implementação: [../docs/07_N8N_IMPLEMENTACAO.md](../docs/07_N8N_IMPLEMENTACAO.md).
