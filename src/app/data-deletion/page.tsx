export const metadata = {
  title: "Data Deletion | WhatsApp Bot",
};

export default function DataDeletionPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-slate-900">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
        WhatsApp Bot
      </p>
      <h1 className="mt-3 text-3xl font-bold">Data Deletion Instructions</h1>

      <section className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
        <p>
          Workspace owners can request deletion of their WhatsApp Bot account,
          workspace, contacts, conversations, messages, broadcasts, and uploaded
          knowledge base content.
        </p>
        <p>
          To request deletion, email{" "}
          <a
            className="font-medium text-emerald-700 underline"
            href="mailto:singaporearun2003@gmail.com"
          >
            singaporearun2003@gmail.com
          </a>{" "}
          from the email address used to manage the workspace. Include your
          workspace name and the WhatsApp phone number ID connected to the
          workspace.
        </p>
        <p>
          We will verify ownership before deleting data. Once verified, deletion
          will be completed within a reasonable period unless retention is required
          for legal, security, or abuse-prevention reasons.
        </p>
      </section>
    </main>
  );
}
