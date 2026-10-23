import { PrintLink } from "@/components/events/PrintLink";
import { registrantName } from "@/lib/allocation/registrant-name";

export interface SignInWorkshop {
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  locationName: string | null;
  bookings: {
    status: string;
    withdrawnAt: Date | null;
    submission: { data: unknown } | null;
    user: { name: string | null } | null;
  }[];
}

export function WorkshopSignInSheet({ workshop }: { workshop: SignInWorkshop }) {
  const names = workshop.bookings
    .filter((b) => b.status === "confirmed" && !b.withdrawnAt)
    .map((b) => registrantName(b.submission?.data as Record<string, unknown> | undefined) || b.user?.name?.trim() || "Name not provided")
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
  const pages = Array.from({ length: Math.max(1, Math.ceil(names.length / 18)) }, (_, i) => names.slice(i * 18, (i + 1) * 18));

  return <main className="workshop-sign-in">
    <style>{`
      .workshop-sign-in { background: #eee; color: #172126; min-height: 100vh; padding: 24px 12px; font-family: Arial, sans-serif; }
      .workshop-sign-in .controls { max-width: 720px; margin: 0 auto 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
      .workshop-sign-in .controls button { background: #174c52; color: white; padding: 12px 18px; border-radius: 6px; font-size: 15px; }
      .workshop-sign-in .controls a { color: #174c52; text-decoration: underline; }
      .workshop-sign-in .sheet { max-width: 720px; margin: 0 auto 24px; padding: 28px; background: white; overflow-wrap: anywhere; }
      .workshop-sign-in h1 { font-size: 23px; line-height: 1.2; font-weight: 700; margin: 8px 0 12px; }
      .workshop-sign-in .brand { font-size: 13px; font-weight: bold; text-transform: uppercase; }
      .workshop-sign-in p { font-size: 13px; line-height: 1.5; margin: 4px 0; }
      .workshop-sign-in table { width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed; }
      .workshop-sign-in th { text-align: left; font-size: 12px; padding: 8px; border-bottom: 2px solid #263a42; }
      .workshop-sign-in td { padding: 9px 8px; font-size: 16px; line-height: 1.4; border-bottom: 1px solid #bbc3c6; height: 40px; }
      .workshop-sign-in .number { width: 38px; color: #4a555a; }
      .workshop-sign-in .initials { width: 110px; border-left: 1px solid #bbc3c6; }
      .workshop-sign-in footer { margin-top: 16px; font-size: 11px; color: #4a555a; display: flex; justify-content: space-between; gap: 12px; }
      @page { size: letter portrait; margin: 12mm; }
      @media print {
        html, body { background: white !important; color: #172126 !important; padding: 0 !important; margin: 0 !important; }
        body > *:not(:has(.workshop-sign-in)):not(.workshop-sign-in) { display: none !important; }
        .workshop-sign-in { padding: 0; background: white; min-height: 0; }
        .workshop-sign-in .controls { display: none; }
        .workshop-sign-in .sheet { max-width: none; padding: 0; margin: 0; break-after: page; }
        .workshop-sign-in .sheet:last-child { break-after: auto; }
        .workshop-sign-in tr { break-inside: avoid; }
        .workshop-sign-in thead { display: table-header-group; }
      }
      @media screen and (max-width: 480px) {
        .workshop-sign-in .sheet { padding: 18px 12px; }
        .workshop-sign-in .initials { width: 78px; }
        .workshop-sign-in .number { width: 30px; }
      }
    `}</style>
    <nav className="controls" aria-label="Sign-in sheet controls">
      <PrintLink />
      <a href="/admin/workspace/training-admin?tab=registrants">Back to registrants</a>
    </nav>
    {pages.map((page, index) => <section className="sheet" key={index} aria-label={`Sign-in sheet page ${index + 1}`}>
      <header>
        <p className="brand">BioHubNet · Training Week · Sign-in sheet</p>
        <h1>{workshop.title}</h1>
        <p>{date.format(workshop.startDateTime)} · {time.format(workshop.startDateTime)} – {time.format(workshop.endDateTime)} (Toronto time)</p>
        {workshop.locationName && <p>{workshop.locationName}</p>}
        <p>Please put your initials beside your name.</p>
      </header>
      <table>
        <thead><tr><th className="number" scope="col">#</th><th scope="col">Participant name</th><th className="initials" scope="col">Initials</th></tr></thead>
        <tbody>{page.map((name, row) => <tr key={row}><td className="number">{index * 18 + row + 1}</td><td>{name}</td><td className="initials" /></tr>)}</tbody>
      </table>
      {names.length === 0 && <p>No approved attendees yet.</p>}
      <footer><span>{names.length} approved attendees · Alphabetical by name</span><span>Page {index + 1} of {pages.length}</span></footer>
    </section>)}
  </main>;
}
