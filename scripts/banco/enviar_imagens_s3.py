#!/usr/bin/env python3
"""Envia os recortes das questoes (data/banco/img/*.png) para o S3.

Nome no S3 e opaco: HMAC-SHA256(id da questao, S3_SAL)[:24].png. Um nome como
2023_D2_Q164.png deixaria o aluno achar o gabarito oficial em segundos. O sal e gerado na
primeira execucao e guardado no .env.local; com ele, rodar de novo da os mesmos nomes e
nao duplica nada.

O mapa id -> nome fica em data/banco/imagens_s3.json, que NAO vai para o git (o repo e
publico). A tabela do Supabase guarda a mesma informacao.

Credenciais: .env.local (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET,
S3_PREFIXO, S3_URL_BASE). O usuario IAM so tem permissao em S3_BUCKET/S3_PREFIXO/*.

Uso:  python3 scripts/banco/enviar_imagens_s3.py
"""
import hashlib
import hmac
import json
import re
import secrets
import ssl
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

RAIZ = Path(__file__).resolve().parents[2]
ENV = RAIZ / ".env.local"


def ler_env():
    env = {}
    for linha in ENV.read_text().splitlines():
        m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)", linha)
        if m:
            env[m.group(1)] = m.group(2).strip()
    if not env.get("S3_SAL"):
        env["S3_SAL"] = secrets.token_hex(16)
        with ENV.open("a") as f:
            f.write(f"\n# Sal dos nomes das imagens no S3 (gerado por enviar_imagens_s3.py). Nao trocar:\n"
                    f"# com outro sal os nomes mudam e as URLs gravadas no banco quebram.\n"
                    f"S3_SAL={env['S3_SAL']}\n")
        print("S3_SAL gerado e gravado no .env.local")
    falta = [k for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET",
                         "S3_PREFIXO", "S3_URL_BASE") if not env.get(k)]
    if falta:
        sys.exit(f".env.local sem: {', '.join(falta)}")
    return env


def nome_opaco(qid, sal):
    return hmac.new(sal.encode(), qid.encode(), hashlib.sha256).hexdigest()[:24] + ".png"


def main():
    env = ler_env()
    s3 = boto3.client("s3", region_name=env["AWS_REGION"],
                      aws_access_key_id=env["AWS_ACCESS_KEY_ID"],
                      aws_secret_access_key=env["AWS_SECRET_ACCESS_KEY"])
    bucket, prefixo = env["S3_BUCKET"], env["S3_PREFIXO"]

    registros = [json.loads(l) for l in (RAIZ / "data/banco/questoes.jsonl").read_text().splitlines()]
    mapa = {r["id"]: nome_opaco(r["id"], env["S3_SAL"]) for r in registros if r["imagem"]}
    if len(set(mapa.values())) != len(mapa):
        sys.exit("colisao de nome opaco: aumentar o tamanho do hash")

    # O que ja esta no S3 (nome -> tamanho), para nao reenviar.
    existentes = {}
    for pagina in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"{prefixo}/"):
        for o in pagina.get("Contents", []):
            existentes[o["Key"]] = o["Size"]

    def enviar(item):
        qid, nome = item
        arq = RAIZ / "data/banco/img" / f"{qid}.png"
        chave = f"{prefixo}/{nome}"
        if existentes.get(chave) == arq.stat().st_size:
            return "pulado"
        try:
            s3.upload_file(str(arq), bucket, chave, ExtraArgs={
                "ContentType": "image/png",
                "CacheControl": "public, max-age=31536000, immutable",
            })
            return "enviado"
        except ClientError as e:
            return f"ERRO {qid}: {e.response['Error']['Code']}"

    with ThreadPoolExecutor(max_workers=12) as ex:
        resultados = list(ex.map(enviar, mapa.items()))
    erros = [r for r in resultados if r.startswith("ERRO")]
    print(f"{resultados.count('enviado')} enviados, {resultados.count('pulado')} ja estavam la, {len(erros)} erros")
    for e in erros[:10]:
        print(" ", e)

    saida = {"url_base": env["S3_URL_BASE"], "imagens": mapa}
    (RAIZ / "data/banco/imagens_s3.json").write_text(json.dumps(saida, indent=1) + "\n")

    # Confere pela URL publica, sem credencial, como o aluno vai abrir.
    for qid in list(mapa)[:2] + list(mapa)[-1:]:
        url = f"{env['S3_URL_BASE']}/{mapa[qid]}"
        # Python do python.org no macOS vem sem certificados raiz: usa o pacote do certifi,
        # o mesmo que o boto3 usa.
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
        with urllib.request.urlopen(url, timeout=20, context=ctx) as r:
            print(f"  publico {r.status} {r.headers.get('Content-Type')} {qid}")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
