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
    "-- Upsert, nao truncate: questoes_enem referencia estas tabelas, e truncate quebraria",
    "-- (ou, com cascade, apagaria o banco de questoes).",
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
linhas.append(",\n".join(vals))
linhas.append("on conflict (area, disciplina) do update set peso = excluded.peso, slots_em_45 = excluded.slots_em_45,")
linhas.append("  faixa_min = excluded.faixa_min, faixa_max = excluded.faixa_max, confianca = excluded.confianca,")
linhas.append("  fonte = excluded.fonte, atualizado_em = now();")
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

linhas.append(",\n".join(vals))
linhas.append("on conflict (id) do update set area = excluded.area, disciplina = excluded.disciplina,")
linhas.append("  assunto = excluded.assunto, peso = excluded.peso, slots_em_45 = excluded.slots_em_45,")
linhas.append("  peso_recente = excluded.peso_recente, confianca = excluded.confianca,")
linhas.append("  fator_texto = excluded.fator_texto, fonte = excluded.fonte, atualizado_em = now();")
ids = ", ".join(q(a["id"]) for a in d["assuntos"])
linhas += ["", "-- Assunto que saiu do JSON sai do banco (falha alto se alguma questao ainda o usa).",
           f"delete from pesos_incidencia where id not in ({ids});", "", "commit;", ""]

saida = RAIZ / "sql" / "seed_pesos.sql"
saida.write_text("\n".join(linhas))
print(f"{saida.relative_to(RAIZ)} — {n_disc} disciplinas, {len(vals)} assuntos")
