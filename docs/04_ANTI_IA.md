# Parâmetros Anti-IA

Portado do projeto EPCAR (`~/Documents/handout_designer/Epcar`), onde essas regras foram
validadas em 20 simulados com revisão humana questão a questão. Lá o exame era de inglês
para escola militar; aqui é ENEM em português, com 5 alternativas em vez de 4. O que muda
está marcado como **[adaptado]**.

Cada regra é `BLOCKER` (a questão não passa) ou `AVISO` (registra e segue).

---

## 1. Escrita — o que denuncia texto gerado

| # | Regra | Severidade | Verificável por código |
|---|---|---|---|
| 1.1 | **Máximo 1 travessão por bloco de texto.** O resto vira vírgula, parêntese ou reestruturação. É o sinal de IA mais comum | BLOCKER | sim |
| 1.2 | Nunca 3+ frases consecutivas com a mesma estrutura (sujeito + verbo + complemento) | AVISO | sim (heurística) |
| 1.3 | Nada de transição de enchimento abrindo parágrafo: *Além disso, Ademais, Adicionalmente, Portanto, Dessa forma, Nesse sentido, Vale destacar, É importante notar* | BLOCKER | sim |
| 1.4 | Sem empilhamento de hedge: *possivelmente, potencialmente, aparentemente, de certa forma* juntos | AVISO | sim |
| 1.5 | **[adaptado]** Nada de tricolon como ritmo default — "rápido, eficiente e escalável". Um por texto, no máximo | AVISO | sim (heurística) |
| 1.6 | **[adaptado]** Blacklist de vocabulário de LLM em português: *crucial, robusto, aprofundar, mergulhar, desvendar, panorama, cenário atual, no mundo de hoje, em um mundo cada vez mais, verdadeiro, fundamental (como intensificador), primordial, holístico, sinergia, tapeçaria* | BLOCKER | sim |
| 1.7 | **[adaptado]** Sem fechamento moralizante. Texto de apoio não termina em lição de casa ("cabe à sociedade refletir sobre...") | BLOCKER | parcial |
| 1.8 | **[adaptado]** Sem emoji, sem negrito decorativo, sem bullet no texto de apoio. ENEM não usa | BLOCKER | sim |
| 1.9 | Enunciado tem de 5 a 15 palavras. Enunciado longo e editorializado é marca nossa, não de prova | AVISO | sim |

### Enunciados a evitar (herdado do §5 do `advanced-stems.md`)

Fórmulas que ficaram viciadas por repetição no EPCAR. As equivalentes em português:

- "Analisando criticamente o excerto acima, é possível inferir que"
- "Considerando o texto como um todo, o autor busca sobretudo"
- "Se colocarmos os textos I e II lado a lado, o ponto em comum é que"
- "Ao longo do texto, o autor assume a posição de que"
- "Reduzido ao seu argumento central, o trecho afirma que"

### Enunciados que soam a prova de verdade

Curtos, planos, sem adjetivo de esforço:

- "De acordo com o texto,"
- "A partir da leitura do texto, conclui-se que"
- "O autor defende que"
- "No trecho, a expressão «X» tem a função de"
- "A relação entre os textos I e II se estabelece porque"
- "Assinale a alternativa que **contraria** o texto."
- "Com base nos dados da tabela,"

---

## 2. Distratores — as cinco alternativas

Adaptado de `epcar-distractor-engine`. **A mudança de 4 para 5 alternativas é a maior
adaptação deste documento:** são 4 distratores para cobrir, e o quarto é sempre o mais
fraco. É onde o auditor aperta.

