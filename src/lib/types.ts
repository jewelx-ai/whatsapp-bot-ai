// Shared row types matching supabase/schema.sql

export type Organization = {
  id: string;
  name: string;
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  ai_enabled: boolean;
  plan: "free" | "starter" | "pro";
  plan_status: "active" | "past_due" | "canceled";
  created_at: string;
};

export type Profile = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  role: "owner" | "admin" | "agent";
  created_at: string;
};

export type Contact = {
  id: string;
  org_id: string;
  wa_phone: string;
  name: string | null;
  tags: string[];
  opted_in: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  org_id: string;
  contact_id: string;
  status: "bot" | "open" | "closed";
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
  contacts?: Contact; // joined
};

export type Message = {
  id: string;
  org_id: string;
  conversation_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  media_url: string | null;
  wa_message_id: string | null;
  status: string;
  created_at: string;
};

export type AutoReply = {
  id: string;
  org_id: string;
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  response_text: string;
  active: boolean;
  created_at: string;
};
