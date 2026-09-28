# Workflows exportados

Um arquivo `.json` por workflow, exportado do n8n (`... > Download`).

| Arquivo | Workflow | Fase |
|---|---|---|
| `99-erro.json` | Error Trigger — log e marca o job como `erro` | 0 |
| `00-entrada-chat.json` | Chat Trigger + agente 0 | 1 |
| `02-orquestrador.json` | Distribuição, loop, agregação, montagem | 1 |
| `10-gerador-mt.json` | Gerador de Matemática | 1 |
| `20-auditoria.json` | Os cinco auditores em paralelo | 2 |
| `01-entrada-webhook.json` | Webhook, responde 202 | 3 |
| `30-status.json` | `GET /status` | 3 |
| `31-correcao.json` | Correção e relatório | 3 |

**Antes de exportar:** confira que nenhuma credencial ficou embutida no JSON. O n8n
exporta referência de credencial, não o segredo — mas prompt com chave colada em nó `Set`
vai junto. `n8n/*.credentials.json` está no `.gitignore`; nós de `Set` não estão.

Detalhes de implementação: [../docs/07_N8N_IMPLEMENTACAO.md](../docs/07_N8N_IMPLEMENTACAO.md).
