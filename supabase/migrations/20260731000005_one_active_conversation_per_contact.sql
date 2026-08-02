-- Keep the inbox to one active chat per WhatsApp contact.
--
-- Older active duplicate conversations are closed before adding the partial
-- unique index. Their messages remain available in history until a user deletes
-- the chat from the Inbox.

with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, contact_id
      order by last_message_at desc, created_at desc, id desc
    ) as rn
  from public.conversations
  where status <> 'closed'
)
update public.conversations c
set status = 'closed'
from ranked r
where c.id = r.id
  and r.rn > 1;

create unique index if not exists idx_one_active_conversation_per_contact
  on public.conversations (org_id, contact_id)
  where status <> 'closed';
