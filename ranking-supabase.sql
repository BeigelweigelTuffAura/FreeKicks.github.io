-- Ranking do dia do Free Kick Legends: tabela e permissões no Supabase.
-- Como usar: no painel do projeto Supabase, abra "SQL Editor", cole tudo isto e clique em "Run".
-- Depois copie, em "Project Settings > API", o "Project URL" e a chave "anon public" para js/config.js
-- (campo `ranking`: url e chave).

create table if not exists public.ranking (
  id bigint generated always as identity primary key,
  dia text not null check (dia ~ '^\d{4}-\d{2}-\d{2}$'),      -- 2026-10-10
  nome text not null check (char_length(nome) between 1 and 24),
  gols integer not null check (gols between 1 and 200),
  criado_em timestamptz not null default now()
);

create index if not exists ranking_dia_gols on public.ranking (dia, gols desc);

-- Segurança por linha: a chave pública só pode LER e INSERIR; ninguém apaga nem edita pelo jogo.
alter table public.ranking enable row level security;

drop policy if exists "ler ranking" on public.ranking;
create policy "ler ranking" on public.ranking for select to anon using (true);

drop policy if exists "entrar no ranking" on public.ranking;
create policy "entrar no ranking" on public.ranking for insert to anon with check (true);
