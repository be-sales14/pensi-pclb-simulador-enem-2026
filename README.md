# Simulado ENEM · gerador multiagente

Projeto didático com alunos: um gerador de simulados do ENEM em que **todas as questões
são geradas por agentes de IA**, com back-end em **n8n**, front em **Vercel** e
persistência em **Supabase**.

Duas portas de entrada, um único núcleo:

- **Chat** — o professor/aluno conversa direto no n8n (Chat Trigger) e define o simulado
  falando.
- **Webhook** — o front na Vercel manda um JSON e recebe o simulado (assíncrono).

Dois tipos de simulado:

- **Oficial** — replica a estrutura real do ENEM (180 questões, 4 áreas de 45), com a
  distribuição por disciplina e assunto medida nas provas de 2015-2025.
- **Personalizado** — o aluno escolhe área, disciplina, assuntos, nº de questões e nível.

## Onde está o quê

| Arquivo | Conteúdo |
|---|---|
| [PLANO.md](PLANO.md) | **Comece aqui.** O plano de ataque completo, em fases |
| [docs/01_ARQUITETURA_AGENTES.md](docs/01_ARQUITETURA_AGENTES.md) | Os 9 agentes, o que cada um faz, o que entra e o que sai |
| [docs/02_CONTRATOS.md](docs/02_CONTRATOS.md) | Schemas JSON que amarram os agentes (`SimuladoSpec`, `Blueprint`, `Questao`, `Auditoria`) |
| [docs/03_DISTRIBUICAO_ENEM.md](docs/03_DISTRIBUICAO_ENEM.md) | Pesos de incidência por disciplina e assunto, e o algoritmo de rateio |
| [docs/04_ANTI_IA.md](docs/04_ANTI_IA.md) | Regras Anti-IA, portadas do projeto EPCAR para o português |
| [docs/05_RUBRICA_DIFICULDADE.md](docs/05_RUBRICA_DIFICULDADE.md) | Como o agente avaliador mede nível (5 eixos) |
| [docs/06_SUPABASE_SCHEMA.md](docs/06_SUPABASE_SCHEMA.md) | Modelo de dados |
| [docs/07_N8N_IMPLEMENTACAO.md](docs/07_N8N_IMPLEMENTACAO.md) | Nós, sub-workflows, fan-out, timeout, custo |
| [docs/08_FRONT_VERCEL.md](docs/08_FRONT_VERCEL.md) | Contrato do front e telas |
| [docs/09_ROADMAP.md](docs/09_ROADMAP.md) | Fases, entregável de cada uma e critério de pronto |
| [data/pesos_incidencia.json](data/pesos_incidencia.json) | Os pesos como **dado**, não como prompt |
| [prompts/](prompts/) | System prompts de cada agente |
| [n8n/](n8n/) | Workflows exportados (`.json`) |
| [sql/](sql/) | Migrations do Supabase |

## Origem dos dados

Nada aqui foi inventado. As duas bases vêm de trabalho anterior:

- **Padrões Anti-IA e engenharia de distratores** — projeto EPCAR
  (`~/Documents/handout_designer/Epcar`), 20 simulados de inglês para escola militar,
  com regras validadas por revisão humana simulado a simulado.
- **Distribuição de questões por disciplina** — estudo de incidência do
  `indahouse-crm` (`docs/enem/` e `docs/ebooks/`), com 465 questões de Matemática de
  11 edições classificadas uma a uma, mais a catalogação manual dos blocos de
  Linguagens e Ciências Humanas (2019-2025).

O que é medido e o que é provisório está marcado em
[docs/03_DISTRIBUICAO_ENEM.md](docs/03_DISTRIBUICAO_ENEM.md). Não apague as marcas.
