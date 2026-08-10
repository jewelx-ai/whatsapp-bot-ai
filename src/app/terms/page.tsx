import { LegalPage } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Terms of Service | JewelX AI",
  description:
    "Terms governing use of JewelX AI's WhatsApp automation platform.",
};

const updatedAt = "August 10, 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updatedAt={updatedAt}>
      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Acceptance of terms
      </h2>
      <p>
        By creating a workspace or otherwise using JewelX AI (&ldquo;the
        service&rdquo;), you agree to these terms. If you do not agree, do
        not use the service.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Service description
      </h2>
      <p>
        JewelX AI is a multi-tenant WhatsApp automation platform: keyword
        auto-replies, AI-assisted responses, a live team inbox, human
        handoff, broadcasts, analytics, and a per-workspace knowledge base,
        delivered through the official WhatsApp Business Platform (Meta
        WhatsApp Cloud API).
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Business-user responsibilities
      </h2>
      <p>
        You are responsible for the accuracy of your workspace content,
        WhatsApp access tokens and Phone Number ID, message templates,
        contact consent records, broadcasts, and replies sent from your
        workspace, and for keeping your account credentials confidential.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        WhatsApp / Meta compliance
      </h2>
      <p>
        Use of the service to send or receive WhatsApp messages must comply
        with Meta&apos;s WhatsApp Business Platform policies and commerce
        policies, including messaging only contacts who have given proper
        consent and respecting opt-out requests.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Acceptable use
      </h2>
      <p>
        You must not use the service to send unlawful, misleading, abusive,
        or unsolicited messages, to impersonate another party, or to attempt
        to circumvent WhatsApp/Meta messaging or consent requirements.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        AI-generated content limitations
      </h2>
      <p>
        AI-assisted replies are generated automatically by a configured
        third-party AI provider based on conversation history and your
        knowledge-base content. Responses may be inaccurate or incomplete.
        You are responsible for reviewing how AI replies are configured for
        your workspace and for any content sent to your customers, whether
        generated automatically or sent manually by your team.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Account and security responsibilities
      </h2>
      <p>
        You are responsible for activity under your account and for
        promptly notifying us of any suspected unauthorized access. Role
        assignment within a workspace (owner, admin, agent) controls who can
        change WhatsApp credentials and workspace settings.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Customer content and data
      </h2>
      <p>
        You retain your workspace&apos;s content (contacts, conversations,
        knowledge-base material, broadcast templates). You are responsible
        for having the right to process that content, including any personal
        data of your customers, in accordance with applicable law.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Third-party services
      </h2>
      <p>
        The service relies on third-party providers including WhatsApp
        Business Platform, hosting and database infrastructure, and
        configured AI providers. Availability and behavior of the service can
        depend on those providers and on the credentials you configure.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Service availability
      </h2>
      <p>
        We aim to keep the service available but do not guarantee
        uninterrupted operation. Scheduled maintenance, provider outages, or
        changes to third-party APIs may affect availability.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Suspension and termination
      </h2>
      <p>
        We may suspend or remove a workspace that abuses the service,
        violates WhatsApp/Meta platform rules, creates a security risk, or
        sends messages without proper authorization. You may stop using the
        service at any time and request deletion of your data (see{" "}
        <a href="/data-deletion" className="font-medium text-emerald-700 underline">
          Data Deletion
        </a>
        ).
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Disclaimers
      </h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties of any
        kind, express or implied, including fitness for a particular purpose
        or non-infringement.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Limitation of liability
      </h2>
      <p>
        To the maximum extent permitted by law, we are not liable for
        indirect, incidental, or consequential damages arising from use of
        the service, including messages sent, AI-generated content, or
        third-party provider outages.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Changes to the service or terms
      </h2>
      <p>
        We may update these terms or the service over time. The date at the
        top of this page reflects the most recent update to these terms.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-slate-900">
        Contact
      </h2>
      <p>
        For terms questions, email{" "}
        <a
          className="font-medium text-emerald-700 underline"
          href={`mailto:${SUPPORT_EMAIL}`}
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <p className="pt-4 text-xs text-slate-500">
        Company registration, business address, and governing-law/jurisdiction
        details are not yet established for this deployment and are
        intentionally omitted rather than invented; see the final report for
        this workstream for a reminder to fill them in before public launch.
      </p>
    </LegalPage>
  );
}
