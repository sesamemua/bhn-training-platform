/**
 * Where an email address's institution is, and roughly how far that is
 * from 144 College Street — for the universities and colleges trainees
 * register with.
 *
 * Not proof of anything — a Queen's student can live in Toronto, and a
 * U of T address can belong to somebody in Kingston — so it never changes
 * how anybody is ranked. It is a prompt: somebody who said "local" (or
 * said nothing) from a Kingston address is worth a second look.
 *
 * Times are typical one-way weekday travel, low and high minutes, as wide
 * as the postal-code table's; the two-hour bands are that table's too.
 *
 * Pure module.
 */
import { bandOf, type TravelBand } from "./from-postcode";

export interface Institution {
  school: string;
  city: string;
  low: number;
  high: number;
  band: TravelBand;
}
/** Kept for the "?" flag: only the ones clearly over two hours. */
export type FarSchool = Institution;

// Domain → school, city, minutes. Subdomains count (mail.mcgill.ca, cmail.carleton.ca).
const TABLE: Record<string, [school: string, city: string, low: number, high: number]> = {
  // Toronto and around — local.
  "utoronto.ca": ["University of Toronto", "Toronto", 0, 30],
  "torontomu.ca": ["Toronto Metropolitan University", "Toronto", 5, 25],
  "ryerson.ca": ["Toronto Metropolitan University", "Toronto", 5, 25],
  "ocadu.ca": ["OCAD University", "Toronto", 5, 20],
  "yorku.ca": ["York University", "Toronto", 40, 65],
  "georgebrown.ca": ["George Brown College", "Toronto", 10, 30],
  "humber.ca": ["Humber Polytechnic", "Toronto", 35, 60],
  "humber.on.ca": ["Humber Polytechnic", "Toronto", 35, 60],
  "senecapolytechnic.ca": ["Seneca Polytechnic", "Toronto", 40, 65],
  "senecacollege.ca": ["Seneca Polytechnic", "Toronto", 40, 65],
  "centennialcollege.ca": ["Centennial College", "Toronto", 40, 65],
  "michener.ca": ["The Michener Institute", "Toronto", 5, 20],
  "sheridancollege.ca": ["Sheridan College", "Oakville / Brampton", 45, 80],
  "ontariotechu.ca": ["Ontario Tech University", "Oshawa", 55, 85],
  "ontariotechu.net": ["Ontario Tech University", "Oshawa", 55, 85],
  "durhamcollege.ca": ["Durham College", "Oshawa", 55, 85],
  "mcmaster.ca": ["McMaster University", "Hamilton", 60, 95],
  "mohawkcollege.ca": ["Mohawk College", "Hamilton", 60, 95],
  "uoguelph.ca": ["University of Guelph", "Guelph", 75, 105],
  // Close to the line — borderline.
  "uwaterloo.ca": ["University of Waterloo", "Waterloo", 90, 125],
  "wlu.ca": ["Wilfrid Laurier University", "Waterloo", 90, 125],
  "mylaurier.ca": ["Wilfrid Laurier University", "Waterloo", 90, 125],
  "conestogac.on.ca": ["Conestoga College", "Kitchener", 90, 125],
  "brocku.ca": ["Brock University", "St. Catharines", 90, 125],
  "trentu.ca": ["Trent University", "Peterborough", 95, 130],
  "uwo.ca": ["Western University", "London", 115, 150],
  "fanshawec.ca": ["Fanshawe College", "London", 115, 150],
  // Clearly over two hours — far.
  "queensu.ca": ["Queen's University", "Kingston", 150, 190],
  "stlawrencecollege.ca": ["St. Lawrence College", "Kingston", 150, 190],
  "uwindsor.ca": ["University of Windsor", "Windsor", 230, 270],
  "nipissingu.ca": ["Nipissing University", "North Bay", 210, 250],
  "laurentian.ca": ["Laurentian University", "Sudbury", 240, 280],
  "nosm.ca": ["NOSM University", "Sudbury / Thunder Bay", 240, 600],
  "uottawa.ca": ["University of Ottawa", "Ottawa", 260, 300],
  "carleton.ca": ["Carleton University", "Ottawa", 260, 300],
  "algonquincollege.com": ["Algonquin College", "Ottawa", 260, 300],
  "mcgill.ca": ["McGill University", "Montréal", 320, 360],
  "concordia.ca": ["Concordia University", "Montréal", 320, 360],
  "umontreal.ca": ["Université de Montréal", "Montréal", 320, 360],
  "polymtl.ca": ["Polytechnique Montréal", "Montréal", 320, 360],
  "uqam.ca": ["UQAM", "Montréal", 320, 360],
  "usherbrooke.ca": ["Université de Sherbrooke", "Sherbrooke", 390, 430],
  "ulaval.ca": ["Université Laval", "Québec City", 480, 540],
  "lakeheadu.ca": ["Lakehead University", "Thunder Bay", 600, 900],
  "dal.ca": ["Dalhousie University", "Halifax", 300, 600],
  "smu.ca": ["Saint Mary's University", "Halifax", 300, 600],
  "unb.ca": ["University of New Brunswick", "Fredericton", 300, 600],
  "mun.ca": ["Memorial University", "St. John's", 360, 600],
  "upei.ca": ["UPEI", "Charlottetown", 300, 600],
  "umanitoba.ca": ["University of Manitoba", "Winnipeg", 300, 600],
  "myumanitoba.ca": ["University of Manitoba", "Winnipeg", 300, 600],
  "usask.ca": ["University of Saskatchewan", "Saskatoon", 360, 600],
  "uregina.ca": ["University of Regina", "Regina", 360, 600],
  "ualberta.ca": ["University of Alberta", "Edmonton", 360, 600],
  "ucalgary.ca": ["University of Calgary", "Calgary", 360, 600],
  "ubc.ca": ["UBC", "Vancouver", 420, 600],
  "sfu.ca": ["Simon Fraser University", "Vancouver", 420, 600],
  "uvic.ca": ["University of Victoria", "Victoria", 420, 600],
};

/** The institution an address belongs to, with how far it is — or null for anything else. */
export function institutionOf(email: string | null | undefined): Institution | null {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  for (const [d, [school, city, low, high]] of Object.entries(TABLE)) {
    if (domain === d || domain.endsWith(`.${d}`)) return { school, city, low, high, band: bandOf(low, high) };
  }
  return null;
}

/** The institution, only when it is clearly over two hours away. */
export function farSchoolOf(email: string | null | undefined): FarSchool | null {
  const i = institutionOf(email);
  return i && i.band === "far" ? i : null;
}
