# 15 — Flowcharts

End-to-end flow diagrams for the whole application, as implemented on
2026-07-23. Rendered with Mermaid (GitHub, VS Code, and most Markdown viewers
display these natively).

Related: [02-architecture.md](02-architecture.md),
[05-bot-logic.md](05-bot-logic.md), [04-api-reference.md](04-api-reference.md),
[14-platform-admin.md](14-platform-admin.md).

---

## 1. System overview

```mermaid
flowchart LR
  subgraph People
    CUST["WhatsApp customer"]
    AGENT["Tenant user<br/>owner / admin / agent"]
    OP["Platform operator<br/>single account"]
  end

  subgraph App["Next.js 16 app"]
    WH["POST /api/webhook<br/>shared, all tenants"]
    DASH["Tenant dashboard<br/>/inbox /contacts /auto-replies<br/>/knowledge /broadcasts /analytics<br/>/settings"]
    PORTAL["Operator portal<br/>/admin"]
    API["Route handlers<br/>/api/*"]
  end

  subgraph External
    META["Meta WhatsApp<br/>Cloud API v21.0"]
    ZAI["AI provider<br/>Z.ai GLM or Google Gemini"]
    VOY["Voyage embeddings<br/>optional"]
  end

  SB["Supabase<br/>Postgres + Auth + RLS<br/>Realtime + pgvector"]

  CUST -->|"message"| META
  META -->|"signed webhook"| WH
  WH --> SB
  WH -->|"reply"| META
  META -->|"delivered"| CUST

  WH -.->|"AI fallback"| ZAI
  WH -.->|"retrieval"| VOY

  AGENT -->|"/login"| DASH
  OP -->|"/admin/login"| PORTAL
  DASH --> API
  PORTAL --> API
  API --> SB
  API -->|"manual reply / broadcast"| META
  SB -.->|"Realtime"| DASH
```

---

## 2. Routing and access control

Matched application requests pass through `proxy.ts` first; pages and API routes then re-check
authorization server-side. Navigation is never the only protection.

```mermaid
flowchart TD
  REQ["Incoming request"] --> MW["proxy.ts<br/>refresh Supabase session"]
  MW --> ISOP{"Signed in as the<br/>platform operator?"}

  ISOP -->|"yes, and path is<br/>/inbox /onboarding /login"| TOPLAT["Redirect → /admin"]
  ISOP -->|"no"| AREA{"Which area?"}

  AREA -->|"/admin/*"| PA{"Signed in?"}
  PA -->|"no"| PLOGIN["Redirect → /admin/login"]
  PA -->|"yes"| PGUARD["requirePlatformAdmin&#40;&#41;"]
  PGUARD --> ISSUPER{"email ==<br/>PLATFORM_SUPER_ADMIN_EMAIL?"}
  ISSUPER -->|"no"| TOINBOX["Redirect → /inbox"]
  ISSUPER -->|"yes"| PORTAL["Render operator portal"]

  AREA -->|"dashboard paths"| DA{"Signed in?"}
  DA -->|"no"| TLOGIN["Redirect → /login"]
  DA -->|"yes"| PROF{"profiles.org_id set?"}
  PROF -->|"no"| ONB["Redirect → /onboarding"]
  PROF -->|"yes"| ROLE{"Route needs<br/>owner/admin?"}
  ROLE -->|"yes, and role is agent"| TOINBOX2["Redirect → /inbox"]
  ROLE -->|"otherwise"| DASH["Render dashboard"]

  AREA -->|"/api/admin/*"| APIP{"Operator?"}
  APIP -->|"no"| F403["403 Forbidden"]
  APIP -->|"yes"| APIOK["Execute"]

  AREA -->|"/api/webhook"| SIG["HMAC signature check"]
  AREA -->|"public: /login /admin/login<br/>/reset-password /auth/callback"| PUB["Render"]
```

---

## 3. Inbound message: the core flow

