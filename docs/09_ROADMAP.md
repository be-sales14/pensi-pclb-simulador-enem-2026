# Roadmap

Seis fases. Cada uma tem um entregável e um critério de pronto verificável — se o critério
não é verificável, a fase não fecha.

---

## Fase 0 · Fundação

**Entrega.** Repo, schema no Supabase, pesos semeados, contratos JSON escritos.

- [x] `sql/001_init.sql` rodado no Supabase (projeto `uwnuehhebwckbbhkaqyx`, 2026-09-28)
- [x] `data/pesos_incidencia.json` semeado em `pesos_incidencia` e `pesos_disciplina`
- [ ] Credenciais de LLM e Supabase criadas no n8n
- [ ] Workflow `99-erro` (Error Trigger) no ar antes de tudo

**Critério de pronto.** `python3 scripts/validar_pesos.py` sai com código 0, e a mesma
validação roda contra o que está **no banco**, não só no arquivo:
`DATABASE_URL=... python3 scripts/validar_pesos.py --banco` — que também acusa
divergência entre o banco e o JSON (alguém editou o JSON e não semeou de novo).

---

## Fase 1 · Fatia vertical

**Entrega.** Chat → Intake → Distribuidor → Gerador → 5 questões de Matemática.

- [ ] `00-entrada-chat` com memória por `sessionId`
- [ ] Agente 0 fechando `SimuladoSpec` em no máximo 3 perguntas
- [ ] Agente 1 com as três camadas (rateio, viabilidade textual, variedade)
- [ ] `10-gerador-mt` produzindo `Questao` válida pelo schema
- [ ] Sem auditoria ainda — de propósito

**Critério de pronto.** Thiago confere os 5 gabaritos à mão. Se algum estiver errado,
a Fase 2 já tem seu primeiro caso de teste.

Esta é a fase que prova o projeto. Cinco questões conferidas valem mais que um diagrama
de 180.

---

## Fase 2 · Qualidade

**Entrega.** Os cinco auditores e o loop de revisão.

- [ ] Camada de lint determinístico (`data/lint_antiia.json`) como nó `Code`
- [ ] Agentes 3, 4, 5, 6 e 7
- [ ] Blindagem por whitelist antes do solver ([07_N8N_IMPLEMENTACAO.md](07_N8N_IMPLEMENTACAO.md) §5)
- [ ] Loop de revisão com cap de 2 voltas e descarte na 3ª
- [ ] `auditorias` e `questao_versoes` gravando tudo

**Critério de pronto.** 20 questões geradas, com:
- ≥ 90% passando no solver cego na 1ª ou 2ª volta;
- 0 questões com fonte fabricada (o lint tem que pegar 100%);
- as versões descartadas visíveis em `questao_versoes` — é o material de aula.

**Aula que sai daqui:** mostrar aos alunos as v1 rejeitadas e o achado que as rejeitou.
É a melhor demonstração de por que auditoria independente não é burocracia.

---

## Fase 3 · Assíncrono e front

**Entrega.** Webhook 202, status, e o front na Vercel.

- [ ] `01-entrada-webhook` respondendo 202 **antes** de disparar o orquestrador
- [ ] `30-status` com progresso real
- [ ] Front: montar (com preview do rateio), gerando, responder
- [ ] `31-correcao` com relatório por assunto
- [ ] View `questoes_publicas` e RLS conferidos — gabarito **não** chega ao browser

**Critério de pronto.** Um aluno pede um simulado personalizado de 15 questões no front,
responde no front e recebe o relatório. Ninguém abre o n8n.

---

## Fase 4 · Simulado oficial completo

**Entrega.** 180 questões, fidelidade, banco reaproveitável, anti-repetição por embedding.

- [ ] Paralelismo por área (4 execuções do orquestrador)
- [ ] `fidelidade` calculada e exibida
- [ ] `pgvector` populado e agente 7 rejeitando de verdade
- [ ] Reaproveitamento do banco: slot que já tem questão aprovada e não repetida puxa do
      banco em vez de gerar
- [ ] **Medir os pesos de Física e Química** com o pipeline do estudo de Matemática, e
      trocar `confianca: provisorio` por `catalogado`

**Critério de pronto.** Um simulado oficial completo sai em menos de 30 minutos, o
relatório de fidelidade fecha, e nenhum desvio maior que 2 slots aparece sem motivo
declarado.

---

## Fase 5 · Analytics

**Entrega.** Análise clássica de item e realimentação da rubrica.

- [ ] View `item_stats` em uso
- [ ] Alerta de `ponto_bisserial` negativo → questão retirada do banco
- [ ] Comparação `pct_acerto` vs. `nivel_medido` → calibração da rubrica
- [ ] Relatório do aluno por habilidade, não só por assunto

**Critério de pronto.** Uma questão com gabarito errado que passou por todos os agentes é
detectada pela estatística de resposta. É o ciclo se fechando.

---

## Fase 6 · Redação

Fora do escopo da v1. Quando entrar, reaproveita
`indahouse-crm/docs/ebooks/caderno-redacao-fuvest` e `diagnostico-redacao-fuvest`.

---

## O que não está no roadmap, de propósito

- **Imagens, tirinhas e gráficos gerados.** Decisão de projeto ([PLANO.md](../PLANO.md) §2.1).
- **Fine-tuning.** Prompt e auditoria resolvem, e o dado para treinar não existe ainda.
- **Adaptativo em tempo real.** Precisa de `item_stats` maduro. Depois da Fase 5, se
  fizer sentido.
- **Simulado de outros vestibulares** (Fuvest, Unicamp). A arquitetura suporta — é trocar
  os pesos e a estrutura da prova. Não antes do ENEM estar bom.
