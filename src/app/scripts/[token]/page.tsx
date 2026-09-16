/**
 * /scripts/[token] — PUBLIC collaborative editor for a shared workspace
 * script. Lives outside the (dashboard) route group, so no login is required:
 * the token is the access credential. First visit asks for a name (creating a
 * ScriptCollaborator + httpOnly cookie); after that the visitor gets the same
 * live editor admins use — original styling, presence colours, auto-save,
 * history — with all edits attributed to their name.
 */
import { headers } from "next/headers";
import { FileText } from "lucide-react";
import { resolveShareToken, getCollaborator } from "@/lib/scripts/share";
import { HtmlScriptEditor } from "@/components/workspace/HtmlScriptEditor";
import { JoinScriptForm } from "@/components/workspace/JoinScriptForm";
import { isRegistrationOpen } from "@/lib/auth/registration";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ token: string }> }

export default async function SharedScriptPage({ params }: Props) {
  const { token } = await params;
  const res = await resolveShareToken(token);
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "bhn-training-platform.vercel.app";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const scriptUrl = `${proto}://${host}/scripts/${token}`;

  if (!res.ok) {
    return (
      <Shell>
        <Notice
          title={res.reason === "expired" ? "This link has expired" : "This link isn't valid"}
          body="Ask the person who shared the script with you for a fresh link."
        />
      </Shell>
    );
  }

  const rc = (res.script.richContent as { kind?: string; html?: string; css?: string } | null) ?? null;
  if (res.script.format !== "html" || !rc?.html) {
    return (
      <Shell>
        <Notice
          title="This script can't be opened from a share link yet"
          body="Only styled (HTML) scripts support shared editing right now. Ask the owner to open it in the workspace instead."
        />
      </Shell>
    );
  }

  const collab = await getCollaborator(res.script.id);

  return (
    <Shell>
      <header className="mx-auto mb-4 flex w-full max-w-7xl items-center gap-3 px-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <FileText size={15} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-fg">{res.script.title}</h1>
          <p className="text-[11px] text-muted">
            Shared script · BHN Video Production
            {collab ? <> · editing as <span className="font-semibold text-fg">{collab.name}</span></> : null}
          </p>
        </div>
      </header>

      {collab ? (
        <div className="mx-auto w-full max-w-7xl">
          <HtmlScriptEditor
            scriptId={res.script.id}
            initialHtml={rc.html}
            css={rc.css ?? ""}
            meId={collab.id}
            meName={collab.name}
            apiBase={`/api/scripts/shared/${token}`}
            readOnly={!res.token.canEdit}
            initialEditCount={collab.editCount}
            alreadyConverted={!!collab.convertedUserId}
            scriptUrl={scriptUrl}
            // No "create an account" offer while public sign-up is closed.
            offerAccount={isRegistrationOpen()}
          />
        </div>
      ) : (
        <JoinScriptForm token={token} scriptTitle={res.script.title} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main data-theme="light" className="min-h-screen bg-elevated/40 px-4 py-6 text-fg sm:px-6">
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-20 w-full max-w-md rounded-2xl border border-line bg-card-solid p-6 text-center shadow-elevated">
      <h1 className="text-lg font-bold text-fg">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
