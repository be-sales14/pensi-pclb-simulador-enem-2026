# Front (Vercel)

Vazio até a Fase 3. Especificação de telas, endpoints e variáveis de ambiente em
[../docs/08_FRONT_VERCEL.md](../docs/08_FRONT_VERCEL.md).

Quando começar:

```bash
npx create-next-app@latest . --typescript --tailwind --app
npx shadcn@latest init
```

Chamada ao n8n passa por Route Handler (`app/api/.../route.ts`), nunca direto do browser —
o token do webhook não vai para o cliente.
