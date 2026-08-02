export const metadata = {
  title: "Privacy Policy | WhatsApp Bot",
};

const updatedAt = "July 31, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
        WhatsApp Bot
      </p>
      <h1 className="mt-3 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-600">Last updated: {updatedAt}</p>

      <section className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
        <p>
          WhatsApp Bot helps businesses manage WhatsApp customer conversations,
          auto-replies, AI-assisted responses, contact lists, broadcasts, and
          knowledge base content.
        </p>
        <p>
          We collect account information, workspace settings, WhatsApp contact
          details, conversation messages, delivery status events, and uploaded or
          submitted knowledge base content needed to provide the service.
        </p>
        <p>
          WhatsApp messages and contact data are used only to route conversations,
          show inbox history, send replies requested by the business, manage
          opt-in status, and improve support workflows for that workspace.
        </p>
        <p>
          We do not sell personal data. Data may be processed by infrastructure
          and service providers required to operate the product, including hosting,
          database, authentication, WhatsApp Cloud API, and configured AI providers.
        </p>
        <p>
          Workspace owners can request export or deletion of their workspace data
          by contacting the service operator from the email used to administer the
          workspace.
        </p>
        <p>
          For privacy requests, email{" "}
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
