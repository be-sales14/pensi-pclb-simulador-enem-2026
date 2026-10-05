#!/usr/bin/env bash
# Simulado ENEM · cria o bucket S3 das imagens das questoes e o usuario IAM que faz upload.
#
# Rodar no AWS CloudShell, logado com um usuario administrador:
#   bash criar_bucket_s3.sh
#
# O que cria:
#   1. bucket S3 com leitura publica SO no prefixo questoes/ (as imagens que o aluno ve);
#      o resto do bucket continua privado, ACL desligada, criptografia padrao;
#   2. CORS para o front ler as imagens;
#   3. usuario IAM "simulado-enem-uploader" que so consegue listar, enviar e apagar
#      objetos dentro de questoes/ neste bucket, e nada mais na conta;
#   4. uma chave de acesso para esse usuario (mostrada UMA vez no final).
#
# Pode rodar de novo: o que ja existe e pulado. Nao mexe em nada fora deste bucket e deste
# usuario. O gabarito NUNCA vai para este bucket: so as imagens das questoes.

set -euo pipefail

# ------------------------------------------------------------------ configuracao
REGIAO="${REGIAO:-sa-east-1}"                    # Sao Paulo: perto dos alunos
PROJETO="simulado-enem"
USUARIO="${PROJETO}-uploader"
PREFIXO="questoes"

CONTA=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${BUCKET:-pensi-${PROJETO}-${CONTA}}"   # nome de bucket e global: a conta garante unicidade

echo "Conta:   $CONTA"
echo "Regiao:  $REGIAO"
echo "Bucket:  $BUCKET"
echo "Usuario: $USUARIO"
echo

# ------------------------------------------------------------------ 0. bloqueio publico da conta
# Se a conta inteira bloqueia politica publica, o bucket nao consegue ser publico. Este
# script nao muda configuracao da conta inteira: so avisa.
BPA_CONTA=$(aws s3control get-public-access-block --account-id "$CONTA" \
  --query 'PublicAccessBlockConfiguration.[BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text 2>/dev/null || echo "None None")
if [[ "$BPA_CONTA" == *True* ]]; then
  echo "PARADO: a conta tem 'Block Public Access' ligado no nivel da CONTA ($BPA_CONTA)."
  echo "Com isso nenhum bucket pode ser publico. Para liberar, no console:"
  echo "  S3 > Block Public Access settings for this account > Edit >"
  echo "  desmarcar 'Block public access to buckets and objects granted through new public bucket"
  echo "  or access point policies' e '... any public bucket or access point policies'."
  echo "Depois rode este script de novo."
  exit 1
fi

# ------------------------------------------------------------------ 1. bucket
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "[ok] bucket ja existe"
else
  if [[ "$REGIAO" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGIAO" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGIAO" \
      --create-bucket-configuration LocationConstraint="$REGIAO" >/dev/null
  fi
  echo "[novo] bucket criado"
fi

aws s3api put-bucket-tagging --bucket "$BUCKET" \
  --tagging "TagSet=[{Key=projeto,Value=${PROJETO}},{Key=uso,Value=imagens-das-questoes}]"

# ACL desligada: so a politica do bucket decide quem le o que.
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'

# Criptografia padrao do S3 (SSE-S3).
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Bloqueio publico do BUCKET: ACL publica continua bloqueada; politica publica liberada,
# porque e a politica abaixo que abre so o prefixo questoes/.
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
echo "[ok] bucket: tags, ACL desligada, criptografia, bloqueio publico ajustado"
sleep 5   # bucket novo as vezes recusa a politica publica nos primeiros segundos

# ------------------------------------------------------------------ 2. politica do bucket
cat > /tmp/politica-bucket.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LeituraPublicaDasImagensDasQuestoes",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/${PREFIXO}/*"
    }
  ]
}
EOF
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/politica-bucket.json
echo "[ok] politica: leitura publica so em ${PREFIXO}/*"

