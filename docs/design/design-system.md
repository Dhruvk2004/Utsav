# Utsav Design System

Status: v3 for the build phase (v2 gaps D1-01 to D1-13 and D-01 to D-16, and v3 gaps DA2-01 to DA2-11 and DR2-01 to DR2-12 resolved; see the Revision log at the end). Engineering reference for brand, tokens, components, motion and accessibility.
Companion files in this folder: `logo.svg`, `logo-mark.svg`, `logo-mono.svg`, `design.html` (brand board plus high-fidelity mockups of every page in `docs/product/spec.md`).

> **Source of truth.** Spec v4 section 1.3 now points here for brand, palette, logo files, fonts and the font budget, so the two documents carry one token set. The owner asked for a professional purple-led palette in the design brief (2026-10-28); that request replaced the spec's earlier maroon/marigold palette and its purple `--color-ai`. The AI marker is now the Marigold edge plus the "AI suggestion" chip (2.4). Marigold edges and the accent tint are reserved for AI content; non-AI progress fills and milestones use the brand colour.

---

## 1. Brand

### 1.1 Name and voice

- **Utsav** (उत्सव, "celebration"). Tagline: *Plan the celebration, not the chaos.*
- Voice: warm, calm, precise. Short sentences. Numbers use Indian grouping (₹25,00,000). Plain words such as "₹2.4 lakh" appear only in AI replies the user can read back; tables always show full figures.
- We never say "magic" or "instantly perfect", and we never use sparkle or confetti imagery for AI. AI is a careful co-planner: "Utsav suggests", "Check and decide".

### 1.2 Logo

| File | Use |
|---|---|
| `logo.svg` (viewBox 0 0 232 64) | Full lockup: mark + "Utsav" wordmark. Headers (height 28-32 px), share page, README. |
| `logo-mark.svg` (viewBox 0 0 64 64) | Mark only. Favicon (`src/app/icon.svg`), app icon, avatar fallback, loading screen. Checked at 16, 32 and 128 px. |
| `logo-mono.svg` (viewBox 0 0 232 64) | Single colour: `fill`/`stroke` = `currentColor`, and the bowl, flame and check are knocked out with an SVG mask. Use it on photos, in print, on Marigold, and for `<Logo variant="mono">`. |

**Concept: "the diya that says done".** A diya (clay oil lamp) is lit at almost every Indian celebration: weddings, birthdays, Diwali, griha pravesh. Utsav's diya sits in a rounded Aubergine tile, and its Marigold flame carries a check mark. Celebration (the flame) and planning (the tick) become one shape: every task you finish keeps the lamp lit.

**Drawing (v3, DA2-03).** The lamp is seen from the side, as people actually see a lit diya. The bowl is a shallow boat: flat rim on the left, a pronounced pointed **spout** lifting to the right, and a short **wick** standing in the spout. The flame rises **from the wick**, not from the bowl centre, in an asymmetric S-curve: narrow at the wick, bulging back over the bowl, with the tip flicking up. The check is cut into the flame's widest part. Because the warm shape sits off-centre at upper right and the pale bowl lifts to the right, the mark survives a squint test and 16 px as "a lamp", where v2 (a symmetric flame centred over a half-disc) read as a generic check-in-a-droplet. The brand board shows v2, v3 and a plain droplet icon side by side at 128 / 32 / 16 px and blurred.

