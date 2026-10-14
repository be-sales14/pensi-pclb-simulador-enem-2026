// Modo demonstracao: sem N8N_WEBHOOK_BASE, as rotas de app/api respondem daqui.
// Roda o MESMO codigo que os nos Code do n8n (n8n/src/*.lib.js) sobre o banco local
// (data/banco), guardando alunos, simulados e entregas na memoria do servidor.
// Serve para desenvolver o front sem n8n. Precisa do repo com data/banco; as imagens vem do
// S3 se existir data/banco/imagens_s3.json (so na maquina de quem subiu), senao de
// data/banco/img via /api/demo-imagem.

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

type Linha = { id: string; ano: number; area: string; numero: number; lingua: string | null; anulada: boolean;
               gabarito: string | null; img_px: [number, number] };
type Classe = { disciplina: string; disciplina_secundaria: string | null; assunto_id: string | null };
type Libs = {
  montarSimulado: (pedido: unknown, disc: unknown[], ass: unknown[], banco: unknown[], vistos: string[]) => {
    pedido: Record<string, unknown>; avisos: string[]; itens: { numero: number; questao_id: string }[] };
  corrigir: (itens: unknown[], respostas: unknown) => { respostas: unknown; acertos: number; total: number; por_area: unknown; por_disciplina: unknown; detalhe: unknown };
};
type Estado = {
  alunos: Map<string, { aluno_id: string; email: string; nome: string }>;
  simulados: Map<string, { pedido: Record<string, unknown>; aluno_id: string | null; itens: { numero: number; questao_id: string }[] }>;
  entregas: { entrega_id: string; simulado_id: string; aluno_id: string; origem: string; acertos: number; total: number;
              por_area: unknown; entregue_em: string }[];
};

const RAIZ = path.resolve(process.cwd(), '..');
const g = globalThis as unknown as { __demo?: Promise<{ libs: Libs; banco: Map<string, Linha & Classe>; imagem: (id: string, px: [number, number]) => string; pesos: { disciplinas: unknown[]; assuntos: unknown[] } }>; __estado?: Estado };
const estado: Estado = (g.__estado ??= { alunos: new Map(), simulados: new Map(), entregas: [] });

function carregar() {
  return (g.__demo ??= (async () => {
    const ler = (f: string) => readFile(path.join(RAIZ, f), 'utf8');
    const fonte = (await Promise.all(['distribuidor', 'sorteio', 'correcao'].map(n => ler(`n8n/src/${n}.lib.js`)))).join('\n');
    const libs = new Function(`${fonte}\nreturn { montarSimulado, corrigir };`)() as Libs;
    const cls = JSON.parse(await ler('data/banco/classificacao.json')) as Record<string, Classe>;
    const linhas = (await ler('data/banco/questoes.jsonl')).trim().split('\n').map(l => JSON.parse(l) as Linha);
    const banco = new Map(linhas.map(l => [l.id, { ...l, ...cls[l.id] }]));
    const pj = JSON.parse(await ler('data/pesos_incidencia.json'));
    const pesos = {
      disciplinas: Object.entries(pj.divisao_disciplinas as Record<string, object[]>).flatMap(([area, ds]) => ds.map(d => ({ area, ...d }))),
      assuntos: pj.assuntos,
    };
    let imagem = (id: string, px: [number, number]) => `/api/demo-imagem?id=${encodeURIComponent(id)}&l=${px[0]}&a=${px[1]}`;
    try {
      await access(path.join(RAIZ, 'data/banco/imagens_s3.json'));
      const s3 = JSON.parse(await ler('data/banco/imagens_s3.json'));
      imagem = id => `${s3.url_base}/${s3.imagens[id]}`;
    } catch { /* sem S3: serve do disco */ }
    return { libs, banco, imagem, pesos };
  })());
}

const publica = (q: Linha & Classe, numero: number, imagem: (id: string, px: [number, number]) => string) => ({
  numero, area: q.area, disciplina: q.disciplina, imagem_url: imagem(q.id, q.img_px), largura: q.img_px[0], altura: q.img_px[1],
});

