# Distribuição de questões

De onde saem os pesos, como o rateio fecha a conta e o que é medido vs. provisório.

Os números como dado estão em [`../data/pesos_incidencia.json`](../data/pesos_incidencia.json).
Este documento explica e credita.

---

## 1. Estrutura da prova (confirmada, 2019-2025)

| Dia | Bloco | Questões | Caderno |
|---|---|---|---|
| 1 | Linguagens e suas Tecnologias | 01 – 45 | Caderno 1 Azul |
| 1 | Ciências Humanas e suas Tecnologias | 46 – 90 | Caderno 1 Azul |
| 2 | Ciências da Natureza e suas Tecnologias | 91 – 135 | Caderno 7 Azul (5 Amarelo em 2025) |
| 2 | Matemática e suas Tecnologias | 136 – 180 | idem |

Confirmado no cabeçalho impresso dos sete anos, não presumido. A cor do caderno muda a
ordem das questões — ver `indahouse-crm/.claude/skills/apostila-enem/references/ARMADILHAS.md`.

⚠️ Em edições antigas a posição da área no dia varia (em 2010, Ciências da Natureza caiu
no 1º dia). Não vale extrapolar para trás.

---

## 2. Grau de confiança de cada peso

Isso é o mais importante deste documento. Três níveis:

| Nível | O que significa | Onde se aplica |
|---|---|---|
| 🟢 **Medido** | Questão a questão, com revisão manual e leitura visual da página | Matemática (2015-2025, 465 questões) |
| 🟡 **Catalogado** | Catalogação manual das candidatas de 7 anos, mas sem simulação de estabilidade | Linguagens, Ciências Humanas (2019-2025) |
| 🔴 **Provisório** | Assuntos nomeados por professor, sem contagem por assunto | Física, Química |

Nenhum peso 🔴 deve aparecer em material publicado como se fosse medido.

**Regra herdada do estudo de Matemática:** nunca apresentar posição exata do 2º ao 8º
lugar. A simulação Monte Carlo (20 mil rodadas) mostrou que 2º/3º e 6º/7º são
intercambiáveis. "Está entre os cinco que mais caem" é defensável; "é o 3º que mais cai"
não é.

---

## 3. Matemática · 45 questões 🟢

Base: 465 das 495 questões de 11 edições (2015-2025) classificadas uma a uma.
Fonte: `indahouse-crm/docs/enem/ANALISE_INCIDENCIA_MATEMATICA_2015_2025.md`.

| Assunto | n | % (11 anos) | Slots em 45 | Tendência 21-25 vs 15-20 |
|---|---:|---:|---:|:--|
| Razão, proporção e regra de três | 82 | 17,6% | **8** | ↓ −5,6 |
| Geometria plana | 57 | 12,3% | **6** | ↓ −4,9 |
| Números, operações e raciocínio | 56 | 12,0% | **5** | ↑ +5,1 |
| Geometria espacial e volumes | 52 | 11,2% | **5** | ↑ +3,1 |
| Funções | 48 | 10,3% | **5** | = |
| Estatística (média, mediana, moda) | 36 | 7,7% | **3** | = |
| Leitura de gráficos e tabelas | 34 | 7,3% | **3** | ↑ +2,9 |
| Porcentagem | 32 | 6,9% | **3** | ↑ +2,8 |
| Probabilidade | 27 | 5,8% | **3** | ↓ −1,5 |
| Análise combinatória | 22 | 4,7% | **2** | = |
| Matemática financeira | 8 | 1,7% | **1** | = |
| Sequências e progressões | 7 | 1,5% | **1** | = |
| Geometria analítica | 4 | 0,9% | **0** | = |
| | | | **45** | |

Uma questão conta para **um único** assunto, o dominante. Volume de cilindro que exige
regra de três conta como geometria espacial.

⚠️ **Geometria analítica fica com 0 slot em 45.** Com 0,9%, ela aparece em ~1 questão a
cada 2 provas. Tratada como subtema dentro de Geometria espacial, não como assunto.

⚠️ **Correção importante herdada do estudo:** geometria plana é o **2º** assunto que mais
cai, com ~12,3%. Material anterior (`foca-no-enem-100-dias`) publicou 7%. Se alguém
reaproveitar aquele número aqui, o simulado sai com metade da geometria plana devida.

