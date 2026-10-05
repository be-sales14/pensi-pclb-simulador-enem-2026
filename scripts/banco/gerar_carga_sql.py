#!/usr/bin/env python3
"""Gera o SQL que carrega o banco (questoes + classificacao + imagem no S3) em questoes_enem.

Saida: data/banco/carga/carga_NN.sql (fora do git: tem o mapa id -> nome opaco da imagem,
que o repo publico nao pode ter). Cada arquivo e um upsert: rodar de novo nao duplica.

Ano, dia, numero, lingua, area, caderno e cor saem do proprio id no SQL, para o arquivo
ficar pequeno.

Uso:  python3 scripts/banco/gerar_carga_sql.py [--lote 330]
"""
import argparse
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
FONTE = {"indahouse-crm/dataset_mt": "mt", "indahouse-crm/leitura_manual": "manual"}

CABECA = """insert into public.questoes_enem
  (id, ano, dia, caderno, cor, numero, lingua, area, disciplina, disciplina_secundaria,
   assunto_id, classificacao_fonte, gabarito, anulada, grupo, imagem_url, imagem_largura, imagem_altura)
select v.id, x.ano, x.dia,
       case when x.dia = 1 then 1 when x.ano = 2025 then 5 else 7 end,
       case when x.dia = 2 and x.ano = 2025 then 'amarela' else 'azul' end,
       x.numero,
       case when v.id like '%\\_in' then 'ingles' when v.id like '%\\_es' then 'espanhol' end,
       case when x.dia = 1 then case when x.numero <= 45 then 'LC' else 'CH' end
            else case when x.numero <= 135 then 'CN' else 'MT' end end,
       v.disc, v.sec, v.assunto,
       case v.fonte when 'mt' then 'indahouse-crm/dataset_mt'
                    when 'mt0' then 'indahouse-crm/dataset_mt (sem assunto: enunciado so em imagem)'
                    when 'manual' then 'indahouse-crm/leitura_manual'
                    when 'cn' then 'leitura por LLM, conferida' end,
       v.gab, v.gab is null, v.grupo, '{base}/' || v.img, v.w, v.h
from (values
{linhas}
) as v(id, img, gab, disc, sec, assunto, fonte, grupo, w, h)
cross join lateral (select substr(v.id, 1, 4)::smallint as ano, substr(v.id, 7, 1)::smallint as dia,
                           substr(v.id, 10, 3)::smallint as numero) x
on conflict (id) do update set
  disciplina = excluded.disciplina, disciplina_secundaria = excluded.disciplina_secundaria,
  assunto_id = excluded.assunto_id, classificacao_fonte = excluded.classificacao_fonte,
  gabarito = excluded.gabarito, anulada = excluded.anulada, grupo = excluded.grupo,
  imagem_url = excluded.imagem_url, imagem_largura = excluded.imagem_largura,
  imagem_altura = excluded.imagem_altura;
"""


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lote", type=int, default=330)
    args = ap.parse_args()
    rs = [json.loads(l) for l in (RAIZ / "data/banco/questoes.jsonl").read_text().splitlines()]
    cls = json.loads((RAIZ / "data/banco/classificacao.json").read_text())
    s3 = json.loads((RAIZ / "data/banco/imagens_s3.json").read_text())
    sem = [r["id"] for r in rs if not cls[r["id"]]["disciplina"]]
    if sem:
        raise SystemExit(f"{len(sem)} questoes sem disciplina, rode classificar.py antes: {sem[:5]}")

    linhas = []
    for r in rs:
        c = cls[r["id"]]
        fonte = FONTE.get(c["fonte"], "mt0" if r["area"] == "MT" else "cn")
        w, h = r["img_px"]
        linhas.append(f"({q(r['id'])},{q(s3['imagens'][r['id']])},{q(r['gabarito'])},{q(c['disciplina'])},"
                      f"{q(c['disciplina_secundaria'])},{q(c['assunto_id'])},{q(fonte)},{q(r.get('grupo'))},{w},{h})")
    pasta = RAIZ / "data/banco/carga"
    pasta.mkdir(exist_ok=True)
    for f in pasta.glob("carga_*.sql"):
        f.unlink()
    for i in range(0, len(linhas), args.lote):
        parte = linhas[i:i + args.lote]
        sql = CABECA.replace("{base}", s3["url_base"]).replace("{linhas}", ",\n".join(parte))
        arq = pasta / f"carga_{i // args.lote + 1:02d}.sql"
        arq.write_text(sql)
        print(f"{arq.relative_to(RAIZ)}: {len(parte)} questoes, {len(sql) // 1024} KB")


if __name__ == "__main__":
    main()
