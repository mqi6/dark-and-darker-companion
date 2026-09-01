import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PrivateSortSessionStore } from "./privateSortSessionStore";

async function main(): Promise<void> {
  const root = resolve("fixtures-private/runtime/complete-stash-sort");
  const candidates: Array<{ directory: string; modifiedAt: number }> = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("sort-")) continue;
    const directory = resolve(root, entry.name);
    try {
      const info = await stat(resolve(directory, "session.private.json"));
      candidates.push({ directory, modifiedAt: info.mtimeMs });
    } catch {
      // Ignore incomplete directories without a prepared session.
    }
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const latest = candidates[0];
  if (!latest) throw new Error("No prepared sort session was found.");

  const output = resolve(root, "latest-sort.sanitized.jsonl");
  const store = new PrivateSortSessionStore(latest.directory, output);
  await store.rebuildDiagnosticFromExisting();
  console.log(`Sanitized sort diagnostic: ${output}`);
}

await main();
