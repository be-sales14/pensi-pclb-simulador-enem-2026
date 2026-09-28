# Front na Vercel

O front é fino: escolhe, acompanha, responde, lê o relatório. Nenhuma regra de geração
vive aqui.

Stack sugerida: **Next.js (App Router) + Tailwind + shadcn/ui**, cliente Supabase para
leitura e Realtime, e `fetch` para os webhooks do n8n.

---

## Endpoints do n8n que o front consome

| Método | Rota | Devolve |
|---|---|---|
| `POST` | `/webhook/simulado` | `202 { job_id }` — ou `422 { faltando: [...] }` |
| `GET` | `/webhook/simulado/:job_id/status` | `{ status, progresso: { geradas, total }, eta_segundos }` |
| `GET` | `/webhook/simulado/:job_id` | `SimuladoPronto` **sem gabarito** |
| `POST` | `/webhook/simulado/:id/respostas` | `{ nota, acertos, relatorio_por_assunto, gabarito_comentado }` |

O gabarito só existe na resposta do `POST /respostas`. Nunca no payload da prova
([06_SUPABASE_SCHEMA.md](06_SUPABASE_SCHEMA.md) §RLS).

---

## Telas

### 1 · Montar simulado

Dois caminhos na mesma tela:

**Oficial** — um botão. Mostra o que vai vir (180 questões, 4 áreas, distribuição por
disciplina) e o tempo estimado. Nada para configurar além de `idioma_estrangeiro` e
`modo`.

**Personalizado** — formulário progressivo:

```
área(s)  ─>  disciplina(s)  ─>  assunto(s)  ─>  nº de questões  ─>  nível
                                    │
                        (opcional: em branco = pelos pesos)
```

A tela mostra, ao vivo, **como o pedido vai ser rateado** — a mesma função `ratear()` do
[03_DISTRIBUICAO_ENEM.md](03_DISTRIBUICAO_ENEM.md) §8, rodando no cliente com os pesos
lidos de `pesos_incidencia`. O aluno vê "8 de razão e proporção, 6 de geometria plana"
antes de mandar. Isso mata metade das dúvidas e ensina a distribuição da prova de graça.

### 2 · Gerando

Barra de progresso alimentada por `GET /status` (polling de 3s) **ou** Supabase Realtime
na tabela `jobs`. Realtime é mais elegante; polling é mais simples e não falha atrás de
proxy. Começar com polling.

Um simulado oficial leva ~20 minutos. A tela precisa ser fechável e retomável: o
`job_id` no `localStorage` e um aviso de que pode voltar depois.

### 3 · Responder

Uma questão por tela em mobile, lista contínua em desktop. Cronômetro opcional. Salvar
rascunho da resposta no `localStorage` a cada marcação — o aluno vai fechar a aba.

### 4 · Relatório

Não é só a nota. Três blocos:

1. **Nota e acertos por área.**
2. **Acertos por assunto**, ao lado do peso daquele assunto na prova real. É o que
   transforma o simulado em plano de estudo: "você errou 5 de 8 em razão e proporção, que
   é o assunto que mais cai".
3. **Gabarito comentado** — a `justificativas[]` de cada alternativa, não só a correta.
   Explicar por que as outras quatro estão erradas é o que o aluno não consegue sozinho.

---

## Chat como segunda porta, também no front

O n8n Chat Trigger tem widget embutível (`@n8n/chat`). Vale embutir no front como
alternativa ao formulário — é o mesmo agente 0, e mostra para os alunos que as duas
portas são o mesmo núcleo.

---

## Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
N8N_WEBHOOK_BASE=            # server-side apenas
N8N_WEBHOOK_TOKEN=           # server-side apenas
```

Chamada ao n8n passa por **Route Handler** do Next (`app/api/.../route.ts`), nunca direto
do browser. O token do webhook não vai para o cliente.
