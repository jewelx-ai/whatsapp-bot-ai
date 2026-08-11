-- Resolve dashboard_analytics() PostgREST overload ambiguity (2026-08-11)
--
-- Two overloads of dashboard_analytics exist:
--   - public.dashboard_analytics(p_org_id uuid, p_days int default 14)  — the
--     original/canonical function (20260715000001), and the exact signature
--     src/app/api/analytics/route.ts:39 calls with named parameters
--     { p_org_id, p_days }.
--   - public.dashboard_analytics(p_days int, p_org_id uuid) — added by
--     20260731000003 as a reversed-argument wrapper "for PostgREST/Supabase
--     named-arg lookup compatibility."
--
-- With both present, PostgREST cannot disambiguate a call that supplies both
-- named parameters — every such call (including the application's own, and
-- confirmed live for the service_role caller, not just anon/authenticated)
-- fails with PGRST203 "Could not choose the best candidate function." The
-- app degrades gracefully via analyticsFallback() when this happens, so it
-- was not an outage, but the intended RPC path never actually worked once
-- the second overload existed.
--
-- Fix: drop the reversed-argument overload. The canonical
-- (p_org_id, p_days) signature — the one the application actually calls —
-- is untouched: same body, same SECURITY DEFINER, same grants (service_role
-- only, confirmed by 20260811000001 and re-asserted below defensively).

drop function if exists public.dashboard_analytics(p_days int, p_org_id uuid);

-- Defensive re-assertion; dropping the other overload does not change this
-- one's grants, but restating keeps the security model explicit here too.
revoke execute on function public.dashboard_analytics(p_org_id uuid, p_days int) from anon, authenticated;
grant execute on function public.dashboard_analytics(p_org_id uuid, p_days int) to service_role;

-- Function signatures changed; force PostgREST to drop its cached schema so
-- the next request resolves the single remaining overload immediately
-- rather than waiting for the next automatic cache refresh.
notify pgrst, 'reload schema';
