/**
 * How far away a postal code is from 144 College Street.
 *
 * Travel support is for a one-way, door-to-door journey of more than
 * two hours, and the form asks the registrant to judge that themselves.
 * People are generous with the estimate: the Travel follow-up list has
 * had registrants with downtown Toronto postal codes on it, who were
 * never going to be approved and only found that out late.
 *
 * So the form works it out while they type. The registrant already
 * gives the first three characters of their postal code — the Forward
 * Sortation Area, which is exactly the resolution this needs.
 *
 * A BAND, NEVER A NUMBER. "About 1½ to 2 hours" is a claim this table
 * can stand behind; "1 h 47" is not, and a precise-looking figure would
 * be argued with. Nothing here refuses anybody — a registrant whose
 * journey the table reads as short can still ask for a review, because
 * the table knows an FSA and they know their actual morning.
 *
 * Replacing this with a routing API later is one function: same input,
 * same shape out. It is not worth an API key today — the question is
 * only ever "clearly under, clearly over, or close?".
 *
 * Pure module: no network, no React, no Prisma.
 */

export type TravelBand =
  /** Clearly inside two hours; travel support does not apply. */
  | "local"
  /** Straddles the two-hour line — the case worth a human looking. */
  | "borderline"
  /** Clearly beyond two hours. */
  | "far";

export interface TravelEstimate {
  /** The three characters the table matched on, uppercased. */
  fsa: string;
  /** Where that is, in words a registrant will recognise. */
  place: string;
  /** Typical one-way door-to-door minutes, low and high. */
  low: number;
  high: number;
  band: TravelBand;
}

/**
 * Prefix → typical one-way minutes to 144 College Street.
 *
 * Longest prefix wins, so a two-character region can be stated once and
 * the parts of it that cross the two-hour line named individually. The
 * ranges are weekday-morning transit or drive, whichever somebody would
 * actually do, and they are deliberately wide.
 */