```mermaid
flowchart TD
  M["Customer sends WhatsApp message"] --> META["Meta Cloud API"]
  META --> POST["POST /api/webhook"]

  POST --> SIG{"X-Hub-Signature-256 valid?<br/>timing-safe HMAC"}
  SIG -->|"no, or app secret missing<br/>(fails closed)"| R401["401 Invalid signature"]
  SIG -->|"yes"| JSON{"Parseable JSON?"}
  JSON -->|"no"| R400["400 Bad JSON"]
  JSON -->|"yes"| LOOP["For each entry → change"]

  LOOP --> PID{"metadata.phone_number_id<br/>present?"}
  PID -->|"no"| SKIP1["Skip"]
  PID -->|"yes"| ORG["Look up organization<br/>by Phone Number ID<br/>cached per request"]

  ORG --> FOUND{"Tenant found?"}
  FOUND -->|"no"| SKIP2["Log + skip<br/>unknown number"]
  FOUND -->|"yes"| SUSP{"organizations.suspended?"}
  SUSP -->|"yes"| SKIP3["Log + skip<br/>no storage, no reply"]
  SUSP -->|"no"| KIND{"Payload type"}

  KIND -->|"statuses[]"| ST["Update messages.status<br/>by org + wa_message_id"]
  KIND -->|"messages[]"| IN["handleIncomingMessage"]

  IN --> TEXT["Extract text<br/>text | interactive button/list<br/>else '[type]' placeholder"]
  TEXT --> CONTACT["Upsert contact<br/>on org_id + wa_phone<br/>set last_seen_at"]
  CONTACT --> CONV{"Open conversation<br/>for this contact?"}
  CONV -->|"no"| NEWC["Create conversation<br/>status = bot"]
  CONV -->|"yes"| USEC["Reuse it"]
  NEWC --> TOUCH
  USEC --> TOUCH["Update last_message_at"]

  TOUCH --> INS["Insert message<br/>unique wa_message_id"]
  INS --> DUP{"Insert result"}
  DUP -->|"23505 conflict"| DEDUPE["Duplicate delivery →<br/>stop, no reply<br/>(idempotency gate)"]
  DUP -->|"other error"| THROW["Throw → 500<br/>Meta retries"]
  DUP -->|"ok"| READ["Mark as read"]

  READ --> HASTEXT{"Non-empty text?"}
  HASTEXT -->|"no"| DONE200["200 ok"]
  HASTEXT -->|"yes"| BOT["runAutoReply<br/>see §4"]
  BOT --> DONE200
  ST --> DONE200
```

---

## 4. Bot decision tree

```mermaid
flowchart TD
  START["runAutoReply&#40;text, conversation&#41;"] --> HUMAN{"conversation.status<br/>== open?"}
  HUMAN -->|"yes, human owns it"| NONE["No automation"]

  HUMAN -->|"no"| KW{"Active keyword rule matches?<br/>exact | contains | starts_with"}
  KW -->|"yes"| SEND1["Send rule response_text"]
  SEND1 --> ISHELP{"normalized keyword<br/>== 'help'?"}
  ISHELP -->|"yes"| OPEN1["conversation → open<br/>hand off to human"]
  ISHELP -->|"no"| END1["Done"]

  KW -->|"no"| AION{"ZAI_API_KEY set<br/>AND organizations.ai_enabled?"}
  AION -->|"no"| FB["Send static fallback"]

  AION -->|"yes"| QUOTA{"active plan +<br/>bump_ai_usage&#40;&#41;<br/>within plan cap?"}
  QUOTA -->|"no, cap reached"| FB
  QUOTA -->|"DB error"| AIGO["Fail open → continue"]
  QUOTA -->|"yes"| AIGO

  AIGO --> HIST["Load last 20 messages<br/>conversation memory"]
  HIST --> RAG["Retrieve KB context<br/>see §5"]
  RAG --> GLM["Call AI provider (primary, then failover)<br/>system prompt + knowledge_base + history"]

  GLM --> RESULT{"Response"}
  RESULT -->|"error, refusal, or empty"| FB
  RESULT -->|"contains [HANDOFF]"| HO["Strip token<br/>send remaining text<br/>conversation → open"]
  RESULT -->|"normal text"| SEND2["Send AI reply"]
```

---

## 5. Knowledge base: ingestion and retrieval

