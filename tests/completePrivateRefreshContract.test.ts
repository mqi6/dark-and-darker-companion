import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("tools/complete-stash-sort-private-operator.ts"), "utf8");

describe("complete private refresh bridge contract", () => {
  it("rebuilds navigation from the current resolved window and screen", () => {
    expect(source).toContain("const currentWindow = await adapter.inspectWindow()");
    expect(source).toContain("const classified = await adapter.classifyScreen()");
    expect(source).toContain("const plan = prepareMove003Refresh({");
    expect(source).not.toContain("await delay(900");
  });

  it("waits for capture readiness and stops capture after navigation", () => {
    expect(source).toContain("await capture.ready");
    expect(source).toContain("capture.stop()");
    expect(source).toContain('child.stdin.write("STOP\\n")');
    expect(source).toContain("navigation-${diagnostic}");
  });
});