| # | Regra | Severidade |
|---|---|---|
| 2.1 | **A correta nunca é a alternativa mais longa** | BLOCKER |
| 2.2 | Nenhum advérbio absoluto na correta: *sempre, nunca, exclusivamente, totalmente, apenas, unicamente, integralmente* | BLOCKER |
| 2.3 | Ao menos **um** distrator é troca de detalhe: um fato do texto com um elemento alterado | BLOCKER |
| 2.4 | Nenhum distrator absurdo. Todos defensáveis na primeira leitura | BLOCKER |
| 2.5 | Nenhum par de distratores semanticamente sobreposto — se dois cabem, a questão é anulável | BLOCKER |
| 2.6 | **[adaptado]** As 5 alternativas têm comprimento parecido (a mais longa não passa de 1,6× a mais curta) | AVISO |
| 2.7 | **[adaptado]** Nenhuma alternativa começa com a mesma palavra que as outras 4 (padrão de gerador) | AVISO |
| 2.8 | Em questão de ironia, crítica social ou satira, as 5 alternativas operam no mesmo nível conceitual (§5) | BLOCKER |
| 2.9 | **No máximo 1 ou 2 tipos de armadilha por questão.** Empilhar técnica deixa a prova com cara de IELTS, não de ENEM (§3) | AVISO |

### Os quatro distratores, por função

Distribuição-alvo para questão de interpretação:

1. **Leitura literal / de superfície** — o que o texto parece dizer, não o que diz.
2. **Inversão** — toma a ironia ou a crítica pelo valor de face.
3. **Aspecto plausível, alvo errado** — tom certo, objeto errado.
4. **Verdadeiro mas irrelevante** — afirmação correta sobre o mundo que o texto não sustenta.

Para Matemática e Ciências da Natureza, os distratores vêm de **erro de procedimento
real**, não de número aleatório: esqueceu de dividir por 2, usou diâmetro no lugar do
raio, não converteu unidade, aplicou a fórmula da área no volume, inverteu a razão.
Cada distrator numérico precisa declarar em `justificativas[]` **qual erro produz aquele
número**. Distrator numérico sem erro nomeado é BLOCKER.

---

## 3. A armadilha do "mais difícil" — lição do Simulado 09

Registro direto da memória do EPCAR, e vale igual aqui.

Quando pediram distratores mais difíceis, o projeto trouxe frameworks acadêmicos
(tipologia de armadilhas Cambridge/IELTS, os "5 Ps", parafrase pesada como regra). O
resultado foi tecnicamente mais difícil e **rejeitado**: soou a prova de proficiência
internacional, não à prova real.

**Dificuldade não vem de tipologia de armadilha.** Vem de:

- densidade do texto de apoio;
- qualidade da paráfrase da alternativa correta;
- exigência de camada implícita para acertar.

Se durante a geração o agente estiver **rotulando** distratores por tipo de armadilha,
empilhando técnicas ou escrevendo correta artificialmente distante do texto, ele derivou.
Isso está no prompt de todo gerador como regra explícita.

---

## 4. Vocabulário e cognatos — Língua Estrangeira

Herdado direto, sem adaptação. Vale para os 5 slots de Inglês/Espanhol.

- **Nunca testar palavra com cognato português óbvio.** O aluno resolve sem ler o texto.
  Banidos como alvo: *pose, excessive, demonstrate, indicate, specific, alternative,
  consequence, initial, investigate*.
- **Preferir vocabulário de origem germânica ou phrasal:** *unravel, idle, thirsty,
  narrow, tell-tale, give up, stand in the way*.
- **O cognato conta na palavra-alvo também, não só nas alternativas.** "nerve" → "nervo"
  invalida a questão mesmo com alternativas todas germânicas.
- **Alternativas em nível de ensino médio.** *steadfast, wavering, untrustworthy* são
  avançadas demais e não apareceriam na prova real. Ou usa sinônimo simples (*firm, weak,
  hidden, hard, quick*), ou reformula como pergunta de sentido com alternativas em frase
  completa e linguagem simples.
- Em espanhol, o problema é maior: quase tudo é cognato. Testar **falso amigo**
  (*embarazada, ratón, largo, éxito, todavía, aula*) ou expressão idiomática, nunca
  vocabulário transparente.

---

## 5. Questões de crítica social, ironia e satira

O achado mais duro do EPCAR (Simulado 15, três a quatro iterações até fechar), e o mais
relevante para Ciências Humanas e Linguagens no ENEM.