- Three shapes only (tile; bowl with spout and wick, one path; flame with the check cut out), so it survives at 16 px. No gradients, no sparkles, no confetti.
- Never centre the flame, mirror the mark, or detach the flame from the wick.
- **Wordmark**: custom monoline lettering for "Utsav", drawn as round-capped 6-unit strokes. The SVG has **no font dependency** (no `<text>`, nothing to convert). **One ownable detail**: the "t" has no ascender stroke; a small filled flame (the mark's flame silhouette at 1:4) sits above its stem, Marigold `#F4A51C` in the colour lockup and `currentColor` in mono. In product UI the component renders the same paths, and the accessible name is "Utsav" (`role="img"`, `aria-label`).
- Clear space: the height of the flame (25% of tile height) on all sides. Minimum size: mark 16 px, lockup 96 px wide.
- Do not recolour the flame anything but Marigold (or currentColor in mono). Do not rotate it, add effects, separate the check from the flame, or place the colour lockup on Marigold.
- **Dark theme (fixed in v2)**: the mark keeps its light-theme colours in both themes: a deep plum tile `#4B1D5C`, an Ivory bowl `#FBF7F1`, and a Marigold flame `#F4A51C` with the check cut in tile colour. On dark surfaces the tile gets a 1.5-unit inner ring in Aubergine-dark `#D8B4E2` (10.09:1 against the dark canvas), so the tile edge stays crisp. Measured: flame on tile 6.29:1, bowl and wick on tile 12.08:1, check against flame 6.29:1, wordmark flame tip on Ivory 1.92:1 (decorative; the "t" stem carries the letter). The old dark-mode recolour (light-plum tile with the flame on top at 1.01:1) is removed. Only the wordmark strokes theme: Aubergine `#4B1D5C` in light, Aubergine-dark `#D8B4E2` in dark (10.09:1 on the canvas). On busy dark imagery, use `logo-mono` in `currentColor` instead.
- The `Logo` component reads four logo tokens (`--color-logo-tile`, `--color-logo-bowl`, `--color-logo-flame`, `--color-logo-ring`; see 2.5). It never uses hard-coded hex in JSX. `icon.svg` uses the same fixed values, so the favicon matches the in-app mark. The mark was checked at 16 and 32 px on both canvases in `design.html` (brand section, "Dark canvas" panel).

### 1.3 Brand motifs (used sparingly)

- **Toran edge**: a row of small alternating Marigold dots and leaf shapes, 8 px tall. It appears only on the landing hero bottom edge, the onboarding "Done" card and the share page header, never inside workspace tools. It is decorative (`aria-hidden`), not an AI marker, and it never sits next to AI cards.
- **Rangoli grid**: a faint 8-fold dot grid (Aubergine at 6% opacity) behind empty states and the generating card. Decorative, `aria-hidden`.
- No photography of people in MVP (for privacy and page weight). Illustrations are not used; empty states are text plus one action (spec 3.4).

---

## 2. Colour

### 2.1 The eight named colours

There are exactly eight brand colours. Each has a light-theme and a dark-theme value. Everything else (surfaces, borders, tints) is **derived** from these with `color-mix()` and is not a new colour.

| # | Name | Light | Dark | Role |
|---|---|---|---|---|
| 1 | **Aubergine** | `#4B1D5C` | `#D8B4E2` | Brand. Primary buttons, links, active tab, **focus ring (both themes)**, selected states, logo tile, non-AI progress fills, function-day milestones. |
| 2 | **Marigold** | `#F4A51C` | `#F7B53E` | Celebration accent and **AI marker**: logo flame (and the wordmark flame tip), AI card edge, "AI suggestion" chip tint, "Review your new plan" banner, toran. Fills and large shapes only, never small text on light backgrounds. **Not a focus colour and not an eyebrow colour** (v3). One documented exception: the Undo action and focus ring inside the inverse toast in light mode (Ink background, 8.64:1), where Aubergine would fail. |
| 3 | **Ink** | `#1F1520` | `#F5EEF3` | Primary text and icons. Inverse toast background. |
| 4 | **Dusk** | `#685A6A` | `#B9A9BA` | Secondary text, captions, help text, "To research" and "Not needed" statuses. |
| 5 | **Ivory** | `#FBF7F1` | `#1A1219` | Page canvas. Text on Aubergine buttons. Logo bowl (fixed `#FBF7F1`). |
| 6 | **Leaf** | `#1F6B45` | `#7FD3A3` | Success: Booked, Paid, Done, "Valid" badge, Saved. |
| 7 | **Turmeric** | `#8A5200` | `#F2C46B` | Warning text and icons: Rushed, Quoted (awaiting), "Paid more than quoted", Adjusted, "Above your budget". |
| 8 | **Sindoor** | `#B3261E` | `#FF9A8F` | Danger: errors, Overdue, "Over by ₹30,000", invalid suggestion reason, Delete. |

Why this set: Aubergine is a deep violet-plum (hue about 284°, nudged in v2 from `#4A1942`, hue about 310°, which could read as dark maroon at small sizes). It reads clearly purple and premium, like Banarasi silk rather than a default `#6B21A8`-style tech violet. Marigold and Turmeric come from the same garland and haldi family, so warnings feel native rather than alarming. Sindoor is the red of celebration but is reserved for danger, always used with text and icons, never as decoration. The palette is purple-led (Aubergine leads the chrome: header logo, primary buttons, active tabs, progress, milestones, brand band). The other seven colours are accents, semantics and neutrals. Ink and Dusk are deliberately plum-tinted neutrals, so the whole UI reads warm-purple without being all-purple.

**Owner sign-off (DA2-10): approved 2026-10-28.** The owner approved the eight colours in both themes, the purple-led interpretation, Aubergine `#4B1D5C` and the diya logo ("Approve, start build"). The text below is kept as the original checklist. The design team cannot sign this off on the owner's behalf. Before the first UI commit, the owner confirms in writing (recorded in the revision log with date): (1) the eight colours and their hex values in both themes, (2) the purple-led, not all-purple, interpretation (one purple plus plum-tinted neutrals), (3) Aubergine `#4B1D5C` rather than v1 `#4A1942`. Until then `#4A1942` remains a one-token revert in `globals.css`; every contrast row in 2.3 also passes with it except where noted in the v2 log.

### 2.2 Derived semantic tokens

| Token | Light | Dark | Derivation |
|---|---|---|---|
| `bg` | `#FBF7F1` | `#1A1219` | Ivory |
| `surface` | `#FFFFFF` | `#241A23` | Ivory raised (white in light; Ivory-dark + 4% Ink in dark) |
| `surface-sunken` | `#F4EEEB` | `#221821` | Aubergine 4% on Ivory (both themes); table headers, sidebars, invalid cards |
| `fg` | `#1F1520` | `#F5EEF3` | Ink |
| `fg-muted` | `#685A6A` | `#B9A9BA` | Dusk |
| `brand` | `#4B1D5C` | `#D8B4E2` | Aubergine |
| `on-brand` | `#FBF7F1` | `#1A1219` | Ivory |
| `accent` | `#F4A51C` | `#F7B53E` | Marigold |
| `on-accent` | `#1F1520` | `#1A1219` | Ink (light) / Ivory-dark (dark) |
| `line` | `#E2D8DC` | `#352935` | Aubergine 14% on Ivory (both themes). Decorative dividers only (never the only thing identifying a control). |
| `line-strong` | `#958C97` | `#8C7E8D` | Dusk 70% on the tint base (white / surface-dark). Input and control borders (3:1 non-text). |
| `brand-tint` | `#E9E4EB` | `#413342` | Aubergine 12% on surface (dark 16%) |
| `accent-tint` | `#FDEFD6` | `#463327` | Marigold 18% on surface (dark 16%). **AI only** (AI chip, review banner, AI plan badge). |
| `success-tint` | `#E4EDE9` | `#333837` | Leaf 12% / 16% |
| `warning-tint` | `#F1EAE0` | `#45352F` | Turmeric 12% / 16% |
| `danger-tint` | `#F6E5E4` | `#472E34` | Sindoor 12% / 16% |
| `neutral-tint` | `#EDEBED` | `#3C313B` | Dusk 12% / 16% |
| `focus` | `#4B1D5C` | `#D8B4E2` | Aubergine in both themes (v3; dark was Marigold). **Rescoped on the brand band**: `.hero, [data-surface="hero"] { --u-focus: var(--u-hero-fg) }` |
| `inverse-bg` / `inverse-fg` | `#1F1520` / `#FBF7F1` | `#F5EEF3` / `#1A1219` | Ink / Ivory swapped (toast) |
| `inverse-action` | `#F4A51C` | `#4B1D5C` | **New in v2 (D1-02).** Undo/close, check icon and timer line inside the inverse toast: Marigold on Ink in light (8.64:1). In dark it is the light Aubergine value on the light toast (11.30:1). |
| `inverse-focus` | `#F4A51C` | `#1A1219` | Focus ring inside the inverse toast |
| `hero-bg` / `hero-fg` | `#4B1D5C` / `#FBF7F1` | `#3C1A48` / `#F5EEF3` | Brand band (landing hero, phone hero header, AI mode button). `hero-fg` is also the focus ring on the band (12.08 / 12.84). The dark value is Aubergine-light mixed 70% into the dark canvas, so the band stays deep plum in dark mode and Marigold on it stays legible (8.12:1). |
| `logo-tile` / `logo-bowl` / `logo-flame` | `#4B1D5C` / `#FBF7F1` / `#F4A51C` | same | Fixed in both themes (1.2) |
| `logo-ring` | `transparent` | `#D8B4E2` | Tile edge on dark surfaces |
| `scrim` | `rgb(31 21 32 / .48)` | `rgb(0 0 0 / .6)` | Ink at 48% |

### 2.3 Contrast (WCAG 2.2), every pairing used

Computed with the WCAG relative-luminance formula. AA needs 4.5:1 for normal text, and 3:1 for large text and non-text UI. Re-computed in v2 for the new Aubergine and checked against every rendered mockup in `design.html` in both themes.

**Light theme**

| Foreground | Background | Ratio | Used for | Result |
|---|---|---|---|---|
| Ink `#1F1520` | Ivory `#FBF7F1` | 16.59 | Body text on canvas | AAA |
| Ink | Surface `#FFFFFF` | 17.70 | Body text on cards | AAA |
| Dusk `#685A6A` | Ivory | 6.04 | Secondary text | AA |
| Dusk | Surface | 6.44 | Secondary text on cards | AA |
| Aubergine `#4B1D5C` | Ivory | 12.08 | Links, headings, focus ring | AAA |
| **Focus ring = hero-fg** Ivory `#FBF7F1` | Hero-bg `#4B1D5C` | 12.08 | Focus ring on the landing hero links, Sign in, the outline CTA and the phone hero header (v2 was Aubergine on Aubergine, 1.00:1) | AA (3:1) |
| Aubergine | Surface | 12.89 | Links on cards, secondary button text | AAA |
| Ivory | Aubergine | 12.08 | Primary button text, hero text | AAA |
| Marigold `#F4A51C` | Aubergine | 6.29 | Flame on logo tile, Marigold glyph on brand band and AI mode button | AA |
| Ink | Marigold | 8.64 | Text on Marigold fills (accent button) | AAA |
| Ink | Accent-tint `#FDEFD6` | 15.59 | "AI suggestion" chip, review banner text | AAA |
| Aubergine | Brand-tint `#E9E4EB` | 10.29 | "Contacted" pill, selected chip, type chip, milestone text | AAA |
| Leaf `#1F6B45` | Ivory / Surface | 6.06 / 6.47 | Success text | AA |
| Leaf | Success-tint `#E4EDE9` | 5.42 | "Booked", "Valid" pill | AA |
| White | Leaf | 6.47 | "Paid" solid pill, success button | AA |
| Turmeric `#8A5200` | Ivory / Surface | 5.99 / 6.39 | Warning text, "Rushed" | AA |
| Turmeric | Warning-tint `#F1EAE0` | 5.35 | "Quoted" pill, warning banner | AA |
| Sindoor `#B3261E` | Ivory / Surface | 6.12 / 6.54 | Error text, "Overdue" | AA |
| Sindoor | Danger-tint `#F6E5E4` | 5.37 | "Not valid" pill, error alert | AA |
| White | Sindoor | 6.54 | Danger button | AA |
| Dusk | Neutral-tint `#EDEBED` | 5.43 | "To research", "Not needed" pills | AA |
| Dusk / Ink | Surface-sunken `#F4EEEB` | 5.61 / 15.40 | Table headers, invalid card text | AA / AAA |
| Ivory | Ink (inverse toast) | 16.59 | Toast text | AAA |
| **Inverse-action** Marigold | Ink (toast) | 8.64 | Toast Undo / close label, check icon, timer line | AAA |
| Inverse-focus Marigold | Ink | 8.64 | Focus ring inside toast (non-text) | AA (3:1) |
| Line-strong `#958C97` | Surface | 3.24 | Input borders, checkbox outlines (non-text) | AA (3:1) |
| Aubergine focus ring | Ivory | 12.08 | 2 px focus ring (non-text) | AA (3:1) |
| Marigold | Ivory | 1.92 | **Decorative only** (AI card left edge, toran). Never the sole signal; always paired with the "AI suggestion" chip text | n/a |

**Dark theme**

| Foreground | Background | Ratio | Used for | Result |
|---|---|---|---|---|
| Ink-dark `#F5EEF3` | Ivory-dark `#1A1219` | 16.08 | Body text | AAA |
| Ink-dark | Surface-dark `#241A23` | 14.76 | Text on cards | AAA |
| Dusk-dark `#B9A9BA` | Ivory-dark / Surface-dark | 8.25 / 7.58 | Secondary text | AAA |
| Aubergine-dark `#D8B4E2` | Ivory-dark / Surface-dark | 10.09 / 9.26 | Links, headings, wordmark | AAA |
| Ivory-dark | Aubergine-dark | 10.09 | Primary button text | AAA |
| Marigold-dark `#F7B53E` | Ivory-dark / Surface-dark | 10.17 / 9.33 | AI edge, AI glyphs (no longer the focus ring) | AAA |
| **Focus ring** Aubergine-dark `#D8B4E2` | Ivory-dark / Surface-dark / Surface-sunken-dark | 10.09 / 9.26 / 9.46 | 2 px focus ring on every control (v3) | AA (3:1) |
| **Focus ring = hero-fg** `#F5EEF3` | Hero-bg-dark `#3C1A48` | 12.84 | Focus ring on the brand band | AA (3:1) |
| Ivory-dark | Marigold-dark | 10.17 | Accent button text | AAA |
| Marigold-dark | Hero-bg-dark `#3C1A48` | 8.12 | Flame glyph on AI mode button and hero band | AAA |
| Ink-dark | Hero-bg-dark | 12.84 | Hero and AI mode button text | AAA |
| Leaf-dark `#7FD3A3` | Surface-dark | 9.42 | Success text | AAA |
| Ivory-dark | Leaf-dark | 10.27 | "Paid" solid pill | AAA |
| Turmeric-dark `#F2C46B` | Surface-dark | 10.33 | Warning text | AAA |
| Sindoor-dark `#FF9A8F` | Surface-dark | 8.24 | Error text | AAA |
| Ivory-dark | Sindoor-dark | 8.97 | Danger button | AAA |
| Aubergine-dark | Brand-tint-dark `#413342` | 6.50 | "Contacted" pill, milestones | AA |
| Leaf-dark | Success-tint-dark `#333837` | 6.67 | "Booked" pill | AA |
| Turmeric-dark | Warning-tint-dark `#45352F` | 7.14 | "Quoted" pill | AAA |
| Sindoor-dark | Danger-tint-dark `#472E34` | 6.01 | "Not valid" pill | AA |
| Dusk-dark | Neutral-tint-dark `#3C313B` | 5.57 | "To research" pill | AA |
| Marigold-dark | Accent-tint-dark `#463327` | 6.60 | "AI suggestion" chip glyph | AA |
| Line-strong-dark `#8C7E8D` | Surface-dark | 4.40 | Input borders | AA (3:1) |
| Dusk-dark | Surface-sunken-dark `#221821` | 7.74 | Table header text | AAA |
| Ivory-dark | Ink-dark (inverse toast) | 16.08 | Toast text | AAA |
| **Inverse-action** Aubergine `#4B1D5C` | Ink-dark `#F5EEF3` (toast) | 11.30 | Toast Undo / close label, check icon, timer line (was Marigold at 1.58:1 in v1, failed) | AAA |
| Inverse-focus Ivory-dark `#1A1219` | Ink-dark | 16.08 | Focus ring inside the light toast | AA (3:1) |

**Logo (both themes, non-text, 3:1 target)**

| Shape | Against | Ratio |
|---|---|---|
| Flame `#F4A51C` | Tile `#4B1D5C` | 6.29 |
| Bowl `#FBF7F1` | Tile | 12.08 |
| Check (tile colour) | Flame | 6.29 |
| Tile ring `#D8B4E2` (dark only) | Dark canvas `#1A1219` | 10.09 |
| Tile `#4B1D5C` | Dark canvas | 1.42, which is why the ring is required on dark surfaces |

A unit test (`tests/unit/design/contrast.test.ts`, written in the build phase) parses the token values from `globals.css` and asserts **every row above**, including the inverse-action, logo and both **focus-on-hero** rows (`focus` resolved inside `.hero` against `hero-bg`, light and dark, ≥ 3:1). A token change can therefore never silently break contrast.

### 2.4 How colour carries meaning

- **AI content** = Marigold left edge (4 px) **plus** the "AI suggestion" chip (flame glyph + text). Marigold edges and `accent-tint` fills are reserved for AI surfaces (AI cards, the AI plan badge, the review banner, the AI chip). Non-AI progress bars, milestones and step markers use `brand`. **Code-generated proposals** ("Suggested by Utsav") = Aubergine left edge plus a chip with the diya mark. **Your edits** = "Edited by you" chip in Dusk. **Library fallback ideas** = "From Utsav's idea library" chip (`neutral-tint`, diya glyph). Origin is always written, never colour-only.
- **Vendor statuses** use colour + icon + text + fill style (6.4). Grayscale-safe.
- **Money states**: "Over by ₹30,000" in Sindoor with an alert icon; "Adjusted" tag in Turmeric with a swap icon; "Estimate" in Dusk with an "≈" prefix; "Above your budget" in Turmeric with an alert icon; "Paid ₹2,000 more than quoted" in Turmeric with an alert icon (a warning, not a block).

### 2.5 Tailwind v4 tokens (`src/app/globals.css`)

The raw palette lives in CSS variables that switch per theme. Tailwind utilities reference them through `@theme inline`, so `bg-surface`, `text-fg-muted`, `border-line-strong`, `bg-accent-tint`, `text-inverse-action` and so on theme automatically.

```css
@import "tailwindcss";

/* 1. Raw palette: the eight named colours (light). */
:root {
  --u-aubergine: #4B1D5C; --u-marigold: #F4A51C; --u-ink: #1F1520; --u-dusk: #685A6A;
  --u-ivory: #FBF7F1;     --u-leaf: #1F6B45;     --u-turmeric: #8A5200; --u-sindoor: #B3261E;
  --u-surface: #FFFFFF;   --u-on-accent: #1F1520; --u-focus: var(--u-aubergine);
  --u-tint-base: #FFFFFF; --u-tint: 12%; --u-tint-accent: 18%;
  --u-hero-bg: #4B1D5C;   --u-hero-fg: #FBF7F1;
  --u-inverse-action: #F4A51C; --u-inverse-focus: #F4A51C;
  --u-logo-ring: transparent;
  color-scheme: light;
}
/* 2. Dark values: system preference unless the user forced light, and an explicit toggle. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --u-aubergine: #D8B4E2; --u-marigold: #F7B53E; --u-ink: #F5EEF3; --u-dusk: #B9A9BA;
    --u-ivory: #1A1219;     --u-leaf: #7FD3A3;     --u-turmeric: #F2C46B; --u-sindoor: #FF9A8F;
    --u-surface: #241A23;   --u-on-accent: #1A1219; --u-focus: var(--u-aubergine);
    --u-tint-base: #241A23; --u-tint: 16%; --u-tint-accent: 16%;
    --u-hero-bg: #3C1A48;   --u-hero-fg: #F5EEF3;
    --u-inverse-action: #4B1D5C; --u-inverse-focus: #1A1219;
    --u-logo-ring: #D8B4E2;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] { /* same block as above */ }

/* 2b. Brand band: the focus ring must contrast with hero-bg, not with the canvas (DA2-01). */
.hero, [data-surface="hero"] { --u-focus: var(--u-hero-fg); }

/* 3. Tailwind theme (utilities: bg-*, text-*, border-*, ring-*, fill-*, stroke-*). */
@theme inline {
  --color-aubergine: var(--u-aubergine);
  --color-marigold: var(--u-marigold);
  --color-ink: var(--u-ink);
  --color-dusk: var(--u-dusk);
  --color-ivory: var(--u-ivory);
  --color-leaf: var(--u-leaf);
  --color-turmeric: var(--u-turmeric);
  --color-sindoor: var(--u-sindoor);

  --color-bg: var(--u-ivory);
  --color-surface: var(--u-surface);
  --color-surface-sunken: color-mix(in srgb, var(--u-aubergine) 4%, var(--u-ivory));
  --color-fg: var(--u-ink);
  --color-fg-muted: var(--u-dusk);
  --color-brand: var(--u-aubergine);
  --color-on-brand: var(--u-ivory);
  --color-accent: var(--u-marigold);
  --color-on-accent: var(--u-on-accent);
  --color-success: var(--u-leaf);
  --color-warning: var(--u-turmeric);
  --color-danger: var(--u-sindoor);
  --color-line: color-mix(in srgb, var(--u-aubergine) 14%, var(--u-ivory));
  --color-line-strong: color-mix(in srgb, var(--u-dusk) 70%, var(--u-tint-base));
  --color-brand-tint: color-mix(in srgb, var(--u-aubergine) var(--u-tint), var(--u-tint-base));
  --color-accent-tint: color-mix(in srgb, var(--u-marigold) var(--u-tint-accent), var(--u-tint-base));
  --color-success-tint: color-mix(in srgb, var(--u-leaf) var(--u-tint), var(--u-tint-base));
  --color-warning-tint: color-mix(in srgb, var(--u-turmeric) var(--u-tint), var(--u-tint-base));
  --color-danger-tint: color-mix(in srgb, var(--u-sindoor) var(--u-tint), var(--u-tint-base));
  --color-neutral-tint: color-mix(in srgb, var(--u-dusk) var(--u-tint), var(--u-tint-base));
  --color-focus: var(--u-focus);
  --color-hero-bg: var(--u-hero-bg);
  --color-hero-fg: var(--u-hero-fg);
  --color-inverse-bg: var(--u-ink);
  --color-inverse-fg: var(--u-ivory);
  --color-inverse-action: var(--u-inverse-action);
  --color-inverse-focus: var(--u-inverse-focus);
  --color-logo-tile: #4B1D5C;   /* fixed in both themes (1.2) */
  --color-logo-bowl: #FBF7F1;
  --color-logo-flame: #F4A51C;
  --color-logo-ring: var(--u-logo-ring);

  --font-display: var(--font-fraunces), Georgia, "Times New Roman", serif;
  --font-sans: var(--font-jakarta), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-deva: var(--font-noto-deva), "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif;

  --text-display-xl: 3rem;     --text-display-xl--line-height: 1.1;
  --text-display: 2.25rem;     --text-display--line-height: 1.15;
  --text-h1: 1.75rem;          --text-h1--line-height: 1.25;
  --text-h2: 1.375rem;         --text-h2--line-height: 1.3;
  --text-h3: 1.125rem;         --text-h3--line-height: 1.4;
  --text-body: 1rem;           --text-body--line-height: 1.5;
  --text-body-sm: 0.875rem;    --text-body-sm--line-height: 1.45;
  --text-caption: 0.75rem;     --text-caption--line-height: 1.35;

  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px; --radius-pill: 999px;

  --shadow-1: 0 1px 2px rgb(75 29 92 / .06), 0 1px 1px rgb(75 29 92 / .04);
  --shadow-2: 0 4px 12px -2px rgb(75 29 92 / .10), 0 2px 4px rgb(75 29 92 / .06);
  --shadow-3: 0 16px 40px -8px rgb(31 21 32 / .22), 0 4px 10px rgb(31 21 32 / .08);

  --ease-out-soft: cubic-bezier(.22, .8, .36, 1);
  --ease-in-out-soft: cubic-bezier(.45, 0, .2, 1);
  --duration-fast: 120ms; --duration-base: 200ms; --duration-slow: 320ms;
}
```

In dark mode, `--shadow-1` and `--shadow-2` are replaced by a 1 px `line` border, and only overlays keep `shadow-3` (shadows do not read on dark surfaces). This block replaces the current `globals.css` tokens (`--color-canvas`, the maroon `--color-brand`, `--color-gold`). The spec's old `--color-ai #4B3B8F` is **not** defined anywhere; there is no purple AI token. Components should use only the semantic names (`bg`, `surface`, `fg`, `brand`, `inverse-*`, ...) and the status/tint names, not the raw eight, except for the logo tokens.

---

## 3. Typography

Google Fonts only, loaded with `next/font/google` (self-hosted at build, `display: "swap"`, explicit `subsets`, CSS variable per family). **Font budget (v2, D-09): at most 60 KB of preloaded woff2 in total for Latin, plus up to 90 KB of on-demand Devanagari that is never preloaded.**

| Role | Family and `next/font` call | Bytes (woff2, estimate until measured) | Notes |
|---|---|---|---|
| UI and body (all controls, tables, numbers) | **Plus Jakarta Sans**, variable `wght` 400-700, `subsets: ["latin"]`, `preload: true`, `variable: "--font-jakarta"` | ≈ 30 KB | One file covers 400/500/600/650/700. Good ₹ glyph. Tabular numbers via `font-variant-numeric: tabular-nums` for every money column, budget and diff. |
| Display (hero, page h1, event title, onboarding question) | **Fraunces**, one static weight `600`, `subsets: ["latin"]`, no `axes` (no `opsz`/`SOFT`), `preload: true`, `variable: "--font-fraunces"` | ≈ 22 KB | Display sizes only (≥ 22 px). Never for body or table text. The fallback (`Georgia`) is metric-adjusted by `next/font` (`adjustFontFallback`), so the swap has no layout shift. |
| Hindi (AI drafts, `lang="hi"` content, Hindi UI Stretch) | **Noto Sans Devanagari**, variable `wght`, `subsets: ["devanagari"]`, `preload: false`, `variable: "--font-noto-deva"` | ≈ 70-90 KB, on demand | Applied via `:lang(hi) { font-family: var(--font-deva) }`. Because it is not preloaded and only `:lang(hi)` elements use it, the browser downloads it only when Hindi text is on screen (an enquiry draft in Hindi, or a plan whose language is Hindi). Line height +0.1 for matras. |

Total preloaded: about 52 KB (estimate), within the 60 KB budget. A CI step `npm run check:fonts` (`scripts/check-font-budget.mjs`, run after `next build`) sums the preloaded font files in `.next/static/media` (the files `next/font` marks for preload) and fails above 60 KB. It also asserts that no Devanagari file is preloaded, and it prints the measured totals. Record the measured numbers here on the first build. The design board (`design.html`) loads the same three families from Google Fonts for review only.

Scale (rem at 16 px root):

| Token | Size / line | Family / weight | Use |
|---|---|---|---|
| `display-xl` | 48 / 53 (mobile 36 / 40) | Fraunces 600 | Landing hero only |
| `display` | 36 / 41 (mobile 28) | Fraunces 600 | Event title in workspace header, onboarding question |
| `h1` | 28 / 35 | Fraunces 600 | Page titles (`/dashboard`, `/settings`) |
| `h2` | 22 / 29 | Plus Jakarta 700 | Section and card titles, AI batch header |
| `h3` | 18 / 25 | Plus Jakarta 650 | Card titles, suggestion titles |
| `body` | 16 / 24 | Plus Jakarta 400 | Default |
| `body-sm` | 14 / 20 | Plus Jakarta 400/500/600 | Tables, card meta, buttons, inputs on dense tables |
| `caption` | 12 / 16 | Plus Jakarta 600, letter-spacing .04em; uppercase only for eyebrow labels | Type chip, eyebrow, "Estimate" |

Rules: minimum text size 12 px; body measure 60-75 characters; never italic Devanagari; never all-caps sentences. Rupee amounts use `₹` + Indian grouping via `Intl.NumberFormat("en-IN")`. In diffs, the arrow is a real `→` with `aria-hidden`, and the accessible text reads "from ₹3,00,000 to ₹2,40,000".

---

## 4. Layout, spacing, radius, elevation

- **Spacing**: 4 px base (Tailwind v4 default `--spacing: 0.25rem`). Use the steps 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64). Card padding is 20 (desktop) / 16 (mobile). Section gap 32. Form field gap 16. Inline control gap 8.
- **Grid**: app max width 1200 px; page gutter `max(16px, env(safe-area-inset-left))`. Workspace: 12-column grid with 24 px gaps. Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Grid tracks are always `minmax(0, 1fr)`, never bare `1fr`, so one wide child (a diff row, a long rupee figure) cannot push a track past its container.
- **AI panel**: 400 px, non-modal, pushes content, at viewport ≥ 1024 px. Below that, it is the mobile modal sheet.
- **Content width with the AI panel open (D-15)**: tabs degrade by the *content* width (viewport − 400 − gutters), measured with a container query (`@container workspace (width < …)`), not by viewport breakpoints:

