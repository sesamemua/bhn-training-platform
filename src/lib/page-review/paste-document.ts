/**
 * Turning a pasted page into a document the browser will lay out.
 *
 * What gets pasted in is usually a whole HTML document — an email
 * export starts at `<!doctype html>` and carries its own head. The
 * first version of this dropped that straight inside a wrapper's
 * `<body>`, and a nested document does not survive the parser: the
 * inner `<html>`, `<head>` and `<body>` tags are dropped, their
 * children are re-homed, and anything that lands inside a `<table>`
 * without being a valid table child is FOSTER PARENTED — moved out in
 * front of the table.
 *
 * A newsletter is forty nested tables. Foster parenting turned it into
 * a page 1,800 pixels wide and 1,500 tall with its sections beside one
 * another instead of down the page, which read as "the page will not
 * scroll" — there was hardly anything to scroll, and most of the
 * newsletter was somewhere off to the right.
 *
 * So a document is served as the document, with the overlay script put
 * in before its closing `</body>`. Only a fragment gets the wrapper.
 *
 * Pure module: no Prisma, no React. The route adds the CSP sandbox
 * header, which is what actually contains this markup.
 */

/** The paste cannot run scripts of its own choosing anyway — the
 *  opaque origin sees to what they could reach — but email exports do
 *  not need them, and stripping keeps the preview honest about what a
 *  recipient sees. */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "");
}

/** Is this a whole document rather than a piece of one? */
export function isWholeDocument(html: string): boolean {
  return /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\b|<html[\s>])/i.test(html);
}

const overlayTag = (src: string) => `<script src="${src}" defer></script>`;

/**
 * The page a reviewer opens: the paste, plus the overlay script.
 *
 * `title` is only used for the wrapper — a whole document brought its
 * own, and replacing it would mean rewriting a head we were handed.
 */
export function pasteDocument(pastedHtml: string, overlayUrl: string, title: string): string {
  const body = stripScripts(pastedHtml);
  const script = overlayTag(overlayUrl);

  if (isWholeDocument(body)) {
    // Before </body> so the overlay runs against a finished document,
    // as it does on a live page. A document with no closing tag —
    // legal, and common in exports — takes it at the end instead.
    const close = body.toLowerCase().lastIndexOf("</body>");
    return close === -1 ? `${body}\n${script}` : `${body.slice(0, close)}${script}\n${body.slice(close)}`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title.replace(/[<>&"]/g, "")}</title>
</head>
<body>
${body}
${script}
</body>
</html>`;
}
