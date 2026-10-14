// Lado do browser: chamadas as rotas de app/api e o que fica guardado no navegador.

import type { Aluno, Pedido, Resultado, Simulado } from './tipos';

export async function postar<T>(url: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  } catch {
    throw new Error('Sem conexão. Confira sua internet e tente de novo.');
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados?.erro ?? 'Algo deu errado. Tente de novo.');
  return dados as T;
}

export const api = {
  aluno: (email: string, nome: string) => postar<Aluno>('/api/aluno', { email, nome }),
  montar: (pedido: Pedido, aluno_id?: string) => postar<Simulado>('/api/simulado', { ...pedido, aluno_id }),
  ver: (simulado_id: string) => postar<Simulado>('/api/simulado/ver', { simulado_id }),
  entregar: (corpo: { simulado_id: string; aluno_id: string; respostas: Record<string, string | null>;
                      origem: 'pagina' | 'pdf'; iniciado_em?: string }) => postar<Resultado>('/api/entregar', corpo),
};

// ------------------------------------------------------------------ armazenamento local
// Tudo em try/catch: aba anonima, armazenamento cheio ou bloqueado nao pode quebrar a prova.

const CHAVE = 'simulado-enem';
function ler<T>(onde: Storage | undefined, chave: string): T | null {
  try { const v = onde?.getItem(`${CHAVE}:${chave}`); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function gravar(onde: Storage | undefined, chave: string, valor: unknown) {
  try { onde?.setItem(`${CHAVE}:${chave}`, JSON.stringify(valor)); } catch { /* segue sem salvar */ }
}
const local = () => (typeof window === 'undefined' ? undefined : window.localStorage);
const sessao = () => (typeof window === 'undefined' ? undefined : window.sessionStorage);

/** O aluno cadastrado neste navegador (o email e a chave do historico no servidor). */
export const alunoSalvo = {
  ler: () => ler<Omit<Aluno, 'historico'>>(local(), 'aluno'),
  gravar: (a: Aluno) => gravar(local(), 'aluno', { aluno_id: a.aluno_id, email: a.email, nome: a.nome }),
  sair: () => { try { local()?.removeItem(`${CHAVE}:aluno`); } catch { /* nada */ } },
};

export type Rascunho = { respostas: Record<string, string | null>; revisar: number[]; iniciado_em: string };

/** Respostas marcadas, salvas a cada clique: o aluno pode fechar a aba e voltar. */
export const rascunho = {
  ler: (id: string) => ler<Rascunho>(local(), `respostas:${id}`),
  gravar: (id: string, r: Rascunho) => gravar(local(), `respostas:${id}`, r),
  apagar: (id: string) => { try { local()?.removeItem(`${CHAVE}:respostas:${id}`); } catch { /* nada */ } },
};

/** Cache da prova recem-montada, para nao buscar de novo ao abrir a pagina. */
export const simuladoCache = {
  ler: (id: string) => ler<Simulado>(sessao(), `simulado:${id}`),
  gravar: (s: Simulado) => gravar(sessao(), `simulado:${s.simulado_id}`, s),
};

/** O resultado da entrega (com gabarito) so existe na resposta do servidor: guardado na sessao. */
export const resultadoSalvo = {
  ler: (id: string) => ler<Resultado & { simulado: Simulado }>(sessao(), `resultado:${id}`),
  gravar: (id: string, r: Resultado, simulado: Simulado) => gravar(sessao(), `resultado:${id}`, { ...r, simulado }),
};

/** Busca o simulado: do cache da sessao ou do servidor. */
export async function carregarSimulado(id: string): Promise<Simulado> {
  const s = simuladoCache.ler(id);
  if (s) return s;
  const novo = await api.ver(id);
  simuladoCache.gravar(novo);
  return novo;
}