| Tab | ≥ 900 px content | 640-899 px content | < 640 px content |
|---|---|---|---|
| Vendors | Five status columns | **Grouped list**: one full-width section per status (same cards, status select kept), Not needed collapsed | Mobile list with status filter chips |
| Budget table | All 8 columns | Priority 3 columns (Paid, Note) move into a per-row **Details** expander (`aria-expanded`); Variance stays | Mobile stacked rows (9.4) |
| What-if table | All columns | Status tag drops under the category name | Mobile full-screen sheet with stacked rows |
| Timeline | Title, category, due, actions | Category moves under the title | Mobile list |
| By-function table | All columns | Time moves under the date | Stacked rows |

  Column priority for the Budget table: 1 = Category, Allocated, Variance, actions; 2 = %, Committed; 3 = Paid, Note.
- **Radius**: `xs` 4 (checkbox), `sm` 6 (pills inside tables, inputs on dense tables), `md` 10 (inputs, buttons), `lg` 14 (cards, AI cards), `xl` 20 (sheets, modals, hero preview), `pill` (chips, status pills, toggles). The logo tile radius (15/64) matches `lg` at app-icon scale.
- **Elevation** (light theme; dark uses borders): `0` flat with a `line` border (tables, list rows); `1` cards; `2` raised cards on hover, popovers, menus, AI panel; `3` modals, sheets, toasts. Only overlays cast a large shadow. Shadows are tinted with Aubergine, never pure black.

---

## 5. Iconography

- Library: **Lucide** (`lucide-react`, pinned to an exact version, e.g. `0.468.0`), stroke 1.75, sizes 16 (dense tables), 20 (default), 24 (empty states, header). Icons inherit `currentColor`.
- Icons never carry meaning on their own. Either there is a visible text label, or an icon-only button has an `aria-label` plus a tooltip (overflow `⋯`, close `✕`). Decorative icons are `aria-hidden="true"`.
- Custom glyphs (24 px grid, 1.75 stroke, round caps, drawn to match Lucide):
  - **Flame glyph** (AI marker): the v3 logo flame silhouette (S-curve, no check), filled. Used only for AI (the "AI suggestion" chip, the AI mode button, AI actions such as "Suggest ideas"). It replaces the generic sparkle icon everywhere and is never used as general decoration (the landing eyebrow uses the diya).
  - **Diya glyph** (Suggested by Utsav / code proposals, starter template badge, idea-library fallback, landing eyebrow): outline of the v3 bowl with spout plus the flame, `vector-effect: non-scaling-stroke` so it keeps the 1.75 stroke.
- Status icons (Lucide names): To research `circle-dashed`, Contacted `message-circle`, Quoted `receipt-indian-rupee`, Booked `calendar-check`, Paid `badge-check` (filled pill), Not needed `circle-slash`. Rushed `alarm-clock`, Overdue `circle-alert`, Adjusted `arrow-left-right`, Valid `check`, Not valid `ban`, Estimate `≈` text prefix (not an icon).
- Event types: Wedding `heart-handshake`, Birthday `cake`, Anniversary `gem`, Community `users-round`, Other `calendar-heart`.

---

## 6. Components

All components live in `src/components/ui` (primitives) and `src/components/plan` (domain). Every interactive control has a visible focus ring (8.1). Hit areas are at least 44 × 44 px for primary actions and AI card actions, and at least 24 × 24 px for dense inline controls (spec 9.2).

### 6.1 Buttons

| Variant | Light | Use |
|---|---|---|
| `primary` | `bg-brand text-on-brand`; hover `brand` mixed 86% with `fg` (darker); active translateY(1px) | One per view: "Create my plan", "Accept", "Save changes" |
| `accent` | `bg-accent text-on-accent` | Landing celebration CTA only ("Continue with Google" stays Google-branded white) |
| `secondary` | `bg-surface text-brand border border-line-strong` | "Edit", "Back", "See a sample plan" |
| `ghost` | `text-brand`, hover `bg-brand-tint` | "Skip for now", "Decline", tertiary |
| `danger` | `bg-danger text-white` (dark: `text-bg`) | Destructive action in a dialog only |
| `icon` | 40 × 40 (44 on `pointer: coarse`), `ghost` styles, `aria-label` required | Close, overflow |
| `inverse` | transparent, `text-inverse-action`, focus ring `inverse-focus` | Actions inside the toast only |

Sizes: `md` 44 px tall, 16 px horizontal padding, `body-sm` 600; `sm` 36 px (dense tables and toolbars only; never AI card actions); `lg` 52 px. Loading: the label stays, a 16 px spinner replaces the leading icon, `aria-busy="true"`, and the button is disabled. Disabled: 45% opacity plus `cursor: not-allowed`, with a reason in text nearby when it is not obvious ("Type an instruction to get suggestions").

### 6.2 Inputs

- Text, number, date, select, textarea: 44 px tall (textarea min 88), `rounded-md`, `bg-surface`, `border-line-strong` (3:1), padding 12. Hover `border-fg-muted`. Focus: 2 px `focus` ring outside, and the border becomes `brand`.
- Label above (`body-sm` 600), help text below (`body-sm` in `fg-muted`, linked with `aria-describedby`). "Why we ask" lines in onboarding use an info icon + text.
- Error: border `danger`, message below with a `circle-alert` icon, `aria-invalid="true"`.
- **Error summary** (every form, on submit with errors): an `alert` box at the top of the form, `role="alert"`, `tabindex="-1"`, focused on submit. Heading "Fix 3 things to continue", then a list of links, one per error, each moving focus to its field. Inline messages stay under each field. Values are never cleared.
- **Money input**: `₹` prefix inside the field, Indian grouping as the user types, `inputmode="numeric"`, tabular numbers, and a live helper ("about ₹7,142 per guest") computed in code.
- Character counter ("23/500") right-aligned below textareas, announced only at 90% and 100%.
- Radio cards (event type, role, budget comfort): 2 px border; selected = `brand` border + `brand-tint` fill + a check icon in the corner (not colour alone).
- **Read-only derived field** (e.g. "Young kids · set from Guests tab: 25 kids", "Event type · locked after creation"): `surface-sunken` background, lock icon, the reason in text, and a link to where it is edited.
- **Combobox with free text** (city, vendor category): list of suggestions; typing anything else is allowed ("Use 'Sound and stage'"). ARIA 1.2 pattern, required for axe (DA2-02b): `<input role="combobox" aria-labelledby="{label id}" aria-controls="{listbox id}" aria-expanded aria-autocomplete="list" aria-activedescendant="{option id}">`; the popup is `<ul role="listbox" id aria-label="Category suggestions">` whose children are `role="option"` with `aria-selected`. The "Use '…' as typed" row is an option too.
- **Progress bars** always have a name: `aria-label` ("Onboarding progress", "Tasks done", "Budget committed") plus `aria-valuetext` ("Step 1 of 4", "12 of 34 tasks done").

