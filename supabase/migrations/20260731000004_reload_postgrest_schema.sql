-- Force PostgREST/Supabase API schema cache reload after RPC changes.
notify pgrst, 'reload schema';
