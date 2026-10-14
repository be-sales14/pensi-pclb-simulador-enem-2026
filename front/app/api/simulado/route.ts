import { encaminhar } from '@/lib/rota';

/** Monta um simulado com questoes reais. Devolve as imagens, nunca o gabarito. */
export async function POST(req: Request) {
  return encaminhar(req, 'montar', ['tipo', 'dia', 'areas', 'n_questoes', 'lingua', 'aluno_id']);
}
