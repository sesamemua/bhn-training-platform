import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── Design-token leak guard ─────────────────────────────────────
  //
  // The platform's colour system lives in `src/app/globals.css` as
  // CSS custom properties consumed via Tailwind utility classes
  // (`text-fg`, `bg-card-solid`, `ring-brand-300`, …). Each theme
  // re-binds those variables, so any colour expressed through a
  // token tracks every theme switch automatically.
  //
  // The leak this rule prevents: hard-coded colour values embedded
  // into Tailwind arbitrary-value classes —
  //
  //     <div className="bg-[#1c1c20]">        // ❌ stays this colour forever
  //     <div className="bg-card-solid">       // ✅ follows the theme
  //
  //     <div className="shadow-[0_4px_rgba(56,189,248,0.45)]">  // ❌ sky-blue glow forever
  //     <div className="shadow-brand-glow">                     // ✅ moves with the brand
  //
  // The selectors below match string literals + template-literal
  // chunks containing a colour-bearing Tailwind utility (`text-`,
  // `bg-`, `border-`, `shadow-`, `drop-shadow-`, `ring-`, `outline-`,
  // `from-`, `to-`, `via-`, `fill-`, `stroke-`, `decoration-`,
  // `divide-`, `placeholder-`, `caret-`, `accent-`) wrapped around an
  // arbitrary value that contains a hex / rgb / rgba / hsl / hsla
  // colour. Non-colour arbitrary values (`w-[24px]`, `text-[10.5px]`,
  // `top-[-9999]`, etc.) are NOT flagged — they're sizing, not
  // theming, and have no token equivalent.
  //
  // Current severity: ERROR.
  //   Promoted from "warn" on 2026-05-21 after the named-shadow
  //   token sweep landed (see docs/design-system.md → Named shadows).
  //   The remaining inline `shadow-[…]` colour-bearing values are
  //   line-level `eslint-disable-next-line no-restricted-syntax`
  //   suppressions inside the LaunchSwitch family — those drive the
  //   cover-flip + countdown timeline and tokenising them would
  //   break the animation rhythm. Every other surface uses a token.
  //
  // If you genuinely need to hard-code a colour (transactional email
  // HTML where CSS variables don't render, a fixed export-to-PDF
  // surface, an SVG asset), suppress with
  // `// eslint-disable-next-line no-restricted-syntax` plus a one-
  // line comment explaining WHY a token wouldn't work.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Plain string literal — the common `className="…"` case.
          selector:
            "Literal[value=/(text|bg|border|shadow|drop-shadow|ring|outline|from|to|via|fill|stroke|decoration|divide|placeholder|caret|accent)-\\[[^\\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]",
          message:
            "Design-token leak: hard-coded colour inside a Tailwind arbitrary value. Use a token (e.g. `text-fg`, `bg-card-solid`, `ring-brand-300`) instead — see docs/design-system.md. If a token genuinely doesn't fit, suppress with `// eslint-disable-next-line no-restricted-syntax` and a one-line reason.",
        },
        {
          // Template literal chunk — catches the same pattern inside
          // `${cn(...)}` / backtick-string class compositions.
          selector:
            "TemplateElement[value.raw=/(text|bg|border|shadow|drop-shadow|ring|outline|from|to|via|fill|stroke|decoration|divide|placeholder|caret|accent)-\\[[^\\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]",
          message:
            "Design-token leak: hard-coded colour inside a Tailwind arbitrary value. Use a token (e.g. `text-fg`, `bg-card-solid`, `ring-brand-300`) instead — see docs/design-system.md. If a token genuinely doesn't fit, suppress with `// eslint-disable-next-line no-restricted-syntax` and a one-line reason.",
        },
      ],
    },
  },

  // Transactional emails ship to inboxes whose clients don't render
  // CSS variables — design tokens cannot reach there. The rule is
  // muted only inside the auth email-send route.
  {
    files: ["src/app/api/auth/send-code/**"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
