-- Simulado ENEM · 005 · batimento para o Supabase Free nao pausar o projeto
-- O plano Free pausa projetos com poucas consultas numa semana. O workflow 47 do n8n grava
-- uma linha aqui a cada 6 horas; a tabela serve de prova de que ele esta rodando.

create table manter_ativo (
  id        bigint generated always as identity primary key,
  ping_em   timestamptz not null default now(),
  origem    text not null default 'n8n'
);

alter table manter_ativo enable row level security;
revoke all on manter_ativo from anon, authenticated;
