# Plano de ataque

Documento-mãe. Decisões, restrições e a ordem em que atacamos. Os detalhes de cada peça
moram em `docs/`.

---

## 0. Mudança de rumo (2026-10-01)

As 5 questões de Matemática geradas na Fase 1 tinham gabarito certo, mas não tinham nível
de ENEM: distratores fracos, uma etapa só, contexto batido. **Decisão do Thiago:** o produto
passa a montar simulados com **questões reais** de edições anteriores, misturando anos,
na proporção da prova oficial.

| Antes | Agora |
|---|---|
| LLM escreve cada questão | questão vem do banco de provas oficiais 2019-2025 (1.295 itens) |
| gabarito do gerador, conferido por solver cego | gabarito oficial do INEP; anuladas fora |
| sem imagem (regra 1 antiga) | recorte da página oficial, com figura |
| ~1.000 chamadas de LLM por simulado oficial | zero LLM para montar: sorteio determinístico em segundos |

**O que continua igual:** o rateio por maior resto sobre `pesos_incidencia` e
`pesos_disciplina` (`n8n/src/distribuidor.lib.js`), o `SimuladoSpec`, o Supabase, a regra
de não mandar gabarito ao browser.

**Como o banco foi feito:** `scripts/banco/extrair_questoes.py` lê os PDFs oficiais
(`data/banco/fontes.json`), recorta cada questão da página (seguindo colunas e páginas) e
lê o gabarito. Ver `data/banco/README.md`.

**Classificação:** Matemática tem assunto questão a questão (estudo do `indahouse-crm`);
Linguagens, Humanas e Natureza têm disciplina. O simulado usa a proporção por assunto em
MT e por disciplina no resto, até a classificação por assunto ser feita (etapa própria,
com revisão).

O resto deste documento descreve o plano original de geração. Vale como registro e
material de aula.

---

## 1. O que estamos construindo

Um back-end em n8n que recebe um pedido de simulado (por chat ou por webhook), monta um
**blueprint** de questões respeitando a distribuição real do ENEM, gera cada questão com
agentes, submete cada questão a **auditorias independentes** (nível, anti-IA, distratores,
resolução) e devolve um simulado pronto, com gabarito e justificativas.

O front na Vercel é a interface do aluno: escolhe o tipo de simulado, acompanha a geração,
responde e recebe o relatório.

---

## 2. Restrições que moldam todo o resto

### 2.1 Sem imagem, sem tirinha, sem figura

Decisão do projeto: **toda questão é texto**. Isso não é um detalhe de estilo, é uma
restrição que muda a distribuição, porque parte da prova real vive em imagem.

Regra operacional, em três faixas:

| Situação | Tratamento |
|---|---|
| **Tabela** (estatística, dados socioeconômicos, tabela periódica parcial) | ✅ Permitido — renderizar em Markdown. É texto |
| **Gráfico** (barras, linhas, pizza, dispersão) | ⚠️ Converter em tabela de dados + rótulo do que o gráfico mostraria. A habilidade cobrada (ler informação quantitativa) sobrevive; a habilidade visual, não |
| **Charge, tirinha, mapa, cartaz, obra de arte, diagrama, esquema, estrutura molecular desenhada** | 🔴 Proibido. O slot **não** é preenchido com um substitute ruim — ele é redistribuído (§2.2) |

### 2.2 O que fazer com os slots que dependem de imagem

O estudo de incidência foi medido em provas onde ~20% das questões têm o enunciado dentro
de uma imagem. Duas coisas seguem disso:

1. **A distribuição precisa de um passo de ajuste.** O agente distribuidor calcula os
   pesos oficiais e depois aplica um `fator_texto` por assunto: quanto daquele assunto é
   viável 100% em texto. Assuntos como *Artes* (obra de arte), *Geografia Física*
   (mapa, perfil de relevo) e *Leitura de gráficos* perdem slots; assuntos textuais
   (Filosofia, Sociologia, Literatura, Interpretação de texto) ganham.
2. **O desvio é declarado, não escondido.** Todo simulado sai com um campo
   `fidelidade` no relatório: qual a distribuição-alvo, qual a entregue, e onde
   divergiu por causa da restrição de texto. Sem isso, o material mente sobre si mesmo.

### 2.3 Fonte fabricada é linha vermelha

Questão de ENEM sempre cita fonte (`Disponível em: ... Acesso em: ...`). Um agente que
gera o texto de apoio **vai inventar essa linha** se a gente não proibir.

Regra: nenhum texto de apoio gerado por agente recebe autor, veículo, URL ou data de
acesso fictícios. Só existem três rótulos válidos:

