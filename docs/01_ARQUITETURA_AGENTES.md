# Arquitetura de agentes

Nove agentes. Cada um é um sub-workflow n8n com entrada e saída em JSON validado
([02_CONTRATOS.md](02_CONTRATOS.md)). Nenhum agente lê a saída bruta de outro: tudo passa
por schema.

---

## Visão geral

```
 Chat Trigger ─┐
               ├─> Normalizador ─> 0·INTAKE ─> 1·DISTRIBUIDOR ─> blueprint[]
 Webhook ──────┘                      │                               │
 (202 + job_id)                       │ falta info?                   │
                                      └─> pergunta (chat)             │
                                          ou 422 (webhook)            │
                                                                      ▼
                                                        ┌──── Loop por slot ────┐
                                                        │                       │
                                                   2·GERADOR (por área)         │
                                                        │                       │
                                            ┌───────────┴───────────┐           │
                                            │  auditoria paralela   │           │
                                            │ 3·NÍVEL  4·ANTI-IA    │           │
                                            │ 5·DISTRATOR 6·SOLVER  │           │
                                            │ 7·ANTI-REPETIÇÃO      │           │
                                            └───────────┬───────────┘           │
                                                        │                       │
                                              aprovado? ─┴─ não ─> REVISOR ─────┘
                                                        │          (máx 2×)
                                                        ▼
                                                   8·MONTADOR ─> Supabase ─> front
```

---

## 0 · Intake (Briefing Agent)

**Papel.** Colher e parsear. É o único agente que conversa.

**Entra.** Texto livre (chat) ou JSON parcial (webhook).
**Sai.** `SimuladoSpec` válido, ou `{ status: "incompleto", faltando: [...] }`.

Precisa extrair:

| Campo | Obrigatório | Default |
|---|---|---|
| `tipo` | sim | — (`oficial` \| `personalizado`) |
| `areas[]` | se personalizado | todas, se oficial |
| `disciplinas[]` | não | derivado da área |
| `assuntos[]` | não | derivado dos pesos |
| `n_questoes` | se personalizado | 180 se oficial |
| `nivel` | não | `misto` |
| `curva_dificuldade` | não | `{ facil: 0.30, medio: 0.45, dificil: 0.25 }` |
| `modo` | não | `rapido` |
| `idioma_estrangeiro` | se Linguagens | `ingles` |
| `aluno_id` | não | anônimo |

**Comportamento por porta.** No chat, faz **uma** pergunta por vez e nunca mais de três no
total — se depois de três ainda falta coisa, assume os defaults e diz em voz alta o que
assumiu. No webhook, não conversa: devolve `422` com a lista de campos faltando.

**Regra de tipo.** `oficial` **trava** área, contagem e distribuição. Se o aluno pedir
"simulado oficial só de matemática", isso é `personalizado` com `areas: ["MT"]` — o
Intake reclassifica e avisa.

---

## 1 · Distribuidor

**Papel.** Virar spec em blueprint. É o agente com a maior parte determinística.

**Entra.** `SimuladoSpec`.
**Sai.** `Blueprint[]` — um objeto por questão.

Três camadas, nessa ordem:

1. **Rateio (nó `Code`, zero LLM).** Lê `pesos_incidencia`, aplica **maior resto (Hare)**
   e fecha a conta exata. Nunca deixa a soma dos slots diferente de `n_questoes`.
   Algoritmo e tabelas em [03_DISTRIBUICAO_ENEM.md](03_DISTRIBUICAO_ENEM.md).
2. **Ajuste de viabilidade textual (nó `Code`).** Aplica `fator_texto` por assunto,
   remove slots que só existiriam com imagem e redistribui o resíduo. Registra o desvio
   em `fidelidade`.
3. **Variedade (LLM).** Só aqui entra agente. Recebe os slots já contados e escolhe,
   para cada um: o **recorte** dentro do assunto, o **gênero do texto de apoio** e o
   **contexto** (para não sair 8 questões de razão e proporção todas sobre receita de
   bolo). Não pode alterar contagem — a saída é validada contra a entrada.

**Curva de dificuldade.** Distribuída *dentro* de cada assunto, não no simulado como um
todo. Um assunto com 1 slot recebe o nível dominante da curva; com 3+ slots recebe a
proporção. Isso evita "todas as difíceis caíram em geometria".

---

## 2 · Gerador (sub-agentes por área)

**Papel.** Escrever a questão de um slot.

Cinco sub-agentes, porque as áreas exigem coisas incompatíveis:

| Sub-agente | Especificidade |
|---|---|
| `gerador-mt` | Precisa **fechar a conta**. Emite `resolucao_passo_a_passo` e os distratores vêm de erros de procedimento reais (esqueceu de dividir, trocou raio por diâmetro), não de números aleatórios |
| `gerador-cn` | Rigor factual (Física/Química/Biologia). Unidades, ordem de grandeza, nomenclatura. Proibido "efeito" inventado |
| `gerador-ch` | Texto de apoio é documento, conceito ou tese. Precisa de posicionamento historiográfico correto e nada de anacronismo |
| `gerador-lc` | Texto de apoio é o coração. Interpretação, variação linguística, literatura. Domínio público quando for literário |
| `gerador-le` | Inglês/Espanhol. Herda direto as regras de cognato e vocabulário do EPCAR |

**Entra.** Um `BlueprintSlot` + trechos relevantes do ruleset anti-IA + lista de contextos
já usados no simulado.
**Sai.** Objeto `Questao` com `enunciado`, `suporte`, `alternativas[5]`, `gabarito`,
`justificativas[5]` (por que cada alternativa está certa ou errada), `resolucao`.

