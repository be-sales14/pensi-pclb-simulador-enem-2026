# Banco de questões reais

Questões das provas oficiais do ENEM, regular, 2019 a 2025, os dois dias.

| Arquivo | O que é | No git? |
|---|---|---|
| `fontes.json` | quais PDFs do INEP entram, com a cor de caderno de cada um | sim |
| `questoes.jsonl` | uma questão por linha: ano, dia, caderno, número, língua, área, gabarito, anulada, texto extraído, onde está na página | sim |
| `img/<id>.png` | recorte da página oficial: **é o que o aluno vê** | não (74 MB; vai para o storage) |

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