- `#FONTE: Texto elaborado para este simulado.`
- `#FONTE: <citação real e verificável>` — só quando o texto vier de busca real, com
  URL que responde, e o agente tiver a URL em mãos.
- `#FONTE: Domínio público — <obra, autor, ano>` — para literatura e filosofia clássica.

Isso está no auditor anti-IA como **BLOCKER**, não como aviso. Ver
[docs/04_ANTI_IA.md](docs/04_ANTI_IA.md) §6.

### 2.4 Redação fica fora da v1

O ENEM tem redação. Simulado de questões objetivas e correção de redação são produtos
diferentes, com agentes diferentes. Fica como Fase 6, e reaproveita o que já existe em
`indahouse-crm/docs/ebooks/caderno-redacao-fuvest` e `diagnostico-redacao-fuvest`.

---

## 3. Decisões de arquitetura já tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| **Onde mora a lógica de distribuição** | Nó `Code` determinístico, não prompt | Rateio de 180 questões em 4 áreas × 10 disciplinas × ~60 assuntos precisa fechar a conta exata. LLM erra soma. O agente entra só na camada de *variedade* (escolher qual recorte dentro do assunto), não na de *contagem* |
| **Como os sub-agentes são implementados** | Sub-workflows n8n (`Execute Sub-workflow`), um por agente | Testável isoladamente, versionável, e o `AI Agent` node pode chamá-los como tool quando fizer sentido |
| **Webhook síncrono ou assíncrono** | **Assíncrono, obrigatório** | 180 questões × 3 chamadas de LLM = ~540 chamadas. Nenhum webhook sobrevive. Retorna `202 + job_id`, front acompanha por polling ou Supabase Realtime |
| **Onde ficam os pesos de incidência** | Tabela no Supabase (`pesos_incidencia`), semeada de `data/pesos_incidencia.json` | Recalibrar quando sair o ENEM 2026 não pode exigir editar prompt |
| **Modelo** | **Gemini** (decisão do Thiago, 2026-09-30). Modelo rápido (Flash) para conversa e tarefas leves; modelo mais forte (Pro) para geração, auditoria e solver cego. O plano original era Claude Sonnet/Opus; a arquitetura não depende do provedor | Geração é volume; auditoria é julgamento. A instância n8n do Thiago é a de teste; a de produção (Bernardo) escolhe os modelos na hora de importar |
| **Anti-repetição** | `pgvector` no banco de questões aprovadas | Mesmo problema que o EPCAR resolveu com arquivos de memória por simulado. Em escala, é embedding |

---

## 4. Os agentes, em uma frase cada

Detalhe em [docs/01_ARQUITETURA_AGENTES.md](docs/01_ARQUITETURA_AGENTES.md).

| # | Agente | Uma frase |
|---|---|---|
| 0 | **Intake** | Conversa, colhe e parseia o pedido até virar um `SimuladoSpec` válido |
| 1 | **Distribuidor** | Transforma o spec em um blueprint questão-por-questão, com assunto, nível e tipo de suporte |
| 2 | **Gerador** (5 sub-agentes, um por área + um de Matemática) | Escreve a questão de um slot do blueprint |
| 3 | **Avaliador de nível** | Mede a dificuldade real contra a rubrica de 5 eixos e compara com o alvo |
| 4 | **Auditor Anti-IA** | Aplica o ruleset do EPCAR portado ao português; parte é lint determinístico |
| 5 | **Auditor de distratores** | Garante que as 5 alternativas competem de verdade |
| 6 | **Resolvedor independente** | Resolve a questão **sem ver o gabarito**; se discordar, a questão volta |
| 7 | **Curador anti-repetição** | Rejeita questão semanticamente próxima de outra já aprovada |
| 8 | **Montador** | Ordena, balanceia gabarito, calcula `fidelidade`, grava e devolve |

O agente 6 não estava no pedido original e é o mais importante dos quatro auditores.
Um gerador que escreve enunciado e gabarito na mesma passada tende a marcar como correta
uma alternativa que não se sustenta. Só um solver cego pega isso.

---

## 5. O loop de qualidade

```
blueprint[i] ──> Gerador ──> questão v1
                               │
                    ┌──────────┴──────────┐
                    │  Auditoria paralela │
                    ├─────────────────────┤
                    │ 3 · nível           │
                    │ 4 · anti-IA (lint+LLM)
                    │ 5 · distratores     │
                    │ 6 · solver cego     │
                    │ 7 · anti-repetição  │
                    └──────────┬──────────┘
                               │
              todos APROVADO? ─┴─ não ─> Revisor ──> questão v2 ──┐
                    │                      (máx. 2 voltas)        │
                    sim                                            │
                    ▼                                              │
              banco de questões  <────────────────────────────────┘
                                     3ª falha = descarta slot e
                                     pede outro do mesmo assunto
```

