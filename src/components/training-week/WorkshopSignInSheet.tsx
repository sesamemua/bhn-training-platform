import { PrintLink } from "@/components/events/PrintLink";
import { registrantName } from "@/lib/allocation/registrant-name";
import { seatPersonKey } from "@/lib/allocation/seat-suggestions";

export interface SignInWorkshop {
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  locationName: string | null;
  bookings: {
    id: string;
    submissionId: string | null;
    userId: string | null;
    status: string;
    withdrawnAt: Date | null;
    submission: { data: unknown; email: string | null } | null;
    user: { name: string | null; email: string | null } | null;
  }[];
}

export function WorkshopSignInSheet({ workshop, sortBy = "first" }: { workshop: SignInWorkshop; sortBy?: "first" | "last" }) {
  const people = new Map<string, { name: string; first: string; last: string }>();
  for (const b of workshop.bookings) {
    if (b.status !== "confirmed" || b.withdrawnAt) continue;
    const data = (b.submission?.data ?? {}) as Record<string, unknown>;
    const email = (typeof data.trainee_email === "string" && data.trainee_email.trim()) || b.submission?.email || b.user?.email || "";
    const key = seatPersonKey(email, b.submissionId ?? b.userId ?? b.id);
    if (!people.has(key)) {
      const name = registrantName(data) || b.user?.name?.trim() || "Name not provided";
      const words = name.replace(/^(?:(?:dr|prof|mr|mrs|ms|mx)\.?\s+)+/i, "").trim().split(/\s+/);
      // shortcut: full-name-only records use the final word; collect separate names for reliable compound-surname sorting.
      const last = typeof data.last_name === "string" && data.last_name.trim() && name.toLocaleLowerCase("en").endsWith(data.last_name.trim().toLocaleLowerCase("en")) ? data.last_name.trim() : words.at(-1)!;
      people.set(key, { name, first: words[0], last });
    }
  }
  const compare = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
  const names = [...people.values()].sort((a, b) => compare(a[sortBy], b[sortBy]) || compare(a.name, b.name)).map((p) => p.name);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
  const pages = Array.from({ length: Math.max(1, Math.ceil(names.length / 90)) }, (_, i) => names.slice(i * 90, (i + 1) * 90));

  return <main className="workshop-sign-in">
    <style>{`
      .workshop-sign-in { background: #eee; color: #172126; min-height: 100vh; padding: 24px 12px; font-family: Arial, sans-serif; }
      .workshop-sign-in .controls { max-width: 720px; margin: 0 auto 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
      .workshop-sign-in .controls button { background: #174c52; color: white; padding: 12px 18px; border-radius: 6px; font-size: 15px; }
      .workshop-sign-in .controls a { color: #174c52; text-decoration: underline; }
      .workshop-sign-in .sort { display: inline-flex; gap: 2px; padding: 3px; border-radius: 6px; background: #dce3e4; }
      .workshop-sign-in .sort a { padding: 7px 10px; font-size: 13px; border-radius: 4px; text-decoration: none; }
      .workshop-sign-in .sort a[aria-current=page] { background: white; color: #172126; font-weight: 700; }
      .workshop-sign-in .sheet { max-width: 800px; margin: 0 auto 24px; padding: 24px; background: white; overflow-wrap: anywhere; }
      .workshop-sign-in h1 { font-family: inherit; font-size: 21px; letter-spacing: 0; line-height: 1.2; font-weight: 700; margin: 6px 0 8px; }
      .workshop-sign-in .brand { font-size: 13px; font-weight: bold; text-transform: uppercase; }
      .workshop-sign-in p { font-size: 12px; line-height: 1.35; margin: 3px 0; }
      .workshop-sign-in .columns { display: grid; gap: 14px; margin-top: 12px; align-items: start; }
      .workshop-sign-in table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .workshop-sign-in th { text-align: left; font-size: 11px; padding: 5px 3px; border-bottom: 2px solid #263a42; }
      .workshop-sign-in td { padding: 3px; font-size: 13px; line-height: 16px; border-bottom: 1px solid #bbc3c6; height: 24px; }
      .workshop-sign-in .number { width: 25px; color: #4a555a; white-space: nowrap; }
      .workshop-sign-in .initials { width: 45px; border-left: 1px solid #bbc3c6; }
      .workshop-sign-in footer { margin-top: 10px; font-size: 10px; color: #4a555a; display: flex; justify-content: space-between; gap: 12px; }
      @page { size: letter portrait; margin: 10mm; }
      @media print {
        html, body { background: white !important; color: #172126 !important; padding: 0 !important; margin: 0 !important; height: auto !important; min-height: 0 !important; }
        body > *:not(:has(.workshop-sign-in)):not(.workshop-sign-in) { display: none !important; }
        .workshop-sign-in { padding: 0; background: white; min-height: 0; }
        .workshop-sign-in .controls { display: none; }
        .workshop-sign-in .sheet { max-width: none; padding: 0; margin: 0; break-after: page; }
        .workshop-sign-in .sheet:last-child { break-after: auto; }
        .workshop-sign-in tr { break-inside: avoid; }
        .workshop-sign-in thead { display: table-header-group; }
      }
      @media screen and (max-width: 700px) {
        .workshop-sign-in .sheet { padding: 18px 12px; }
        .workshop-sign-in .columns { grid-template-columns: 1fr !important; }
        .workshop-sign-in .initials { width: 78px; }
        .workshop-sign-in .number { width: 40px; }
      }
    `}</style>
    <nav className="controls" aria-label="Sign-in sheet controls">
      <PrintLink />
      <div className="sort" role="group" aria-label="Sort attendees by">
        <a href="?sort=first" aria-current={sortBy === "first" ? "page" : undefined}>First name</a>
        <a href="?sort=last" aria-current={sortBy === "last" ? "page" : undefined}>Last name</a>
      </div>
      <a href="/admin/workspace/training-admin?tab=registrants">Back to registrants</a>
    </nav>
    {pages.map((page, index) => {
      const columns = Math.max(1, Math.ceil(page.length / 30));
      const rows = Math.max(1, Math.ceil(page.length / columns));
      return <section className="sheet" key={index} aria-label={`Sign-in sheet page ${index + 1}`}>
      <header>
        <p className="brand">BioHubNet · Training Week · Sign-in sheet</p>
        <h1>{workshop.title}</h1>
        <p>{date.format(workshop.startDateTime)} · {time.format(workshop.startDateTime)} – {time.format(workshop.endDateTime)} (Toronto time)</p>
        {workshop.locationName && <p>{workshop.locationName}</p>}
        <p>Please put your initials beside your name.</p>
      </header>
      <div className="columns" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }, (_, column) => <table key={column} aria-label={`Attendees ${index * 90 + column * rows + 1} to ${index * 90 + Math.min((column + 1) * rows, page.length)}`}>
        <thead><tr><th className="number" scope="col">#</th><th scope="col">Participant name</th><th className="initials" scope="col">Initials</th></tr></thead>
        <tbody>{page.slice(column * rows, (column + 1) * rows).map((name, row) => <tr key={row}><td className="number">{index * 90 + column * rows + row + 1}</td><td>{name}</td><td className="initials" /></tr>)}</tbody>
      </table>)}
      </div>
      {names.length === 0 && <p>No approved attendees yet.</p>}
      <footer><span>{names.length} approved attendees · Sorted by {sortBy} name</span><span>Page {index + 1} of {pages.length}</span></footer>
    </section>; })}
  </main>;
}
