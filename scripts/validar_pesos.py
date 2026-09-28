#!/usr/bin/env python3
"""Valida os pesos de incidência. Critério de pronto da Fase 0.

Uso:  python3 scripts/validar_pesos.py            # valida data/pesos_incidencia.json
      python3 scripts/validar_pesos.py --banco    # valida o que está no Supabase
                                                  # (precisa de DATABASE_URL e psql)
Sai com código 1 se qualquer invariante quebrar.
"""
import json, os, subprocess, sys, collections
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

CONF_ASSUNTO = {"medido", "catalogado", "provisorio"}
CONF_DISCIPLINA = CONF_ASSUNTO | {"edital"}

SQL_BANCO = """
select json_build_object(
  'divisao_disciplinas', (
    select json_object_agg(area, ds) from (
      select area, json_agg(json_build_object(
               'disciplina', disciplina, 'slots_em_45', slots_em_45,
               'confianca', confianca) order by disciplina) as ds
      from pesos_disciplina group by area) t),
  'assuntos', (
    select json_agg(json_build_object(
             'id', id, 'area', area, 'disciplina', disciplina, 'peso', peso,
             'slots_em_45', slots_em_45, 'confianca', confianca,
             'fator_texto', fator_texto) order by id)
    from pesos_incidencia)
)
"""


def carregar_arquivo():
    return json.loads((RAIZ / "data" / "pesos_incidencia.json").read_text())


def carregar_banco():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL nao definida. Pegue a connection string em "
                 "Supabase > Project Settings > Database.")
    r = subprocess.run(["psql", url, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", SQL_BANCO],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"psql falhou:\n{r.stderr}")
    d = json.loads(r.stdout)
    return {"divisao_disciplinas": d["divisao_disciplinas"] or {},
            "assuntos": d["assuntos"] or []}


def validar(d):
    erros, avisos = [], []

    # 1. cada área soma 45 na divisão por disciplina
    for area, discs in d["divisao_disciplinas"].items():
        s = sum(x["slots_em_45"] for x in discs)
        if s != 45:
            erros.append(f"{area}: disciplinas somam {s}, esperado 45")
        for x in discs:
            if x["confianca"] not in CONF_DISCIPLINA:
                erros.append(f"{area}/{x['disciplina']}: confianca '{x['confianca']}' invalida")

    # 2. cada área soma 45 na divisão por assunto
    por_area = collections.Counter()
    por_disc = collections.Counter()
    for a in d["assuntos"]:
        por_area[a["area"]] += a["slots_em_45"]
        por_disc[(a["area"], a["disciplina"])] += a["slots_em_45"]
    for area in ("LC", "CH", "CN", "MT"):
        if por_area[area] != 45:
            erros.append(f"{area}: assuntos somam {por_area[area]}, esperado 45")

    # 3. disciplina e seus assuntos batem
    for area, discs in d["divisao_disciplinas"].items():
        for x in discs:
            got = por_disc[(area, x["disciplina"])]
            if got != x["slots_em_45"]:
                erros.append(f"{area}/{x['disciplina']}: disciplina diz {x['slots_em_45']}, "
                             f"assuntos somam {got}")

    # 4. total 180
    total = sum(por_area.values())
    if total != 180:
        erros.append(f"total de slots {total}, esperado 180")

    # 5. fator_texto no intervalo, confianca em domínio válido
    for a in d["assuntos"]:
        if not 0 <= a.get("fator_texto", 1) <= 1:
            erros.append(f"{a['id']}: fator_texto fora de [0,1]")
        if a["confianca"] not in CONF_ASSUNTO:
            erros.append(f"{a['id']}: confianca '{a['confianca']}' invalida")

    # 6. avisos: peso >= 5% com 0 slot; assunto provisorio
    for a in d["assuntos"]:
        if a["peso"] >= 5 and a["slots_em_45"] == 0:
            avisos.append(f"{a['id']}: peso {a['peso']}% com 0 slot — checar piso minimo")
        if a["confianca"] == "provisorio":
            avisos.append(f"{a['id']}: PROVISORIO — nao publicar como medido")

    return total, erros, avisos


def comparar(banco, arquivo):
    """O banco tem que ser o JSON semeado. Diferença = alguém esqueceu de semear."""
    campos = ("area", "disciplina", "peso", "slots_em_45", "confianca", "fator_texto")
    b = {a["id"]: a for a in banco["assuntos"]}
    f = {a["id"]: a for a in arquivo["assuntos"]}
    erros = [f"{i}: existe no JSON, falta no banco" for i in sorted(f.keys() - b.keys())]
    erros += [f"{i}: existe no banco, falta no JSON" for i in sorted(b.keys() - f.keys())]
    for i in sorted(f.keys() & b.keys()):
        for c in campos:
            vf, vb = f[i].get(c, 1.0 if c == "fator_texto" else None), b[i][c]
            if vf != vb and not (isinstance(vf, (int, float)) and isinstance(vb, (int, float))
                                 and abs(vf - vb) < 1e-9):
                erros.append(f"{i}.{c}: JSON={vf} banco={vb}")
    return erros


if __name__ == "__main__":
    no_banco = "--banco" in sys.argv
    d = carregar_banco() if no_banco else carregar_arquivo()
    total, erros, avisos = validar(d)
    if no_banco:
        erros += [f"divergencia: {e}" for e in comparar(d, carregar_arquivo())]

    origem = "banco" if no_banco else "arquivo"
    print(f"[{origem}] {len(d['assuntos'])} assuntos, {total} slots\n")
    for a in avisos:
        print(f"  aviso  {a}")
    if erros:
        print()
        for e in erros:
            print(f"  ERRO   {e}")
        sys.exit(1)
    print("\nOK — todas as invariantes fecham.")
