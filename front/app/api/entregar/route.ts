import { encaminhar } from '@/lib/rota';

/** Corrige no n8n e grava a entrega. So esta resposta traz o gabarito (regra 4). */
export async function POST(req: Request) {
  return encaminhar(req, 'entregar', ['simulado_id', 'aluno_id', 'respostas', 'origem', 'iniciado_em']);
}