const RULES: { prefix: string; place: string; low: number; high: number }[] = [
  // ── Toronto. Every M is inside two hours, but a Malvern morning is
  //    not a Kensington morning, so the east and west ends say so.
  { prefix: "M1B", place: "Malvern, Scarborough", low: 60, high: 90 },
  { prefix: "M1C", place: "Highland Creek, Scarborough", low: 60, high: 90 },
  { prefix: "M1E", place: "West Hill, Scarborough", low: 55, high: 85 },
  { prefix: "M1V", place: "Milliken, Scarborough", low: 55, high: 85 },
  { prefix: "M1X", place: "Upper Rouge, Scarborough", low: 65, high: 95 },
  { prefix: "M1", place: "Scarborough", low: 45, high: 80 },
  { prefix: "M2", place: "North York", low: 35, high: 60 },
  { prefix: "M3", place: "North York", low: 35, high: 60 },
  { prefix: "M9", place: "Etobicoke", low: 40, high: 70 },
  { prefix: "M8", place: "Etobicoke", low: 35, high: 60 },
  { prefix: "M", place: "Toronto", low: 15, high: 45 },

  // ── The 905, inside the line.
  { prefix: "L5", place: "Mississauga", low: 40, high: 75 },
  { prefix: "L4T", place: "Malton, Mississauga", low: 45, high: 80 },
  { prefix: "L4W", place: "Mississauga", low: 40, high: 75 },
  { prefix: "L4X", place: "Mississauga", low: 35, high: 70 },
  { prefix: "L4Y", place: "Mississauga", low: 35, high: 70 },
  { prefix: "L4Z", place: "Mississauga", low: 40, high: 75 },
  { prefix: "L4V", place: "Mississauga", low: 45, high: 80 },
  { prefix: "L6", place: "Brampton and Oakville", low: 50, high: 85 },
  { prefix: "L7", place: "Halton", low: 50, high: 90 },
  { prefix: "L3R", place: "Markham", low: 45, high: 80 },
  { prefix: "L3S", place: "Markham", low: 50, high: 85 },
  { prefix: "L3T", place: "Thornhill", low: 40, high: 75 },
  { prefix: "L4B", place: "Richmond Hill", low: 45, high: 80 },
  { prefix: "L4C", place: "Richmond Hill", low: 45, high: 80 },
  { prefix: "L4E", place: "Richmond Hill", low: 50, high: 85 },
  { prefix: "L4H", place: "Vaughan", low: 45, high: 80 },
  { prefix: "L4J", place: "Thornhill, Vaughan", low: 40, high: 75 },
  { prefix: "L4K", place: "Concord, Vaughan", low: 45, high: 80 },
  { prefix: "L4L", place: "Woodbridge, Vaughan", low: 50, high: 85 },
  { prefix: "L1V", place: "Pickering", low: 45, high: 80 },
  { prefix: "L1W", place: "Pickering", low: 45, high: 80 },
  { prefix: "L1X", place: "Pickering", low: 50, high: 85 },
  { prefix: "L1Y", place: "Pickering", low: 55, high: 90 },
  { prefix: "L1S", place: "Ajax", low: 50, high: 85 },
  { prefix: "L1T", place: "Ajax", low: 50, high: 85 },
  { prefix: "L1Z", place: "Ajax", low: 55, high: 90 },

  // ── Straddling the line: the ones worth a human reading.
  { prefix: "L1M", place: "Whitby", low: 60, high: 100 },
  { prefix: "L1N", place: "Whitby", low: 60, high: 100 },
  { prefix: "L1P", place: "Whitby", low: 65, high: 105 },
  { prefix: "L1R", place: "Whitby", low: 65, high: 105 },
  { prefix: "L1G", place: "Oshawa", low: 70, high: 115 },
  { prefix: "L1H", place: "Oshawa", low: 70, high: 115 },
  { prefix: "L1J", place: "Oshawa", low: 70, high: 115 },
  { prefix: "L1K", place: "Oshawa", low: 75, high: 120 },
  { prefix: "L1L", place: "Oshawa", low: 75, high: 120 },
  { prefix: "L1B", place: "Bowmanville", low: 85, high: 135 },
  { prefix: "L1C", place: "Bowmanville", low: 85, high: 135 },
  { prefix: "L1E", place: "Courtice", low: 80, high: 130 },
  { prefix: "L3M", place: "Bradford and Newmarket", low: 75, high: 120 },
  { prefix: "L3P", place: "Markham", low: 55, high: 90 },
  { prefix: "L3X", place: "Newmarket", low: 70, high: 115 },
  { prefix: "L3Y", place: "Newmarket", low: 70, high: 115 },
  { prefix: "L3Z", place: "Bradford", low: 80, high: 125 },
  { prefix: "L4M", place: "Barrie", low: 95, high: 145 },
  { prefix: "L4N", place: "Barrie", low: 95, high: 145 },
  { prefix: "L4P", place: "Keswick", low: 80, high: 130 },
  { prefix: "L4S", place: "Richmond Hill", low: 50, high: 85 },
  { prefix: "L8", place: "Hamilton", low: 70, high: 120 },
  { prefix: "L9", place: "Hamilton and Dundas", low: 80, high: 130 },
  { prefix: "L0", place: "rural southern Ontario", low: 70, high: 140 },
  { prefix: "N1", place: "Guelph", low: 80, high: 130 },
  { prefix: "N2", place: "Kitchener–Waterloo", low: 90, high: 140 },
  { prefix: "N3", place: "Brantford and Cambridge", low: 90, high: 145 },
  { prefix: "K9", place: "Peterborough", low: 95, high: 145 },
  { prefix: "K0", place: "rural eastern Ontario", low: 120, high: 300 },
  { prefix: "N0", place: "rural southwestern Ontario", low: 100, high: 200 },

  // ── Clearly beyond two hours.
  { prefix: "L2", place: "Niagara", low: 100, high: 160 },
  { prefix: "L3B", place: "Welland", low: 110, high: 170 },
  { prefix: "L3C", place: "Welland", low: 110, high: 170 },
  { prefix: "L3K", place: "Port Colborne", low: 120, high: 180 },
  { prefix: "N4", place: "Woodstock and Simcoe", low: 120, high: 180 },
  { prefix: "N5", place: "St Thomas and Aylmer", low: 140, high: 200 },
  { prefix: "N6", place: "London", low: 135, high: 195 },
  { prefix: "N7", place: "Sarnia area", low: 180, high: 260 },
  { prefix: "N8", place: "Leamington and Windsor area", low: 220, high: 300 },
  { prefix: "N9", place: "Windsor", low: 230, high: 320 },
  { prefix: "K1", place: "Ottawa", low: 240, high: 330 },
  { prefix: "K2", place: "Ottawa", low: 240, high: 330 },
  { prefix: "K4", place: "Ottawa area", low: 240, high: 330 },
  { prefix: "K6", place: "Cornwall area", low: 240, high: 330 },
  { prefix: "K7", place: "Kingston and Belleville area", low: 150, high: 240 },
  { prefix: "K8", place: "Belleville and Pembroke area", low: 150, high: 260 },
  { prefix: "K", place: "eastern Ontario", low: 150, high: 300 },
  { prefix: "P", place: "northern Ontario", low: 240, high: 600 },
];

