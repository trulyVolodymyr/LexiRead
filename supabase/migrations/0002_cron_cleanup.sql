-- Nightly maintenance. Requires the pg_cron extension (enable in Dashboard → Database → Extensions).

create extension if not exists pg_cron;

-- Evict translation cache entries older than 90 days.
select cron.schedule(
  'evict-translation-cache',
  '15 3 * * *',
  $$delete from public.translation_cache where created_at < now() - interval '90 days'$$
);

-- Remove abandoned uploads (book row created but the client never finished).
select cron.schedule(
  'cleanup-abandoned-uploads',
  '30 3 * * *',
  $$delete from public.books where status = 'uploading' and created_at < now() - interval '1 hour'$$
);
