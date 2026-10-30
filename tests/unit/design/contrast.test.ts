import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Parses the real tokens in globals.css, resolves every derived colour (var() and color-mix in
 * sRGB) per theme, and asserts each pairing from design-system 2.3. A token change that breaks
 * contrast fails here.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

type Rgb = [number, number, number];

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const LIGHT = block(":root");
const DARK = { ...LIGHT, ...block(':root[data-theme="dark"]') };
const THEME = block("@theme inline");

function hex(value: string): Rgb {
  const h = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function resolve(value: string, vars: Record<string, string>): Rgb {
  const v = value.replace(/\/\*.*?\*\//g, "").trim();
  if (v.startsWith("#")) return hex(v);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(vars[ref[1]] ?? THEME[ref[1]], vars);
  const mix = v.match(/^color-mix\(in srgb, (var\(--[\w-]+\)) (var\(--[\w-]+\)|[\d.]+%), (var\(--[\w-]+\))\)$/);
  if (mix) {
    const pctText = mix[2].startsWith("var(") ? vars[mix[2].slice(4, -1)] : mix[2];
    const p = parseFloat(pctText) / 100;
    const a = resolve(mix[1], vars);
    const b = resolve(mix[3], vars);
    return a.map((c, i) => Math.round(c * p + b[i] * (1 - p))) as Rgb;
  }
  throw new Error(`Cannot resolve ${value}`);
}

const token = (name: string, vars: Record<string, string>) => resolve(THEME[`--color-${name}`], vars);

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum] for both themes (design-system 2.3). */
const PAIRS: [string, string, number][] = [
  ["fg", "bg", TEXT],
  ["fg", "surface", TEXT],
  ["fg-muted", "bg", TEXT],
  ["fg-muted", "surface", TEXT],
  ["brand", "bg", TEXT],
  ["brand", "surface", TEXT],
  ["on-brand", "brand", TEXT],
  ["on-accent", "accent", TEXT],
  ["fg", "accent-tint", TEXT],
  ["brand", "brand-tint", TEXT],
  ["success", "surface", TEXT],
  ["success", "success-tint", TEXT],
  ["on-solid", "success", TEXT],
  ["warning", "surface", TEXT],
  ["warning", "warning-tint", TEXT],
  ["danger", "surface", TEXT],
  ["danger", "danger-tint", TEXT],
  ["on-solid", "danger", TEXT],
  ["fg-muted", "neutral-tint", TEXT],
  ["fg-muted", "surface-sunken", TEXT],
  ["fg", "surface-sunken", TEXT],
  ["inverse-fg", "inverse-bg", TEXT],
  ["inverse-action", "inverse-bg", TEXT],
  ["inverse-focus", "inverse-bg", UI],
  ["hero-fg", "hero-bg", TEXT],
  ["accent", "hero-bg", UI],
  ["line-strong", "surface", UI],
  ["focus", "bg", UI],
  ["focus", "surface", UI],
  ["focus", "surface-sunken", UI],
  ["logo-flame", "logo-tile", UI],
  ["logo-bowl", "logo-tile", UI],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme contrast", (_, vars) => {
  it.each(PAIRS)("%s on %s meets %s:1", (fg, bg, min) => {
    expect(ratio(token(fg, vars), token(bg, vars))).toBeGreaterThanOrEqual(min);
  });

  it("keeps the focus ring visible on the brand band, where it is rescoped to hero-fg", () => {
    expect(css).toMatch(/\.hero,\s*\[data-surface="hero"\]\s*\{\s*--u-focus: var\(--u-hero-fg\);/);
    expect(ratio(token("hero-fg", vars), token("hero-bg", vars))).toBeGreaterThanOrEqual(UI);
  });
});

describe("derived tokens", () => {
  it.each([
    ["surface-sunken", LIGHT, "#f4eeeb"],
    ["brand-tint", LIGHT, "#e9e4eb"],
    ["accent-tint", LIGHT, "#fdefd6"],
    ["line-strong", LIGHT, "#958c97"],
    ["brand-tint", DARK, "#413342"],
    ["line-strong", DARK, "#8c7e8d"],
  ] as const)("%s matches design-system 2.2", (name, vars, expected) => {
    const [r, g, b] = token(name, vars);
    const actual = hex(expected);
    // Within 1 unit per channel of the documented value (rounding differs by tool).
    expect(Math.max(Math.abs(r - actual[0]), Math.abs(g - actual[1]), Math.abs(b - actual[2]))).toBeLessThanOrEqual(1);
  });

  it("rings the logo tile on the dark canvas only", () => {
    expect(LIGHT["--u-logo-ring"]).toBe("transparent");
    expect(ratio(resolve(DARK["--u-logo-ring"], DARK), token("bg", DARK))).toBeGreaterThanOrEqual(UI);
  });

  it("defines the same keys in the media-query dark block and the explicit dark toggle", () => {
    const media = css.slice(css.indexOf(':root:not([data-theme="light"]) {'));
    const mediaBody = media.slice(media.indexOf("{") + 1, media.indexOf("}"));
    const mediaVars = Object.fromEntries([...mediaBody.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect(mediaVars).toEqual(block(':root[data-theme="dark"]'));
  });
});
