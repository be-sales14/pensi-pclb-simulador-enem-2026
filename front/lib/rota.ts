// Ponte entre as rotas de app/api e o n8n. So repassa os campos permitidos de cada rota.

import { chamarN8n, ErroDoBack, type Rota } from './n8n';

export async function encaminhar(req: Request, rota: Rota, campos: string[]) {
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: 'Pedido inválido.' }, { status: 400 });
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo))
    return Response.json({ erro: 'Pedido inválido.' }, { status: 400 });

  const limpo = Object.fromEntries(campos.filter(c => corpo[c] !== undefined).map(c => [c, corpo[c]]));
  try {
    return Response.json(await chamarN8n(rota, limpo));
  } catch (e) {
    const status = e instanceof ErroDoBack ? (e.status >= 500 ? 502 : e.status) : 400;
    return Response.json({ erro: legivel((e as Error).message) }, { status });
  }
}

// As mensagens dos nos Code do n8n vem sem acento; aqui ficam legiveis para o aluno.
const TRADUCAO: [RegExp, string][] = [
  [/^Email invalido\.?$/, 'Email inválido.'],
  [/^Aluno nao cadastrado/, 'Faça seu cadastro (email e nome) antes de entregar.'],
  [/^Este simulado ja foi entregue/, 'Você já entregou este simulado. O resultado está no seu histórico.'],
  [/^Simulado nao encontrado/, 'Simulado não encontrado. Confira o código impresso no PDF.'],
  [/^banco sem questoes suficientes/, 'Não há questões suficientes no banco para este pedido. Tente menos questões.'],
];
const legivel = (m: string) => TRADUCAO.find(([r]) => r.test(m))?.[1] ?? m;
