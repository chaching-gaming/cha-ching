-- Server time RPC for client clock synchronization
-- Returns the current server timestamp for calculating client/server clock offset

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY INVOKER
AS $$ SELECT now(); $$;

GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated, anon;
