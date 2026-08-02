export const metadata = {
  title: "Terms of Service | WhatsApp Bot",
};

const updatedAt = "July 31, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
        WhatsApp Bot
      </p>
      <h1 className="mt-3 text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-600">Last updated: {updatedAt}</p>

      <section className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
        <p>
          By using WhatsApp Bot, you agree to use the service only for lawful
          customer communication and to comply with WhatsApp Business Platform,
          Meta, privacy, spam, and consumer protection requirements.
        </p>
        <p>
          You are responsible for the accuracy of your workspace content, WhatsApp
          access tokens, templates, contact consent, broadcasts, and replies sent
          from your workspace.
        </p>
        <p>
          You must not use the service to send unlawful, misleading, abusive, or
          unsolicited messages. Broadcasts must be sent only to contacts who have
          permissioned communication from your business.
        </p>
        <p>
          The service may rely on third-party providers including hosting,
          authentication, database, WhatsApp Cloud API, and configured AI services.
          Availability depends on those providers and the credentials configured
          in your workspace.
        </p>
        <p>
          We may suspend or remove a workspace that abuses the service, violates
          platform rules, creates security risk, or sends messages without proper
          authorization.
        </p>
        <p>
          For terms questions, email{" "}
          <a
            className="font-medium text-emerald-700 underline"
            href="mailto:singaporearun2003@gmail.com"
          >
            singaporearun2003@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
