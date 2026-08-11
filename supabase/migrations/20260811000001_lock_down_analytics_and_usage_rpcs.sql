-- Lock down EXECUTE on service-role-only RPCs (2026-08-11)
--
-- dashboard_analytics() and bump_ai_usage() are SECURITY DEFINER functions
-- that bypass RLS and trust their p_org_id argument outright. Confirmed by
-- reading every call site: their only legitimate callers are
-- src/app/api/analytics/route.ts:39 and src/lib/ai.ts:245, and both call
-- them exclusively through the service-role client (supabaseAdmin()), with
-- org_id resolved server-side — from the authenticated dashboard session
-- (getOrgForCurrentUser()) or the webhook's phone_number_id lookup
-- (getOrgByPhoneNumberId()) — never from raw client input, and never
-- through the anon/authenticated PostgREST roles. No authenticated-browser
-- call path exists for either function.
--
-- The migrations that created these functions (20260731000001,
-- 20260723000001) only ran `revoke all ... from public`, which does not
-- remove the individual EXECUTE grants Supabase applies by default to the
-- named anon/authenticated roles on every new function in an exposed
-- schema. That left both RPCs directly callable over /rest/v1/rpc/... by
-- anyone, passing an arbitrary org_id to read another tenant's analytics
-- (dashboard_analytics) or corrupt another tenant's AI usage counter
-- (bump_ai_usage). Confirmed live and exploitable: an anonymous POST to
-- /rest/v1/rpc/bump_ai_usage with a fabricated org_id reached the INSERT
-- and only failed on a foreign-key violation — a real org_id would have
-- succeeded.
--
-- Fix: explicitly revoke EXECUTE from anon and authenticated (not just
-- PUBLIC) on every existing overload of both functions, and re-affirm
-- service_role-only access. Since no legitimate authenticated-caller path
-- exists, restricting who may call these functions at all — rather than
-- adding an internal auth.uid()-based org-membership check that the sole
-- real caller (service_role, which has no user JWT/auth.uid() session)
-- could never satisfy — is the correct least-privilege fix for how these
-- functions are actually used.

revoke execute on function public.dashboard_analytics(p_org_id uuid, p_days int) from anon, authenticated;
revoke execute on function public.dashboard_analytics(p_days int, p_org_id uuid) from anon, authenticated;
revoke execute on function public.bump_ai_usage(p_org_id uuid, p_daily_limit int) from anon, authenticated;

grant execute on function public.dashboard_analytics(p_org_id uuid, p_days int) to service_role;
grant execute on function public.dashboard_analytics(p_days int, p_org_id uuid) to service_role;
grant execute on function public.bump_ai_usage(p_org_id uuid, p_daily_limit int) to service_role;
