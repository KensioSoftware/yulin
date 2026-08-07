import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Lists the files a staged CDK asset directory holds.
 *
 * Paths come back relative to the asset root with `/` separators, which is the
 * form both the deployment filters and the S3 Object keys are written in.
 */
export async function simCdkBucketDeployFiles(
  directoryPath: string,
): Promise<string[]> {
  return await filesUnder(directoryPath, directoryPath);
}

async function filesUnder(
  rootPath: string,
  directoryPath: string,
): Promise<string[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const relativePaths: string[] = [];
  const nested: Promise<string[]>[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      nested.push(filesUnder(rootPath, entryPath));
      continue;
    }

    if (entry.isFile()) {
      relativePaths.push(
        path.relative(rootPath, entryPath).split(path.sep).join("/"),
      );
    }
  }

  const nestedPaths = await Promise.all(nested);

  return [...relativePaths, ...nestedPaths.flat()];
}
