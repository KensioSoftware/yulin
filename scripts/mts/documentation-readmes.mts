/**
 * Finding the documentation pages on disk.
 *
 * Two scripts walk the same tree. The example extractor reads every page for
 * its fenced TypeScript blocks, and the `llms.txt` writer checks every page has
 * a link pointing at it.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

/** Every `README.md` under a directory, at any depth. */
export async function findReadmes(
  directory: string,
): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const readmePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      readmePaths.push(...(await findReadmes(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "README.md") {
      readmePaths.push(entryPath);
    }
  }

  return readmePaths;
}
