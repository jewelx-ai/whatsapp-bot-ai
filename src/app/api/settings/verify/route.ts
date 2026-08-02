import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/org";
import { decryptWaToken } from "@/lib/secrets";
import { verifyCredentials } from "@/lib/whatsapp";

// Checks the workspace's stored WhatsApp credentials against Meta so Settings
// can show a truthful status instead of merely "a token is present".
// Read-only, and the token itself never leaves the server.
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: org } = await db
    .from("organizations")
    .select("wa_phone_number_id, wa_access_token")
    .eq("id", profile.orgId)
    .single();

  if (!org?.wa_phone_number_id || !org?.wa_access_token) {
    return NextResponse.json({ status: "not_configured" });
  }

  let token = "";
  try {
    token = decryptWaToken(org.wa_access_token);
  } catch (err) {
    console.error("Could not decrypt stored WhatsApp token for verification", err);
    return NextResponse.json(
      { status: "error", reason: "Stored WhatsApp credentials cannot be decrypted." },
      { status: 500 }
    );
  }

  const result = await verifyCredentials({
    phoneNumberId: org.wa_phone_number_id,
    token,
  });

  return NextResponse.json(result);
}