Regra de parada: **duas voltas de revisão por questão**. Na terceira falha, o slot é
descartado e o distribuidor emite um slot substituto do mesmo assunto com semente
diferente. Sem isso, uma questão ruim consome o orçamento do simulado inteiro.

---

## 6. Orçamento de chamadas, e o interruptor de rigor

Simulado oficial completo, no modo rigoroso:

| Etapa | Chamadas |
|---|---:|
| Intake + distribuição | ~3 |
| Geração (180 slots) | 180 |
| Auditoria (4 agentes × 180) | 720 |
| Revisões (estimando 25% de retrabalho) | ~135 |
| Montagem | ~2 |
| **Total** | **~1.040** |

Isso é caro e lento. Por isso o `SimuladoSpec` tem `modo`:

| Modo | Auditoria | Uso |
|---|---|---|
| `rapido` | Lint determinístico + 1 auditor combinado + solver cego | Aula, demo, iteração dos alunos |
| `rigoroso` | Os 4 auditores separados | Simulado que vai para aluno de verdade |

O solver cego **nunca** sai, em nenhum modo. É o gate que não se negocia.

---

## 7. Ordem de ataque

Resumo; o detalhado com critério de pronto está em
[docs/09_ROADMAP.md](docs/09_ROADMAP.md).

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0 · Fundação** | Repo, schema Supabase, `pesos_incidencia` semeado, contratos JSON | `SELECT` nos pesos devolve 180 slots que somam 180 |
| **1 · Fatia vertical** | Chat Trigger → Intake → Distribuidor → Gerador → 5 questões de Matemática | 5 questões de MT saem com gabarito conferido à mão pelo Thiago |
| **2 · Qualidade** | Os 5 auditores + loop de revisão | 20 questões geradas, ≥90% passam no solver cego na 1ª ou 2ª volta |
| **3 · Assíncrono + front** | Webhook 202/polling, Supabase Realtime, telas na Vercel | Aluno pede simulado personalizado no front e responde no front |
| **4 · Oficial completo** | 180 questões, `fidelidade`, anti-repetição por embedding | Um simulado oficial completo sai em < 30 min e o relatório de fidelidade fecha |
| **5 · Analytics** | Correção, proxy de TRI, relatório por habilidade | Aluno recebe onde errou por assunto, não só a nota |
| **6 · Redação** | Fora do escopo da v1 | — |

A Fase 1 é a que prova o projeto. Cinco questões de Matemática end-to-end, com gabarito
conferido à mão, valem mais que um diagrama de 180.

---

## 8. Riscos, e o que fazemos com cada um

| Risco | Sinal de que aconteceu | Mitigação |
|---|---|---|
| **Gabarito errado** | Solver cego discorda do gerador | Agente 6 é bloqueante. Toda questão com discordância volta ou morre |
| **Duas alternativas defensáveis** | Solver cego marca "ambígua" | Mesmo gate. O solver reporta `resposta` **e** `outras_defensaveis[]` |
| **Fonte inventada** | Regex acha `Disponível em:` ou `Acesso em:` em texto gerado | Lint determinístico, BLOCKER (§2.3) |
| **Questão com cara de IA** | Travessão em rajada, tricolon, "é fundamental notar" | Lint + auditor anti-IA ([docs/04_ANTI_IA.md](docs/04_ANTI_IA.md)) |
| **Distribuição que mente** | Simulado "oficial" com 25 de interpretação de texto porque é o mais fácil de gerar em texto | Campo `fidelidade` obrigatório no relatório |
| **Custo estoura** | Um simulado oficial custa mais que o previsto | `modo: rapido` como default no front; `rigoroso` é escolha explícita |
| **Timeout de webhook** | Front recebe 504 | Assíncrono desde a Fase 3, não como otimização depois |
| **Questões repetidas entre simulados** | Aluno reconhece o enunciado | Agente 7 + `pgvector` |
| **Pesos de Física e Química são provisórios** | Distribuição de CN não bate com a prova real | Marcado como `provisorio: true` no JSON; tarefa de medição na Fase 4 |

---

## 9. O que precisa de decisão humana

Nada disso um agente decide:

1. **Conferência de gabarito das primeiras 20 questões** — calibra a confiança no solver.
2. **Se `gráfico → tabela` é aceitável pedagogicamente** ou se a área perde o slot.
3. **Peso de Física e Química por assunto** — hoje é provisório; ou medimos com o mesmo
   pipeline do `indahouse-crm`, ou um professor arbitra.
4. **Se o simulado "oficial" da v1 é 180 questões ou 90 (um dia)** — o plano suporta os
   dois; 90 custa metade e cabe numa aula.
