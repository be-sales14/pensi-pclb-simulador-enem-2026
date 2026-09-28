# Modelo de dados (Supabase)

Migration em [`../sql/001_init.sql`](../sql/001_init.sql).

---

## Tabelas

| Tabela | Papel |
|---|---|
| `pesos_disciplina` | Quantas das 45 questões de cada área vão para cada disciplina. O rateio por assunto acontece dentro dela |
| `pesos_incidencia` | Os pesos por área/disciplina/assunto, com grau de confiança. **Dado, não prompt** |
| `jobs` | Um pedido de simulado, com estado e progresso |
| `simulados` | Simulado montado, com spec, blueprint e fidelidade |
| `questoes` | Questão aprovada, com suporte, alternativas, gabarito e embedding |
| `questao_versoes` | Cada versão gerada, aprovada ou não. É o histórico que ensina |
| `auditorias` | Todo veredito de todo agente sobre toda versão |
| `simulado_questoes` | Ligação N-N com o número da questão no simulado |
| `respostas` | Resposta de aluno, para análise clássica de item |

Duas decisões que valem explicar:

**`questoes` separada de `questao_versoes`.** A questão aprovada é o produto; as versões
descartadas são o dado mais valioso do projeto para os alunos — mostram *o que* os
auditores pegam e *por quê*. Jogar fora a v1 quando a v2 passa é perder a aula.

**`embedding` em `questoes`, com `pgvector`.** É o que o agente 7 usa para anti-repetição.
Índice `ivfflat` com `vector_cosine_ops`.

---

## O que grava quando

```
webhook/chat ──> jobs (recebido)
distribuidor ──> simulados (blueprint, status=gerando)
gerador ──────> questao_versoes (versao=1)
auditores ────> auditorias (5 linhas por versao)
aprovado ─────> questoes + simulado_questoes
montador ─────> simulados (fidelidade, status=pronto) + jobs (pronto)
aluno ────────> respostas
```

---

## Análise clássica de item

O que fecha o ciclo da rubrica de dificuldade
([05_RUBRICA_DIFICULDADE.md](05_RUBRICA_DIFICULDADE.md) §Proxy de TRI). Roda como view,
não como agente.

```sql
create or replace view item_stats as
with nota as (
  select aluno_id, simulado_id,
         avg(case when correta then 1.0 else 0.0 end) as pct_total
  from respostas group by 1, 2
)
select r.questao_id,
       count(*)                                                   as n_respostas,
       avg(case when r.correta then 1.0 else 0.0 end)              as pct_acerto,
       corr(case when r.correta then 1.0 else 0.0 end, n.pct_total) as ponto_bisserial
from respostas r
join nota n using (aluno_id, simulado_id)
group by 1
having count(*) >= 30;
```

Duas leituras acionáveis:

- **`ponto_bisserial` negativo** → item defeituoso. Aluno que vai bem na prova erra esse
  item mais que aluno que vai mal. É quase sempre gabarito errado ou ambiguidade que o
  solver cego não pegou. Vai para revisão humana, e a questão sai do banco.
- **`pct_acerto` muito distante do `nivel_medido`** → a rubrica erra naquele tipo de
  questão. Calibra a rubrica, não a questão.

---

## RLS

O front na Vercel fala com o Supabase com a chave `anon`. Então:

- `questoes`: aluno **não** lê `gabarito`, `justificativas` nem `resolucao`. Duas
  opções — ou uma view `questoes_publicas` sem essas colunas, ou RLS + coluna mascarada.
  A view é mais simples e mais difícil de errar.
- `respostas`: aluno lê e escreve só as próprias (`auth.uid() = aluno_id`).
- `jobs`: aluno só **lê** o próprio job (para o Realtime da tela de progresso). Quem
  escreve é o n8n.
- `pesos_incidencia`, `pesos_disciplina`, `auditorias`, `questao_versoes`, `simulados`,
  `simulado_questoes`: sem acesso pelo `anon`. São do back.
- **Toda tabela nova nasce com RLS ligado.** No Supabase, tabela sem RLS no schema
  `public` é leitura *e escrita* para qualquer um com a chave `anon` — que é pública.
- A correção acontece no n8n (`31-correcao`) com a `service_role`, nunca no browser.

Mandar o gabarito para o browser junto com a prova é o bug mais fácil de cometer neste
projeto, e o mais difícil de perceber, porque a tela funciona.
