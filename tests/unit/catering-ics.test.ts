import { describe, expect, it } from "vitest";
import { estimateCatering } from "@/lib/domain/catering";
import { addDays } from "@/lib/domain/dates";
import { buildIcs, escapeIcsText, foldLine, icsFileName, istToUtc } from "@/lib/domain/ics";
import { deriveView } from "@/lib/domain/view";
import { TODAY, wedding } from "../domainFixtures";

describe("estimateCatering", () => {
  it("adds a 10% buffer and rounds up to the nearest 5", () => {
    expect(estimateCatering(300)).toEqual({ plates: 330, bufferPercent: 10 });
    expect(estimateCatering(101)).toEqual({ plates: 115, bufferPercent: 10 });
  });

  it("supports a custom buffer", () => {
    expect(estimateCatering(100, 0)).toEqual({ plates: 100, bufferPercent: 0 });
  });

  it("returns zero plates for zero guests", () => {
    expect(estimateCatering(0).plates).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => estimateCatering(-1)).toThrow(RangeError);
    expect(() => estimateCatering(2.5)).toThrow(RangeError);
    expect(() => estimateCatering(10, 150)).toThrow(RangeError);
  });
});

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines untouched", () => {
    expect(foldLine("SUMMARY:Hello")).toBe("SUMMARY:Hello");
  });

  it("folds long lines at 75 octets with a leading space on continuations", () => {
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts.slice(1).every((p) => p.startsWith(" ") && p.length <= 75)).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });

  it("never splits a multi-byte character", () => {
    const folded = foldLine(`SUMMARY:${"स".repeat(60)}`);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      expect(part).not.toContain("�");
    }
  });
});

describe("buildIcs", () => {
  const plan = wedding();
  const ics = buildIcs(plan, "e1", TODAY, new Date("2026-11-01T10:00:00Z"));
  const view = deriveView(plan, TODAY);

  it("is a valid calendar envelope with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("has the event day, each function, every open task and each open vendor's book-by date", () => {
    const open = view.tasks.filter((t) => !t.done).length;
    const toBook = plan.vendors.filter((v) => ["to_research", "contacted", "quoted"].includes(v.status)).length;
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1 + plan.functions.length + open + toBook);
  });

  it("times functions in India time and runs late evenings past midnight", () => {
    const sangeet = plan.functions.find((fn) => fn.name === "Sangeet");
    expect(sangeet?.startTime).toBe("19:00");
    expect(ics).toContain(`DTSTART:${istToUtc(sangeet?.date ?? "", "19:00")}`);
    expect(istToUtc("2026-12-12", "19:00")).toBe("20261212T133000Z");
    const late = buildIcs({ ...plan, functions: [{ ...plan.functions[0], startTime: "22:00", endTime: "01:00" }] }, "e1", TODAY);
    expect(late).toContain(`DTEND:${istToUtc(addDays(plan.functions[0].date, 1), "01:00")}`);
  });

  it("scopes every UID by the event id, so two events' files never collide (QA-07 regression)", () => {
    const uids = ics.split("\r\n").filter((line) => line.startsWith("UID:"));
    expect(uids).toContain("UID:e1-event@utsav");
    expect(uids.every((uid) => uid.startsWith("UID:e1-"))).toBe(true);
    expect(buildIcs(plan, "e2", TODAY)).not.toContain("UID:e1-");
  });

  it("includes the after-event tasks and leaves done tasks out", () => {
    expect(ics).toContain("SUMMARY:To do: Send thank-you messages");
    const done = plan.tasks.find((t) => t.done);
    expect(done && ics.includes(`UID:e1-${done.id}@utsav`)).toBe(false);
  });

  it("uses all-day dates ending the following day and stamps the generation time", () => {
    expect(ics).toContain(`DTSTART;VALUE=DATE:${plan.details.eventDate.replace(/-/g, "")}`);
    expect(ics).toContain("DTSTAMP:20261101T100000Z");
  });

  it("escapes user text and never includes vendor labels or contacts", () => {
    const titled = {
      ...plan,
      details: { ...plan.details, title: "Fun, food; friends" },
      vendors: plan.vendors.map((v) => ({ ...v, label: "Lotus Decor", contact: "98200 00000" })),
    };
    const out = buildIcs(titled, "e1", TODAY);
    expect(out).toContain("SUMMARY:Fun\\, food\\; friends");
    expect(out).not.toContain("Lotus");
    expect(out).not.toContain("98200");
  });

  it("names the file after the event", () => {
    expect(icsFileName({ ...plan, details: { ...plan.details, title: "Ananya & Rohan's wedding" } })).toBe(
      "utsav-ananya-rohan-s-wedding.ics",
    );
    expect(icsFileName({ ...plan, details: { ...plan.details, title: "" } })).toMatch(/^utsav-[a-z-]+\.ics$/);
    expect(icsFileName({ ...plan, details: { ...plan.details, title: "ॐ" } })).toBe("utsav-event.ics");
  });
});
