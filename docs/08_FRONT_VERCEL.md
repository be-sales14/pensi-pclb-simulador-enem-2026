# Front na Vercel

O front é fino: escolhe o simulado, mostra as questões, recebe as respostas e mostra a
nota. Sorteio, correção e banco vivem no n8n e no Supabase. O código está em
[front/](../front/) e o passo a passo para rodar e publicar está no
[front/README.md](../front/README.md).

Stack: **Next.js 16 (App Router) + Tailwind 4**. Sem cliente Supabase no navegador: tudo
passa pelos webhooks.

---

## Endpoints do n8n que o front consome

Todos `POST`, com o header `x-simulado-token` (credencial Header Auth
**Simulado ENEM · token do front**). O navegador nunca chama o n8n direto: cada rota de
`front/app/api/` repassa só os campos esperados e acrescenta o token, que fica no servidor.

| Rota do front | Webhook | Corpo | Devolve |
|---|---|---|---|
| `/api/aluno` | 40 · `simulado-enem/aluno` | `{ email, nome }` | `{ aluno_id, email, nome, historico[] }` |
| `/api/simulado` | 41 · `simulado-enem/montar` | `{ tipo, dia?, areas?, n_questoes?, lingua, aluno_id? }` | `{ simulado_id, pedido, avisos, questoes[] }` **sem gabarito** |
| `/api/simulado/ver` | 43 · `simulado-enem/ver` | `{ simulado_id }` (id inteiro ou código de 8) | o mesmo de `montar` |
| `/api/entregar` | 42 · `simulado-enem/entregar` | `{ simulado_id, aluno_id, respostas, origem, iniciado_em? }` | `{ acertos, total, por_area, por_disciplina, questoes[{ numero, marcada, gabarito, certo }] }` |

Cada questão chega como `{ numero, area, disciplina, imagem_url, largura, altura }`: a
imagem do recorte oficial no S3, sem ano, número original ou gabarito. O gabarito só existe
na resposta de `entregar` (regra 4 do CLAUDE.md), e uma entrega por aluno e simulado.

---

## Telas

### 1 · Montar (`/`)

Quatro opções: oficial completo (180), 1º dia (90), 2º dia (90) e personalizado (áreas e
número de questões à escolha, rateados na proporção da prova). Língua estrangeira só aparece quando
Linguagens entra. Dois botões:

- **Fazer na tela:** pede email + nome se o navegador ainda não conhece o aluno, monta com
  `aluno_id` (o sorteio evita questões que ele já viu) e abre a prova.
- **Baixar PDF:** monta sem cadastro e abre a versão para imprimir, que chama a janela de
  impressão sozinha quando as imagens terminam de carregar.

### 2 · Prova (`/simulado/[id]`), layout B

Caderno corrido com as questões agrupadas por área e as bolhas A–E embaixo de cada uma;
cartão-resposta lateral (vira bloco embaixo no celular) com o estado de cada questão
(respondida, revisar, em branco); cronômetro do tempo gasto; **Exportar PDF** e
**Entregar**, que avisa quantas estão em branco. As marcações ficam no `localStorage` a
cada clique.

### 3 · Imprimir (`/simulado/[id]/imprimir`)

Duas colunas como o caderno do ENEM (questão larga ocupa as duas) e, na última página, o
cartão-resposta em branco com o **código curto** (8 primeiros caracteres do id).

### 4 · Corrigir prova feita no papel (`/corrigir`)

Código do PDF → cadastro (se preciso) → grade de bolhas → entrega com `origem: "pdf"`.

### 5 · Resultado e histórico

Resultado: nota, barras por área e por disciplina, gabarito questão a questão e as erradas
com o recorte, para revisar. Fica na aba que entregou (sessionStorage); depois disso, o
histórico (`/historico`) guarda a nota e o desempenho por área de cada entrega, pelo email.

---

## Variáveis de ambiente

```
N8N_WEBHOOK_BASE=https://api.data.descomplica.io/webhook   # servidor
N8N_TOKEN=                                                # servidor, mesmo valor da credencial do n8n
```

Sem `N8N_WEBHOOK_BASE` o front entra em **modo demonstração** (`front/lib/demo.ts`): roda
as libs de `n8n/src/` sobre `data/banco/` em memória. Serve para desenvolver o visual sem
n8n; não é para produção, porque não guarda nada.

---

## Apêndice · desenho da Fase 1 (questão gerada)

Antes da mudança de rumo de 2026-10-01 (PLANO.md §0) o front acompanhava a geração por IA.
Fica aqui como material de aula.

O front é fino: escolhe, acompanha, responde, lê o relatório. Nenhuma regra de geração
vive aqui.

Stack sugerida: **Next.js (App Router) + Tailwind + shadcn/ui**, cliente Supabase para
leitura e Realtime, e `fetch` para os webhooks do n8n.

---

### Endpoints do n8n que o front consome

| Método | Rota | Devolve |
|---|---|---|
| `POST` | `/webhook/simulado` | `202 { job_id }` — ou `422 { faltando: [...] }` |
| `GET` | `/webhook/simulado/:job_id/status` | `{ status, progresso: { geradas, total }, eta_segundos }` |
| `GET` | `/webhook/simulado/:job_id` | `SimuladoPronto` **sem gabarito** |
| `POST` | `/webhook/simulado/:id/respostas` | `{ nota, acertos, relatorio_por_assunto, gabarito_comentado }` |

O gabarito só existe na resposta do `POST /respostas`. Nunca no payload da prova
([06_SUPABASE_SCHEMA.md](06_SUPABASE_SCHEMA.md) §RLS).

---

### Telas

#### 1 · Montar simulado

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

#### 2 · Gerando

Barra de progresso alimentada por `GET /status` (polling de 3s) **ou** Supabase Realtime
na tabela `jobs`. Realtime é mais elegante; polling é mais simples e não falha atrás de
proxy. Começar com polling.

Um simulado oficial leva ~20 minutos. A tela precisa ser fechável e retomável: o
`job_id` no `localStorage` e um aviso de que pode voltar depois.

#### 3 · Responder

Uma questão por tela em mobile, lista contínua em desktop. Cronômetro opcional. Salvar
rascunho da resposta no `localStorage` a cada marcação — o aluno vai fechar a aba.

#### 4 · Relatório

Não é só a nota. Três blocos:

1. **Nota e acertos por área.**
2. **Acertos por assunto**, ao lado do peso daquele assunto na prova real. É o que
   transforma o simulado em plano de estudo: "você errou 5 de 8 em razão e proporção, que
   é o assunto que mais cai".
3. **Gabarito comentado** — a `justificativas[]` de cada alternativa, não só a correta.
   Explicar por que as outras quatro estão erradas é o que o aluno não consegue sozinho.

---

### Chat como segunda porta, também no front

O n8n Chat Trigger tem widget embutível (`@n8n/chat`). Vale embutir no front como
alternativa ao formulário — é o mesmo agente 0, e mostra para os alunos que as duas
portas são o mesmo núcleo.

---

### Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
N8N_WEBHOOK_BASE=            # server-side apenas
N8N_WEBHOOK_TOKEN=           # server-side apenas
```

Chamada ao n8n passa por **Route Handler** do Next (`app/api/.../route.ts`), nunca direto
do browser. O token do webhook não vai para o cliente.