```mermaid
flowchart TD
  subgraph Ingest["Ingestion — authenticated tenant user"]
    P["PDF upload<br/>POST /api/kb/upload<br/>.pdf, ≤20 MB"] --> EXTRACT["unpdf text extraction"]
    U["Website<br/>POST /api/kb/url"] --> SSRF{"SSRF guard<br/>http/https only<br/>DNS-resolve host<br/>block private/loopback/<br/>link-local/reserved<br/>re-validate ≤3 redirects<br/>cap 5 MB, 20 s"}
    SSRF -->|"blocked"| REJ["422 Blocked host"]
    SSRF -->|"allowed"| CLEAN["cheerio: strip script/style/<br/>nav/footer/header"]
    T["Pasted text<br/>POST /api/kb/text"] --> CHUNK

    EXTRACT --> CHUNK["Chunk text"]
    CLEAN --> CHUNK
    CHUNK --> EMB{"VOYAGE_API_KEY set?"}
    EMB -->|"yes"| VEC["voyage-3.5-lite<br/>vector&#40;1024&#41;"]
    EMB -->|"no"| NOVEC["No embedding"]
    VEC --> STORE
    NOVEC --> STORE["kb_documents + kb_chunks<br/>with org_id"]
  end

  subgraph Retrieve["Retrieval — during an AI reply"]
    Q["Latest customer turn"] --> HASEMB{"Embeddings available?"}
    HASEMB -->|"yes"| MATCH["match_kb_chunks RPC<br/>pgvector cosine, top 5"]
    HASEMB -->|"no"| FTS["Postgres full-text search<br/>fallback"]
    MATCH --> CTX
    FTS --> CTX["Inject into<br/>&lt;knowledge_base&gt; system prompt"]
  end

  STORE -.-> HASEMB
```

---

## 6. Outbound: manual reply and broadcast

```mermaid
flowchart TD
  subgraph Manual["Human reply from /inbox"]
    A1["Agent types reply"] --> A2["POST /api/messages/send"]
    A2 --> A3{"Session + org?"}
    A3 -->|"no"| A401["401"]
    A3 -->|"yes"| A4{"Conversation belongs<br/>to this org?"}
    A4 -->|"no"| A404["404"]
    A4 -->|"yes"| A5{"Tenant WhatsApp<br/>credentials present?"}
    A5 -->|"no"| A409["409"]
    A5 -->|"yes"| A6["sendText via Graph API"]
    A6 -->|"Graph error"| A502["502<br/>details logged server-side only"]
    A6 -->|"ok"| A7["Persist outbound message<br/>conversation → open"]
  end

  subgraph Bcast["Broadcast"]
    B1["Template + language + tag"] --> B2["POST /api/broadcasts"]
    B2 --> B3{"Session + org?"}
    B3 -->|"no"| B401["401"]
    B3 -->|"yes"| B4["Create campaign<br/>idempotency key"]
    B4 --> B5["Enqueue opted-in recipients<br/>by tag, max 1000"]
    B5 --> B6["Claim queued recipient rows<br/>bounded batch"]
    B6 --> B7["sendTemplate per claimed row"]
    B7 --> B8["Update recipient + aggregate<br/>sent/failed/progress"]
    B8 --> B9["PATCH repeats until done<br/>or worker cron continues"]
  end
```

---

## 7. Tenant lifecycle

```mermaid
flowchart TD
  S1["Sign up at /login"] --> S2["auth trigger handle_new_user&#40;&#41;<br/>creates profile with email,<br/>org_id = null"]
  S2 --> S3["Redirected to /onboarding"]
  S3 --> S4["create_organization&#40;name&#41;<br/>org + caller as owner<br/>+ seed rules hi/hello/price/help"]
  S4 --> S5["/settings: Phone Number ID<br/>+ access token, AI toggle"]
  S5 --> S6["Operator registers webhook<br/>in the shared Meta app"]
  S6 --> S7["Inbound messages route<br/>to this workspace"]

  ALT["Operator-provisioned path"] --> ALT1["Operator creates workspace<br/>/admin/organizations"]
  ALT1 --> ALT2["Operator creates owner account<br/>/admin/users, role = owner"]
  ALT2 --> ALT3["Hands over temporary password"]
  ALT3 --> S5
```

---

## 8. Platform operator flows

