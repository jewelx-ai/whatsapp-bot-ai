import { LegalPage } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Data Deletion | JewelX AI",
  description: "How to request deletion of workspace or account data from JewelX AI.",
};

const updatedAt = "August 10, 2026";

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Instructions" updatedAt={updatedAt}>
      <p>
        This page explains how to request deletion of data associated with a
        JewelX AI workspace or account. There is currently no self-service
        deletion button in the product &mdash; every request is handled
        manually by the platform operator as described below.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        How to request deletion
      </h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Sign in to the platform at <a href="/login" className="font-medium text-emerald-700 underline">/login</a> where applicable, so we can confirm which workspace the request applies to.</li>
        <li>
          Email{" "}
          <a
            className="font-medium text-emerald-700 underline"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address used to manage the workspace.
        </li>
        <li>
          State your workspace/account identifier (workspace name and the
          email you sign in with) and that you are requesting data deletion.
        </li>
        <li>
          We may verify your identity or authority over the workspace before
          proceeding.
        </li>
        <li>
          Once verified, associated data is deleted or anonymized within a
          reasonable period, subject to any retention required for legal,
          security, or abuse-prevention reasons.
        </li>
        <li>
          You will receive a confirmation email once the request has been
          processed.
        </li>
      </ol>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        End WhatsApp users
      </h2>
      <p>
        If you have only messaged a business through WhatsApp (you do not
        have a JewelX AI account), your conversation data is controlled by
        that business, not by JewelX AI directly. Please contact the business
        you were messaging to request deletion or correction of your
        conversation data with them. You can also message &ldquo;STOP&rdquo;
        to opt out of future messages from that business.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Platform business customers
      </h2>
      <p>
        If you administer a workspace on JewelX AI, you may request deletion
        of your workspace&apos;s account, contacts, conversations, messages,
        broadcasts, and uploaded knowledge-base content using the steps
        above.
      </p>
    </LegalPage>
  );
}
