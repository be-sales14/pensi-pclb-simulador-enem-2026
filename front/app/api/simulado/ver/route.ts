import { encaminhar } from '@/lib/rota';

/** Reabre um simulado pelo id ou pelo codigo curto impresso no PDF. Sem gabarito. */
export async function POST(req: Request) {
  return encaminhar(req, 'ver', ['simulado_id']);
}
