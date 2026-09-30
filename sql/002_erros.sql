-- Simulado ENEM · 002 · rastreio de erro do n8n
-- Ver docs/07_N8N_IMPLEMENTACAO.md secao 7.

-- O Error Trigger do n8n sabe qual EXECUCAO quebrou, nao qual job. O orquestrador grava
-- o proprio $execution.id aqui ao comecar; o 99-erro usa isso para achar o job.
alter table jobs add column execucao_id text;
create index jobs_execucao_idx on jobs (execucao_id);

-- Todo erro de todo workflow, com ou sem job. E o log que o 99-erro escreve.
create table erros_execucao (
  id            uuid primary key default gen_random_uuid(),
  execucao_id   text,
  execucao_url  text,
  workflow_id   text,
  workflow_nome text,
  no_com_erro   text,
  mensagem      text,
  stack         text,
  modo          text,               -- webhook, trigger, integrated...
  job_id        uuid references jobs(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index erros_execucao_job_idx on erros_execucao (job_id);

alter table erros_execucao enable row level security;
