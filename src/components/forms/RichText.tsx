/**
 * Renders parseRich output. Only for forms whose presentation opts in —
 * see src/lib/formbuilder/rich-text.ts for why that is not every form.
 *
 * Paragraphs are block spans, not <p>, so this can sit inside a <label>
 * or an existing <p> without producing invalid markup.
 */
import { parseRich } from "@/lib/formbuilder/rich-text";

export function RichText({ text, gap = "mt-2" }: { text: string; gap?: string }) {
  return (
    <>
      {parseRich(text).map((paragraph, i) => (
        <span key={i} className={i === 0 ? "block" : `block ${gap}`}>
          {paragraph.map((piece, j) =>
            "href" in piece ? (
              <a
                key={j}
                href={piece.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand-500 underline underline-offset-2 hover:text-brand-400"
              >
                {piece.text}
              </a>
            ) : "bold" in piece ? (
              <strong key={j} className="font-semibold text-fg">{piece.text}</strong>
            ) : (
              <span key={j}>{piece.text}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}
