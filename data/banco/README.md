# Banco de questões reais

Questões das provas oficiais do ENEM, regular, 2019 a 2025, os dois dias.

| Arquivo | O que é | No git? |
|---|---|---|
| `fontes.json` | quais PDFs do INEP entram, com a cor de caderno de cada um | sim |
| `questoes.jsonl` | uma questão por linha: ano, dia, caderno, número, língua, área, gabarito, anulada, texto extraído, onde está na página | sim |
| `classificacao_cn.json` | disciplina de cada questão de Natureza (Biologia, Física, Química), lida por LLM e conferida | sim |
| `classificacao.json` | disciplina (e assunto em MT) de todas as questões; gerado por `scripts/banco/classificar.py` | sim |
| `img/<id>.png` | recorte da página oficial: **é o que o aluno vê** | não (74 MB; está no S3) |
| `imagens_s3.json`, `carga/` | mapa id → nome opaco no S3 e o SQL de carga | **não**: o repo é público e o mapa entregaria o gabarito |

`id` = `<ano>_D<dia>_Q<número>[_in|_es]`, por exemplo `2023_D2_Q164`, `2021_D1_Q005_es`.

## Números

- 1.295 registros: 7 edições × (95 do dia 1 + 90 do dia 2). No dia 1, as questões 1 a 5
  existem duas vezes, em inglês e em espanhol.
- 9 anuladas pelo INEP (`anulada: true`, `gabarito: null`). Nunca entram em simulado.
- 5 questões em grupo (2025, dia 1, 06 a 10): dividem um texto, que vai repetido no
  recorte de cada uma. `grupo` marca isso.

## Como foi conferido

- Contagem fecha em todos os 14 cadernos: nenhuma questão faltando ou duplicada.
- Gabarito confrontado com os levantamentos independentes do `indahouse-crm`:
  **1.160 de 1.160 iguais** (CH, LC, CN e MT 2020-2025). 2019 D2 (caderno 7) não tem
  segunda fonte: o gabarito veio direto do INEP.
- Recortes conferidos a olho: casos difíceis (questão de largura total, figura sobre a
  calha, tirinha, questão que continua na outra página ou coluna) e amostra aleatória.

## Armadilhas que o extrator já trata

- **A numeração muda com a cor do caderno.** Prova e gabarito sempre da mesma cor.
- 2019 tem fio vertical entre as colunas; 2022 tem um texto vertical "ENEM 2022" no mesmo lugar.
- 2021 tem uma camada de texto ilegível por cima do texto real, e o pdftotext às vezes
  junta numa linha o texto das duas colunas.
- 2025 dia 2 (caderno 5) é prova de gráfica: tem marcas de corte e lista de cores na margem.
- O `2019_GB_impresso_D2_CD7.pdf` do `kb_enem` é uma página de erro 404 salva como PDF.

## Regerar

```bash
python3 scripts/banco/extrair_questoes.py            # ~6 min, todos os cadernos
python3 scripts/banco/extrair_questoes.py --so 2023_D2
```

Precisa de `pdftotext`/`pdftoppm` (poppler) e Pillow, e dos PDFs em `~/Documents/kb_enem`
(caminho em `--kb`). Os dois gabaritos baixados do INEP ficam em `data/fontes/`.

## Classificação

| Área | Nível | Fonte |
|---|---|---|
| MT | assunto (285 de 315; 30 têm o enunciado só em imagem e ficam sem assunto) | `indahouse-crm/docs/enem/dataset_mt_2015_2025.json` |
| CH, LC | disciplina, com secundária quando a leitura manual marcou duas | `indahouse-crm/.../leitura_manual/<ano>.md` |
| CN | disciplina | leitura por LLM de cada questão (`classificacao_cn.json`) |

A classificação de CN por palavra-chave do `indahouse-crm` deixava 56 de 315 sem rótulo e
subcontava Química (34 no total). A leitura por LLM dá ~15/15/15 por ano em todos os anos,
que é como a prova é montada; as 37 divergências com a palavra-chave em 2020-2025 foram
conferidas pelo motivo declarado e favorecem a leitura nova. 32 questões ficaram com
confiança baixa: são as interdisciplinares, e todas têm `disciplina_secundaria`.

Média por ano no banco contra a divisão oficial (`pesos_disciplina`): todas as disciplinas
ficam a menos de 1 questão do oficial (ex.: Geografia 14,7 vs 15; Português 23,3 vs 23).

## No Supabase

Tabela `questoes_enem` (migration `sql/003_banco_enem.sql`), 1.295 linhas, conferida por
impressão digital contra os arquivos locais. O browser só lê `questoes_enem_publicas`:
sem gabarito, sem ano, sem número, sem anuladas (1.286 linhas). A tabela tem RLS sem
policy **e** nenhum grant para `anon`/`authenticated`.

Recarregar depois de mudar classificação ou recorte:

```bash
python3 scripts/banco/classificar.py
python3 scripts/banco/enviar_imagens_s3.py     # só reenvia imagem que mudou
python3 scripts/banco/gerar_carga_sql.py       # gera data/banco/carga/*.sql (upsert)
```