```mermaid
flowchart TD
  L["/admin/login"] --> L1["Supabase signInWithPassword"]
  L1 --> L2{"Credentials valid?"}
  L2 -->|"no"| LE["Show error"]
  L2 -->|"yes"| L3["GET /api/admin/session"]
  L3 --> L4{"Is the configured operator?"}
  L4 -->|"no"| L5["Sign out again<br/>'use workspace sign-in'"]
  L4 -->|"yes"| OV["/admin overview"]

  OV --> ORGS["/admin/organizations"]
  OV --> USERS["/admin/users"]
  OV --> ACC["/admin/access"]

  ORGS --> C1["New workspace<br/>name + plan"]
  C1 --> C2["POST /api/admin/orgs"]
  ORGS --> D1["Delete workspace"]
  D1 --> D2{"Typed name matches exactly?"}
  D2 -->|"no"| D3["400 rejected"]
  D2 -->|"yes"| D4["DELETE /api/admin/orgs/[id]<br/>tenant data cascades<br/>members detached: org_id → null"]

  ORGS --> DET["Organization detail"]
  DET --> P1["PATCH /api/admin/orgs/[id]<br/>plan | plan_status | suspended"]
  P1 --> P2["suspended = true →<br/>webhook skips this tenant"]

  USERS --> N1["New user<br/>email, password, workspace, role"]
  N1 --> N2["POST /api/admin/users<br/>pre-confirmed account<br/>+ profile org/role"]
  USERS --> R1["Delete user"]
  R1 --> R2{"Typed email matches?<br/>Target is the operator?"}
  R2 -->|"mismatch or operator"| R3["400 rejected"]
  R2 -->|"ok"| R4["DELETE /api/admin/users<br/>profile cascades"]
```

---

## 9. Data model

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ PROFILES : "members (set null on delete)"
  ORGANIZATIONS ||--o{ CONTACTS : cascade
  ORGANIZATIONS ||--o{ CONVERSATIONS : cascade
  ORGANIZATIONS ||--o{ MESSAGES : cascade
  ORGANIZATIONS ||--o{ AUTO_REPLIES : cascade
  ORGANIZATIONS ||--o{ BROADCASTS : cascade
  ORGANIZATIONS ||--o{ KB_DOCUMENTS : cascade
  ORGANIZATIONS ||--o{ KB_CHUNKS : cascade
  ORGANIZATIONS ||--o{ USAGE_DAILY : cascade
  CONTACTS ||--o{ CONVERSATIONS : has
  CONVERSATIONS ||--o{ MESSAGES : contains
  KB_DOCUMENTS ||--o{ KB_CHUNKS : "chunked into"
  AUTH_USERS ||--|| PROFILES : "1:1 cascade"

  ORGANIZATIONS {
    uuid id PK
    text name
    text wa_phone_number_id "unique, routes webhooks"
    text wa_access_token "encrypted on new saves, not client-readable"
    boolean ai_enabled
    text plan "free|starter|pro, enforced"
    text plan_status
    boolean suspended "blocks webhook"
  }
  PROFILES {
    uuid id PK "= auth.users.id"
    uuid org_id FK "null = no workspace"
    text full_name
    text email "synced copy"
    text role "owner|admin|agent"
  }
  USAGE_DAILY {
    uuid org_id PK
    date day PK
    int ai_replies "daily AI cap"
  }
```

---

## 10. Security layers

```mermaid
flowchart TD
  subgraph L1["1 — Edge"]
    E1["proxy.ts: session refresh<br/>+ area redirects"]
  end
  subgraph L2["2 — Server guards"]
    G1["Dashboard layout: session + org"]
    G2["requirePlatformAdmin: single operator"]
    G3["Role checks: owner/admin for<br/>credential writes"]
    G4["Webhook: HMAC, fails closed"]
  end
  subgraph L3["3 — Database"]
    D1["RLS: org_id = current_org_id&#40;&#41;"]
    D2["Column privileges:<br/>no client write to org_id/role,<br/>no client read of wa_access_token,<br/>org updates limited to name/ai_enabled"]
    D3["Service role bypasses RLS →<br/>routes must scope by org explicitly"]
  end
  subgraph L4["4 — Cost & abuse"]
    Q1["usage_daily + bump_ai_usage&#40;&#41;"]
    Q2["SSRF guard on URL ingestion"]
    Q3["Atomic webhook dedupe"]
  end

  L1 --> L2 --> L3 --> L4

  OPEN["Still open:<br/>legacy token migration ·<br/>no per-minute rate limits ·<br/>no billing automation ·<br/>broadcast worker/scheduling ·<br/>no audit log"]
  L4 -.-> OPEN
```
