# Rubrica de dificuldade

Como o agente 3 mede o nível real de uma questão. Cinco eixos, 1 a 3 pontos cada, soma de
5 a 15, mapeada numa escala de 1 a 9.

O ponto da rubrica não é acertar a dificuldade no absoluto — é ser **consistente**, para
que o simulado tenha a curva pedida e para que o relatório do aluno signifique algo.

---

## Os cinco eixos

### E1 · Carga de leitura

| Pontos | Critério |
|---:|---|
| 1 | Texto de apoio até 80 palavras, ou nenhum |
| 2 | 81 a 200 palavras |
| 3 | Acima de 200 palavras, ou dois textos para cruzar |

### E2 · Etapas de raciocínio

| Pontos | Critério |
|---:|---|
| 1 | Uma etapa. Localizar informação, aplicar uma fórmula direta |
| 2 | Duas etapas. Converter e então calcular; entender e então comparar |
| 3 | Três ou mais etapas, ou uma etapa que exige escolher o caminho antes de andar |

### E3 · Distância semântica até a alternativa correta

| Pontos | Critério |
|---:|---|
| 1 | **Literal.** A correta repete palavras do texto |
| 2 | **Paráfrase.** A correta reformula o que o texto diz |
| 3 | **Inferência ou síntese.** A correta afirma algo que o texto sustenta mas não diz |

Este é o eixo que mais separa questão de ENEM de questão de apostila. Muita questão gerada
por IA para em 1 e se apresenta como difícil por ter texto longo.

### E4 · Interferência dos distratores

| Pontos | Critério |
|---:|---|
| 1 | Três ou mais alternativas descartáveis por leitura superficial |
| 2 | Duas alternativas competem de verdade |
| 3 | Três ou mais alternativas competem; o descarte exige releitura do texto |

### E5 · Pré-requisito de conteúdo

| Pontos | Critério |
|---:|---|
| 1 | Nenhum. Resolve com o texto e senso comum |
| 2 | Um conceito de ensino médio |
| 3 | Dois ou mais conceitos, ou um conceito de baixa incidência em aula |

---

## Mapa soma → nível

| Soma | Nível (1-9) | Rótulo |
|---:|---:|---|
| 5 | 1 | fácil |
| 6 | 2 | fácil |
| 7 | 3 | fácil |
| 8 | 4 | médio |
| 9 | 5 | médio |
| 10 | 6 | médio |
| 11 | 7 | difícil |
| 12 | 8 | difícil |
| 13-15 | 9 | difícil |

**Veredito.** `APROVADO` se `|nivel_medido − nivel_alvo| <= 1`. Fora disso, o agente
devolve `ajuste_sugerido` apontando **qual eixo** mover e como:

> `nivel_alvo: 7, nivel_medido: 4. E3 está em 1 (a correta repete "impermeabilização do
> solo" do texto). Reescrever a correta como síntese do efeito, não como repetição do
> termo. E4 está em 1: as alternativas C e E são descartáveis pela extensão.`

Nunca "está fácil, deixe mais difícil". O agente 3 aponta eixo e mecanismo, senão o
revisor só engorda o texto — que sobe E1 e não muda dificuldade real.

---

## Curva-alvo do simulado

Default: `{ facil: 0.30, medio: 0.45, dificil: 0.25 }`.

Aplicada **dentro de cada assunto**, não no simulado inteiro:

- assunto com 1 slot → recebe o nível dominante da curva (médio);
- assunto com 2 slots → 1 médio + 1 sorteado entre fácil e difícil pela curva;
- assunto com 3+ slots → proporção da curva, arredondada por maior resto.

Sem isso, o rateio junta todas as difíceis num assunto e o aluno acha que não sabe
geometria quando o problema é que só a geometria veio difícil.

---

## Proxy de TRI — o que dá e o que não dá

O ENEM corrige por TRI, com três parâmetros por item: dificuldade (b), discriminação (a)
e acerto ao acaso (c). **Nada disso se estima sem resposta de aluno.** Um agente não
mede discriminação.

O que fazemos, então:

1. **Antes de qualquer aplicação:** só `nivel_medido` pela rubrica, apresentado como
   dificuldade estimada. Nunca chamado de "TRI".
2. **Depois de N respostas** (`N >= 30` por questão, gravadas em `respostas`):
   calcular por item o **percentual de acerto** e a **correlação ponto-bisserial** entre
   acertar o item e a nota total. Isso é análise clássica de item, é honesta e é
   calculável com SQL.
3. **Realimentar a rubrica.** Item com percentual de acerto muito distante do
   `nivel_medido` é sinal de que a rubrica erra naquele tipo. Item com correlação
   ponto-bisserial negativa é item defeituoso — provavelmente gabarito errado ou
   ambiguidade que o solver cego não pegou. Vai para revisão humana.

O passo 3 é o que fecha o ciclo: o aluno respondendo é o único avaliador de nível que não
é um agente.
