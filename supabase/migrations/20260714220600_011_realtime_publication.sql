-- Add public.queue to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;

-- Force PostgREST to reload the schema cache so the new table is recognized
NOTIFY pgrst, 'reload schema';
