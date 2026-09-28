#!/usr/bin/env python3
"""Gera sql/seed_pesos.sql a partir de data/pesos_incidencia.json.

O SQL gerado nao entra no git (ver .gitignore) — a fonte de verdade e o JSON.
Uso:  python3 scripts/gerar_seed_pesos.py && cat sql/seed_pesos.sql
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
d = json.loads((RAIZ / "data" / "pesos_incidencia.json").read_text())


def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


linhas = [
    "-- Gerado por scripts/gerar_seed_pesos.py. Nao editar a mao.",
    f"-- Fonte: data/pesos_incidencia.json v{d['versao']} ({d['atualizado_em']})",
    "",
    "begin;",
    "",
    "truncate table pesos_incidencia, pesos_disciplina;",
    "",
    "insert into pesos_disciplina",
    "  (area, disciplina, peso, slots_em_45, faixa_min, faixa_max, confianca, fonte)",
    "values",
]

vals = []
for area, discs in d["divisao_disciplinas"].items():
    for x in discs:
        faixa = x.get("faixa") or [None, None]
        vals.append(
            f"  ({q(area)}, {q(x['disciplina'])}, {q(x['peso'])}, {q(x['slots_em_45'])}, "
            f"{q(faixa[0])}, {q(faixa[1])}, {q(x['confianca'])}, {q(x.get('fonte'))})"
        )
linhas.append(",\n".join(vals) + ";")
n_disc = len(vals)

linhas += [
    "",
    "insert into pesos_incidencia",
    "  (id, area, disciplina, assunto, peso, slots_em_45, peso_recente, confianca, fator_texto, fonte)",
    "values",
]

vals = []
for a in d["assuntos"]:
    fonte = a.get("nota") or (f"n={a['n']}" if a.get("n") else None)
    vals.append(
        f"  ({q(a['id'])}, {q(a['area'])}, {q(a['disciplina'])}, {q(a['assunto'])}, "
        f"{q(a['peso'])}, {q(a['slots_em_45'])}, {q(a.get('peso_recente'))}, "
        f"{q(a['confianca'])}, {q(a.get('fator_texto', 1.0))}, {q(fonte)})"
    )

linhas.append(",\n".join(vals) + ";")
linhas += ["", "commit;", ""]

saida = RAIZ / "sql" / "seed_pesos.sql"
saida.write_text("\n".join(linhas))
print(f"{saida.relative_to(RAIZ)} — {n_disc} disciplinas, {len(vals)} assuntos")
