#!/usr/bin/env python3
"""Extrai as questoes das provas oficiais do ENEM (PDF do INEP) para o banco.

Para cada caderno listado em data/banco/fontes.json:
  1. acha os marcadores "QUESTAO NN" com posicao (pdftotext -bbox-layout);
  2. divide cada pagina em faixas de duas colunas e faixas de largura total, olhando a
     tinta na calha entre as colunas (pega texto, imagem e grafico vetorial do mesmo jeito);
  3. recorta cada questao da pagina renderizada, seguindo a questao entre colunas e paginas;
  4. le o gabarito oficial do PDF de gabarito, incluindo questoes anuladas.

Saida: data/banco/questoes.jsonl (um registro por questao) e data/banco/img/*.png.
O recorte da pagina e o que o aluno ve; o texto extraido serve para busca e classificacao.

Uso:  python3 scripts/banco/extrair_questoes.py [--so 2023_D2] [--kb ~/Documents/kb_enem]
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[2]
DPI = 150
ESC = DPI / 72.0                       # pontos do PDF -> pixels
TINTA = 235                            # qualquer cinza visivel conta: figura clara (parede azul, grade de grafico) e conteudo

MARCADOR = re.compile(r"^QUEST[ÃA]O\s*(\d{1,3})$", re.I)
CABECALHO = re.compile(r"^\*[A-Z0-9]+\*$|^\d+º DIA$|^\d{2}$|enem\s*20\d\d|^Exame Nacional do Ensino M[ée]dio$|^20\d\d$|^(ENEM20\d\d){2,}", re.I)
# Sinais de cabecalho que valem ate 13% da altura (o de 2025 e mais baixo). "NN" sozinho so no topo.
CABECALHO_FORTE = re.compile(r"^\*[A-Z0-9]+\*$|^\d+º DIA$|enem\s*20\d\d|^Exame Nacional do Ensino M[ée]dio$|^(ENEM20\d\d){2,}", re.I)
TEXTO_COMUM = re.compile(r"^Textos? para as quest(ões|oes) (de )?(\d{1,3}) (a|e) (\d{1,3})", re.I)
RODAPE = re.compile(r"•\s*\d+º DIA|CADERNO \d+|Página \d+|^\d{1,2}$", re.I)
FAIXA_DE_AREA = re.compile(
    r"E SUAS TECNOLOGIAS|^Quest(ões|oes) de \d+ a \d+|opç[ãa]o (ingl[êe]s|espanhol)"
    r"|^(LINGUAGENS|CIÊNCIAS|MATEMÁTICA)\b", re.I)
PAGINA_FORA = re.compile(r"INSTRUÇÕES PARA A REDAÇÃO|PROPOSTA DE REDAÇÃO|RASCUNHO|"
                         r"Transcreva a sua Redação|LEIA ATENTAMENTE AS INSTRUÇÕES", re.I)


# ------------------------------------------------------------------ leitura do PDF

def linhas_por_pagina(pdf):
    with tempfile.NamedTemporaryFile(suffix=".html") as f:
        subprocess.run(["pdftotext", "-bbox-layout", str(pdf), f.name], check=True)
        h = Path(f.name).read_text(encoding="utf-8")
    paginas = []
    for w, hh, corpo in re.findall(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', h, re.S):
        linhas = []
        for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', corpo, re.S):
            palavras = [(tuple(map(float, w[:4])), html.unescape(w[4])) for w in re.findall(
                r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', m.group(5))]
            # Em 2021 o "Questao NN" vem grudado no fim de uma linha de texto oculto. O marcador
            # vira uma linha propria, com a caixa so das duas palavras.
            for k in range(len(palavras) - 1):
                (a, ta), (b, tb) = palavras[k], palavras[k + 1]
                if re.fullmatch(r"QUEST[ÃA]O", ta, re.I) and re.fullmatch(r"\d{1,3}", tb) and len(palavras) > 2:
                    linhas.append({"x0": a[0], "y0": min(a[1], b[1]), "x1": b[2], "y1": max(a[3], b[3]), "t": f"{ta} {tb}"})
                    palavras = palavras[:k] + palavras[k + 2:]
                    break
            texto = " ".join(t for _, t in palavras).strip()
            # 2021 tem uma camada de texto ilegivel (caracteres de controle) que atravessa as
            # colunas. Ela confundiria a deteccao de questao larga: fica de fora.
            controle = sum(1 for c in texto if ord(c) < 32 or 0x7f <= ord(c) < 0xa0)
            if texto and controle > 0.2 * len(texto):
                continue
            if texto:
                x0 = min(c[0] for c, _ in palavras); x1 = max(c[2] for c, _ in palavras)
                y0 = min(c[1] for c, _ in palavras); y1 = max(c[3] for c, _ in palavras)
                linhas.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": texto,
                               "ws": [(c[0], c[2]) for c, _ in palavras]})
        # As vezes "Questao" e "NN" saem em linhas separadas (2021): junta pelo vizinho a direita.
        for l in [l for l in linhas if re.fullmatch(r"QUEST[ÃA]O", l["t"], re.I)]:
            for o in linhas:
                m = re.match(r"(\d{1,3})\b\s*(.*)", o["t"])
                if m and abs(o["y0"] - l["y0"]) < 4 and 0 <= o["x0"] - l["x1"] < 20:
                    l["t"] = f"{l['t']} {m.group(1)}"
                    l["x1"] = o["x0"] + 6 * len(m.group(1))
                    if m.group(2):
                        o["t"] = m.group(2)
                    else:
                        linhas.remove(o)
                    break
        paginas.append({"w": float(w), "h": float(hh), "linhas": linhas})
    return paginas


def renderizar(pdf, pasta):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-png", str(pdf), str(pasta / "p")], check=True)
    arqs = sorted(pasta.glob("p-*.png"), key=lambda p: int(p.stem.split("-")[1]))
    return [Image.open(a).convert("L") for a in arqs]


# ------------------------------------------------------------------ layout de uma pagina

def e_conteudo(l, pag):
    """Linha que faz parte da prova: nao e cabecalho/logo, nem marca de grafica na margem
    (a prova de 2025 caderno 5 e uma prova de grafica com 'Capa' e lista de cores na borda)."""
    vertical = l["y1"] - l["y0"] > 40 and l["x1"] - l["x0"] < 12
    return (not vertical and not CABECALHO.search(l["t"]) and l["x0"] >= 22 and l["x1"] <= pag["w"] - 22
            and not re.match(r"^(ENEM20\d\d){2,}", l["t"], re.I))


def fio_horizontal(img, y0, y1, de_baixo=False):
    """Primeira linha de pixel (em pt) entre y0 e y1 com um fio cobrindo 40%+ da largura."""
    w = img.width
    ys = range(int(y1 * ESC), int(y0 * ESC), -1) if de_baixo else range(int(y0 * ESC), int(y1 * ESC))
    for y in ys:
        if 0 <= y < img.height:
            linha = img.crop((0, y, w, y + 1)).tobytes()
            maior = atual = 0
            for v in linha:
                atual = atual + 1 if v < TINTA else 0
                maior = max(maior, atual)
            if maior > 0.4 * w:        # traco continuo: linha de texto sempre tem vao entre letras
                return y / ESC
    return None


def zona_de_conteudo(pag, img):
    """Topo e base uteis da pagina, em pontos: tira cabecalho (codigo de barras, logo e o fio
    abaixo dele) e rodape. O logo "enem 20xx" e desenho, nao texto: so o fio o denuncia."""
    # So faixa horizontal baixa conta como cabecalho. Em 2022 o fio entre as colunas e um texto
    # vertical "ENEM 2022 ENEM 2022..." de cima a baixo: casaria com o padrao do logo.
    cab = [l["y1"] for l in pag["linhas"] if l["y1"] - l["y0"] < 30 and (
           (l["y0"] < 60 and CABECALHO.search(l["t"])) or (l["y0"] < 0.13 * pag["h"] and CABECALHO_FORTE.search(l["t"])))]
    rod = [l["y0"] for l in pag["linhas"] if l["y0"] > pag["h"] * 0.9 and RODAPE.search(l["t"])]
    topo = max(cab) + 4 if cab else 50
    base = min(rod) - 3 if rod else pag["h"] - 45
    primeira = min((l["y0"] for l in pag["linhas"] if l["y0"] > topo and not CABECALHO.search(l["t"])), default=topo + 30)
    fio = fio_horizontal(img, topo, min(topo + 30, primeira - 1))
    if fio is not None:
        topo = fio + 3
    fio = fio_horizontal(img, base - 20, base, de_baixo=True)
    if fio is not None and fio > base - 20:
        ultima = max((l["y1"] for l in pag["linhas"] if l["y1"] < fio), default=0)
        if ultima < fio - 1:
            base = fio - 3
    return topo, base


def celulas(img, pag):
    """Celulas da pagina em ordem de leitura: (x0, y0, x1, y1) em pontos.

    O ENEM diagrama em duas colunas, e uma questao inteira pode ocupar a largura da pagina.
    Questao larga e reconhecida pelas primeiras linhas de texto depois do marcador: elas
    atravessam o meio da pagina. A faixa larga vai do marcador ate o proximo marcador abaixo
    (em qualquer coluna). O resto da pagina e lido como duas colunas, esquerda e depois
    direita. Decidir por questao, e nao por linha de pixel, mantem figuras inteiras."""
    topo, base = zona_de_conteudo(pag, img)
    meio = pag["w"] / 2
    linhas = [l for l in pag["linhas"] if topo <= l["y0"] <= base and e_conteudo(l, pag)]
    xs, xe = [l["x0"] for l in linhas], [l["x1"] for l in linhas]
    esq = max(15, min(xs) - 6) if xs else 25
    dir_ = min(pag["w"] - 15, max(xe) + 6) if xe else pag["w"] - 25
    mks = sorted((l for l in linhas if MARCADOR.match(l["t"])), key=lambda l: l["y0"])

    def atravessa(l):
        """A linha cruza a calha de verdade. O pdftotext as vezes junta numa linha so o texto
        das duas colunas (2021): ai ha um vao de 8+ pt exatamente no meio, e nao conta."""
        if not (l["x0"] < meio - 4 and l["x1"] > meio + 4):
            return False
        ws = sorted(l.get("ws") or [(l["x0"], l["x1"])])
        if any(a < meio + 1 and b > meio - 1 for a, b in ws):
            return True
        return any(b1 < meio < a2 and a2 - b1 < 6 for (_, b1), (a2, _) in zip(ws, ws[1:]))

    def comeca_largo(y_ini, y_fim):
        ls = sorted((l for l in linhas if y_ini <= l["y0"] < y_fim and not MARCADOR.match(l["t"])
                     and not FAIXA_DE_AREA.search(l["t"])), key=lambda l: l["y0"])[:6]
        return any(atravessa(l) for l in ls)

    largas = []
    for m in mks:
        if m["x0"] > meio:
            continue                       # marcador na coluna direita: questao de coluna
        abaixo = [o["y0"] for o in mks if o["y0"] > m["y0"] + 5]
        fim = min(abaixo) - 3 if abaixo else base
        if comeca_largo(m["y1"], min(fim, m["y1"] + 80)):
            largas.append([m["y0"] - 3, fim])
    primeiro = mks[0]["y0"] - 3 if mks else base
    if primeiro - topo > 10 and comeca_largo(topo, min(primeiro, topo + 80)):
        largas.append([topo, primeiro])    # continuacao larga vinda da pagina anterior
    largas.sort()
    juntas = []
    for a, b in largas:
        if juntas and a <= juntas[-1][1] + 1:
            juntas[-1][1] = max(juntas[-1][1], b)
        else:
            juntas.append([a, b])
    saida, y = [], topo
    for a, b in juntas:
        if a - y > 2:
            saida += [(esq, y, meio - 2, a), (meio + 2, y, dir_, a)]
        saida.append((esq, a, dir_, b))
        y = b
    if base - y > 2:
        saida += [(esq, y, meio - 2, base), (meio + 2, y, dir_, base)]
    return saida


def tem_tinta(img, r, linhas_min=6):
    """Ha conteudo de verdade na regiao: tinta em pelo menos 6 linhas de pixel.
    Fio horizontal de cabecalho ou separador tem 1 a 3 e nao conta."""
    x0, y0, x1, y1 = (int(v * ESC) for v in r)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return False
    reg = img.crop((x0, y0, x1, y1)).point(lambda v: 255 if v < TINTA else 0)
    w, h = reg.size
    linhas = sum(1 for y in range(h) if reg.crop((0, y, w, y + 1)).getbbox())
    return linhas >= linhas_min


# ------------------------------------------------------------------ segmentacao

def segmentar(pdf, ano, dia):
    paginas = linhas_por_pagina(pdf)
    with tempfile.TemporaryDirectory() as tmp:
        imgs = renderizar(pdf, Path(tmp))
        questoes, atual, vistos, comuns = [], None, {}, []
        for ip, (pag, img) in enumerate(zip(paginas, imgs), start=1):
            texto_pag = " ".join(l["t"] for l in pag["linhas"])
            marcadores = [l for l in pag["linhas"] if MARCADOR.match(l["t"]) or TEXTO_COMUM.match(l["t"])]
            topo, base = zona_de_conteudo(pag, img)
            conteudo = [l for l in pag["linhas"] if topo <= l["y0"] <= base and e_conteudo(l, pag)]
            if not marcadores and (PAGINA_FORA.search(texto_pag) or not conteudo):
                atual = None          # redacao, instrucao, contracapa: corta a continuacao
                continue
            cels = celulas(img, pag)
            # Cada marcador pertence a UMA celula: a que contem o centro dele, ou a mais proxima.
            def dist(l, c):
                cx, cy = (l["x0"] + l["x1"]) / 2, (l["y0"] + l["y1"]) / 2
                return max(c[0] - cx, 0, cx - c[2]) + max(c[1] - cy, 0, cy - c[3])
            dono = {id(m): min(range(len(cels)), key=lambda i: dist(m, cels[i])) for m in marcadores}
            for ic, cel in enumerate(cels):
                cx0, cy0, cx1, cy1 = cel
                dentro = lambda l: cx0 - 2 <= (l["x0"] + l["x1"]) / 2 <= cx1 + 2 and cy0 - 2 <= (l["y0"] + l["y1"]) / 2 <= cy1 + 2
                mks = sorted((m for m in marcadores if dono[id(m)] == ic), key=lambda l: l["y0"])
                faixa_area = [l for l in pag["linhas"] if dentro(l) and FAIXA_DE_AREA.search(l["t"])
                              and (not mks or l["y0"] < mks[0]["y0"])]
                inicio = max([cy0] + [l["y1"] + 2 for l in faixa_area])
                fim_faixa = max([l["y1"] + 1 for l in faixa_area], default=-1)
                cortes = [inicio] + [max(m["y0"] - 3, fim_faixa) for m in mks] + [cy1]
                for k in range(len(cortes) - 1):
                    r = (cx0, cortes[k], cx1, cortes[k + 1])
                    if k > 0 and TEXTO_COMUM.match(mks[k - 1]["t"]):
                        mt = TEXTO_COMUM.match(mks[k - 1]["t"])
                        atual = {"comum": (int(mt.group(3)), int(mt.group(5))), "segmentos": [{"pagina": ip, "rect": r}]}
                        comuns.append(atual)
                    elif k > 0:
                        n = int(MARCADOR.match(mks[k - 1]["t"]).group(1))
                        vistos[n] = vistos.get(n, 0) + 1
                        lingua = None
                        if dia == 1 and n <= 5:
                            lingua = "ingles" if vistos[n] == 1 else "espanhol"
                        atual = {"ano": ano, "dia": dia, "numero": n, "lingua": lingua, "segmentos": []}
                        questoes.append(atual)
                        atual["segmentos"].append({"pagina": ip, "rect": r})
                    elif atual is not None and tem_tinta(img, r):
                        atual["segmentos"].append({"pagina": ip, "rect": r})
        # Texto comum a um grupo de questoes (2025 D1, 06 a 10): vai na frente de cada uma, para
        # que toda questao seja autossuficiente no simulado. "grupo" avisa o montador.
        for c in comuns:
            a, b = c["comum"]
            for q in questoes:
                if a <= q["numero"] <= b and q["lingua"] is None:
                    q["segmentos"] = c["segmentos"] + q["segmentos"]
                    q["grupo"] = f"{ano}_D{dia}_Q{a:03d}-{b:03d}"
        # texto e imagem de cada questao
        for q in questoes:
            linhas, partes = [], []
            for s in q["segmentos"]:
                pag, img = paginas[s["pagina"] - 1], imgs[s["pagina"] - 1]
                x0, y0, x1, y1 = s["rect"]
                ls = [l for l in pag["linhas"] if x0 - 2 <= (l["x0"] + l["x1"]) / 2 <= x1 + 2
                      and y0 - 2 <= (l["y0"] + l["y1"]) / 2 <= y1 + 2]
                linhas += [l["t"] for l in sorted(ls, key=lambda l: (round(l["y0"]), l["x0"]))
                           if not MARCADOR.match(l["t"])]
                crop = img.crop(tuple(int(v * ESC) for v in s["rect"]))
                caixa = ImageOps.invert(crop).point(lambda v: 255 if v > 255 - TINTA else 0).getbbox()
                if caixa:
                    pad = 6
                    crop = crop.crop((max(0, caixa[0] - pad), max(0, caixa[1] - pad),
                                      min(crop.width, caixa[2] + pad), min(crop.height, caixa[3] + pad)))
                    partes.append(crop)
            q["texto"] = "\n".join(linhas)
            q["_partes"] = partes
        return questoes


def montar_imagem(partes):
    if not partes:
        return None
    gap = 14
    w = max(p.width for p in partes)
    h = sum(p.height for p in partes) + gap * (len(partes) - 1)
    out = Image.new("L", (w, h), 255)
    y = 0
    for p in partes:
        out.paste(p, (0, y)); y += p.height + gap
    return out


# ------------------------------------------------------------------ gabarito

def ler_gabarito(pdf, dia):
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    gab, anuladas = {}, set()
    for n in re.findall(r"Quest[ãa]o\s+(\d{1,3})\s+Anulad", txt, re.I):
        anuladas.add(int(n))
    tok = r"([A-E]|Anulad[oa]|X)"
    for linha in txt.splitlines():
        if dia == 1:
            m = re.match(r"^\s*([1-5])\s+([A-E]|Anulad[oa])\s+([A-E]|Anulad[oa])\s+(4[6-9]|50)\s+" + tok + r"\s*$", linha, re.I)
            if m:
                gab[(int(m.group(1)), "ingles")] = m.group(2)
                gab[(int(m.group(1)), "espanhol")] = m.group(3)
                gab[(int(m.group(4)), None)] = m.group(5)
                continue
        for n, g in re.findall(r"\b(\d{1,3})\s+" + tok + r"(?=\s|$)", linha, re.I):
            n = int(n)
            if (dia == 1 and 6 <= n <= 90) or (dia == 2 and 91 <= n <= 180):
                gab.setdefault((n, None), g)
    saida = {}
    for k, g in gab.items():
        anulada = not re.fullmatch(r"[A-E]", g, re.I) or k[0] in anuladas
        saida[k] = None if anulada else g.upper()
    return saida


# ------------------------------------------------------------------ principal

def esperado(dia):
    if dia == 1:
        return {(n, l) for n in range(1, 6) for l in ("ingles", "espanhol")} | {(n, None) for n in range(6, 91)}
    return {(n, None) for n in range(91, 181)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kb", default=os.path.expanduser("~/Documents/kb_enem"))
    ap.add_argument("--so", help="processa so um caderno, ex.: 2023_D2")
    args = ap.parse_args()
    fontes = json.loads((RAIZ / "data/banco/fontes.json").read_text())
    pasta_img = RAIZ / "data/banco/img"
    pasta_img.mkdir(parents=True, exist_ok=True)
    saida_path = RAIZ / "data/banco/questoes.jsonl"
    registros = {}
    if saida_path.exists():
        for l in saida_path.read_text().splitlines():
            r = json.loads(l); registros[r["id"]] = r
    problemas = 0
    for f in fontes["cadernos"]:
        chave = f"{f['ano']}_D{f['dia']}"
        if args.so and args.so != chave:
            continue
        resolve = lambda p: Path(p.replace("{kb}", args.kb).replace("{repo}", str(RAIZ))).expanduser()
        qs = segmentar(resolve(f["prova"]), f["ano"], f["dia"])
        gab = ler_gabarito(resolve(f["gabarito"]), f["dia"])
        achadas = {(q["numero"], q["lingua"]) for q in qs}
        exp = esperado(f["dia"])
        faltam, sobram = sorted(exp - achadas, key=str), sorted(achadas - exp, key=str)
        dup = len(qs) - len(achadas)
        sem_gab = sorted(exp - set(gab), key=str)
        status = "ok" if not (faltam or sobram or dup or sem_gab) else "PROBLEMA"
        problemas += status != "ok"
        print(f"{chave} caderno {f['caderno']}: {len(qs)} questoes, {sum(1 for v in gab.values() if v is None)} anuladas"
              f" — {status}" + (f" faltam={faltam} sobram={sobram} duplicadas={dup} sem_gabarito={sem_gab}" if status != "ok" else ""))
        for q in qs:
            sufixo = f"_{q['lingua'][:2]}" if q["lingua"] else ""
            qid = f"{q['ano']}_D{q['dia']}_Q{q['numero']:03d}{sufixo}"
            img = montar_imagem(q.pop("_partes"))
            if img is not None:
                img.save(pasta_img / f"{qid}.png", optimize=True)
            g = gab.get((q["numero"], q["lingua"]), "?")
            registros[qid] = {
                "id": qid, "ano": q["ano"], "dia": q["dia"], "caderno": f["caderno"], "cor": f["cor"],
                "aplicacao": f.get("aplicacao", "regular"), "numero": q["numero"], "lingua": q["lingua"],
                "area": ("LC" if q["numero"] <= 45 else "CH") if f["dia"] == 1 else ("CN" if q["numero"] <= 135 else "MT"),
                "gabarito": g if g != "?" else None, "anulada": g is None,
                "imagem": f"{qid}.png" if img is not None else None,
                "img_px": [img.width, img.height] if img is not None else None,
                "grupo": q.get("grupo"), "segmentos": q["segmentos"], "texto": q["texto"],
            }
    ordem = sorted(registros.values(), key=lambda r: (r["ano"], r["dia"], r["numero"], r["lingua"] or ""))
    saida_path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in ordem))
    print(f"\n{len(ordem)} registros em {saida_path.relative_to(RAIZ)}")
    sys.exit(1 if problemas else 0)


if __name__ == "__main__":
    main()