**Problema.** Se a alternativa correta é a única "filosófica" e as outras quatro descrevem
superfície (quem, o quê, onde), o aluno acerta por eliminação de registro, sem ter
entendido nada.

**Regra.** As cinco alternativas operam no mesmo nível de abstração. Três modos de falha:

1. Distratores no nível literal enquanto a correta é conceitual → o aluno escolhe "a mais
   profunda".
2. Distratores como afirmação genérica fora do tema → eliminação trivial.
3. **A correta nomeia o mecanismo da crítica** ("uma ironia dirigida ao absurdo de pagar
   para divulgar uma empresa de graça") → testa reconhecer a palavra "ironia", não
   interpretar.

**Como fazer.** Escrever a **correta primeiro**, como afirmação de síntese. Depois
escrever quatro outras afirmações de síntese, cada uma tomando uma posição diferente:

- leitura de face — toma a ironia como sincera, com pequena variação;
- inversão de tom — lê crítica como elogio, ou o contrário;
- moldura conceitual errada — ignorância vs. negação; sistêmico vs. individual; rebeldia
  vs. cumplicidade;
- presente em um só texto — verdadeira para o texto I mas não para o II (só em questão
  que cruza textos).

**Nunca explicar a piada no enunciado nem na alternativa.** Fica proibido, por herança
direta: enunciados do tipo "O humor da tirinha se baseia em" ou "A crítica consiste em".
O ENEM não usa, e o enunciado entrega a resposta.

Como não vamos ter tirinha nem charge, isso se transfere para: crônica, texto satírico,
comentário irônico dentro de um texto de opinião, letra de música, poema.

---

## 6. Fonte — BLOCKER absoluto

Questão de ENEM sempre cita fonte. Um agente que gera o texto de apoio **vai inventar**
essa linha se não for proibido.

**Nenhum texto gerado recebe autor, veículo, URL ou data de acesso fictícios.**

Três rótulos válidos, e só três:

```
#FONTE: Texto elaborado para este simulado.
#FONTE: <citação real e verificável>          — só com URL em mãos que responde
#FONTE: Domínio público — <obra, autor, ano>  — literatura e filosofia clássica
```

Lint determinístico (BLOCKER se casar em texto marcado como gerado):

```
/Dispon[íi]vel em:/i
/Acesso em:/i
/https?:\/\//
/\b(Folha|Estad[ãa]o|G1|BBC|El Pa[íi]s|Veja|Nature|Science|IBGE|IPCC)\b/
```

**Consequência de projeto:** questão que exige documento histórico real (carta, lei,
discurso) só pode ser gerada se o documento for de domínio público e o agente tiver o
texto de verdade. Caso contrário o slot é redistribuído. Isso vale principalmente para
História e Filosofia — e é por isso que o `fator_texto` desses assuntos não é 1.0 na
prática, mesmo sendo textuais.

---

## 7. Gabarito

Herdado, com a mudança para 5 letras.

- **[adaptado]** A-E o mais equilibrado possível. Em 45 questões: 9 de cada.
  Em contagem não divisível por 5, a diferença máxima entre a letra mais e a menos usada
  é 1.
- Nunca 3 letras iguais consecutivas.
- Nunca bloco de 5 repetido.
- Nunca ciclo `A-B-C-D-E-A-B-C-D-E`.

⚠️ **Lição do EPCAR:** no pipeline antigo, o `app.py` reembaralhava as alternativas na
montagem, então trabalhar a sequência de letras no gerador era esforço perdido. Aqui é o
**agente 8 (Montador)** que embaralha e balanceia. O gerador **não** deve tentar controlar
a letra da correta.

---

## 8. Limpeza da saída

- Nenhum rótulo interno na questão final (`VOC`, `INF`, `GRM`, `nivel_alvo`).
- Nenhum template de enunciado visível.
- Nenhum artefato de checklist ou de validação.
- Nenhuma marca de raciocínio do agente ("Vamos analisar...", "Como podemos ver...").

Os metadados existem — mas em campo separado do JSON, nunca no corpo da questão.
