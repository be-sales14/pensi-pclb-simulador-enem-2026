# CLAUDE.md — Simulado ENEM

## O projeto

Montador de simulados do ENEM com **questões reais** de provas anteriores (2019-2025),
misturadas na proporção da prova oficial. Back em **n8n**, front em **Vercel**, dados em
**Supabase**. Projeto didático, feito com alunos.

**Mudança de rumo (2026-10-01, decisão do Thiago):** as questões geradas por IA não
chegaram ao nível do ENEM. O produto principal agora sorteia questões reais do banco
(`data/banco/`). O pipeline de geração (Fase 1) fica no repo como material de aula. Ver
[PLANO.md](PLANO.md) §0.

Leia [PLANO.md](PLANO.md) antes de mexer em qualquer coisa. Os detalhes estão em `docs/`.

## Idioma

Conversa com o usuário em **português**. Conteúdo das questões em português, exceto os
5 slots de língua estrangeira (inglês ou espanhol).

## Regras não negociáveis

Estas quatro não se discutem sem o Thiago:

1. **Questão real é mostrada como o recorte da página oficial**, com suas figuras. Nada de
   reescrever, resumir ou "limpar" o enunciado: o recorte é o que o aluno vê; o texto
   extraído serve só para busca e classificação. *(Até 2026-10-01 esta regra era "nenhuma
   imagem", valendo para questão gerada. Questão gerada continua sem imagem.)*
2. **Fonte fabricada é BLOCKER** (vale para questão gerada). Texto gerado nunca recebe autor, veículo, URL ou data de
   acesso fictícios. Só três rótulos válidos, ver [docs/04_ANTI_IA.md](docs/04_ANTI_IA.md) §6.
3. **O solver cego é bloqueante para questão gerada.** Nenhuma questão gerada vai para o
   aluno sem ter sido resolvida por um agente que não viu o gabarito. Questão real usa o
   gabarito oficial do INEP; questão anulada nunca entra em simulado.
4. **O gabarito não vai para o browser junto com a prova.** Ele existe só na resposta do
   endpoint de correção.

## Onde a lógica vive

| Coisa | Onde | Nunca |
|---|---|---|
| Pesos de incidência | tabela `pesos_incidencia` no Supabase, semeada de `data/pesos_incidencia.json` | hard-coded em prompt ou em nó `Code` |
| Contagem de slots | nó `Code` determinístico (maior resto) | LLM. Erra soma |
| Variedade de recorte e contexto | LLM, camada 3 do agente 1 | nó `Code` |
| Regras anti-IA contáveis | `data/lint_antiia.json`, nó `Code` | prompt |
| Regras anti-IA de julgamento | `prompts/` | nó `Code` |

## Ao editar os pesos

Rode `python3 scripts/validar_pesos.py`. Se não sair código 0, o rateio vai quebrar em
produção sem avisar.

**Nunca troque `confianca: provisorio` por `medido` sem ter feito a medição.** Física e
Química estão provisórios hoje. A marca existe para impedir que um número inventado apareça
em material publicado como se fosse medido.

## Ao editar as regras anti-IA

Elas vêm do projeto EPCAR (`~/Documents/handout_designer/Epcar`), validadas em 20
simulados com revisão humana. Cada regra existe porque uma questão real foi rejeitada por
violá-la. Antes de relaxar uma, leia a memória correspondente em
`~/.claude/projects/-Users-thiago-cabral-Documents-handout-designer-Epcar/memory/`.

Em especial: **não** transforme a engenharia de distratores em tipologia acadêmica de
armadilhas. Isso já foi tentado (Simulado 09) e rejeitado. Ver
[docs/04_ANTI_IA.md](docs/04_ANTI_IA.md) §3.

## Commits

Convencionais, em português:

```
feat: adiciona agente de auditoria de distratores
fix: corrige rateio quando n_questoes < 10
docs: registra medicao de pesos de Fisica
```

## Dependências

- n8n (self-hosted ou cloud) com credenciais de LLM e Supabase
- Supabase com `pgvector` e `pgcrypto`
- Python 3 para os scripts de validação
- Node 20+ para o front
