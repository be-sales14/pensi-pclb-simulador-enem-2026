-- Simulado ENEM · 004 · alunos, simulados montados com questoes reais e entregas
-- Tudo aqui e do back: o browser fala com o n8n, que usa a credencial Postgres.
-- Ver docs/08_FRONT_VERCEL.md.

create extension if not exists citext with schema extensions;

-- Quem faz o simulado na pagina. O email e a chave (mesma pessoa = mesmo historico em
-- qualquer aparelho); o nome e so para exibir. Quem so baixa o PDF nao precisa se cadastrar.
create table alunos (
  id            uuid primary key default gen_random_uuid(),
  email         extensions.citext not null unique
                check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  nome          text not null check (length(btrim(nome)) between 1 and 120),
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now()
);

-- Um simulado montado: a lista de questoes reais, na ordem em que o aluno ve.
create table simulados_enem (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid references alunos (id) on delete set null,   -- null: montado para PDF
  tipo        text not null check (tipo in ('oficial', 'personalizado')),
  spec        jsonb not null,
  semente     text not null,                                   -- mesmo spec + semente = mesma prova
  n_questoes  smallint not null check (n_questoes between 1 and 180),
  distribuicao jsonb,                                           -- slots por area/disciplina/assunto
  criado_em   timestamptz not null default now()
);

create table simulado_enem_itens (
  simulado_id uuid not null references simulados_enem (id) on delete cascade,
  numero      smallint not null check (numero between 1 and 180),
  questao_id  text not null references questoes_enem (id),
  primary key (simulado_id, numero),
  unique (simulado_id, questao_id)
);

create index simulado_enem_itens_questao_idx on simulado_enem_itens (questao_id);

-- A entrega: as respostas do aluno e a nota. Uma por aluno por simulado.
create table entregas (
  id           uuid primary key default gen_random_uuid(),
  simulado_id  uuid not null references simulados_enem (id) on delete cascade,
  aluno_id     uuid not null references alunos (id) on delete cascade,
  origem       text not null check (origem in ('pagina', 'pdf')),
  respostas    jsonb not null,            -- {"1":"C","2":null,...}
  acertos      smallint not null,
  total        smallint not null,
  por_area     jsonb not null,            -- {"MT":{"acertos":30,"total":45}}
  por_disciplina jsonb not null,
  iniciado_em  timestamptz,
  entregue_em  timestamptz not null default now(),
  unique (simulado_id, aluno_id)
);

create index entregas_aluno_idx on entregas (aluno_id, entregue_em desc);

alter table alunos              enable row level security;
alter table simulados_enem      enable row level security;
alter table simulado_enem_itens enable row level security;
alter table entregas            enable row level security;
revoke all on alunos, simulados_enem, simulado_enem_itens, entregas from anon, authenticated;
