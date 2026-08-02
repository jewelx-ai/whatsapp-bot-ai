-- Dashboard analytics aggregate (2026-07-31)
-- Avoids downloading raw messages into the browser, which is capped by
-- PostgREST/Supabase max_rows and undercounts busy workspaces.

create or replace function public.dashboard_analytics(p_org_id uuid, p_days int default 14)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      greatest(p_days, 1) as days_count,
      (
        date_trunc('day', now())
        - ((greatest(p_days, 1) - 1)::text || ' days')::interval
      ) as since_day
  ),
  day_series as (
    select generate_series(
      (select since_day from bounds),
      date_trunc('day', now()),
      interval '1 day'
    )::date as day
  ),
  message_counts as (
    select
      m.created_at::date as day,
      count(*) filter (where m.direction = 'in')::int as incoming,
      count(*) filter (where m.direction = 'out')::int as outgoing
    from public.messages m, bounds b
    where m.org_id = p_org_id
      and m.created_at >= b.since_day
    group by m.created_at::date
  )
  select jsonb_build_object(
    'totalContacts',
      (select count(*)::int from public.contacts where org_id = p_org_id),
    'totalConversations',
      (select count(*)::int from public.conversations where org_id = p_org_id),
    'openConversations',
      (select count(*)::int from public.conversations where org_id = p_org_id and status = 'open'),
    'messagesIn',
      coalesce((select sum(incoming)::int from message_counts), 0),
    'messagesOut',
      coalesce((select sum(outgoing)::int from message_counts), 0),
    'days',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'iso', ds.day::text,
              'incoming', coalesce(mc.incoming, 0),
              'outgoing', coalesce(mc.outgoing, 0)
            )
            order by ds.day
          )
          from day_series ds
          left join message_counts mc on mc.day = ds.day
        ),
        '[]'::jsonb
      )
  );
$$;

revoke all on function public.dashboard_analytics(uuid, int) from public;
grant execute on function public.dashboard_analytics(uuid, int) to service_role;