### 6.3 Chips

- **Filter / choice chip** (onboarding traditions, dietary, focus chips): pill, 36 px tall (hit area 44 via padding), `border-line-strong`; selected = `bg-brand text-on-brand` with a leading check icon, `aria-pressed="true"` (multi) or radio semantics (single). Choosing **Mixed/other** reveals a text field directly below the chip group ("Tell us in a few words", ≤ 60 characters, `traditionOther`).
- **Example chip** (AI mode "Try:"): pill, `bg-surface-sunken`, `text-fg`, leading flame glyph. Clicking fills the instruction box and never submits. **Up to four chips per tab**, specific to the tab (listed in 9.3), and generated, not hand-placed: every chip maps to one tool in the active `PLAN_TOOLS` list or to one field of the code-computed `facts` block (9.3 rules).
- **Origin chips**: "AI suggestion" (`bg-accent-tint text-fg`, flame glyph), "Suggested by Utsav" (`bg-brand-tint text-brand`, diya glyph), "Edited by you" (`bg-neutral-tint text-fg-muted`, pencil), "Starter template" (`bg-neutral-tint`, diya glyph), "From Utsav's idea library" (`bg-neutral-tint`, diya glyph), "AI plan" (`bg-accent-tint`, flame), "From your new plan" (`bg-accent-tint`, flame), "Replaces your earlier change" (`bg-neutral-tint`, undo glyph), "Sample plan" (`bg-warning-tint text-warning`), "May not suit Jain guests" / "May not suit no-onion-garlic guests" (`bg-warning-tint text-warning`, alert icon; 6.14), "Recorded example" (`bg-warning-tint`), "P1" (`bg-neutral-tint`, used only in design mockups to mark items not built in the P0 pass).
- **Type chip** (Wedding, Birthday, ...): `caption` uppercase, `bg-brand-tint text-brand`.

### 6.4 Status pills (vendor pipeline)

Encoding uses four channels: **text label, icon, colour and fill style**, so it works in grayscale and for colour-blind users. Height 24, `rounded-pill`, `caption` 600 (sentence case, not uppercase).

| Status | Icon | Style (light) | Style (dark) |
|---|---|---|---|
| To research | `circle-dashed` | `bg-neutral-tint text-dusk`, 1 px dashed `line-strong` border | same tokens |
| Contacted | `message-circle` | `bg-brand-tint text-brand` | same tokens |
| Quoted | `receipt-indian-rupee` | `bg-warning-tint text-warning` | same tokens |
| Booked | `calendar-check` | `bg-success-tint text-success`, 1 px solid `success` border | same tokens |
| Paid | `badge-check` | **solid** `bg-success text-white` (dark: `text-bg`) | same tokens |
| Not needed | `circle-slash` | transparent, `text-dusk`, 1 px `line` border | same tokens |

Pipeline progress (vendor card footer): five 6 px segments. Segments up to the current step are filled in `success`, the current step is outlined, and visually hidden text reads "Step 3 of 5: Quoted".

**Status change rules in the UI (spec 5.6; code enforces them, the UI asks first):**

- Choosing **Booked** or **Paid** on a vendor with no `quotedAmount` does not save yet. The card (or drawer) expands an inline group directly below the select: "Quoted amount (required to mark booked)" money input + **Save** + **Cancel**. Focus moves to the amount. Save sets the amount and status in one operation. **Cancel** (or Escape) reverts the select to the previous status, announced as "Status not changed". The select stays enabled, never drag-only.
- Choosing **Paid** also requires "Paid amount" > 0 in the same inline group (pre-filled with the quote and editable). Saving 0 shows the inline error "Enter the amount you paid".
- **Paid more than quoted** (paid > quoted): a warning, not a block. The card and drawer show Turmeric text with an alert icon: "Paid ₹2,000 more than quoted". It also appears in the totals bar tooltip.
- **Delete vendor**: a confirm dialog states "Notes, amounts and saved drafts for Photographer will be deleted." Choosing Cancel or Delete. For status Booked or Paid, delete is blocked: the dialog explains "Photographer is booked, so its ₹2,40,000 counts as committed. Change the status (for example to Not needed) before deleting." with only a Close button and a "Change status" link.

Other pills: Valid (`success-tint`, check), Not valid (`danger-tint`, ban), Rushed (`warning-tint`, alarm-clock), Overdue (`danger-tint`, circle-alert), Adjusted (`warning-tint`, arrows), Applied (`success-tint`), Declined (`neutral-tint`), Recorded example (`warning-tint`), Above your budget (`warning-tint`, alert).

### 6.5 AI suggestion card (the signature component)

Anatomy (spec 6.1): an `article` with `aria-labelledby` its title, `bg-surface`, `rounded-lg`, `shadow-1`, and a 4 px left edge in `accent` (AI) or `brand` (Suggested by Utsav).

1. Header row: origin chip (left), validity pill (right: Valid / Not valid / No longer applies). Follow-up items also carry "Replaces your earlier change".
2. Title (`h3`, 16-18 px, 650): the code-built `describeOperation` label, e.g. "Reduce Decor by 20%".
3. **Diff block** (6.6): code-computed rows.
4. "Why" line: `body-sm`, `fg-muted`, prefixed "Why:", the quoted model rationale (max 160 characters), visually secondary.
5. Inline control (only where the spec lists one, e.g. "Saving goes: [Lower total ▾]").
6. Actions: **Accept** (`primary`), **Edit** (`secondary`), **Decline** (`ghost`), all **size `md` (44 px tall) on every pointer type** (D1-11). The order is fixed, so muscle memory and keyboard order match. Buttons have accessible names that include the target, e.g. `aria-label="Accept: Reduce Decor by 20%"`. Collapsed-state Undo/Restore and the "Accept all valid" button are also 44 px.

States:

| State | Visual | Focus after |
|---|---|---|
| Pending | Full card | n/a |
| Edit | The card expands into the reused editor form, with the "Edited by you" chip, a live "Preview:" diff line, and the actions "Save and accept" / "Cancel". On phones the edit form fills the sheet width; fields stack one per row | First field; Cancel returns to Edit |
| Applied | Collapses to one line: Leaf check + "Applied: Reduce Decor by 20%" + **Undo** | Undo button |
| Applied, undo unavailable | Same line; the Undo button is replaced by text "Undo unavailable: the plan changed after this." and a "Change it in the Budget tab" link | The line (`tabindex="-1"`) |
| Declined | Collapses to one line in `fg-muted`: "Declined: Reduce Decor by 20%" + **Restore** | Restore button |
| Not valid | `surface-sunken` background, title in `fg-muted`, reason in `danger` with a ban icon, no Accept; "Dismiss" plus an optional code-fix button ("Add Sangeet as a new function"). Pressing the fix **replaces the invalid card in place** with a "Suggested by Utsav" card for the fix (e.g. `add_function` Sangeet, date from the instruction, share 10%, other shares rescaled), drawn in `design.html` "Edit states and the code fix" | The new card's heading |
| No longer applies | As Not valid, reason "The plan changed since this was suggested" | n/a |
| Dependent | Nested under its parent with a 16 px indent and connector line; text "Also adds Photo booth vendor" on Accept | n/a |
| Follow-up | Normal card plus the "Replaces your earlier change" chip. **Title is code-built from the net effect** (DR2-06): "Change Decor cut from 20% to 15%", never "Reduce Decor by 15%" over a diff that goes up. Two diff lines: "From original ₹3,00,000 → ₹2,55,000 (−15%)" and "From now ₹2,40,000 → ₹2,55,000 (+₹15,000)". Accepting it undoes the earlier op and applies the new one in one history entry | Undo |

Batch header: `h2` (tabindex -1) "3 suggestions for 'cut decor spend by 20%'", count text "2 valid", and **Accept all valid (2)** (`secondary`). After Accept all: the **summary line** replaces the header actions. It is a `div` with `tabindex="-1"` and `role="status"` that receives focus: "2 applied, 1 skipped: There is no budget category called 'Stage decor'." plus a batch **Undo** (44 px). The skipped card stays below in its Not valid state.

Reply card ("Answer"): no actions, `surface-sunken`, code-computed figures in a small definition list.

**Edit forms in the card (DA2-05).** Every Edit opens the reused editor from spec 6.1 inside the card, with "Edited by you", a live "Preview:" (`role="status"`) and **Save and accept** / **Cancel**. Drawn: `adjust_budget_category` (amount, saving goes to), **idea editor** (title, description ≤ 300 with counter, category, estimated cost "≈ ₹", shared with the Ideas tab where the button reads "Save changes"), **`move_function`** (function locked, date limited to event day −14 to +1, start/end; the preview lists every linked task with old → new date and the rushed count), **`add_vendor`** (category, budget line, functions, book-by days, questions; no label or contact). Remove ops (`remove_task`, `remove_vendor`, `remove_function`, `remove_budget_category`) have no Edit: the card is the confirm form and states what is deleted or moved ("This task will be deleted", "2 vendors move to Contingency"); `remove_budget_category` carries a "Move amount and vendors to" select as its inline control.

**P0 op cards with previews (DR2-03)**, all the same component, diff lines from `describeOperation`:

| Op | Title (code-built) | Body |
|---|---|---|
| `set_event_date` | "Move the event date to Mon 21 Dec 2026" | Date diff with "+7 days", then the Event settings preview line: open tasks moved, functions shifted, rushed count, pinned tasks kept |
| `set_guests` | "Set guests to 450" | Total diff, per-guest diff; "Kids (40) and elderly (30) unchanged" |
| `remove_budget_category` | "Remove budget category: Entertainment" | Removed line, Contingency gain, the list of vendors that move, Move-to select |
| `remove_function` | "Remove function: Mehndi" | "Linked tasks and vendors will be unlinked" with names, share diff for the remaining functions |
| `add_function` | "Add function: Cocktail night" | Date, time, share and amount; share diff for every function plus a 100% total row |
| `set_vendor_status` | "Mark Mehndi artist as booked" | Status and committed diffs, and a boxed **Amount: ₹45,000 · you said "45k"** line so the parsed number is checked before Accept |
| `set_total_budget` (replan) | "Re-plan the budget for ₹22,00,000" | No diff; tag "Opens What-if"; primary button **Open What-if** (pre-filled), plus Decline |

**Where code proposals render (D-07, one rule).** Every code-generated proposal ("Suggested by Utsav": Add to plan on an idea, Reset this section, Update catering, the "Add Sangeet as a new function" fix) renders **inline, directly under the control that created it**, using this same card component and the same state machine:

| Trigger | Card appears | Focus on arrival |
|---|---|---|
| Ideas → saved idea → "Add to plan" | Under that idea row (task card + budget-note card) | First card's heading |
| Review banner → "Reset this section to the starter template" | Inside the banner, under that section | Card heading |
| Guests → total changed (P1) | Under the guest counts | None (polite announcement only, user is typing) |
| AI panel → invalid card → "Add Sangeet as a new function" | Replaces the invalid card in the panel | Card heading |

While pending, each card also counts toward the **AI mode button badge** (6.15), and it is listed in the AI panel under "Waiting for you" with a "Show" link that scrolls to it. Proposals expire after 24 h like AI proposals.

### 6.6 Diff view