---

## 4. Linguagens · 45 questões 🟡

Base: catalogação manual do bloco comum, 2019-2025 (280 questões).
Fonte: `indahouse-crm/docs/ebooks/linguagens-corpus/00_CORPUS_E_CLASSIFICACAO.md`.

### 4.1 Divisão da área

| Matéria | Medido (2019-2025) | % | Slots em 45 |
|---|---:|---:|---:|
| Língua estrangeira (Inglês **ou** Espanhol, Q01-05) | fixo por edital | — | **5** |
| Português | 159 | 56,8% | **23** |
| Literatura | 67 | 23,9% | **10** |
| Artes | 29 | 10,4% | **4** |
| Educação Física | 12 | 4,3% | **2** |
| Sobreposição / interdisciplinar | 13 | 4,6% | **1** |
| | | | **45** |

Os percentuais são sobre as 40 do bloco comum; os 5 slots de língua estrangeira são
fixados pelo edital, não medidos.

### 4.2 Português · 23 slots

Sub-classificação por eixo de habilidade, sobre as 159 candidatas.
Fonte: `indahouse-crm/docs/ebooks/portugues/02_ARQUITETURA.md`.

| Eixo | n | % | Slots |
|---|---:|---:|---:|
| Interpretação de texto | 107 | 67,3% | **15** |
| Variação linguística, registro e funções da linguagem | 39 | 24,5% | **6** |
| Gramática normativa e coesão explícita | 13 | 8,2% | **2** |

Dois terços de Português é interpretação. Um simulado que enche Português de gramática
não é um simulado de ENEM.

### 4.3 Literatura · 10 slots

| Assunto | Candidatas | Slots |
|---|---:|---:|
| Literatura contemporânea — vozes plurais e testemunho | 14 | **2** |
| Literatura contemporânea — ficção urbana e crônica | 14 | **2** |
| Romantismo, Realismo e Naturalismo | 13 | **2** |
| Modernismo — ruptura e regionalismo | 9 | **2** |
| Parnasianismo, Simbolismo e Pré-Modernismo | 8 | **1** |
| Modernismo — Geração de 45 | 7 | **1** |

### 4.4 Língua estrangeira · 5 slots

| Eixo | Slots |
|---|---:|
| Identidade, diversidade e pertencimento | **2** |
| Tecnologia, comportamento e vida contemporânea | **2** |
| Crítica social, consumo e comportamento coletivo | **1** |

Herda o ruleset de cognatos e vocabulário do EPCAR ([04_ANTI_IA.md](04_ANTI_IA.md) §4).

### 4.5 Artes e Educação Física — o problema da imagem

🔴 **Artes é a disciplina mais atingida pela restrição de texto.** Boa parte das questões
de Artes no ENEM parte de uma obra visual. Sem imagem, sobram: texto sobre movimento
artístico, manifesto, letra de música, crítica de arte, teatro e literatura dramática.
Ver §7 para o tratamento.

---

## 5. Ciências Humanas · 45 questões 🟡

Base: leitura manual das candidatas de 2019-2025, agregada pelos quatro projetos de
apostila.

| Disciplina | Candidatas | % | Slots em 45 |
|---|---:|---:|---:|
| Geografia | 103 | 32,7% | **15** |
| História | 82 | 26,0% | **12** |
| Sociologia | 73 | 23,2% | **10** |
| Filosofia | 57 | 18,1% | **8** |
| | **315** | | **45** |

⚠️ **Verificar antes de publicar:** as 315 candidatas somam exatamente 45 × 7 anos. Pode
ser coincidência ou pode ser artefato da forma como cada projeto contou. Se houver
sobreposição (uma questão contada em Geografia **e** em Sociologia), Geografia está
sobrestimada. A leitura conservadora é usar **faixas**: Geografia 13-15, História 11-13,
Sociologia 9-11, Filosofia 7-9.

⚠️ A primeira passada automática do corpus de Humanas jogou **44% em "indefinido"**, e o
corpo de texto extraído vem contaminado (pedaço de uma questão dentro de outra). Os
números acima vêm da **leitura manual**, que corrigiu isso — não da classificação
automática.

### 5.1 Geografia · 15 slots

