import { NextResponse } from "next/server";
import { getPlatformAdmin } from "@/lib/platform";

// Lets the platform login page confirm, server-side, that the freshly signed-in
// account is the configured super admin before redirecting into the portal.
export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ email: admin.email });
}