- Row grid: label | before | `→` | after | delta. Before in `fg-muted` with `text-decoration: line-through` **and** visually hidden "from". After in `fg` 600. Delta in a pill: a decrease is `success-tint` "−₹60,000" (saving), an increase is `warning-tint` "+₹50,000" (spend). Never colour only: the sign and the word "less/more" are in the accessible label.
- Columns are `minmax(0, max-content) auto 16px auto minmax(0, 1fr)`, and every cell has `min-width: 0`. Below 420 px of card width, the delta pill wraps onto its own line under before/after (a container query), so a diff never forces horizontal overflow.
- Total row separated by a 1 px `line` rule, bold.
- **What-if variant (spec 6.4)**: two option cards **side by side** (radio cards, `radiogroup`): **Simple rescale** (code only, instant; summary "Every category × 0.88") and **Smart re-plan** (AI chip; summary "AI re-weights categories; code allocates exact rupees"). **Generate / Regenerate sit outside the radio cards** (a `radio` must not contain a button, DA2-02d): idle shows Generate under the radiogroup; ready shows a "Ready" status in the card and Regenerate under it. On phones the two cards stack. Under them, one diff table shows the selected option. Columns: Include (checkbox), Category, Before, After (editable money input), Change, Origin and status. The Smart table header carries the "AI suggestion" chip, and each AI-weighted row has a small flame "AI" origin tag. Status tags: Protected, "Adjusted by Utsav to protect Catering", Edited by you, Adjusted, "Cannot go below ₹2,40,000 committed", Not included. Under the table: a code note for dropped categories ("Ignored 'Fireworks': not a category in this plan. Add it from the Budget tab first.") and the model's **rationale notes** (up to 5, AI chip, bulleted). Then the trade-off cards. A sticky footer shows the totals and **Apply selected**. Apply is disabled with a reason when the total does not match: "Adjust one more row so the total is ₹22,00,000 (currently ₹22,40,000)."
- Smart re-plan states: idle (Generate), loading (three-stage progress inside the option card, Cancel), failed ("Smart re-plan is unavailable right now. Simple rescale still works." with Simple selected automatically), ready.
- Date diff (move function): "Sangeet · Sun 13 Dec → Fri 11 Dec · 3 linked tasks move 2 days earlier".

### 6.7 Toast

Bottom-centre on mobile (above the tab bar). On desktop it sits **bottom-left of the content column** (left = page gutter), so it never covers the AI panel. With the panel open, its max width is the content width minus 32 px. `bg-inverse-bg text-inverse-fg`, `rounded-md`, `shadow-3`, max width 420. `role="status"`, never takes focus. Content: icon + message + one action (Undo) + close. **The action, close and check icon use `inverse-action`** (Marigold on Ink in light, 8.64:1; Aubergine `#4B1D5C` on the light toast in dark, 11.30:1). The focus ring uses `inverse-focus`. Buttons are 44 px tall. Auto-dismiss after 10 s, paused on hover and focus-within. A 2 px `inverse-action` line shows the remaining time (static under reduced motion). Escape closes it when focused. Kinds: success (check icon), info, conflict ("This plan changed in another tab. Reloaded the latest version.").

### 6.8 Modal, sheets and menus

- **Dialog** (delete event, delete category, delete vendor, revoke link): native `<dialog>` with `showModal()`, `rounded-xl`, `shadow-3`, max width 480, scrim. Title `h2`, body, actions right-aligned (Cancel, then the destructive action). Focus starts on the first field (e.g. "Type the event title") or on Cancel. Escape closes, and focus returns to the opener.
- **Side sheet** (What-if, vendor drawer, add vendor): right side, full height, `surface`, sticky header with title + close and sticky footer with actions. Widths: What-if 720 px, vendor drawer and add-vendor 560 px. Modal on all sizes (focus trapped). **Below 768 px every side sheet becomes a full-screen dialog** that slides up (M9). This includes What-if: it is a full-screen sheet with stacked rows, not a partial bottom sheet.
- **AI panel**: on desktop, a non-modal `aside` (`complementary`, 400 px, pushes content). On mobile, a modal bottom sheet (top offset 36 px, drag handle, focus trap, Escape).
- **Menu** (event overflow, row overflow, idea overflow): `button[aria-haspopup="menu"]` opening a `role="menu"` popover (`shadow-2`, `rounded-md`, items 44 px tall, arrow-key navigation, Escape closes and returns focus). A disabled item keeps its label and shows its reason as a second line ("Contingency can't be deleted. It always stays in the plan.").

### 6.9 Tabs (workspace)

Real links (`<a aria-current="page">`), not ARIA tabs. 48 px tall, `body-sm` 600, `fg-muted`. The current tab is `fg` + a 3 px `brand` underline (plus `aria-current`, so not colour-only; the underline is a shape cue). Badge counts in a small pill ("Vendors 10"); counts come from the event, never copied between events. **Vendors badge = active vendors** (status ≠ Not needed); the accessible text is "Vendors, 10 active". **Mobile (DA2-09)**: all six links are in the markup (never dropped); the bar scrolls horizontally with `scroll-snap-type: x proximity`, right padding 36 px so the fifth tab is visibly cut off at 375 px, and a 44 px decorative edge fade (`::after`, no content, so not exposed to AT; a matching left fade once scrolled). On load, `element.scrollIntoView({inline: "nearest", block: "nearest"})` on the current tab. No "More" menu: Ideas and Guests stay one tap away.

Segmented control (By category / By function; All / To do / Done): `radiogroup`, `surface-sunken` track, selected segment `surface` with `shadow-1` and a check icon.

### 6.10 Progress

- **Linear bar** (tasks done, budget committed, onboarding): 8 px track `neutral-tint`, fill `brand` for all non-AI progress (tasks, onboarding, budget committed). Over-commit adds a `danger` segment past 100% with the text "Over by ₹40,000". Always paired with visible text ("12 of 34 done · 35%") and `role="progressbar"` with `aria-valuenow`/`aria-valuetext`.
- **Staged progress card** (AI loading, generating): list of 3 stages with icons (done check / spinner / empty circle), `aria-live="polite"`, Cancel button. Failure state: the active stage turns into a Turmeric alert icon with "AI was unavailable. Using the starter template." before navigation.
- **Step indicator** (wizard, onboarding): numbered dots with labels; the current step has `aria-current="step"`.

### 6.11 Empty states

Text-first (spec 3.4): a 24 px Lucide icon in a 48 px `brand-tint` circle, an `h3` title, a one-sentence body, one primary action, an optional secondary "Ask AI" action with the flame glyph, and a faint rangoli dot grid behind (decorative). Examples: "No events yet", "No vendors yet", "No ideas yet" (primary: Suggest ideas), "No tasks yet". **"Suggest vendors with AI"** on the Vendors empty state (DR2-09) opens AI mode with "Suggest the vendor categories I need" pre-filled (not submitted) and produces a normal T2 batch of `add_vendor` cards; the PM adds this instruction to the 6.3 eval set.

### 6.12 Skeletons

Same geometry as the final layout (CLS < 0.05). Blocks in `neutral-tint`, `rounded-sm`, text lines 12 px tall at 60-90% widths. The shimmer is a 1.6 s linear sweep of a 30% `surface` highlight; it stops under reduced motion and the skeleton stays static. The container has `aria-busy="true"` and visually hidden text such as "Loading your events". AI idea loading uses idea-card-shaped skeletons inside the New suggestions strip, plus the staged progress card.

### 6.13 Alerts and banners

- Inline alert: `rounded-md`, tint background, 1 px border in the semantic colour, leading icon, bold first phrase. `role="alert"` for errors, `role="status"` for others.
- Page banners: "Review your new plan" (`region`, `accent-tint` with Marigold edge, because it reviews AI output), "Started from a template" (`neutral-tint`), "Sample plan - not saved" (`warning-tint`, `role="note"`, sticky), "You are offline" (`warning-tint`, sticky).
- **Review banner rows**: each of the four sections shows the summary + **Looks good** + **Reset this section to the starter template** (visible text "Reset section", `aria-label="Reset Ideas to the starter template"`). Accessible name: `aria-label="Reset section: Vendors"` (visible text first, WCAG 2.5.3). Ideas additionally shows **Save all**. A reviewed section collapses to a "Reviewed" pill **with no Undo** (DR2-07: "Looks good" changes nothing in the plan, so there is nothing to undo, and "Undo" is reserved for plan history). Under the rows: "Start from the starter template instead". When the event version has moved on, it is disabled with the reason "Not available after you've changed the plan. Reset sections one at a time instead." The banner can be reopened from the event overflow menu ("Review your new plan") until every section is reviewed.

### 6.14 Cards

Event card (dashboard): the whole card is one link. Type chip, countdown ("38 days to go") top-right, title in Fraunces 22, meta line, budget + progress bar (`brand`), a signals line ("3 vendors booked · 2 due this week"), and the AI pending badge ("2 suggestions waiting", flame glyph). Hover: `shadow-2` and title underline.

Idea card: title, category tag, description, "≈ ₹6,000 (estimate)", "Why this idea: …" from `basis`, and origin. AI ideas in the New suggestions strip and T1 ideas in "From your new plan" have the Marigold edge and **Save / Edit / Dismiss** (T1: **Save / Dismiss**). Saved ideas have a `line` edge, **Add to plan** and an overflow menu (**Edit**, **Delete**). Flags: "Above your budget" (Turmeric). **Dietary guardrail (DA2-06, spec 7.3)**: when the event's dietary list includes Jain or no-onion-garlic and a food idea matches the code keyword list for that diet (potato, onion, garlic, root vegetables, …), the card shows a `warning-tint` tag with an alert icon, "May not suit Jain guests", and the "Why this idea" line adds "Flagged by Utsav: …". The idea is never hidden or auto-dismissed. In a Hindi plan, idea title and description are model text in `lang="hi"`; category, estimate, flags and "Why this idea" stay English and code-built.

### 6.15 AI mode button

`hero-bg` fill, `hero-fg` text, flame glyph in Marigold, label "AI mode" + shortcut hint. The hint reads **"Ctrl K"** by default and **"⌘K"** on Apple platforms (`navigator.userAgentData?.platform` or the UA string matches Mac/iPhone/iPad). It is hidden on `pointer: coarse`. `aria-keyshortcuts="Control+K Meta+K"` always. When the panel is closed and items are pending, a Marigold count badge sits on the button ("2"). **Accessible name (DA2-02a)**: the visible "AI mode" comes first; the hint `<kbd>` is `aria-hidden="true"` (the shortcut is exposed by `aria-keyshortcuts`); the count is a visually hidden `<span>`: name = "AI mode, 2 suggestions waiting". No `aria-label` on this button.

### 6.16 Enquiry draft editor (DA2-04)

The draft is a real `<textarea>` with a visible label ("Message · edit it before you copy or open WhatsApp"), inside a bordered box whose header carries "Draft - review before sending" and the origin chip ("AI" or "Template draft"). Hindi drafts set `lang="hi"` on the textarea (Noto Sans Devanagari, line height 1.7). A counter below right ("265/700" WhatsApp, "257/1,500" email; Email also has a Subject input) is linked with `aria-describedby` and announced only at 90% and 100%. After the first change the header gains **"Edited by you"**. **Copy**, **Open in WhatsApp** / **Open email** and **Save draft** use the current textarea text. **Regenerate** on an edited draft opens a dialog "Replace your edited draft?" with Cancel (initial focus), "Save my draft first" and "Replace draft". Phones use the same textarea full width inside the drawer sheet.

---

## 7. Motion

Principle: motion explains a change in the plan (something arrived, something was applied, something moved). It never decorates, never delays input, and never animates money figures counting up, because users must read exact rupees immediately. Implementation: **CSS transitions and `@keyframes` only** (no animation library in MVP, which keeps the bundle small). Height collapse uses `grid-template-rows: 1fr → 0fr`, which needs no JavaScript measurement. Optional Stretch: the native View Transitions API for tab changes, behind a feature check.

| # | Where | Trigger | Property | Duration | Easing | Implementation |
|---|---|---|---|---|---|---|
| M1 | AI suggestion cards and code proposal cards entering | Proposal arrives | `opacity` 0→1, `transform: translateY(8px)`→0 | 200 ms, stagger 40 ms per card, max 5 staggered (the rest appear together) | `--ease-out-soft` | `@keyframes card-in`; `style="--i: n"` and `animation-delay: calc(var(--i) * 40ms)` |
| M2 | Accept feedback | Accept clicked | Card: `grid-template-rows` 1fr→0fr on the body; background flashes `success-tint` then settles; check icon `scale(.6)`→1 | 240 ms collapse, 160 ms icon | `--ease-in-out-soft` | CSS transition on `[data-state="applied"]` |
| M3 | Decline feedback | Decline clicked | Body collapse, `opacity` .7 for the collapsed line | 200 ms | `--ease-in-out-soft` | Same transition, `[data-state="declined"]` |
| M4 | Workspace tab transitions | Route change | Content `opacity` 0→1 and `translateY(4px)`→0; the underline indicator slides (`transform: translateX`) | 160 ms content, 200 ms indicator | `--ease-out-soft` | `@keyframes fade-up` on the tab panel; the indicator is a positioned pseudo-element. Stretch: View Transitions |
| M5 | Progress fills | Value change (tasks ticked, committed) | `transform: scaleX()` on the fill (origin left) | 320 ms | `--ease-out-soft` | `transition: transform`. Never on first paint |
| M6 | Skeleton shimmer | Loading | `background-position` sweep | 1.6 s, infinite | linear | `@keyframes shimmer`; stops when content arrives |
| M7 | Onboarding step transitions | Continue / Back | Outgoing fades (`opacity` → 0, 120 ms); incoming `translateX(16px)`→0 + fade (Back uses `-16px`) | 200 ms | `--ease-out-soft` | Keyed container with `@keyframes step-in-next / step-in-back`; focus moves to the step `h1` when the animation starts (not when it ends) |
| M8 | AI panel open / close (desktop) | AI mode button, Ctrl/Cmd+K, Close | Panel `transform: translateX(16px)`→0 + opacity; the content width changes instantly (no layout animation) | 200 ms open, 150 ms close | `--ease-out-soft` | CSS transition on `[data-open]` |
| M9 | Mobile sheets: AI bottom sheet and full-screen sheets (What-if, vendor drawer, add vendor) | Open / close | `transform: translateY(100%)`→0 | 280 ms open, 200 ms close | `--ease-out-soft` | `<dialog>` + `@starting-style` transition (fallback: no animation) |
| M10 | Toast | Shown / dismissed | `translateY(8px)` + opacity in; opacity out; 10 s timer line `scaleX` 1→0 | 180 ms in, 120 ms out | `--ease-out-soft` | CSS; the timer uses `animation-play-state: paused` on hover and focus-within |
| M11 | "Adjusted" rows after a rebalance | A save that changed other rows | Row background `warning-tint` fades to transparent; the tag stays | 900 ms | `ease-out` | `@keyframes highlight-fade` |
| M12 | Generating card stages | Stage changes | Stage icon crossfade; spinner rotation | 160 ms; spinner 900 ms linear infinite | linear | CSS |
| M13 | Inline status prompt (Booked/Paid amount) | Status select change | Prompt group `grid-template-rows` 0fr→1fr | 160 ms | `--ease-out-soft` | CSS; focus moves to the amount at once (not after the animation) |
| M14 | Menus | Open / close | `opacity` + `scale(.98)`→1 from the trigger corner | 120 ms in, 80 ms out | `--ease-out-soft` | CSS on `[data-open]` / `@starting-style` |