| Assunto | Candidatas | Slots | Nota |
|---|---:|---:|---|
| Geografia Física | 24 | **4** | ⚠️ em queda forte: 5 das 24 em 2023-2025 |
| Meio Ambiente e Mudanças Climáticas | 19 | **3** | ↑ **1º em tendência recente**: 13 das 19 em 2023-2025 |
| Geopolítica | 17 | **2** | presente nos 7 anos sem falhar |
| Geografia Urbana | 17 | **2** | |
| Geografia Agrária | 15 | **2** | concentrada em 2020 (6 das 15) |
| Geografia da População | 11 | **2** | ausente em 2020 e 2025 |

Se o simulado tiver `enfase: recente`, Meio Ambiente sobe para 4 e Geografia Física cai
para 3. Está no JSON como `peso_recente`.

### 5.2 História · 12 slots

| Assunto | Candidatas | Slots |
|---|---:|---:|
| Expansão marítima, conquista da América e escravidão colonial | 22 | **3** |
| República Velha, Era Vargas e Estado Novo | 18 | **3** |
| Antiguidade e Idade Média | 13 | **2** |
| Mundo contemporâneo: guerras, Guerra Fria e ditadura militar | 12 | **2** |
| Brasil Império: independência, Segundo Reinado e abolição | 9 | **1** |
| Idade Moderna europeia: absolutismo, Iluminismo e revoluções | 8 | **1** |

### 5.3 Sociologia · 10 slots

| Assunto | Candidatas | Slots |
|---|---:|---:|
| Desigualdade, raça e gênero | 18 | **3** |
| Cultura, identidade e patrimônio | 16 | **2** |
| Teoria social: clássicos e crítica contemporânea | 15 | **2** |
| Mundo do trabalho e reestruturação produtiva | 8 | **1** |
| Movimentos sociais, Estado e políticas públicas | 8 | **1** |
| Direitos humanos, migração e minorias | 8 | **1** |

### 5.4 Filosofia · 8 slots

| Assunto | Candidatas | Slots |
|---|---:|---:|
| Ética, poder e política na filosofia contemporânea | 14 | **2** |
| Fenomenologia, existencialismo e epistemologia contemporâneas | 14 | **2** |
| Antiguidade e Idade Média | 13 | **2** |
| Razão, ciência e conhecimento na modernidade | 9 | **1** |
| Ética e política na modernidade | 7 | **1** |

Quase metade do corpus de Filosofia é contemporâneo (28 de 57). Um simulado que enche
Filosofia de Sócrates e Platão erra o alvo.

---

## 6. Ciências da Natureza · 45 questões 🔴

**Este é o bloco mais fraco em dado.** A classificação automática do corpus de CN deu
Física 105, Química 34, Biologia 120 — e o próprio estudo registra que o vocabulário de
Química não pontuou, subdetectando a disciplina. 34 questões de Química em 6 anos é
implausível.

### 6.1 Divisão da área — default honesto

| Disciplina | Slots | Faixa aceitável |
|---|---:|---|
| Biologia | **15** | 14-17 |
| Física | **15** | 13-16 |
| Química | **15** | 13-16 |

Usamos 15/15/15 porque é o default defensável enquanto a medição não existir, **não**
porque foi medido. Tarefa da Fase 4: rodar o mesmo pipeline do estudo de Matemática
sobre as questões 91-135 dos 7 anos.

### 6.2 Biologia · 15 slots 🟡

Base: candidatas por assunto, `indahouse-crm/docs/ebooks/biologia/02_ARQUITETURA.md`.

| Assunto | Candidatas | Slots |
|---|---:|---:|
| Ecologia (inclui botânica) | 35 | **5** |
| Microbiologia e saúde | 17 | **3** |
| Genética | 16 | **3** |
| Fisiologia humana | 15 | **2** |
| Evolução | 8 | **1** |
| Citologia | 7 | **1** |

Ecologia é um terço da Biologia do ENEM. Microbiologia e saúde vem forte por covid-19,
dengue e doenças tropicais.

### 6.3 Física · 15 slots 🔴 provisório

Assuntos nomeados pelo professor Thales; **sem contagem por assunto**. Distribuição abaixo
é provisória e precisa de medição ou arbítrio de professor.

| Assunto | Slots (provisório) |
|---|---:|
| Eletricidade (eletrostática + eletrodinâmica) | **3** |
| Cinemática e dinâmica | **3** |
| Energia, trabalho e potência | **3** |
| Ondas e óptica | **2** |
| Termologia | **2** |
| Estática, hidrostática e gravitação | **2** |

