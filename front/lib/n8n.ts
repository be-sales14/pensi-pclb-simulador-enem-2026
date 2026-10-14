// Chamada aos webhooks do n8n. Roda SO no servidor (Route Handlers em app/api): o token
// fica em variavel de ambiente e nunca vai para o browser.
//
//   N8N_WEBHOOK_BASE  ex.: https://api.data.descomplica.io/webhook
//   N8N_TOKEN         o mesmo valor da credencial "Simulado ENEM · token do front" no n8n
//
// Sem N8N_WEBHOOK_BASE, o front entra no modo demonstracao (lib/demo.ts).

import { chamarDemo } from './demo';

export type Rota = 'aluno' | 'montar' | 'ver' | 'entregar';

export class ErroDoBack extends Error {
  constructor(mensagem: string, public status: number) {
    super(mensagem);
  }
}

export const modoDemonstracao = () => !process.env.N8N_WEBHOOK_BASE;

export async function chamarN8n<T>(rota: Rota, corpo: unknown): Promise<T> {
  const base = process.env.N8N_WEBHOOK_BASE?.trim().replace(/\/+$/, '');
  if (!base) return chamarDemo(rota, corpo) as Promise<T>;

  let resposta: Response;
  try {
    resposta = await fetch(`${base.replace(/\/$/, '')}/simulado-enem/${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-simulado-token': (process.env.N8N_TOKEN ?? '').trim() },
      body: JSON.stringify(corpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ErroDoBack('Não foi possível falar com o servidor do simulado. Tente de novo em instantes.', 502);
  }

  const texto = await resposta.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { message: texto }; }

  if (!resposta.ok) throw new ErroDoBack(mensagemDeErro(dados, resposta.status), resposta.status);
  return dados as T;
}

// Erro esperado vem do n8n como 400 { erro } (ex.: "Este simulado ja foi entregue por este aluno.").
// Excecao no workflow chega como 500 { message: "Error in workflow" }.
function mensagemDeErro(dados: unknown, status: number) {
  const d = dados as { erro?: string; message?: string; error?: { message?: string } } | null;
  if (d?.erro) return d.erro;
  if (status === 401 || status === 403) return 'O front não está autorizado no n8n: confira o N8N_TOKEN.';
  if (status === 404) return 'O workflow do n8n não respondeu: confira se ele está ativo.';
  if (d?.message === 'Error in workflow') return 'O servidor do simulado teve um problema. Tente de novo.';
  const msg = d?.message ?? d?.error?.message;
  return msg && msg.length < 300 ? msg : 'O servidor do simulado teve um problema. Tente de novo.';
}
