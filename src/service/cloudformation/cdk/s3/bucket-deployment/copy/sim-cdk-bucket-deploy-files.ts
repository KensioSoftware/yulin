import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Lists the files a staged CDK asset directory holds.
 *
 * Paths come back relative to the asset root with `/` separators, which is the
 * form both the deployment filters and the S3 Object keys are written in.
 *
 * A symbolic link to a file is followed, as `aws s3 sync` follows one by
 * default. A symbolic link to a directory is refused rather than walked,
 * because a link pointing at one of its own ancestors would otherwise be walked
 * forever, and a staged CDK asset has no reason to hold one.
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
      relativePaths.push(relativeTo(rootPath, entryPath));
      continue;
    }

    if (entry.isSymbolicLink()) {
      nested.push(linkedFile(rootPath, entryPath));
    }
  }

  const nestedPaths = await Promise.all(nested);

  return [...relativePaths, ...nestedPaths.flat()];
}

/**
 * The one path a symbolic link contributes, or none when it points nowhere.
 */
async function linkedFile(
  rootPath: string,
  entryPath: string,
): Promise<string[]> {
  const linked = await linkedStats(entryPath);

  // A link pointing at nothing is left out rather than failing the deployment,
  // which is what `aws s3 sync` does with one.
  if (linked === undefined) {
    return [];
  }

  if (linked.isDirectory()) {
    throw new Error(
      `Sim CDK BucketDeployment source ${entryPath} is a symbolic link to a ` +
        `directory, which simulated deployments do not follow`,
    );
  }

  return [relativeTo(rootPath, entryPath)];
}

async function linkedStats(
  entryPath: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    // `stat` rather than `lstat`, so the link is followed to what it names.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return await stat(entryPath);
  } catch {
    return undefined;
  }
}

function relativeTo(rootPath: string, entryPath: string): string {
  return path.relative(rootPath, entryPath).split(path.sep).join("/");
}