**Where motion must not be used**: money values and totals (no count-up, no flip-number); table re-sorting; status `<select>` changes (instant; the pill swaps text immediately); error messages and the error summary (they appear instantly so they are not missed); the focus ring (instant); the date-change preview; badge counts; anything that loops after load except spinners and skeleton shimmer; parallax, confetti or celebratory bursts (including "vendor booked" or "paid"); hover lifts larger than 2 px.

**Reduced motion** (`@media (prefers-reduced-motion: reduce)`): all transforms are removed. Fades shorter than 120 ms remain for M1, M2, M3, M10 and M14 (opacity only), so state changes are still perceivable. The shimmer stops (static skeleton). Spinners are replaced by a static "Working…" label with the stage text. Sheets, prompts and panels appear instantly. M11 becomes a static "Adjusted" tag only. The phone tab bar scrolls the current tab into view with `behavior: "auto"` always (no smooth scrolling on load), and the "Edited by you" chip on drafts and cards appears without animation. Implement this with a global rule that sets `animation: none` plus `transition-property: opacity` and `transition-duration: 100ms` on the motion classes, rather than the blunt `0.01ms !important` on everything, which would remove the useful opacity cue.

---

## 8. Accessibility

### 8.1 Focus

- `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`. Light: Aubergine (12.08:1 on Ivory). Dark: Aubergine-dark `#D8B4E2` (10.09:1 on the dark canvas; v2 used Marigold, which blurred the AI signal). On Aubergine-filled buttons the ring sits outside (offset 2 px) against the canvas. **That is only true on the canvas**: on the brand band (landing hero, phone hero header, any `hero-bg` surface) the canvas is Aubergine, so `.hero` rescopes `--u-focus` to `hero-fg` (Ivory on plum, 12.08:1 light, 12.84:1 dark; DA2-01). The AI mode button sits on the surface, so it keeps the default ring. Inside the inverse toast: `outline-color: var(--color-inverse-focus)` (Marigold on Ink in light at 8.64:1, Ivory-dark on the light toast in dark at 16.08:1).
- Never remove outlines; `:focus` without `-visible` shows nothing for mouse users.
- **Skip link** "Skip to main content": the first focusable element on every page, off-screen until focused, then shown top-left at 16 px from the edges as a `primary` button with `shadow-2`. It targets `<main id="main" tabindex="-1">`. It is drawn in `design.html` (States, "Forms and chrome").

### 8.2 Touch targets

- Primary actions, **AI card Accept / Edit / Decline (44 px on every pointer type)**, Undo / Restore, Accept all, toast actions, bottom-sheet controls, chips: **44 × 44 px** minimum (visual 36 px chips get padding to 44).
- Dense inline controls (table row overflow, checkboxes in task rows, remove-chip ×, `sm` table buttons): **≥ 24 × 24 px** with 8 px spacing (WCAG 2.5.8). On `pointer: coarse` they grow to 44.
- Checkbox visuals are 20 px inside a 24 px (desktop) / 44 px row (mobile) label hit area.

### 8.3 Colour-independent encoding

- Vendor statuses: text + icon + colour + fill style (6.4). Pipeline segments have hidden text.
- Over budget: "Over by ₹30,000" text + icon. Rushed / Overdue: pill text + icon. Valid / Not valid: pill text + icon. Paid more than quoted: text + icon.
- Diff: signs (+/−), struck-through "before", hidden "from/to" words.
- AI origin: chip text, not only the Marigold edge.
- Links in body text are underlined.

### 8.4 Keyboard flow for AI suggestion review

1. **Ctrl+K / Cmd+K** (or the "AI mode" button) opens the panel and focuses the instruction textarea (`aria-keyshortcuts="Control+K Meta+K"`).
2. Type; **Ctrl/Cmd+Enter** submits, or Tab to **Suggest** and press Enter. Tab order inside the panel: Close → textarea → Suggest → example chips → "Waiting for you" (if any) → previous turns (each a disclosure button) → current batch.
3. While waiting: progress card (`aria-live="polite"`) with a **Cancel** button reachable by Tab.
4. Proposal arrives: focus moves to the batch `h2` (tabindex -1) unless the user moved focus elsewhere; the live region says "3 suggestions, 2 valid".
5. Tab order from the heading: **Accept all valid** → card 1 (Accept → Edit → Decline → inline control if any) → card 2 … Invalid cards expose only Dismiss / the fix link.
6. Accept / Decline: the card collapses and focus lands on its **Undo** / **Restore**; Tab continues to the next card's Accept. If Undo becomes unavailable, focus stays on the collapsed line, which reads its reason.
7. Edit: focus moves to the first field; Escape or Cancel returns to Edit; "Save and accept" moves focus to Undo.
8. Accept all: focus moves to the summary line ("2 applied, 1 skipped: …") with the batch Undo.
9. The toast never takes focus; Undo is also on the collapsed card. **Escape** closes the toast if it has focus; otherwise Escape (mobile sheet) closes the panel, and focus returns to the AI mode button.
10. Code proposal cards created inline (6.5) follow steps 5-8 in place.
11. No single-character shortcuts anywhere.

### 8.5 Other rules

- One `h1` per page; landmarks `header`, `nav`, `main`, `aside` (AI panel), `footer`.
- Live regions: one shared polite region for saves and rebalance announcements (spec 9.2); `role="alert"` for errors and the error summary.
- Editable table cells have per-row `aria-label`s ("Decor, amount after"). Details expanders keep the visible word first: `<button aria-expanded>Details<span class="sr-only"> for Venue</span></button>` (no `aria-label`, WCAG 2.5.3). Columns that hold only buttons get a visually hidden header ("Actions", "Details", "Include"); no empty `<th>`.
- Horizontal scroll containers (frame strips on the board; wide tables in the app) get `tabindex="0"` plus a name so keyboard users can scroll them.
- Hindi text in `lang="hi"`. Reduced motion respected (section 7).
- Contrast test in CI (2.3). axe on every route (spec 9.2).

### 8.6 axe result for the reference markup (DA2-02)

`design.html` is checked with axe-core 4.14.0 in Playwright Chromium (all rules, 1,400 px, after animations settle, the page wrapped in `<html lang="en">` as the artifact host does). v3 result: **light 0 violations, dark 0 violations**, 58 rules passing in each theme. 169 nodes are "needs review" for contrast only because they hold no letters (₹ prefix, → arrows) or sit on a gradient (toran, tab-bar fades); they are covered by the 2.3 table. The bare file additionally reports `html-has-lang`, which the host page supplies. Board conventions that keep it clean: mockup inputs are styled `span`/`div` and carry their intended name as `data-aria-label` (the app puts it on the real control as `aria-label`); repeated mockup landmarks are suffixed "(mockup N)" so names stay unique in one long document. Neither convention is copied into the app.

---

## 9. Page design notes (see `design.html` for the mockups)

### 9.1 Pages

| Page | Key design decisions |
|---|---|
| Landing `/` | Aubergine hero band with Ivory text, Fraunces display headline, toran edge. The right side is a product preview (budget table + one AI card), not an illustration. **The preview is decorative (DR2-08)**: the whole card is one link to `/demo/wedding?tab=budget&ai=Cut+decor+spend+by+20%25` whose name is its visible last line, "Try this in the sample wedding"; the mock table and card inside are `aria-hidden="true"` and its Accept / Edit / Decline are styled `span`s, not buttons. Eyebrow text is `hero-fg` with the diya glyph (Marigold stays an AI and flame colour). Every control on the band uses the `hero-fg` focus ring (8.1). Two CTAs: Continue with Google (white Google-style button) and See a sample plan (secondary on dark). "How it works" three steps; a feature strip of the four brief pillars; trust strip "AI suggests. Utsav checks the numbers. You decide." |
| Sign in | Centred card on the rangoli dot grid; logo, one Google button; loading and three error states shown. |
| Onboarding | Single-column 560 px card, step dots + text "Step 2 of 4", brand progress bar, "Why we ask" info lines, footer with Back / Skip for now / Continue. Step 3 lists all 19 tradition chips from spec 4.2 with the Mixed/other text field. Save-error state shown. The Done step has a summary card with the toran edge. |
| Dashboard | "My events" h1 + New event; tabs Upcoming / Past / Archived (**P1**, hidden in P0); 3-up event cards (1-up on mobile). Empty, loading and error states. |
| Create event | Three-step wizard. Step 1 draws the conditional fields for every type: Birthday "Turning (age)", Anniversary "Years married", Community/Other "Occasion" select with "Other" free text, plus generated title placeholders. Step 2: function rows (stacked cards on mobile), "Does this event have several parts?" for non-wedding types, tradition chips with Mixed/other text. Step 3: honorees, theme, kids/elderly/mobility, plan language. One error state with error summary and inline messages. Generating card, plus its template-fallback transition. |
| Workspace header | Fraunces title, chips, countdown, AI mode button (flame, "Ctrl K" / "⌘K", pending badge), overflow menu (Review your new plan · Event settings · Share link · Add to calendar · Archive **P1** · Delete event). |
| Overview | Opens with the "Review your new plan" banner (Looks good / Reset section on every row; Save all on Ideas; reset card inline; disabled "Start from the starter template instead" state). On a first visit, the Saved ideas card reads "6 ideas from your new plan to review". |
| Budget | Editable table with tabular numbers, Variance column, Adjusted tags (every unpinned row rebalanced proportionally), row overflow menu, add-category inline form, delete-category dialog ("2 vendors will move to Contingency"), blocked Contingency delete. Segmented By category / By function. What-if side sheet with Simple and Smart **side by side**, and all Smart states. Mobile: stacked rows and a full-screen What-if. |
| Timeline | Phase groups; function days as brand-tint milestones; Rushed / Overdue pills; inline task editor showing the computed date, with "N days **before / after** the event" (−7 to 730) or a date. **Phase rule (DR2-05)**: function milestones on the event day or the day after (daysBefore 0 or −1, e.g. a +1 reception) sit in "Event days" (the `day` phase, labelled "Event days" when it holds more than one function); earlier functions follow `phaseFor`; "After the event" holds tasks only. PM to align `groupByPhase` and its unit test. States: task overflow menu (Edit, Mark as done, Delete with Undo toast), pinned-date warning after a date change ("1 task with a fixed date is now more than 7 days after the event", Move / Keep). Mobile list with the editor as a full-width block. |
| Vendors | Five status columns (each card has a status select), totals bar, a Paid card, collapsed Not needed. "Vendor states" frame: Booked/Paid inline amount prompts, Paid more than quoted, Add vendor sheet, delete confirm + blocked variant. Vendor drawer: questions (edit/remove/add), enquiry options incl. "Sign with my name" and include date/city/guests, WhatsApp and Email variants, "Some details were removed", saved drafts (max 3) with a "Template draft". Mobile: list with filter chips; drawer as a full-screen sheet. Grouped-list fallback when the AI panel leaves < 900 px. |
| Ideas | "Ideas use:" summary line; **community variant (DA2-06)** with no honoree rows: Occasion (locked, from creation), "Planned by: residents' committee" (locked, from `profile.role`), theme, kids / elderly read-only from Guests, mobility, traditions + Mixed/other, dietary, vibe; "May not suit Jain guests" food card; **Hindi plan frame (DR2-10)**; complete personalisation panel (honorees with Add/Remove, theme, tradition + Mixed/other, dietary, kids/elderly read-only from Guests, mobility, vibe); "From your new plan (not saved yet)" group with Save / Dismiss; New suggestions strip (Save / Edit / Dismiss, Save all); saved list with Add to plan, Edit, Delete; "Add your own idea"; Add-to-plan result cards inline. Anniversary variant (two honorees, "Decade photo wall, 1967 to 2027"). Empty, loading, library-fallback and "Above your budget" states. |
| AI mode | 400 px panel; instruction box; up to four tab-specific example chips (9.3); "Edit states and the code fix" frame and "P0 op cards with previews" frame (6.5); "Waiting for you"; previous turns (expandable); batch with cards in all states; Accept-all summary; follow-up card; undo-unavailable; edit state; error states. Mobile bottom sheet; mobile edit form. Toast at the bottom-left of the content column. |
| Settings, Guests, Event settings | Plain forms in cards. Avatar menu (name and email, My events, Settings, Privacy and AI, Sign out). Onboarding re-run `/onboarding?rerun=1`: answers pre-filled, "Updating your profile" tag, "Cancel and return to Settings", Done says "Profile updated." and returns to `/settings`. Guests shows the inline validation state (adults + kids ≠ total; dietary counts > total) with the error summary, messages on blur and save only. Event settings share card adds **"Show event title" (default off)**. Settings has Event types multi-select and traditionOther; "Delete my account" is **P1, hidden until F-20**. Event settings shows the locked type, the budget field that opens What-if, sharing off ("Create link"), the revoke confirm, and the delete dialog requiring the title. Danger zone separated with a Sindoor heading and outline button. |
| Shared plan `/s/[token]` | Read-only document layout: logo + "Shared plan (read-only)" + Make your own. **Heading is the code-built type title** ("Wedding · Pune", "Diwali celebration · Chennai") unless the owner turns on "Show event title" (DR2-12; PM to add `showTitle` to share options and `toSharedView`). **Budget (DR2-01)**: a `<details open>` "All N budget lines" table with every category, and with "Show amounts" on, Allocated, Committed and Paid plus a totals row and the summary "Committed · Paid · Remaining" (deriveView definitions); open on desktop, collapsed on phones. **Vendors**: every active vendor as category + status pill (+ Quoted and Paid with amounts on), plus "N marked Not needed"; notes appear only with "Show vendor notes". Frames: wedding desktop, community Diwali at 375 px, the same with notes on, amounts-hidden (shares and statuses only), opted-in title, revoked-token 404. |
| Privacy `/privacy` | Full page frame: what we store, what we send to Gemini, what we never do, delete your data (P0 wording: account deletion by email), contact. |
| Demo | Chooser with three sample cards. `/demo/wedding?tab=budget` with read-only budget and function shares, the sandbox AI panel ("Cut decor spend by 20%"), the follow-up "Replaces your earlier change", and the code-only What-if simple-rescale diff. `/demo/birthday?tab=ideas` and `/demo/community?tab=ideas` with Suggest ideas, focus chips and a sandbox New suggestions strip (Recorded example). "Reset sample" error card for `SANDBOX_STATE_INVALID`. **Exhausted state (DA2-11)**: on 429 the panel shows "You've used the 5 sample tries this hour. Try again in N minutes, or sign in to plan your own." (from `Retry-After`), Suggest disabled with "0 of 5 tries left · resets at 3:42 pm" as its description, Sign in with Google and "See the recorded example" still available; the 300/day cap shows "The demo is busy today. Try again tomorrow." Sticky "Sample plan - not saved" banner everywhere. |
| 404 / error / loading / offline / rate limit / conflict / forms and chrome | Shown in the States section, including the skip link, the error summary and the share "not shared yet" state. |

