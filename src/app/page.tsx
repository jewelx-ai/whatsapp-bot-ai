import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase email-confirmation links land on the Site URL (/) with ?code=…
  // Hand the code to the auth callback so the user gets a session.
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  // The root route is the login page. Signed-in users are bounced to /inbox
  // by proxy.ts once they hit /login.
  redirect("/login");
}
