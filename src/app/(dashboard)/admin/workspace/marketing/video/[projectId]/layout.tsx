/**
 * Every tab of a video project leaves room below its last section, so
 * that section can be scrolled up to the top of the screen. Without it,
 * a tab that fits the screen exactly (Prep day, Call sheets, Before the
 * shoot on a large display) cannot scroll at all, and its last card stays
 * pinned to the bottom edge.
 */
export default function VideoProjectLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-[60vh]">{children}</div>;
}