function historico(aluno_id: string) {
  return estado.entregas.filter(e => e.aluno_id === aluno_id)
    .map(e => ({ ...e, tipo: estado.simulados.get(e.simulado_id)?.pedido.tipo }))
    .sort((a, b) => b.entregue_em.localeCompare(a.entregue_em));
}

export async function chamarDemo(rota: string, corpo: unknown) {
  const { libs, banco, imagem, pesos } = await carregar();
  const b = (corpo ?? {}) as Record<string, unknown>;
  await new Promise(r => setTimeout(r, 250));   // o n8n de verdade leva ~1 s

  if (rota === 'aluno') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const nome = String(b.nome ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email invalido.');
    if (!nome) throw new Error('Informe seu nome.');
    const a = estado.alunos.get(email) ?? { aluno_id: randomUUID(), email, nome };
    a.nome = nome;
    estado.alunos.set(email, a);
    return { ...a, historico: historico(a.aluno_id) };
  }

  if (rota === 'montar') {
    const vistos = [...estado.simulados.values()].filter(s => b.aluno_id && s.aluno_id === b.aluno_id)
      .flatMap(s => s.itens.map(i => i.questao_id));
    const linhas = [...banco.values()].filter(q => !q.anulada);
    const r = libs.montarSimulado(b, pesos.disciplinas, pesos.assuntos, linhas, vistos);
    const id = randomUUID();
    estado.simulados.set(id, { pedido: r.pedido, aluno_id: (b.aluno_id as string) || null, itens: r.itens });
    return { simulado_id: id, pedido: r.pedido, avisos: r.avisos,
             questoes: r.itens.map(i => publica(banco.get(i.questao_id)!, i.numero, imagem)) };
  }

  if (rota === 'ver') {
    const cod = String(b.simulado_id ?? '').toLowerCase();
    const id = /^[0-9a-f-]{8,36}$/.test(cod) ? [...estado.simulados.keys()].find(k => k.startsWith(cod)) : undefined;
    if (!id) throw new Error('Simulado nao encontrado. Confira o codigo impresso no PDF.');
    const s = estado.simulados.get(id)!;
    return { simulado_id: id, pedido: s.pedido, questoes: s.itens.map(i => publica(banco.get(i.questao_id)!, i.numero, imagem)) };
  }

  if (rota === 'entregar') {
    const s = estado.simulados.get(String(b.simulado_id));
    if (![...estado.alunos.values()].some(a => a.aluno_id === b.aluno_id)) throw new Error('Aluno nao cadastrado: registre email e nome antes de entregar.');
    if (!s) throw new Error('Simulado nao encontrado.');
    if (estado.entregas.some(e => e.simulado_id === b.simulado_id && e.aluno_id === b.aluno_id))
      throw new Error('Este simulado ja foi entregue por este aluno.');
    const itens = s.itens.map(i => { const q = banco.get(i.questao_id)!; return { numero: i.numero, area: q.area, disciplina: q.disciplina, gabarito: q.gabarito }; });
    const c = libs.corrigir(itens, b.respostas);
    const entrega_id = randomUUID();
    estado.entregas.push({ entrega_id, simulado_id: String(b.simulado_id), aluno_id: String(b.aluno_id),
                           origem: b.origem === 'pdf' ? 'pdf' : 'pagina', acertos: c.acertos, total: c.total,
                           por_area: c.por_area, entregue_em: new Date().toISOString() });
    return { entrega_id, acertos: c.acertos, total: c.total, por_area: c.por_area, por_disciplina: c.por_disciplina, questoes: c.detalhe };
  }
  throw new Error(`rota desconhecida: ${rota}`);
}

/** Usado por /api/demo-imagem quando nao ha S3: le data/banco/img/<id>.png. */
export async function lerImagemLocal(id: string) {
  if (!/^\d{4}_D[12]_Q\d{3}(_in|_es)?$/.test(id)) return null;
  try { return await readFile(path.join(RAIZ, 'data/banco/img', `${id}.png`)); } catch { return null; }
}
