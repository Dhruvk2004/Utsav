import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** axe with the WCAG 2.2 AA tags, after entrance animations settle. */
export async function expectNoA11yViolations(page: Page) {
  // Let entrance fades finish first; mid-fade text would be checked at partial opacity.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  // A card can start fading in just after that wait, so a violation must last to count; real ones do.
  await expect(async () => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
  }).toPass({ timeout: 5_000 });
}
