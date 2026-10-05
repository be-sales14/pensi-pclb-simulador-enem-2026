-- Simulado ENEM · 003 · banco de questoes reais (provas oficiais 2019-2025)
-- Ver PLANO.md §0 e data/banco/README.md.

create table questoes_enem (
  id             text primary key,                         -- '2023_D2_Q164', '2021_D1_Q005_es'
  uid            uuid not null unique default gen_random_uuid(),  -- id publico: nao revela ano nem numero
  ano            smallint not null check (ano between 2009 and 2100),
  dia            smallint not null check (dia in (1, 2)),
  caderno        smallint not null,
  cor            text not null,
  aplicacao      text not null default 'regular',
  numero         smallint not null check (numero between 1 and 180),
  lingua         text check (lingua in ('ingles', 'espanhol')),
  area           text not null check (area in ('LC', 'CH', 'CN', 'MT')),
  disciplina     text not null,
  disciplina_secundaria text,
  assunto_id     text references pesos_incidencia (id),   -- so MT tem assunto por enquanto
  classificacao_fonte text,
  gabarito       char(1) check (gabarito in ('A', 'B', 'C', 'D', 'E')),
  anulada        boolean not null default false,
  grupo          text,                                     -- questoes que dividem um texto (2025 D1 06-10)
  imagem_url     text not null,                            -- recorte da pagina oficial, no S3, nome opaco
  imagem_largura smallint,
  imagem_altura  smallint,
  criado_em      timestamptz not null default now(),
  check (anulada or gabarito is not null),                 -- questao valida sempre tem gabarito
  foreign key (area, disciplina) references pesos_disciplina (area, disciplina),
  unique nulls not distinct (ano, dia, aplicacao, numero, lingua)
);

comment on table questoes_enem is
  'Questoes reais do ENEM. O gabarito so sai daqui pelo back (service_role). O browser le questoes_enem_publicas.';
comment on column questoes_enem.imagem_url is
  'Recorte da pagina oficial. E o que o aluno ve: nao reescrever o enunciado (CLAUDE.md, regra 1).';

create index questoes_enem_sorteio_idx on questoes_enem (area, disciplina, assunto_id) where not anulada;

alter table questoes_enem enable row level security;   -- sem policy: anon nao le a tabela
-- Segunda camada: sem grant nenhum. Se alguem criar uma policy por engano, o gabarito
-- continua fora do browser (aplicado como migration 003b).
revoke all on questoes_enem from anon, authenticated;

-- O browser so ve isto: sem gabarito, sem ano, sem numero, sem anuladas.
create view questoes_enem_publicas as
  select uid, area, disciplina, assunto_id, lingua, grupo,
         imagem_url, imagem_largura, imagem_altura
  from questoes_enem
  where not anulada;

revoke all on questoes_enem_publicas from anon, authenticated;
grant select on questoes_enem_publicas to anon, authenticated;
