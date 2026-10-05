#!/usr/bin/env python3
"""Junta a classificacao de cada questao do banco (data/banco/questoes.jsonl).

Fontes:
  MT  assunto questao a questao: indahouse-crm/docs/enem/dataset_mt_2015_2025.json
      (caderno 7 de 2019 a 2024, caderno 5 em 2025: a mesma numeracao do nosso banco)
  CH  disciplina, leitura manual: indahouse-crm/.../ciencias-humanas-corpus/pesquisa/leitura_manual/<ano>.md
  LC  disciplina, leitura manual: indahouse-crm/.../linguagens-corpus/pesquisa/leitura_manual/<ano>.md
  CN  disciplina: data/banco/classificacao_cn.json (leitura por LLM de cada questao, conferida
      contra a classificacao por palavra-chave do indahouse-crm; ver data/banco/README.md)

Saida: data/banco/classificacao.json  { id: {disciplina, disciplina_secundaria, assunto_id, fonte} }
Uso:   python3 scripts/banco/classificar.py
"""
import collections
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CRM = Path.home() / "Documents/GitHub/indahouse-crm/docs"

# Nome do topico no estudo de MT -> id em pesos_incidencia
TOPICO_MT = {
    "razao_proporcao": "MT.razao_proporcao", "numeros": "MT.numeros_raciocinio",
    "geo_plana": "MT.geometria_plana", "geo_espacial": "MT.geometria_espacial",
    "funcao": "MT.funcoes", "estatistica": "MT.estatistica",
    "graficos_tabelas": "MT.graficos_tabelas", "porcentagem": "MT.porcentagem",
    "probabilidade": "MT.probabilidade", "combinatoria": "MT.combinatoria",
    "mat_financeira": "MT.financeira", "sequencias": "MT.sequencias",
    "geo_analitica": "MT.geometria_analitica",
}
# Rotulo da leitura manual -> disciplina em pesos_disciplina
DISCIPLINA = {
    "geografia": "Geografia", "historia": "Historia", "sociologia": "Sociologia", "filosofia": "Filosofia",
    "portugues": "Portugues", "literatura": "Literatura", "artes": "Artes",
    "educacao fisica": "Educacao Fisica",
    "lingua estrangeira (ingles)": "Lingua estrangeira", "lingua estrangeira (espanhol)": "Lingua estrangeira",
    "biologia": "Biologia", "fisica": "Fisica", "quimica": "Quimica",
}


def chave(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def ler_tabelas_manuais(pasta):
    """{(ano, numero, lingua): [rotulos]} a partir das tabelas | Questao | Materia | ... |."""
    saida = {}
    for arq in sorted((CRM / pasta).glob("*.md")):
        ano = int(arq.stem)
        for linha in arq.read_text().splitlines():
            if not re.match(r"^\|\s*\d{1,2}\s*\|", linha):
                continue
            celulas = [c.strip() for c in re.split(r"(?<!\\)\|", linha)[1:-1]]
            n, materia = int(celulas[0]), celulas[1]
            rotulos = [chave(r) for r in materia.split("\\|")]
            lingua = None
            if n <= 5 and rotulos[0].startswith("lingua estrangeira"):
                lingua = "ingles" if "ingles" in rotulos[0] else "espanhol"
            saida[(ano, n, lingua)] = rotulos
    return saida


def main():
    rs = [json.loads(l) for l in (RAIZ / "data/banco/questoes.jsonl").read_text().splitlines()]
    mt = json.loads((CRM / "enem/dataset_mt_2015_2025.json").read_text())
    ch = ler_tabelas_manuais("ebooks/ciencias-humanas-corpus/pesquisa/leitura_manual")
    lc = ler_tabelas_manuais("ebooks/linguagens-corpus/pesquisa/leitura_manual")
    cn_arq = RAIZ / "data/banco/classificacao_cn.json"
    cn = json.loads(cn_arq.read_text()) if cn_arq.exists() else {}

    saida, faltam = {}, collections.Counter()
    for r in rs:
        c = {"disciplina": None, "disciplina_secundaria": None, "assunto_id": None, "fonte": None}
        if r["area"] == "MT":
            c["disciplina"] = "Matematica"
            topico = mt.get(str(r["ano"]), {}).get(str(r["numero"]))
            c["assunto_id"] = TOPICO_MT.get(topico)
            if topico and not c["assunto_id"]:
                sys.exit(f"topico de MT sem par em pesos_incidencia: {topico}")
            c["fonte"] = "indahouse-crm/dataset_mt" if topico else "indahouse-crm/dataset_mt (sem assunto: enunciado so em imagem)"
        elif r["area"] in ("CH", "LC"):
            tab = ch if r["area"] == "CH" else lc
            rot = tab.get((r["ano"], r["numero"], r["lingua"]))
            if rot:
                c["disciplina"] = DISCIPLINA[rot[0]]
                if len(rot) > 1:
                    c["disciplina_secundaria"] = DISCIPLINA[rot[1]]
                c["fonte"] = "indahouse-crm/leitura_manual"
        elif r["area"] == "CN" and r["id"] in cn:
            c["disciplina"] = cn[r["id"]]["disciplina"]
            c["disciplina_secundaria"] = cn[r["id"]].get("secundaria")
            c["fonte"] = "leitura por LLM, conferida (classificacao_cn.json)"
        if not c["disciplina"]:
            faltam[r["area"]] += 1
        saida[r["id"]] = c

    (RAIZ / "data/banco/classificacao.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n")

    # Conferencia: disciplinas por ano, contra a divisao oficial de pesos_disciplina.
    oficial = {(a, d["disciplina"]): d["slots_em_45"] for a, ds in
               json.loads((RAIZ / "data/pesos_incidencia.json").read_text())["divisao_disciplinas"].items() for d in ds}
    area_de = {r["id"]: r["area"] for r in rs}
    por = collections.Counter((area_de[i], c["disciplina"]) for i, c in saida.items()
                              if c["disciplina"] and not i.endswith("_es"))
    print("disciplina         banco (7 anos)  media/ano  oficial em 45")
    for (a, d), n in sorted(por.items()):
        print(f"  {a} {d:18} {n:5}           {n / 7:5.1f}      {oficial.get((a, d), '-')}")
    sem_assunto = sum(1 for i, c in saida.items() if area_de[i] == "MT" and not c["assunto_id"])
    print(f"\nsem disciplina: {dict(faltam) or 'nenhuma'} | MT sem assunto: {sem_assunto}")
    sys.exit(1 if faltam else 0)


if __name__ == "__main__":
    main()
