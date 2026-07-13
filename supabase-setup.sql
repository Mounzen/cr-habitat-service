-- À exécuter une fois dans l'éditeur SQL de ton projet Supabase.
-- Crée une table unique en jsonb qui stocke :
--   - les comptes rendus (id = uid généré par l'app)
--   - les compteurs de référence par pôle (id = '__counters__')
--   - les sujets proposés par les agents (id = '__proposals__')

create table if not exists service_habitat_cr (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table service_habitat_cr enable row level security;

-- Policy ouverte (lecture/écriture libre avec la clé anon), cohérente avec le
-- reste de l'écosystème zéro-infra. À restreindre si besoin avant un usage
-- avec des données plus sensibles (ex : policy liée à un compte agent).
create policy "allow all" on service_habitat_cr for all using (true) with check (true);