**Cinco alternativas (A-E).** O ENEM usa 5, não 4. Isso muda a engenharia de distratores
herdada do EPCAR: são 4 distratores para cobrir, não 3. O quarto tende a ser o mais fraco
— é onde o auditor 5 aperta.

---

## 3 · Avaliador de nível

**Papel.** Medir dificuldade real e comparar com o alvo do slot.

**Entra.** `Questao` + `nivel_alvo`.
**Sai.** `{ nivel_medido, escores: {...}, veredito, ajuste_sugerido }`.

Cinco eixos, rubrica em [05_RUBRICA_DIFICULDADE.md](05_RUBRICA_DIFICULDADE.md):
carga de leitura, etapas de raciocínio, distância semântica até a correta, interferência
dos distratores, pré-requisitos de conteúdo.

Veredito é `APROVADO` se `|nivel_medido − nivel_alvo| <= 1` numa escala de 1 a 9. Fora
disso, retorna **como** subir ou descer — nunca "está fácil, deixe mais difícil".

---

## 4 · Auditor Anti-IA

**Papel.** Tirar a cara de IA. Metade dele não é agente.

**Camada 1 — lint determinístico (nó `Code`).** O que dá para contar, conta:
travessões por bloco, transições de enchimento em início de parágrafo, sequências
paralelas, empilhamento de hedge, blacklist de vocabulário, `Disponível em:` em texto
gerado, comprimento da alternativa correta vs. as outras, advérbio absoluto na correta.
Cada achado é `BLOCKER` ou `AVISO`.

**Camada 2 — agente.** O que exige julgamento: ritmo de frase, se o enunciado parece
enunciado de prova ou parece prompt, se o texto de apoio tem a textura de texto publicado.

Ruleset completo em [04_ANTI_IA.md](04_ANTI_IA.md).

---

## 5 · Auditor de distratores

**Papel.** Garantir que as 5 alternativas competem.

Herda a **auditoria de 6 passos** do `epcar-distractor-engine`, adaptada para 5
alternativas. Checa, entre outras coisas:

- a correta não é a mais longa;
- nenhuma alternativa é descartável na primeira leitura (sem espantalho);
- pelo menos um distrator é *troca de detalhe* (fato do texto com um elemento mudado);
- nenhum par de distratores é semanticamente sobreposto (o erro que o Sim 09 do EPCAR
  pegou: "expanding" e "straining" cabiam os dois);
- em questão de ironia, satira ou crítica social, as 5 alternativas operam no **mesmo
  nível conceitual** — o achado mais duro do EPCAR, ver
  [04_ANTI_IA.md](04_ANTI_IA.md) §5.

---

## 6 · Resolvedor independente (solver cego)

**Papel.** Resolver a questão sem ver o gabarito. É o gate que não se negocia.

**Entra.** `enunciado`, `suporte`, `alternativas[]`. **Nada mais.** Sem gabarito, sem
justificativas, sem resolução, sem assunto.
**Sai.** `{ resposta, confianca, outras_defensaveis[], justificativa }`.

Três desfechos:

| Desfecho | Ação |
|---|---|
| `resposta == gabarito` e `outras_defensaveis` vazio | ✅ passa |
| `resposta != gabarito` | 🔴 volta para revisão. Ou o gabarito está errado, ou o enunciado não sustenta o gabarito. As duas coisas são defeito |
| `resposta == gabarito` mas `outras_defensaveis` não vazio | 🔴 volta. Questão ambígua passa no gabarito e reprova na prova |

Roda com o modelo mais forte disponível e temperatura baixa. É o único agente que vale
gastar Opus em todo simulado.

---

## 7 · Curador anti-repetição

**Papel.** Impedir que o aluno reconheça o enunciado.

**Entra.** `Questao` aprovada.
**Sai.** `{ veredito, similares: [{ questao_id, similaridade }] }`.

Duas checagens:

1. **Dentro do simulado atual** — contexto repetido (duas questões sobre a mesma
   pesquisa, o mesmo autor, a mesma situação).
2. **Contra o banco** — embedding do `suporte + enunciado` no `pgvector`. Acima de
   `0.90` de similaridade de cosseno, rejeita; entre `0.82` e `0.90`, marca para
   revisão humana.

É a versão em escala do que o EPCAR fazia com um arquivo de log por simulado.

---

## 8 · Montador

**Papel.** Fechar o pacote.

- **Ordena** as questões na numeração oficial (LC 1-45, CH 46-90, CN 91-135, MT 136-180)
  ou sequencial, se personalizado.
- **Balanceia o gabarito**: A-E o mais equilibrado possível, sem 3 letras iguais
  consecutivas, sem bloco repetido, sem ciclo `a-b-c-d-e-a-b-c-d-e`. Herdado do EPCAR.
- **Ordena por dificuldade crescente dentro de cada área** (o ENEM não faz isso, mas para
  simulado de treino é melhor; controlado por `spec.ordem_dificuldade`).
- **Calcula `fidelidade`**: alvo vs. entregue por disciplina e assunto, com o desvio
  atribuído à restrição de texto.
- **Grava** no Supabase e devolve o payload do front.

---

## Revisor (não é agente numerado)

Não é um agente próprio: é o **gerador da área**, chamado de novo, agora recebendo a
questão v1 mais a lista de achados dos auditores. Isso mantém a voz da questão consistente
e evita um sexto prompt para manter.

Limite de **2 voltas**. Na terceira falha, o slot é descartado e o distribuidor emite um
substituto do mesmo assunto com semente diferente.
