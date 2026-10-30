import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  budgetLinesOp,
  editAfter,
  functionAmountsText,
  gapMessage,
  protectRows,
  resolveLine,
  rowsTotal,
  setIncluded,
  simpleRows,
  smartRows,
  statusText,
} from "@/lib/client/whatif";
import { birthday, wedding } from "../../domainFixtures";

const NEW_TOTAL = 2_200_000;
const row = (rows: ReturnType<typeof simpleRows>, id: string) => rows.find((r) => r.lineId === id)!;

describe("What-if table (spec 6.4)", () => {
  it("starts from a simple rescale that adds up to the new total", () => {
    const rows = simpleRows(wedding(), NEW_TOTAL);
    expect(rowsTotal(rows)).toBe(NEW_TOTAL);
    expect(row(rows, "line-decor")).toMatchObject({ before: 300_000, after: 264_000, included: true, ai: false });
    expect(gapMessage(rows, NEW_TOTAL)).toBeNull();
    expect(statusText(row(rows, "line-photography"))).toBe("Cannot go below ₹2,40,000 committed");
  });

  it("pins an edited row and rebalances the other included rows", () => {
    const edited = editAfter(simpleRows(wedding(), NEW_TOTAL), "line-decor", 250_000, NEW_TOTAL);
    expect(rowsTotal(edited)).toBe(NEW_TOTAL);
    expect(statusText(row(edited, "line-decor"))).toBe("Edited by you");
    expect(statusText(row(edited, "line-entertainment"))).toBe("Adjusted");
  });

  it("keeps an excluded row's old amount, and reports the gap when nothing can absorb it", () => {
    let rows = simpleRows(birthday(), 50_000);
    rows = setIncluded(rows, "line-venue", false, 50_000);
    expect(row(rows, "line-venue").after).toBe(12_000);
    expect(statusText(row(rows, "line-venue"))).toBe("Not included");
    expect(rowsTotal(rows)).toBe(50_000);
    for (const id of ["line-food-cake", "line-decor", "line-entertainment", "line-return-gifts"])
      rows = setIncluded(rows, id, false, 50_000);
    rows = editAfter(rows, "line-contingency", 1_000, 50_000);
    expect(gapMessage(rows, 50_000)).toBe("Adjust one more row so the total is ₹50,000 (currently ₹56,000).");
    rows = setIncluded(rows, "line-decor", true, 50_000);
    expect(rowsTotal(rows)).toBe(50_000);
    expect(budgetLinesOp(rows).lines).toHaveLength(6);
  });

  it("always adds up after any single edit that leaves a row free (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 400_000 }), (index, amount) => {
        const plan = wedding();
        const rows = editAfter(simpleRows(plan, NEW_TOTAL), plan.budget.lines[index].id, amount, NEW_TOTAL);
        expect(rowsTotal(rows)).toBe(NEW_TOTAL);
      }),
    );
  });

  it("maps smart weights onto existing lines only, protecting and clamping", () => {
    const plan = wedding();
    const { rows, ignored } = smartRows(
      plan,
      NEW_TOTAL,
      [
        { category: "venue", percent: 10 },
        { category: "Catering", percent: 40 },
        { category: "Invitations", percent: 4 },
        { category: "Photography", percent: 1 },
        { category: "Fireworks", percent: 5 },
        { category: "Catering", percent: 99 },
      ],
      ["line-venue"],
    );
    expect(ignored).toEqual(["Fireworks"]);
    expect(rowsTotal(rows)).toBe(NEW_TOTAL);
    expect(statusText(row(rows, "line-venue"))).toBe("Adjusted by Utsav to protect Venue");
    expect(row(rows, "line-venue").after).toBe(500_000);
    expect(statusText(row(rows, "line-photography"))).toBe("Kept at ₹2,40,000 already committed");
    expect(row(rows, "line-catering").ai).toBe(true);
    expect(row(rows, "line-contingency").ai).toBe(false);
    const kept = smartRows(plan, 3_000_000, [{ category: "Decor", percent: 12 }], ["line-catering"]).rows;
    expect(statusText(row(kept, "line-catering"))).toBe("Protected");
    expect(statusText({ ...row(kept, "line-decor"), status: null })).toBeNull();
  });

  it("resolves names exactly, then by a unique prefix", () => {
    const plan = wedding();
    expect(resolveLine(plan, "  DECOR ")).toBe("line-decor");
    expect(resolveLine(plan, "Make")).toBe("line-makeup-mehndi");
    expect(resolveLine(plan, "Stage")).toBeNull();
  });

  it("lists function amounts at the new total", () => {
    expect(functionAmountsText(wedding(), NEW_TOTAL)).toBe(
      "Haldi ₹2,20,000 (10%) · Mehndi ₹2,20,000 (10%) · Sangeet ₹3,30,000 (15%) · Wedding ₹9,90,000 (45%) · Reception ₹4,40,000 (20%)",
    );
    expect(functionAmountsText(birthday(), 1)).toBeNull();
  });

  it("keeps protected rows under Simple rescale, and the others absorb the cut (CO-03, MQW-03 regression)", () => {
    const plan = wedding();
    const rows = simpleRows(plan, NEW_TOTAL, ["line-venue", "line-catering"]);
    expect(rowsTotal(rows)).toBe(NEW_TOTAL);
    for (const id of ["line-venue", "line-catering"]) {
      expect(row(rows, id).after).toBe(row(rows, id).before);
      expect(statusText(row(rows, id))).toBe(`Adjusted by Utsav to protect ${row(rows, id).category}`);
    }
    // Everything else takes a deeper cut than the plain ×0.88 rescale.
    expect(row(rows, "line-decor").after).toBeLessThan(row(simpleRows(plan, NEW_TOTAL), "line-decor").after);
    // A protected line that grows anyway is simply marked protected.
    expect(statusText(row(simpleRows(plan, 3_000_000, ["line-venue"]), "line-venue"))).toBe("Protected");
  });

  it("never lets a pinned row's rebalance cut a protected row, Simple or Smart (BP-02 regression)", () => {
    const plan = birthday();
    const food = "line-food-cake";
    let rows = simpleRows(plan, 55_000, [food]);
    const foodBefore = row(rows, food).before;
    rows = editAfter(rows, "line-decor", 5_000, 55_000);
    expect(row(rows, food).after).toBeGreaterThanOrEqual(foodBefore);
    expect(rowsTotal(rows)).toBe(55_000);
    expect(budgetLinesOp(rows).lines.find((l) => l.lineId === food)?.amount).toBeGreaterThanOrEqual(foodBefore);

    const smart = smartRows(plan, 55_000, [{ category: "Food & cake", percent: 20 }], [food]).rows;
    const pinned = editAfter(smart, "line-decor", 7_000, 55_000);
    expect(row(pinned, food).after).toBeGreaterThanOrEqual(foodBefore);
    expect(rowsTotal(pinned)).toBe(55_000);
  });

  it("keeps protected amounts and reports the gap when they alone exceed the new total", () => {
    const plan = birthday();
    const ids = plan.budget.lines.map((line) => line.id);
    const rows = simpleRows(plan, 10_000, ids.slice(0, 2));
    expect(row(rows, ids[0]).after).toBe(row(rows, ids[0]).before);
    expect(gapMessage(rows, 10_000)).toMatch(/^Adjust one more row so the total is ₹10,000/);
    // Rows already at or above their old amount are left alone.
    const kept = simpleRows(plan, 80_000);
    expect(protectRows(kept, 80_000)).toEqual(kept);
  });
});
