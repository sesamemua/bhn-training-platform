import { capitalizeName } from "@/lib/events/print-jobs";
import type { BuiltForm, FormField } from "./types";

export const nameReviewKey = (key: string) => `__name_review_${key}`;

export function workshopNameField(form: BuiltForm, field: FormField): boolean {
  return field.type === "short_text" && ["full_name", "first_name", "last_name"].includes(field.key)
    && Boolean(form.presentation?.session || form.fields.some(f => f.type === "multi" && f.slots.length));
}

export function registrationName(raw: unknown, key: string) {
  const value = typeof raw === "string" ? raw.normalize("NFC").trim().replace(/\s+/gu, " ") : "";
  const warnings: string[] = [];
  let error: string | undefined;
  if (typeof raw !== "string" || !value || !/\p{L}/u.test(value)) error = "Enter your own name.";
  else if (value.length > 160) error = "Use no more than 160 characters for your name.";
  else if (/[<>@]|https?:|www\.|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/iu.test(String(raw))) {
    error = "Enter a person's name, not an email address, website or markup.";
  }
  const words = value.split(" ");
  if (/\b(university|institute|laboratory|labs?|company|corporation|network|biohubnet|inc|llc|ltd|solutions|biosciences|biotech|pharma|centre|center|college|foundation|astrazeneca|sanofi|ccrm|catti|castl)\b|\bhi[³3](?=\W|$)/iu.test(value)) {
    warnings.push("This may be an organization. Enter your own name; your institution or company belongs in its separate field.");
  }
  if (key === "full_name" && words.length === 1 && /^[\p{Script=Latin}\p{M}'’.-]+$/u.test(value)) {
    warnings.push("Include your family name if you use one. If you have a single name, you can confirm it below.");
  }
  if ((key !== "first_name" && /(?:^|\s)\p{L}\.?$/u.test(value)) || (words.length > 1 && new Set(words.map(w => w.toLocaleLowerCase())).size === 1)) {
    warnings.push("Check that your name is complete, rather than initials or a repeated name.");
  }
  if (/\p{N}|\p{Extended_Pictographic}/u.test(value)) warnings.push("Check the numbers or symbols in your name.");
  if (/\b(dr|prof|professor|phd|ceo|director)\b/iu.test(value)) warnings.push("Leave job titles and qualifications out of your badge name.");
  // Suggest casing only; particles, initials and preferred spelling belong to the registrant.
  const uniformCase = value.toLocaleUpperCase() !== value.toLocaleLowerCase()
    && (value === value.toLocaleUpperCase() || value === value.toLocaleLowerCase());
  const suggestion = !error && uniformCase && capitalizeName(value) !== value ? capitalizeName(value) : undefined;
  if (suggestion) warnings.push("Check the capitalization, or keep your preferred spelling below.");
  return { value, error, warnings, suggestion };
}
