# Contratos JSON

Os schemas que amarram os agentes. Nenhum agente lê saída bruta de outro: tudo passa por
`Structured Output Parser` no n8n, com retry na falha de parse.

Convenção de áreas: `LC` Linguagens · `CH` Ciências Humanas · `CN` Ciências da Natureza ·
`MT` Matemática.

---

## SimuladoSpec — saída do agente 0

```json
{
  "job_id": "uuid",
  "origem": "chat | webhook",
  "aluno_id": "uuid | null",
  "tipo": "oficial | personalizado",
  "modo": "rapido | rigoroso",
  "n_questoes": 180,
  "areas": ["LC", "CH", "CN", "MT"],
  "disciplinas": [],
  "assuntos": [],
  "nivel": "facil | medio | dificil | misto",
  "curva_dificuldade": { "facil": 0.30, "medio": 0.45, "dificil": 0.25 },
  "enfase": "acumulada | recente",
  "idioma_estrangeiro": "ingles | espanhol",
  "ordem_dificuldade": "oficial | crescente",
  "assumido": ["modo=rapido por omissao"],
  "criado_em": "2026-09-09T12:00:00Z"
}
```

`assumido[]` é o que o Intake preencheu por default. O front mostra isso ao aluno; no
chat, o agente diz em voz alta. Assumir default calado é o que faz o aluno receber outra
coisa do que pediu.

---

## BlueprintSlot — saída do agente 1, um por questão

```json
{
  "slot_id": "MT-07",
  "numero": 142,
  "area": "MT",
  "disciplina": "Matematica",
  "assunto": "Razao, proporcao e regra de tres",
  "recorte": "escala em planta baixa",
  "habilidade": "H10",
  "nivel_alvo": 6,
  "genero_suporte": "situacao-problema | tabela | texto informativo | poema | cronica | trecho literario | documento historico | conceito filosofico | dialogo",
  "suporte_permitido": ["texto", "tabela"],
  "contexto_proibido": ["receita de bolo", "combustivel"],
  "peso_origem": { "fonte": "medido", "percentual": 17.6 }
}
```

- `recorte` e `contexto_proibido` são o que o LLM da camada 3 do distribuidor produz, para
  dar variedade. `contexto_proibido` acumula o que já foi usado no simulado.
- `suporte_permitido` sai do `fator_texto` do assunto. Nunca inclui `imagem`.
- `habilidade` é da Matriz de Referência do INEP quando aplicável, e `null` quando o
  assunto não mapeia limpo. Não inventar código de habilidade.

---

## Questao — saída do agente 2

```json
{
  "slot_id": "MT-07",
  "versao": 1,
  "suporte": {
    "texto": "…",
    "tabela_md": "| Ano | Casos |\n|---|---|\n| 2020 | 1.240 |",
    "fonte": "Texto elaborado para este simulado.",
    "fonte_tipo": "elaborado | real_verificada | dominio_publico"
  },
  "enunciado": "Com base nos dados da tabela, o aumento percentual entre 2020 e 2024 foi de",
  "alternativas": [
    { "letra": "A", "texto": "…" },
    { "letra": "B", "texto": "…" },
    { "letra": "C", "texto": "…" },
    { "letra": "D", "texto": "…" },
    { "letra": "E", "texto": "…" }
  ],
  "gabarito": "C",
  "justificativas": [
    { "letra": "A", "correta": false,
      "por_que": "resultado de dividir pelo valor final em vez do inicial",
      "erro_nomeado": "base_invertida" },
    { "letra": "C", "correta": true, "por_que": "…", "erro_nomeado": null }
  ],
  "resolucao": "…",
  "metadados": { "palavras_suporte": 96, "tem_tabela": true }
}
```

Regras que o schema impõe:

- exatamente 5 alternativas, letras A a E, sem repetição;
- `justificativas[]` tem 5 itens, um por letra;
- em `MT` e `CN`, todo distrator numérico precisa de `erro_nomeado` não nulo
  ([04_ANTI_IA.md](04_ANTI_IA.md) §2);
- `fonte_tipo` obrigatório. `real_verificada` exige URL que respondeu na geração.

---

## Auditoria — saída dos agentes 3 a 7

Mesmo envelope para os cinco, para que o roteador do n8n seja um só.

```json
{
  "slot_id": "MT-07",
  "versao": 1,
  "agente": "nivel | antiia | distratores | solver | repeticao",
  "veredito": "APROVADO | REVISAR | DESCARTAR",
  "achados": [
    { "regra": "2.1", "severidade": "BLOCKER",
      "descricao": "a alternativa correta (C) e a mais longa, com 24 palavras contra 11 da media",
      "como_corrigir": "encurtar C para ~13 palavras ou alongar B e D" }
  ],
  "extra": {}
}
```

`extra` carrega o que é específico de cada agente:

| Agente | `extra` |
|---|---|
| `nivel` | `{ nivel_medido, escores: { E1..E5 }, ajuste_sugerido }` |
| `solver` | `{ resposta, confianca, outras_defensaveis: ["B"], justificativa }` |
| `repeticao` | `{ similares: [{ questao_id, similaridade }] }` |
| `antiia` | `{ lint: [...], julgamento: "…" }` |

**Regra de agregação.** Um `BLOCKER` de qualquer agente = `REVISAR`. Só `APROVADO` de
todos os cinco fecha a questão. `DESCARTAR` só vem do agente 7 (repetição acima de 0.90)
ou da terceira falha do loop.

**O solver é bloqueante mesmo quando concorda.** `resposta == gabarito` com
`outras_defensaveis` não vazio é `REVISAR`.

---

## SimuladoPronto — saída do agente 8, payload do front

```json
{
  "job_id": "uuid",
  "simulado_id": "uuid",
  "status": "pronto",
  "tipo": "oficial",
  "n_questoes": 180,
  "questoes": [ { "numero": 1, "area": "LC", "enunciado": "…", "suporte": {…}, "alternativas": [...] } ],
  "gabarito": { "1": "C", "2": "A" },
  "distribuicao_entregue": { "LC": { "Portugues": 23, "Literatura": 10 } },
  "fidelidade": {
    "score": 0.87,
    "desvios": [
      { "disciplina": "Artes", "alvo": 4, "entregue": 1,
        "motivo": "restricao_texto", "realocado_para": "Literatura" }
    ]
  },
  "auditoria_resumo": {
    "geradas": 194, "aprovadas": 180, "descartadas": 14,
    "revisoes_medias": 0.31,
    "solver_discordou": 9
  },
  "gerado_em": "2026-09-09T12:34:00Z"
}
```

O objeto que vai para o aluno **não inclui** `gabarito`, `justificativas` nem
`resolucao` — esses vêm do endpoint de correção, depois que ele responde. Mandar o
gabarito junto com a prova é o bug mais fácil de cometer aqui.

`auditoria_resumo` é o painel de saúde do pipeline. `solver_discordou: 9` em 194 questões
significa que ~5% dos gabaritos gerados estavam errados e foram pegos. Se esse número for
zero, desconfie do solver, não celebre.

---

## Estados do job

```
recebido -> especificando -> distribuindo -> gerando -> auditando -> montando -> pronto
                  │                              │
                  └-> incompleto                 └-> erro
```

`incompleto` só existe na porta webhook (retorna 422 com `faltando[]`). No chat, o agente
0 fica em `especificando` até fechar o spec.

O front faz polling em `GET /simulado/:job_id/status`, que devolve
`{ status, progresso: { geradas: 47, total: 180 }, eta_segundos }`.