# ------------------------------------------------------------------ 3. CORS
cat > /tmp/cors.json <<'EOF'
{
  "CORSRules": [
    {
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": ["*"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 86400
    }
  ]
}
EOF
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///tmp/cors.json
echo "[ok] CORS: GET e HEAD liberados para o front"

# ------------------------------------------------------------------ 4. usuario IAM
if aws iam get-user --user-name "$USUARIO" >/dev/null 2>&1; then
  echo "[ok] usuario IAM ja existe"
else
  aws iam create-user --user-name "$USUARIO" \
    --tags Key=projeto,Value="$PROJETO" >/dev/null
  echo "[novo] usuario IAM criado"
fi

cat > /tmp/politica-usuario.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListarSoOPrefixoDasQuestoes",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${BUCKET}",
      "Condition": { "StringLike": { "s3:prefix": ["${PREFIXO}/*", "${PREFIXO}"] } }
    },
    {
      "Sid": "EnviarLerApagarImagensDasQuestoes",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/${PREFIXO}/*"
    }
  ]
}
EOF
aws iam put-user-policy --user-name "$USUARIO" --policy-name "${PROJETO}-s3-questoes" \
  --policy-document file:///tmp/politica-usuario.json
echo "[ok] politica do usuario: so ${BUCKET}/${PREFIXO}/*"

# ------------------------------------------------------------------ 5. teste publico
# Sobe um arquivo de teste com o usuario atual, le pela URL publica e apaga.
URL_BASE="https://${BUCKET}.s3.${REGIAO}.amazonaws.com/${PREFIXO}"
echo "ok" > /tmp/teste.txt
aws s3api put-object --bucket "$BUCKET" --key "${PREFIXO}/_teste.txt" --body /tmp/teste.txt \
  --content-type text/plain >/dev/null
sleep 2
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "${URL_BASE}/_teste.txt")
aws s3api delete-object --bucket "$BUCKET" --key "${PREFIXO}/_teste.txt" >/dev/null
if [[ "$CODIGO" == "200" ]]; then
  echo "[ok] teste: arquivo em ${PREFIXO}/ abre pela URL publica (HTTP 200)"
else
  echo "[ATENCAO] teste: a URL publica respondeu HTTP $CODIGO. Confira o bloqueio publico da conta."
fi
CODIGO_FORA=$(curl -s -o /dev/null -w "%{http_code}" "https://${BUCKET}.s3.${REGIAO}.amazonaws.com/fora-do-prefixo.txt")
echo "[ok] fora de ${PREFIXO}/ continua fechado (HTTP $CODIGO_FORA, esperado 403)"

# ------------------------------------------------------------------ 6. chave de acesso
QTD=$(aws iam list-access-keys --user-name "$USUARIO" --query 'length(AccessKeyMetadata)' --output text)
echo
if [[ "$QTD" -ge 1 ]]; then
  echo "O usuario ja tem $QTD chave(s) de acesso. Nao criei outra."
  echo "Se perdeu a chave secreta, apague a antiga no console (IAM > Users > $USUARIO >"
  echo "Security credentials) e rode o script de novo."
  CHAVE_ID="(chave existente)"; CHAVE_SECRETA="(nao e possivel mostrar de novo)"
else
  read -r CHAVE_ID CHAVE_SECRETA < <(aws iam create-access-key --user-name "$USUARIO" \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  echo "[novo] chave de acesso criada"
fi

cat <<EOF

==================================================================== PRONTO

Copie o bloco abaixo para o arquivo .env.local na raiz do projeto simulado-enem
(o arquivo nao vai para o git). NAO cole a chave secreta em chat nenhum.

AWS_ACCESS_KEY_ID=${CHAVE_ID}
AWS_SECRET_ACCESS_KEY=${CHAVE_SECRETA}
AWS_REGION=${REGIAO}
S3_BUCKET=${BUCKET}
S3_PREFIXO=${PREFIXO}
S3_URL_BASE=${URL_BASE}

A chave secreta so aparece AGORA. Se fechar esta tela sem copiar, apague a chave no
console e rode o script de novo.
====================================================================
EOF
