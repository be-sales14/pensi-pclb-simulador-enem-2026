# Front · Simulado ENEM

Site em **Next.js 16** (App Router, Tailwind 4) que monta, aplica e corrige simulados com
questões reais do ENEM. Toda a regra (sorteio, correção, banco) vive no **n8n**; o front só
chama os webhooks 40 a 43 por rotas de servidor. Ver [docs/08_FRONT_VERCEL.md](../docs/08_FRONT_VERCEL.md).

## Rodar no seu computador

Precisa de Node 20 ou mais novo.

```bash
cd front
npm install
npm run dev          # abre em http://localhost:3000
```

Sem `.env.local` o site roda em **modo demonstração**: sorteia do banco que está no repo
(`data/banco/questoes.jsonl`) em memória, sem n8n nem Supabase. Serve para mexer no
visual. Os recortes das questões não estão no git; no modo demonstração eles aparecem como
um cartão cinza com o id da questão (quem tem os recortes ou o mapa do S3 vê as imagens).

Para usar o back de verdade, copie o exemplo e preencha o token:

```bash
cp .env.example .env.local
```

| Variável | O que é |
|---|---|
| `N8N_WEBHOOK_BASE` | Base dos webhooks de produção, ex.: `https://api.data.descomplica.io/webhook` |
| `N8N_TOKEN` | O mesmo valor da credencial Header Auth **Simulado ENEM · token do front** no n8n |

O token fica só no servidor (rotas em `app/api/`). Nunca crie `NEXT_PUBLIC_N8N_TOKEN`: tudo
que começa com `NEXT_PUBLIC_` vai para o navegador.

## Publicar na Vercel

1. **Add New → Project**, importe o repositório.
2. **Root Directory:** `front`. O framework (Next.js) é detectado sozinho.
3. **Environment Variables:** `N8N_WEBHOOK_BASE` e `N8N_TOKEN`, como na tabela acima.
   Sem elas o site sobe em modo demonstração, que não guarda nada entre acessos.
4. **Deploy.**

No n8n, os workflows 40, 41, 42 e 43 precisam estar **ativos** (publicados), e os quatro
usam a mesma credencial de Header Auth.

## Telas

| Rota | O que faz |
|---|---|
| `/` | Escolhe o simulado (oficial completo, 1º dia, 2º dia ou personalizado) e o caminho: fazer na tela ou baixar o PDF |
| `/simulado/[id]` | Layout B: caderno com as questões e bolhas, cartão-resposta lateral, cronômetro, entregar |
| `/simulado/[id]/imprimir` | Versão para papel: duas colunas e cartão-resposta em branco com o código |
| `/simulado/[id]/resultado` | Nota, desempenho por área e disciplina, gabarito e questões erradas |
| `/corrigir` | Quem fez no papel digita o código e as respostas |
| `/historico` | Entregas do aluno (pelo email) |

## Regras que o front respeita

- **A questão é a imagem do recorte oficial.** Nada de reescrever o enunciado.
- **O gabarito não vai para o navegador junto com a prova.** Ele só chega na resposta de
  `/api/entregar` e fica guardado na aba (sessionStorage).
- **O aluno se identifica por email + nome** para fazer na tela. O email é a chave do
  histórico; quem só baixa o PDF não precisa se cadastrar.
- As respostas marcadas ficam no `localStorage` a cada clique: dá para fechar a aba e voltar.

## Organização

```
app/            páginas e rotas de API (proxy para o n8n)
components/     telas (Tela*.tsx) e peças do layout (Prova.tsx, Basicos.tsx)
lib/n8n.ts      chamada ao n8n com o token; cai no modo demonstração sem N8N_WEBHOOK_BASE
lib/demo.ts     modo demonstração: roda as libs de n8n/src sobre data/banco
lib/cliente.ts  chamadas do navegador e o que fica guardado nele
lib/tipos.ts    formatos trocados com o n8n
```

Antes de publicar: `npm run lint` e `npm run build` sem erro.