### 9.2 P1 and Stretch markers

Mockups tag every element that is not in the P0 build with a visible "P1" or "Stretch" chip: Archived tab, Archive event, History list, Delete my account (F-20), Outstation guests, catering proposal, Suggest questions button, Hindi UI toggle (Stretch, not drawn). The developer builds untagged elements in the P0 pass.

### 9.3 AI mode example chips per tab (four each)

Each chip maps 1:1 to a tool in `PLAN_TOOLS` or to a field of the code-computed `facts` block (spec 6.3: total, committed, paid, remaining, tasks overdue). Source in brackets.

| Tab | Chips |
|---|---|
| Overview | "What's overdue?" (facts.tasksOverdue) · "Move the sangeet to Friday" (`move_function`) · "Add a photographer" (`add_vendor` + `add_task`) · "We're now 450 guests" (`set_guests`; fallback "What's left to pay?") |
| Budget | "Cut decor spend by 20%" (`adjust_budget_category`) · "Move ₹50,000 from Decor to Catering" (2 × `adjust_budget_category`) · "Keep the total under ₹24 lakh" (`set_total_budget`) · "What's left to pay?" (facts.committed, facts.paid) |
| Timeline | "Move the sangeet to Friday" (`move_function`) · "Add a task to book the mehndi artist" (`add_task`) · "What's overdue?" (facts.tasksOverdue) · "Push the wedding back by a week" (`set_event_date`; fallback "Add a reminder to send invites 30 days before", `add_task`) |
| Vendors | "Add a photo booth" (`add_vendor`) · "Mark the mehndi artist as booked at 45k" (`set_vendor_status`) · "Add a note to the caterer: wants 50% advance" (`update_vendor`) · "Add questions for the decorator" (`update_vendor` questions) |
| Ideas | "Ideas for elderly guests" · "Cheaper decor ideas" · "Something for 25 kids" · "Ideas that fit Diwali" (all `add_idea`) |
| Guests | "We're now 45 guests, 30 of them kids" (`set_guests` total + kids) · "We have 18 elderly guests" (`set_guests` elderly; total unchanged, said on the card) · "We're now 40 guests" (`set_guests`) · "What's left to pay?" (facts) |

Removed in v3 (DA2-07, DR2-02): "10 of them are Jain" (no tool takes dietary counts), "How many plates do I need?" (catering estimate is not in `facts`), "Add 15 elderly guests" (ambiguous: does the total rise?), "What's due this week?" (not in `facts`), "Which vendors are still unbooked?" (answer would be model-counted), "Add a trial makeup day" (task or function?), and "Mark the caterer as booked at ₹3,90,000" (the caterer is already booked in the S1 fixture). If the PM extends `facts` with `dueThisWeek[]` and `cateringPlates` (from `estimateCatering`), "What's due this week?" and "How many plates do I need?" may return.

**Rules.** (1) Chips live in one typed constant, `EXAMPLE_CHIPS: { tab, text, source: { tool: ToolName } | { facts: keyof Facts } }[]`. (2) The panel renders only chips whose `tool` is in the active `PLAN_TOOLS` (so dropping `set_guests` / `set_event_date` under spec 12.5 step 3 swaps in the listed fallback instead of leaving a dead chip). (3) A unit test asserts every chip's tool or facts key exists. (4) Every chip text is a row in the spec 6.3 eval set with its expected op or reply source; the PM adds the rows not yet there.

Demo samples use three of their tab's chips plus the sample's recorded chip (wedding "Cut decor spend by 20%", birthday "Add a painting station", community "Add volunteer tasks for the event day").

### 9.4 Canonical wedding states (DA2-08, DR2-04)

Every wedding frame in `design.html` carries a state chip, so the numbers never contradict each other. `src/lib/demo/fixtures.ts` uses **S1** for the demo wedding, and it must pass `assertPlanInvariants`.

| State | When | Key numbers |
|---|---|---|
| **S0** fresh plan | First visit after generation (Overview with the review banner) | 10 vendors To research, committed ₹0, paid ₹0, remaining ₹25,00,000; "Book wedding venue" Rushed, due today |
| **S1** canonical (Wed 28 Oct) | Vendors, Timeline, Overview signals, Share, demo fixture | Venue Booked ₹4,50,000 (paid ₹1,00,000), its task done 26 Oct; Caterer Booked ₹3,90,000 (paid ₹1,00,000); Videographer Booked ₹2,40,000 on the ₹2,00,000 Photography line, so **over by ₹40,000**; Invitation printer Paid ₹40,000 on a ₹38,000 quote; Mehndi artist Quoted ₹45,000; Photographer and Sound & lights Contacted; Decor, Pandit, Makeup artist To research (makeup is the Rushed task); 1 Not needed (Bridal car). Committed ₹11,18,000, paid ₹2,40,000, remaining ₹13,82,000, 12 of 34 tasks done. Tab badge "Vendors 10" (active) |
| **S1 + AI** | AI mode panel and `/demo/wedding?tab=budget` | S1 after accepting "Cut decor spend by 20%" with change_total: Decor ₹2,40,000, total ₹24,40,000, Photography still ₹2,00,000 and over by ₹40,000 |
| **S2** | Budget tab, phone Budget, panel-open frame | S1 after lowering Decor by hand to ₹1,90,000 with "adjust the others": 8 unpinned rows × 1.05, Photography ₹2,10,000 and **over by ₹30,000** |

---

## 10. Revision log

### v2 (2026-10-28): design review D1-01 to D1-13 and D-01 to D-16