/** Outside Ontario it is a flight or a very long drive either way. */
const PROVINCES: Record<string, string> = {
  A: "Newfoundland and Labrador", B: "Nova Scotia", C: "Prince Edward Island",
  E: "New Brunswick", G: "Quebec", H: "Montréal", J: "Quebec",
  R: "Manitoba", S: "Saskatchewan", T: "Alberta", V: "British Columbia",
  X: "the territories", Y: "Yukon",
};

/** Worst case under this and nobody would call it a two-hour journey. */
const CLEARLY_UNDER = 105;
const TWO_HOURS = 120;

function bandOf(low: number, high: number): TravelBand {
  if (high < CLEARLY_UNDER) return "local";
  if (low >= TWO_HOURS) return "far";
  return "borderline";
}

/**
 * Read whatever they typed. Null when it is not a postal code yet —
 * which is most of the time, because this runs on every keystroke.
 */
export function travelFromPostcode(raw: string): TravelEstimate | null {
  const fsa = raw.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  if (!/^[A-Z]\d[A-Z]$/.test(fsa)) return null;

  const hit = RULES.filter((r) => fsa.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (hit) return { fsa, place: hit.place, low: hit.low, high: hit.high, band: bandOf(hit.low, hit.high) };

  const province = PROVINCES[fsa[0]];
  if (province) return { fsa, place: province, low: 240, high: 600, band: "far" };

  // A well-formed code this table has never heard of. Say nothing
  // rather than guess — a wrong "you are local" is worse than silence.
  return null;
}

/** "about 45 minutes" · "about 1½ to 2 hours" — never a false-precise figure. */
export function travelWords(e: TravelEstimate): string {
  const say = (m: number) => {
    if (m < 60) return `${Math.round(m / 5) * 5} minutes`;
    const h = Math.floor(m / 60);
    const rest = Math.round((m % 60) / 15) * 15;
    if (rest === 0) return `${h} hour${h === 1 ? "" : "s"}`;
    if (rest === 60) return `${h + 1} hour${h === 0 ? "" : "s"}`;
    const frac = rest === 15 ? "¼" : rest === 30 ? "½" : "¾";
    return `${h}${frac} hours`;
  };
  if (e.high - e.low > 45 || e.low >= 240) return `over ${say(e.low)}`;
  // Both inside the hour: one unit, not two.
  if (e.high < 60) return `about ${Math.round(e.low / 5) * 5}\u2013${Math.round(e.high / 5) * 5} minutes`;
  return `about ${say(e.low)} to ${say(e.high)}`;
}
