import { encaminhar } from '@/lib/rota';

/** Cadastra ou encontra o aluno pelo email e devolve o historico. */
export async function POST(req: Request) {
  return encaminhar(req, 'aluno', ['email', 'nome']);
}
