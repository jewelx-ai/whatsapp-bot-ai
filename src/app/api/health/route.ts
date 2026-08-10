import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Unauthenticated liveness probe for Docker HEALTHCHECK / load balancers.
// Intentionally has no DB/provider calls and returns nothing sensitive.
export async function GET() {
  return NextResponse.json({ status: "UP" });
}
