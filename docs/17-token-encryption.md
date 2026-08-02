# 17 — WhatsApp Token Encryption

## Status

Implemented in code on 2026-07-31. New WhatsApp access tokens saved through
`POST /api/settings` are stored as versioned AES-256-GCM ciphertext in
`organizations.wa_access_token`.

The database column stays as `text`, so no schema migration is required for this
change. Existing plaintext rows remain readable for backwards compatibility and
are encrypted the next time an owner/admin saves a replacement token in
Settings.

## Required environment

Set this server-only variable in every runtime environment:

```bash
WHATSAPP_TOKEN_ENCRYPTION_KEY=<32-byte key>
```

Recommended generation:

```bash
openssl rand -base64 32
```

Accepted formats are 32 bytes encoded as base64, 64 hex characters, or a raw
32-byte UTF-8 string. Do not prefix it with `NEXT_PUBLIC_`.

## Runtime behavior

- `src/lib/secrets.ts` encrypts and decrypts tenant WhatsApp tokens.
- `POST /api/settings` encrypts a submitted `accessToken` before writing it.
- `GET /api/settings` decrypts server-side only to produce `tokenHint`
  (`length` and `last4`) and `connected`; it never returns the token.
- `GET /api/settings/verify`, manual replies, broadcasts, and webhook replies
  decrypt server-side before calling Meta.
- Legacy plaintext values are accepted by the decrypt helper so existing tenants
  keep working during migration.

If a stored value is encrypted and the runtime has no valid
`WHATSAPP_TOKEN_ENCRYPTION_KEY`, credential-dependent operations return an error
instead of attempting to send with bad credentials.

## Rotation and migration

For a tenant with an existing plaintext token:

1. Configure `WHATSAPP_TOKEN_ENCRYPTION_KEY`.
2. Open `/settings` as an owner/admin.
3. Paste the current permanent WhatsApp token again and save.
4. Confirm `GET /api/settings` still returns a `tokenHint` and never the token.
5. Confirm `GET /api/settings/verify` reports `ok`.

For key rotation, add a decrypt-with-old/encrypt-with-new maintenance path before
changing the environment variable. The current implementation supports one
active key.
