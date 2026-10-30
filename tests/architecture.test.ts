import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Anti-gaming rules for the files excluded from coverage (spec 12.4): each page, layout and
 * boundary stays at most 60 lines, does not branch on data, and takes its UI from `@/components`;
 * each route handler file only re-exports handlers from `@/lib/server/handlers`.
 */
const APP = join(process.cwd(), "src/app");
const SHELL = /^(page|layout|loading|error|global-error|not-found)\.tsx$/;

function find(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return find(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

const files = find(APP, SHELL);
const routes = find(APP, /^route\.ts$/);

describe("route shells", () => {
  it("finds the shells", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(process.cwd(), f), f]))("%s is a thin shell", (_, file) => {
    const source = readFileSync(file, "utf8");
    expect(source.split("\n").length).toBeLessThanOrEqual(60);
    expect(source).not.toMatch(/\bif\s*\(|\bswitch\s*\(|\?\s*[^.:\s]+\s*:/);
    for (const [, from] of source.matchAll(/from "([^"]+)"/g)) {
      expect(from).toMatch(/^(next(\/.*)?|react|\.\/globals\.css|@\/components\/.+|@\/lib\/config)$/);
    }
  });
});

describe("route handler files", () => {
  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes.map((f) => [relative(process.cwd(), f), f]))("%s only re-exports handlers", (_, file) => {
    const source = readFileSync(file, "utf8").trim();
    expect(source.split("\n").length).toBeLessThanOrEqual(15);
    expect(source).toMatch(/^export \{ [A-Z, ]+ \} from "@\/lib\/server\/handlers\/[a-z]+(\/[a-z]+)?";$/);
  });
});
