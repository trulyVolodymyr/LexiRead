-- LexiRead initial schema: profiles, books, chunks, progress, translation cache, quotas.

-- ============================================================ profiles

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  -- { fontFamily, fontSize, lineHeight, theme: 'light'|'dark'|'sepia', marginsPct, targetLang }
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ books

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  author text,
  language text not null,
  format text not null check (format in ('epub', 'fb2', 'txt')),
  file_hash text not null,
  file_path text not null,
  cover_path text,
  chunk_count int not null,
  char_count bigint not null,
  -- [{ title, chunkIndex, charOffset }]
  toc jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('uploading', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, file_hash)
);

create index books_user_idx on public.books (user_id, created_at desc);

alter table public.books enable row level security;

create policy "own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ book_chunks

create table public.book_chunks (
  book_id uuid not null references public.books(id) on delete cascade,
  chunk_index int not null,
  chapter_index int not null,
  char_start bigint not null,
  char_count int not null,
  -- sanitized HTML fragment
  content text not null,
  primary key (book_id, chunk_index)
);

alter table public.book_chunks enable row level security;

create policy "own chunks" on public.book_chunks
  for all
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));

-- ============================================================ reading_progress

create table public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chunk_index int not null default 0,
  char_offset int not null default 0,
  percent real not null default 0,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.reading_progress enable row level security;

create policy "own progress" on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ translation_cache
-- RLS enabled with NO policies: only the Edge Function (service_role) reads/writes,
-- so no user can enumerate others' lookups.

create table public.translation_cache (
  cache_key text primary key,
  src_lang text not null,
  tgt_lang text not null,
  mode text not null check (mode in ('word', 'sentence', 'entity')),
  response jsonb not null,
  provider text not null,
  hit_count int not null default 1,
  created_at timestamptz not null default now()
);

create index tc_created_idx on public.translation_cache (created_at);

alter table public.translation_cache enable row level security;

-- ============================================================ usage_quotas
-- Same deal: service_role only, tamper-proof quotas.

create table public.usage_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  word_lookups int not null default 0,
  sentence_translations int not null default 0,
  primary key (user_id, day)
);

alter table public.usage_quotas enable row level security;

-- Atomic quota check-and-increment: the limit lives in the WHERE clause, so two
-- concurrent requests can never both pass at the boundary.
create function public.increment_usage(p_user uuid, p_kind text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into usage_quotas (user_id, day) values (p_user, current_date)
  on conflict (user_id, day) do nothing;

  if p_kind = 'word' then
    update usage_quotas set word_lookups = word_lookups + 1
      where user_id = p_user and day = current_date and word_lookups < p_limit
      returning true into ok;
  else
    update usage_quotas set sentence_translations = sentence_translations + 1
      where user_id = p_user and day = current_date and sentence_translations < p_limit
      returning true into ok;
  end if;

  return coalesce(ok, false);
end $$;

revoke execute on function public.increment_usage from public, anon, authenticated;

-- ============================================================ storage buckets

insert into storage.buckets (id, name, public)
values ('book-files', 'book-files', false), ('book-covers', 'book-covers', false);

-- Path convention: {bucket}/{userId}/{bookId}/...  → first folder must be the owner's uid.
create policy "own book files select" on storage.objects
  for select using (bucket_id = 'book-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own book files insert" on storage.objects
  for insert with check (bucket_id = 'book-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own book files delete" on storage.objects
  for delete using (bucket_id = 'book-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own covers select" on storage.objects
  for select using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own covers insert" on storage.objects
  for insert with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own covers delete" on storage.objects
  for delete using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
