import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a temporary directory and return its path.
 */
export async function makeTempDir(): Promise<string> {
  const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-test-"));
  const directoryPath = path.join(tempRootPath, "public");

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(directoryPath);

  return directoryPath;
}