### 6.4 Química · 15 slots 🔴 provisório

Assuntos da apostila v2 (sete, com Radioatividade incluída a pedido do professor
Guilherme). **Sem contagem por assunto.**

| Assunto | Slots (provisório) |
|---|---:|
| Química ambiental | **3** |
| Estequiometria | **3** |
| Química orgânica | **3** |
| Funções inorgânicas | **2** |
| Eletroquímica | **2** |
| Tabela periódica e propriedades | **1** |
| Radioatividade | **1** |

⚠️ Circula em cursinho o número "12 questões, 24% da prova de Química" para orgânica.
O estudo do `indahouse-crm` marcou esse número como não confirmado. Não usar como claim.

---

## 7. O ajuste de viabilidade textual

Aplicado **depois** do rateio, pelo nó `Code` do agente 1.

Cada assunto tem um `fator_texto` de 0 a 1: a fração dele que é gerável 100% em texto.

| Faixa | Assuntos típicos | Tratamento |
|---|---|---|
| `1.0` | Filosofia, Sociologia, Literatura, Interpretação de texto, História, Química orgânica (nomenclatura) | nada muda |
| `0.7 – 0.9` | Estatística, Porcentagem, Genética (heredograma vira descrição), Termologia | tabela em Markdown substitui o gráfico |
| `0.3 – 0.6` | Leitura de gráficos e tabelas, Geografia Física (mapa, perfil de relevo), Geometria plana e espacial (figura) | slot só sobrevive se o enunciado descrever a figura em palavras sem virar charada |
| `0.0 – 0.2` | Artes (obra visual), Educação Física (imagem de gesto motor), charge, tirinha, cartaz | slot **redistribuído** |

O resíduo é redistribuído **dentro da mesma disciplina** primeiro, e só depois dentro da
mesma área. Nunca entre áreas — isso quebraria a estrutura oficial.

O desvio resultante vai para o campo `fidelidade` do relatório:

```json
{
  "fidelidade": {
    "score": 0.87,
    "desvios": [
      { "disciplina": "Artes", "alvo": 4, "entregue": 1,
        "motivo": "restricao_texto", "realocado_para": "Literatura" },
      { "assunto": "Leitura de gráficos e tabelas", "alvo": 3, "entregue": 2,
        "motivo": "grafico_convertido_em_tabela" }
    ]
  }
}
```

Sem esse campo, um simulado "oficial" com 1 questão de Artes se apresenta como fiel — e
não é.

---

## 8. Algoritmo de rateio

**Maior resto (método de Hare).** Determinístico, fecha a conta exata, e o mesmo spec
sempre produz a mesma contagem.

```js
// data/pesos_incidencia.json  ->  contagem exata de slots
function ratear(pesos, total) {
  const soma = pesos.reduce((s, p) => s + p.peso, 0);
  const bruto = pesos.map(p => ({ ...p, ideal: (p.peso / soma) * total }));

  const base = bruto.map(p => ({ ...p, slots: Math.floor(p.ideal) }));
  let faltam  = total - base.reduce((s, p) => s + p.slots, 0);

  // desempate estável: maior resto, depois maior peso, depois ordem alfabética
  const ordem = [...base].sort((a, b) =>
    (b.ideal % 1) - (a.ideal % 1) || b.peso - a.peso || a.id.localeCompare(b.id)
  );

  for (let i = 0; faltam > 0; i = (i + 1) % ordem.length, faltam--) {
    ordem[i].slots += 1;
  }
  return base;
}
```

**Invariante que o nó seguinte valida, e falha alto se quebrar:**
`soma(slots) === total`, para o simulado inteiro e para cada área.

**Piso mínimo.** Um assunto com peso ≥ 5% nunca fica com 0 slot em simulados de 20+
questões. Se o rateio der 0, ele toma 1 slot do assunto com o maior número de slots.

**Simulado personalizado pequeno.** Com `n_questoes` abaixo de 10, o rateio por peso vira
ruído. Abaixo desse piso, o distribuidor usa os assuntos **explicitamente pedidos** em
partes iguais, e se nenhum foi pedido, os N assuntos de maior peso, um slot cada.