| Gap | Fix | Where |
|---|---|---|
| D1-01 Spec and design token sets contradict | Spec 1.3 rewritten to match this document (eight colours with light/dark values, Marigold AI marker + chip text, logo file names, stroke wordmark, Fraunces / Plus Jakarta Sans / Noto Sans Devanagari via `next/font` with subsets, revised font budget). `--color-ai #4B3B8F` removed everywhere; spec 2.2 row, 6.1, 9.2, 9.3 updated; spec revision log v4 added. The "supersedes" note here replaced by "source of truth" | spec 1.3, 2.2, 6.1, 9.2, 9.3, 13 v4; this doc header, 2.5 |
| D1-02 Dark-mode toast Undo at 1.58:1 | New `inverse-action` (Marigold on Ink in light 8.64:1; `#4B1D5C` on the light toast in dark 11.30:1) and `inverse-focus` tokens; toast Undo, close, check icon and timer line use them; rows added to 2.3 and the contrast test | 2.2, 2.3, 2.5, 6.1, 6.7, 8.1; design.html tokens, toast CSS, colour table |
| D1-03 Logo flame invisible on dark tile | Mark keeps fixed light colours in both themes (plum tile, Ivory bowl, Marigold flame) with a `#D8B4E2` ring on dark surfaces; logo tokens added; brand board shows the mark on a dark canvas at 96/32/16 px | 1.2, 2.2, 2.3, 2.5; design.html brand section and `#logo-mark` symbol |
| D1-04 Personalisation inputs not designed | Step 1 drawn for Birthday (Turning 6), Anniversary (Years married 60), Community (Occasion Diwali) and Other (free text); step 3 adds Theme and Plan language; Ideas panel completed per spec 5.7/10.11 incl. read-only kids/elderly; onboarding chips completed (19) with Mixed/other text; anniversary Ideas frame with "Decade photo wall, 1967 to 2027" (Why: 60 years married) | design.html Onboarding, Create event, Ideas; 9.1 |
| D1-05 Vendor checklist maintenance states | New "Vendor states" frame: Booked prompt (quote required) with Cancel-reverts, Paid prompt (paid > 0), Paid card with "Paid ₹2,000 more than quoted", Add vendor sheet (category suggestions + free text, budget line), delete confirm and blocked variant, drafts list (max 3) with "Template draft"; enquiry toggles "Sign with my name", include date/city/guests; Paid column now has a card | 6.4; design.html Vendors |
| D1-06 Judge-visible demo path | Frames for `/demo/wedding?tab=budget` (read-only budget + function shares, sandbox AI panel, What-if simple rescale diff, follow-up "Replaces your earlier change"), `/demo/birthday?tab=ideas` (Suggest ideas, focus chips, sandbox New suggestions strip, Recorded example), community updated with Suggest ideas, and the "Reset sample" error card | design.html Demo; 9.1 |
| D1-07 AI review states missing | Accept-all summary line (focus target, batch Undo), reset_section card with before/after, Add-to-plan cards (add_task + set_budget_note), "Undo unavailable" line, "From Utsav's idea library" label; Smart re-plan table labelled with AI chip and per-row AI tags, rationale notes, "Adjusted by Utsav to protect Catering"; batch count fixed to 3 | 6.5, 6.6; design.html AI mode, Budget, Overview, Ideas |
| D1-08 T1 review consistency | Ideas row has Looks good · Save all · Reset section; T1 ideas in their own "From your new plan (not saved yet)" group with Save / Dismiss; saved-idea overflow (Edit, Delete); "Add your own idea" | 6.13, 6.14; design.html Overview, Ideas |
| D1-09 Budget tab coverage | Variance column added; add-category form, delete-category dialog ("2 vendors will move to Contingency") and blocked Contingency delete drawn; What-if options settled as **side by side** in both docs (spec 6.4 wording aligned); What-if "Before" equals the category table | 6.6, 6.8; spec 6.4; design.html Budget |
| D1-10 design.html overflows at 400 px | `.grid2`/`.grid3` use `minmax(0,1fr)`; diff cells `min-width:0` and the delta wraps under 420 px; `body{overflow-x:hidden}` removed; re-checked at 400 px (no page-level horizontal scroll; wide frames scroll inside `.scroller`) | 4, 6.6; design.html CSS |
| D1-11 Button size contradiction | AI card actions, Undo/Restore and Accept all are size `md` (44 px) on every pointer type; `sm` (36 px) only for dense tables/toolbars; HTML caption and CSS match | 6.1, 6.5, 8.2; design.html |
| D1-12 Remaining spec states | "Forms and chrome" frame: skip link on focus, form error summary, share "not shared yet" (Create link); onboarding save error; "Delete my account" tagged P1 (hidden until F-20); `/privacy` promoted to a full page frame. Hindi UI toggle stays out (Stretch) | 6.2, 8.1, 9.1, 9.2; design.html States, Settings, Privacy |
| D1-13 Purple reads maroon | Aubergine nudged from `#4A1942` (hue 310°) to `#4B1D5C` (hue 284°); all light ratios re-computed (2.3); brand presence raised (brand progress fills, milestones, step markers). Owner confirmation pending; revert is one token | 2.1-2.3, 2.5; design.html tokens and swatches |
| D-01 Demo T4 flow missing | Same as D1-06: Suggest ideas, focus chips, sandbox New suggestions strip with Save/Edit/Dismiss and Recorded example, Undo, Reset sample, What-if Simple rescale entry point on the wedding sample; birthday and wedding samples drawn | design.html Demo |
| D-02 T1 idea state | "From your new plan (not saved yet)" group separate from Saved; Overview Saved ideas card shows "6 ideas from your new plan to review" on first visit | 6.14; design.html Ideas, Overview |
| D-03 Review banner gaps | Looks good on every row incl. Ideas (+ Save all); Reset buttons have section-specific accessible names; disabled "Start from the starter template instead" state; reset_section card; overflow menu with "Review your new plan" | 6.13; design.html Overview |
| D-04 Ideas personalisation panel | Every spec field drawn (honoree rows with Add/Remove, up to 4; theme; tradition chips + Mixed/other; dietary; kids/elderly read-only once counts exist; mobility; vibe) and an anniversary couple variant (two honorees with ages, elderly from Guests) | design.html Ideas |
| D-05 Wizard gaps | Occasion and Milestone variants; "Does this event have several parts?" toggle; traditionOther; theme; plan language; error state with summary and inline messages (date range, budget 1,000 to 10 crore, function date window, end after start); template-fallback transition | 6.2, 6.10; design.html Create event |
| D-06 Vendor status rules | Inline "Quoted amount (required to mark booked)" with Save/Cancel (select reverts on Cancel), Paid prompt, Paid-more-than-quoted warning, Add vendor form | 6.4, M13; design.html Vendors |
| D-07 Where code proposals render | One rule: inline under the trigger, same card component, counted in the AI button badge and listed under "Waiting for you"; focus rules per trigger | 6.5, 6.15, 8.4; design.html Ideas, Overview, AI mode |
| D-08 Mobile coverage | 375 px frames: Budget stacked rows, What-if full-screen sheet (6.8 and M9 now agree), wizard function rows as stacked cards, Timeline with inline editor, vendor drawer full-screen, AI card edit form | 6.8, M9; design.html Mobile section |
| D-09 Font budget | Fraunces limited to one static 600 Latin subset (no opsz/SOFT axes), Jakarta single variable Latin file, Devanagari on demand and never preloaded; budget ≤ 60 KB preloaded (≈ 52 KB estimated) + ≤ 90 KB on demand; CI check `check:fonts` records the measured total | 3; spec 1.3, 9.3 |
| D-10 Brand vs spec, AI distinctness | Decision source and date recorded (owner, design brief, 2026-10-28; spec v4 updated by PM); Marigold edges and accent-tint now reserved for AI; non-AI progress fills, milestones and landing step markers use brand; landing eyebrow uses the diya instead of the flame | header, 1.3, 2.1, 2.4, 6.10; design.html |
| D-11 Budget tab details | Rebalance example recomputed with the proportional rule (Decor ₹3,00,000 → ₹1,90,000; all 8 unpinned rows × 1.05, all tagged Adjusted); Variance column; row menu; delete dialog; What-if Generate, loading, failure, "Anything else?", "Ignored 'Fireworks'", "Adjusted by Utsav to protect Catering", AI chip and disabled Apply | 6.6; design.html Budget |
| D-12 AI panel details | Four tab-specific chips; follow-up card; expanded earlier turn; pending badge; toast placement next to the panel; "Ctrl K" / "⌘K" by platform | 6.3, 6.7, 6.15, 9.3; design.html AI mode |
| D-13 Enquiry drafts | "Sign with my name"; Email variant with Subject and Open email; saved drafts list with View/Delete; "Template draft"; "Some details were removed"; question edit/remove/add; distinct sample categories (Photographer vs Videographer; AI example now adds a Photo booth) | design.html Vendors |
| D-14 Ideas states | Empty Ideas tab, T4 loading, library fallback label, "Above your budget", saved Edit/Delete; birthday tab badge fixed (Vendors 5) | 6.11, 6.12, 6.14; design.html Ideas |
| D-15 Layout with AI panel open | Container-query rules per tab (vendor grouped list below 900 px content, budget column priorities with a Details expander); frame drawn | 4; design.html AI mode |
| D-16 Settings, event settings, onboarding, share | Event types multi-select and traditionOther in Settings; onboarding chips completed; Event settings: locked type, budget field opening What-if, Create link state, revoke confirm, delete dialog; overflow menu contents; share amounts-hidden variant and revoked 404; P1 chips on Archived tab, Archive, History, Delete account | 9.2; design.html Settings, Event settings, Share, Overview |

### v3 (2026-10-28): audit DA2-01 to DA2-11 and review DR2-01 to DR2-12

| Gap | Fix | Where |
|---|---|---|
| DA2-01 Focus ring invisible on the brand band | `.hero, [data-surface="hero"] { --u-focus: var(--u-hero-fg) }`: Ivory on plum, 12.08:1 light, 12.84:1 dark. New "focus ring = hero-fg" rows in 2.3 (and in the planned `contrast.test.ts`). Focused hero link, Sign in and outline CTA drawn in the Accessibility section | 2.2, 2.3, 2.5, 8.1; design.html CSS, colour table, Accessibility |
| DA2-02 Reference markup fails axe | Reset buttons `aria-label="Reset section: Vendors"`; AI mode name = visible "AI mode" + hidden count, `kbd` `aria-hidden`; Details buttons keep visible text with hidden " for Venue"; account avatar button likewise; comboboxes labelled with `aria-controls`, `aria-activedescendant` and `role="option"` children; every progressbar named; Regenerate moved outside the radio card; visually hidden headers on action columns; frame scrollers `tabindex="0"` and named; heading levels fixed. **axe-core 4.14.0: light 0 violations, dark 0 violations** (8.6) | 6.2, 6.6, 6.13, 6.15, 8.5, 8.6; design.html throughout |
| DA2-03 Logo mark not specific | Mark redrawn: side-view diya, pronounced spout with a wick, asymmetric S-curve flame rising from the wick (off-centre), check kept, still three shapes. Wordmark "t" carries a flame tip. Before/after with a droplet reference at 128/32/16 px and a squint test on the brand board. `logo.svg`, `logo-mark.svg`, `logo-mono.svg`, flame and diya glyphs updated | 1.2, 5; logo files; design.html Brand |
| DA2-04 Draft not editable | Draft is a labelled textarea with 700 / 1,500 counter, "Edited by you" after a change, and "Replace your edited draft?" confirm; WhatsApp (Hindi) desktop, Email, and phone drawer drawn | 6.16; design.html Vendors, Mobile |
| DA2-05 Edit forms for other card types | "Edit states and the code fix" frame: idea editor (shared with the Ideas tab), Move Sangeet in edit with the linked-task preview, add_vendor in edit, remove_task confirm, invalid card replaced in place by the "Add function: Sangeet" Utsav card | 6.5; design.html AI mode |
| DA2-06 Dietary guardrail and community inputs | "Mini aloo-tikki chaat counter" card with "May not suit Jain guests" (icon + text, never hidden); community Diwali personalisation panel (occasion, planned by committee from `profile.role`, counts from Guests, traditions + Mixed/other, no honoree rows) | 6.3, 6.14, 9.1; design.html Ideas |
| DA2-07 Chips the tools cannot serve | "10 of them are Jain" replaced by "We're now 45 guests, 30 of them kids"; chips generated from `EXAMPLE_CHIPS` filtered by the active `PLAN_TOOLS`, with fallbacks and an eval row per chip | 6.3, 9.3; design.html AI mode, Guests |
| DA2-08 Mock data conflicts | Canonical states S0 / S1 / S1 + AI / S2 with a chip on every wedding frame; Overview + review banner = S0; Vendors badge defined as active vendors | 6.9, 9.4; design.html |
| DA2-09 Mobile tabs hide Ideas and Guests | All six tabs in every phone bar, fifth tab cut off, decorative edge fade, current tab scrolled into view | 6.9, 7; design.html Components and phone frames |
| DA2-10 Palette sign-off and Marigold reservation | Dark focus ring changed to Aubergine-dark `#D8B4E2` (10.09:1); landing eyebrow is `hero-fg`; the inverse-toast use of Marigold documented as the one exception. **Owner sign-off still pending**: checklist in 2.1 (eight colours, purple-led interpretation, `#4B1D5C`); to be recorded here with a date when given | 2.1, 2.2, 2.3, 8.1; design.html |
| DA2-11 Demo exhausted state | Panel frame for 429: copy with minutes from `Retry-After`, Suggest disabled with a described reason, sign-in and recorded example still available; daily-cap wording | 9.1; design.html Demo |
| DR2-01 Share page not line by line | Full budget table (Allocated, Committed, Paid, totals) in an open disclosure, full vendor list with status and amounts, community Diwali at 375 px, notes-on variant, amounts-hidden variant | 9.1; design.html Shared plan |
| DR2-02 Chips vs tools and facts | Same as DA2-07; every chip's source is listed in 9.3; optional PM extension (`facts.dueThisWeek[]`, `facts.cateringPlates`) noted | 9.3 |
| DR2-03 Undrawn P0 op cards | "P0 op cards with previews" frame and table: set_event_date, set_guests, remove_budget_category (vendor relink), remove_function, add_function (share rebalance), set_vendor_status (amount box), set_total_budget(replan) hand-off | 6.5; design.html AI mode |
| DR2-04 Wedding frames contradict | S1 marks the venue task done (makeup artist is the rushed task); review banner drawn on S0 with no vendor amounts; S2 frames labelled; demo fixture follows S1 | 9.4; design.html Overview, Timeline, Mobile, Share |
| DR2-05 Reception under "After the event" | Function milestones at daysBefore 0 or −1 sit under "Event days"; "After the event" holds tasks only. PM to align `groupByPhase` and its test | 9.1; design.html Timeline |
| DR2-06 Follow-up title reads backwards | Code-built net-effect title "Change Decor cut from 20% to 15%" with "From original" and "From now" diff lines | 6.5; design.html Components, AI mode, Demo |
| DR2-07 "Reviewed · Undo" | Undo removed; reviewed rows show only the pill; the banner reopens from the event menu | 6.13; design.html Overview |
| DR2-08 Live-looking hero buttons | Preview card is one link to the sample with the instruction pre-filled; inner mock `aria-hidden`, no buttons | 9.1; design.html Landing |
| DR2-09 "Suggest vendors with AI" undefined | Opens AI mode pre-filled with "Suggest the vendor categories I need", yields add_vendor cards; annotated; eval row requested | 6.11; design.html Components |
| DR2-10 No Hindi plan frame | "Plan language: Hindi" frame: English code-built title, diff, chips and estimates; Hindi rationale, idea text and summary in `lang="hi"` with boundaries marked; line heights 1.65 / 1.7 | 3, 6.14; design.html Ideas |
| DR2-11 Remaining states | Task overflow menu, "days after the event" editor, pinned-date warning; Guests inline validation with error summary; phone What-if include checkboxes and trade-off cards; avatar menu; onboarding re-run with return to Settings | 9.1; design.html Timeline, Guests, Mobile, Settings |
| DR2-12 Share title vs "no honoree names" | Share heading is the code-built type title ("Wedding · Pune"); the owner's title appears only with "Show event title" (default off). Rule reworded: no honoree name fields, honoree notes, vendor labels, contacts or drafts. PM to add `showTitle` to share options and `toSharedView` | 9.1; design.html Shared plan, Event settings |

**Items for the PM (spec changes these fixes rely on):** `groupByPhase` places function milestones with daysBefore 0 or −1 under the `day` phase (DR2-05); share options gain `showTitle` (default false) and `toSharedView` uses the type title otherwise (DR2-12); eval rows for every 9.3 chip and for "Suggest the vendor categories I need" (DA2-07, DR2-02, DR2-09); optional `facts.dueThisWeek[]` and `facts.cateringPlates`.
