# CLAUDE.md — Simulado ENEM

## O projeto

Gerador de simulados do ENEM com agentes de IA. Back em **n8n**, front em **Vercel**,
dados em **Supabase**. Projeto didático, feito com alunos.

Leia [PLANO.md](PLANO.md) antes de mexer em qualquer coisa. Os detalhes estão em `docs/`.

## Idioma

Conversa com o usuário em **português**. Conteúdo das questões em português, exceto os
5 slots de língua estrangeira (inglês ou espanhol).

## Regras não negociáveis

Estas quatro não se discutem sem o Thiago:

1. **Nenhuma imagem.** Toda questão é texto. Tabela em Markdown é texto e pode; gráfico
   vira tabela; charge, tirinha, mapa e obra de arte não existem, o slot é redistribuído.
   Ver [PLANO.md](PLANO.md) §2.1.
2. **Fonte fabricada é BLOCKER.** Texto gerado nunca recebe autor, veículo, URL ou data de
   acesso fictícios. Só três rótulos válidos, ver [docs/04_ANTI_IA.md](docs/04_ANTI_IA.md) §6.
3. **O solver cego é bloqueante em todos os modos.** Nenhuma questão vai para o aluno sem
   ter sido resolvida por um agente que não viu o gabarito.
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
