// Shared row types matching supabase/schema.sql

export type Contact = {
  id: string;
  wa_phone: string;
  name: string | null;
  tags: string[];
  opted_in: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  contact_id: string;
  status: "bot" | "open" | "closed";
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
  contacts?: Contact; // joined
};

export type Message = {
  id: string;
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
  trigger_keyword: string;
  match_type: "exact" | "contains" | "starts_with";
  response_text: string;
  active: boolean;
  created_at: string;
};
