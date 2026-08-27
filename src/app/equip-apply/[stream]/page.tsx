/**
 * The public front door to an EQUIP application.
 *
 *   /equip-apply/venture-connect
 *   /equip-apply/venture-lift
 *
 * This is the URL that goes on biohubnet.ca. It exists because
 * /equip/apply/new sits under the (dashboard) route group, whose layout
 * redirects a signed-out visitor to a bare /login — losing the stream,
 * and with it the whole intent of the link they clicked. Everything
 * under that group has the same problem; this route sidesteps it for
 * the one path an outsider is actually given.
 *
 * Signed in  → straight to the wizard with the stream already chosen,
 *              which skips the question that exists only to choose one.
 * Signed out → /login carrying a callback back to exactly here, so the
 *              stream survives the round trip.
 *
 * Deliberately not a page anybody reads: it renders nothing and
 * redirects. A landing page between a button and a form is a place to
 * lose people.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { STREAM_META } from "@/lib/equip/types";

/** The URL spelling of each stream, kept apart from the stored value so
 *  a link on somebody else's website is not a database identifier. */
export const STREAMS: Record<string, "venture_connect" | "venture_lift"> = {
  "venture-connect": "venture_connect",
  ventureconnect: "venture_connect",
  connect: "venture_connect",
  "venture-lift": "venture_lift",
  venturelift: "venture_lift",
  lift: "venture_lift",
};

export async function generateMetadata(
  { params }: { params: Promise<{ stream: string }> },
): Promise<Metadata> {
  const { stream } = await params;
  const id = STREAMS[stream.toLowerCase()];
  const name = id ? STREAM_META[id].name : "EQUIP";
  return { title: `Apply — ${name}`, robots: { index: false } };
}

export default async function EquipApplyEntry({
  params,
}: {
  params: Promise<{ stream: string }>;
}) {
  const { stream } = await params;
  const id = STREAMS[stream.toLowerCase()];

  // An unknown stream goes to the EQUIP overview rather than a 404 —
  // a mistyped link on somebody else's site should still land people
  // somewhere useful.
  if (!id) redirect("/equip");

  const target = `/equip/apply/new?stream=${id}`;
  const session = await getSession();
  redirect(session ? target : `/login?callbackUrl=${encodeURIComponent(target)}`);
}
