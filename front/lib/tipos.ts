// Formatos que o front troca com o n8n (workflows 40 a 43). Ver docs/08_FRONT_VERCEL.md.

export type Area = 'LC' | 'CH' | 'CN' | 'MT';

export type Pedido = {
  tipo: 'oficial' | 'personalizado';
  dia?: 1 | 2 | null;
  areas?: Area[];
  n_questoes?: number;
  lingua: 'ingles' | 'espanhol';
};

/** Uma questao como o aluno ve: so a imagem. Sem gabarito, ano ou numero original. */
export type Questao = {
  numero: number;
  area: Area;
  disciplina: string;
  imagem_url: string;
  largura: number;
  altura: number;
};

export type Simulado = {
  simulado_id: string;
  pedido: Pedido & { n_questoes: number };
  avisos?: string[];
  questoes: Questao[];
};

export type Placar = Record<string, { acertos: number; total: number }>;

export type EntregaResumo = {
  entrega_id: string;
  simulado_id: string;
  tipo: 'oficial' | 'personalizado';
  origem: 'pagina' | 'pdf';
  acertos: number;
  total: number;
  por_area: Placar;
  entregue_em: string;
};

export type Aluno = {
  aluno_id: string;
  email: string;
  nome: string;
  historico: EntregaResumo[];
};

/** Resposta da entrega. So aqui o gabarito chega ao browser (regra 4 do CLAUDE.md). */
export type Resultado = {
  entrega_id: string;
  acertos: number;
  total: number;
  por_area: Placar;
  por_disciplina: Placar;
  questoes: { numero: number; marcada: string | null; gabarito: string; certo: boolean }[];
};

export const NOME_AREA: Record<Area, string> = {
  LC: 'Linguagens, Códigos e suas Tecnologias',
  CH: 'Ciências Humanas e suas Tecnologias',
  CN: 'Ciências da Natureza e suas Tecnologias',
  MT: 'Matemática e suas Tecnologias',
};

export const NOME_CURTO_AREA: Record<Area, string> = {
  LC: 'Linguagens', CH: 'Humanas', CN: 'Natureza', MT: 'Matemática',
};

const NOME_DISCIPLINA: Record<string, string> = {
  'Lingua estrangeira': 'Língua estrangeira', Portugues: 'Português', Historia: 'História',
  Fisica: 'Física', Quimica: 'Química', Matematica: 'Matemática', 'Educacao Fisica': 'Educação Física',
};
export const nomeDisciplina = (d: string) => NOME_DISCIPLINA[d] ?? d;

export function tituloDoPedido(p: Pick<Pedido, 'tipo' | 'dia'>) {
  if (p.tipo === 'oficial') return p.dia ? `Simulado oficial · ${p.dia}º dia` : 'Simulado oficial completo';
  return 'Simulado personalizado';
}

/** Codigo curto impresso no PDF: os 8 primeiros caracteres do id. */
export const codigoCurto = (id: string) => id.slice(0, 8);
