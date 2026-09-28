-- Simulado ENEM · schema inicial
-- Executar no SQL Editor do Supabase.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------- pesos

-- Divisao de cada area (45 questoes) entre disciplinas. O rateio por assunto
-- acontece dentro da disciplina, entao o no Code precisa ler isto do banco.
create table pesos_disciplina (
  area          text not null check (area in ('LC','CH','CN','MT')),
  disciplina    text not null,
  peso          numeric not null check (peso >= 0),
  slots_em_45   smallint not null check (slots_em_45 between 0 and 45),
  faixa_min     smallint,                       -- faixa observada nas provas, quando medida
  faixa_max     smallint,
  confianca     text not null check (confianca in ('medido','catalogado','provisorio','edital')),
  fonte         text,
  atualizado_em timestamptz not null default now(),
  primary key (area, disciplina)
);

create table pesos_incidencia (
  id            text primary key,              -- 'MT.razao_proporcao'
  area          text not null check (area in ('LC','CH','CN','MT')),
  disciplina    text not null,
  assunto       text not null,
  peso          numeric not null check (peso >= 0),
  slots_em_45   smallint not null check (slots_em_45 between 0 and 45),
  peso_recente  numeric,                        -- ênfase 2023-2025, quando medida
  confianca     text not null check (confianca in ('medido','catalogado','provisorio')),
  fator_texto   numeric not null default 1.0 check (fator_texto between 0 and 1),
  habilidades   text[] default '{}',
  fonte         text,                           -- de onde veio o número
  atualizado_em timestamptz not null default now(),
  foreign key (area, disciplina) references pesos_disciplina (area, disciplina)
);

comment on column pesos_incidencia.confianca is
  'medido = questao a questao com revisao manual; catalogado = leitura manual sem simulacao; provisorio = sem contagem. Nunca publicar provisorio como medido.';
comment on column pesos_incidencia.fator_texto is
  'Fracao do assunto que e geravel 100% em texto, sem imagem. Ver docs/03_DISTRIBUICAO_ENEM.md secao 7.';

-- ---------------------------------------------------------------- jobs

create table jobs (
  id          uuid primary key default gen_random_uuid(),
  origem      text not null check (origem in ('chat','webhook')),
  aluno_id    uuid,
  spec        jsonb,
  status      text not null default 'recebido'
              check (status in ('recebido','especificando','incompleto','distribuindo',
                                'gerando','auditando','montando','pronto','erro')),
  progresso   jsonb default '{"geradas":0,"total":0}',
  erro        jsonb,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- simulados

create table simulados (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  tipo        text not null check (tipo in ('oficial','personalizado')),
  spec        jsonb not null,
  blueprint   jsonb not null,
  fidelidade  jsonb,
  auditoria_resumo jsonb,
  status      text not null default 'gerando',
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------- questoes

create table questoes (
  id             uuid primary key default gen_random_uuid(),
  area           text not null check (area in ('LC','CH','CN','MT')),
  disciplina     text not null,
  assunto        text not null,
  recorte        text,
  habilidade     text,
  nivel_alvo     smallint check (nivel_alvo between 1 and 9),
  nivel_medido   smallint check (nivel_medido between 1 and 9),
  suporte        jsonb not null,   -- { texto, tabela_md, fonte, fonte_tipo }
  enunciado      text not null,
  alternativas   jsonb not null,   -- [{ letra, texto }] x5
  gabarito       char(1) not null check (gabarito in ('A','B','C','D','E')),
  justificativas jsonb not null,
  resolucao      text,
  embedding      vector(1536),
  origem_job     uuid references jobs(id) on delete set null,
  aprovada_em    timestamptz not null default now(),
  retirada_em    timestamptz,      -- preenchido quando a analise de item reprova
  retirada_motivo text
);

create index questoes_embedding_idx
  on questoes using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index questoes_assunto_idx on questoes (area, disciplina, assunto);

-- ---------------------------------------------------------------- versoes

create table questao_versoes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  slot_id     text not null,
  versao      smallint not null,
  payload     jsonb not null,
  veredito    text not null check (veredito in ('APROVADO','REVISAR','DESCARTAR')),
  questao_id  uuid references questoes(id) on delete set null,
  criado_em   timestamptz not null default now(),
  unique (job_id, slot_id, versao)
);

-- ---------------------------------------------------------------- auditorias

create table auditorias (
  id           uuid primary key default gen_random_uuid(),
  versao_id    uuid not null references questao_versoes(id) on delete cascade,
  agente       text not null check (agente in ('nivel','antiia','distratores','solver','repeticao')),
  veredito     text not null check (veredito in ('APROVADO','REVISAR','DESCARTAR')),
  achados      jsonb not null default '[]',
  extra        jsonb,
  criado_em    timestamptz not null default now()
);

create index auditorias_versao_idx on auditorias (versao_id);

-- ---------------------------------------------------------------- montagem

create table simulado_questoes (
  simulado_id uuid not null references simulados(id) on delete cascade,
  questao_id  uuid not null references questoes(id) on delete cascade,
  numero      smallint not null,
  primary key (simulado_id, numero),
  unique (simulado_id, questao_id)
);

-- ---------------------------------------------------------------- respostas

create table respostas (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null,
  simulado_id uuid not null references simulados(id) on delete cascade,
  questao_id  uuid not null references questoes(id) on delete cascade,
  marcada     char(1) check (marcada in ('A','B','C','D','E')),
  correta     boolean not null,
  tempo_ms    integer,
  criado_em   timestamptz not null default now(),
  unique (aluno_id, simulado_id, questao_id)
);

create index respostas_questao_idx on respostas (questao_id);

-- ---------------------------------------------------------------- view publica

-- O aluno nunca ve gabarito, justificativas ou resolucao.
create view questoes_publicas as
  select id, area, disciplina, assunto, nivel_medido,
         suporte, enunciado, alternativas
  from questoes
  where retirada_em is null;

-- ---------------------------------------------------------------- analise de item

create or replace view item_stats as
with nota as (
  select aluno_id, simulado_id,
         avg(case when correta then 1.0 else 0.0 end) as pct_total
  from respostas group by 1, 2
)
select r.questao_id,
       count(*)                                                    as n_respostas,
       avg(case when r.correta then 1.0 else 0.0 end)               as pct_acerto,
       corr(case when r.correta then 1.0 else 0.0 end, n.pct_total) as ponto_bisserial
from respostas r
join nota n using (aluno_id, simulado_id)
group by 1
having count(*) >= 30;

-- ---------------------------------------------------------------- RLS

alter table questoes           enable row level security;
alter table questao_versoes    enable row level security;
alter table auditorias         enable row level security;
alter table pesos_incidencia   enable row level security;
alter table pesos_disciplina   enable row level security;
alter table respostas          enable row level security;
alter table jobs               enable row level security;
alter table simulados          enable row level security;
alter table simulado_questoes  enable row level security;

-- sem policy = sem acesso pelo anon. Back usa service_role.
-- Tabela sem RLS no schema public e leitura E escrita para quem tem a chave anon.
create policy respostas_proprias on respostas
  for all using (auth.uid() = aluno_id) with check (auth.uid() = aluno_id);

-- O front acompanha o proprio job por Realtime. So leitura; quem escreve e o n8n.
create policy jobs_proprios_leitura on jobs
  for select using (auth.uid() = aluno_id);
